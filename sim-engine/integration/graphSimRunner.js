/**
 * @file graphSimRunner.js — runs the IDM engine on an arbitrary edited /
 * imported network graph and renders it on a canvas with real geometry.
 *
 * This is the bridge that turns the Network Editor (or any OSM/SUMO/
 * OpenDRIVE import) into an instant local playground — plus a first
 * route-choice layer: k penalized shortest paths per OD pair split by a
 * multinomial-logit model over free-flow travel times.
 *
 * Exposed as window.SAE_Runner by bootModules.js.
 */

import { Network } from '../network/graph.js';
import { Simulator } from '../simulator.js';

const TYPE_MIX = [
  { type: 'sedan', w: 0.78 },
  { type: 'bus', w: 0.10 },
  { type: 'truck', w: 0.12 },
];

/* ────────────────────────── routing utils ────────────────────────── */

function edgeTimeS(edge) {
  const speed = Number.isFinite(edge.speedLimit) && edge.speedLimit > 1
    ? edge.speedLimit : 8;
  return edge.length / speed;
}

/**
 * Dijkstra over directed edges. `cost(edge)` returns seconds.
 * @returns {{time:number, edges:string[]}} best path or Infinity/[]
 */
function shortestPath(net, source, target, cost) {
  const dist = new Map([[source, 0]]);
  const prevNode = new Map();
  const prevEdge = new Map();
  const done = new Set();
  const queue = [[0, source]];

  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, u] = queue.shift();
    if (done.has(u)) continue;
    done.add(u);
    if (u === target) break;
    for (const e of net.getOutgoingEdges(u)) {
      const nd = d + cost(e);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prevNode.set(e.to, u);
        prevEdge.set(e.to, e.id);
        queue.push([nd, e.to]);
      }
    }
  }
  if (!done.has(target)) return { time: Infinity, edges: [] };

  const edges = [];
  let cur = target;
  while (cur !== source) {
    edges.unshift(prevEdge.get(cur));
    cur = prevNode.get(cur);
  }
  return { time: dist.get(target), edges };
}

/**
 * Up to k diverse routes: after each found path, its edges get a penalty
 * multiplier so the next search naturally diverges.
 */
function kRoutes(net, source, target, k, baseCost) {
  const penalty = new Map(); // edgeId -> factor
  const cost = (e) => baseCost(e) * (penalty.get(e.id) ?? 1);
  const out = [];
  for (let i = 0; i < k; i++) {
    const r = shortestPath(net, source, target, cost);
    if (!r.edges.length || !Number.isFinite(r.time)) break;
    out.push(r);
    for (const eid of r.edges) penalty.set(eid, (penalty.get(eid) ?? 1) * 3);
  }
  /* logit probabilities over the collected routes */
  const times = out.map((r) => Math.max(r.time, 1));
  const tMin = Math.min(...times);
  const theta = 0.35;
  const exps = times.map((t) => Math.exp(-theta * ((t - tMin) / tMin)));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  out.forEach((r, i) => { r.p = exps[i] / sum; });
  return out.sort((a, b) => b.p - a.p);
}

/* ─────────────────────────── runner ─────────────────────────── */

export class GraphSimRunner {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.sim = null;
    this.net = null;
    this.geom = new Map();   /* edgeId -> {ax,ay,bx,by,len,px} px geometry */
    this.staticLayer = null; /* offscreen canvas with roads pre-rendered   */
    this.routes = [];        /* flat [{edges,p}] across all pairs          */
    this.running = false;
    this.raf = null;
    this.opts = {};
    this._acc = 0;
  }

  /**
   * @param {{nodes:Array,Object,edges:Array}} netJSON editor/OSM/export JSON
   * @param {{vph?:number,duration?:number,kRoutes?:number,seed?:number,
   *          signalPlans?:Array}} [opts]
   */
  load(netJSON, opts = {}) {
    this._lastLoad = { netJSON, opts };
    this.opts = Object.assign({ vph: 900, duration: 600, kRoutes: 2, seed: 42 }, opts);
    this.net = Network.fromJSON(netJSON);

    const entries = [], exits = [];
    for (const n of this.net.nodes.values()) {
      const out = this.net.getOutgoingEdges(n.id).length;
      const inn = this.net.getIncomingEdges(n.id).length;
      if (out > 0 && inn === 0) entries.push(n.id);
      else if (inn > 0 && out === 0) exits.push(n.id);
    }
    if (!entries.length) entries.push(this.net.nodes.keys().next().value);
    if (!exits.length) exits.push([...this.net.nodes.keys()].pop());

    /* cap combinatorics on large imports */
    const pick = (arr) => arr.length <= 3 ? arr
      : [arr[0], arr[Math.floor(arr.length / 2)], arr[arr.length - 1]];
    const pairs = [];
    for (const o of pick(entries))
      for (const d of pick(exits))
        if (o !== d) pairs.push([o, d]);

    const baseCost = (e) => edgeTimeS(e);
    this.routes = [];
    const chosenRoutes = [];
    for (const [o, d] of pairs.slice(0, 6)) {
      for (const r of kRoutes(this.net, o, d, this.opts.kRoutes, baseCost)) {
        this.routes.push({ pair: [o, d], ...r });
        chosenRoutes.push(r);
      }
    }
    if (!chosenRoutes.length) throw new Error('no feasible route in network');

    /* demand: one departure per second, pair+route by weighted choice */
    const items = [];
    let seq = 0;
    for (let t = 0; t < this.opts.duration; t++) {
      const nDep = this.opts.vph / 3600;
      const frac = nDep - Math.floor(nDep);
      let count = Math.floor(nDep);
      if (rngNext(this.opts.seed + t) < frac) count += 1;
      for (let j = 0; j < count; j++) {
        const route = weightedPick(chosenRoutes);
        let type = 'sedan', acc2 = 0, roll = rngNext(this.opts.seed + t * 31 + j);
        for (const m of TYPE_MIX) { acc2 += m.w; if (roll <= acc2) { type = m.type; break; } }
        items.push({
          id: `g${seq++}`,
          origin: route.pair ? route.pair[0] : route.edges[0],
          dest: route.pair ? route.pair[1] : route.edges[route.edges.length - 1],
          departTime: t,
          type,
          route: route.edges.slice(),
        });
      }
    }

    this.sim = new Simulator({ dt: 0.5, seed: this.opts.seed });
    this.sim.loadNetwork(this.net);
    if (Array.isArray(opts.signalPlans) && opts.signalPlans.length) {
      try { this.sim.loadSignals(opts.signalPlans); } catch { /* optional */ }
    }
    this.sim.loadDemand(items);
    this._buildGeometry();

    /* seed RNG state consumed above is deterministic per opts.seed */
    function rngNext(salt) {
      let a = (salt | 0) + 0x6D2B79F5;
      a = Math.imul(a ^ (a >>> 15), 1 | a);
      a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
      return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
    }
    function weightedPick(list) {
      const total = list.reduce((a, r) => a + (r.p ?? 1), 0);
      let x = rngNextSeedless() * total;
      for (const r of list) { x -= (r.p ?? 1); if (x <= 0) return r; }
      return list[list.length - 1];
    }
    function rngNextSeedless() { return Math.random(); }
  }

  _buildGeometry() {
    if (!this.canvas) return;   /* headless mode: simulation only */
    const W = this.canvas.width, H = this.canvas.height;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const n of this.net.nodes.values()) {
      minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat);
      minLng = Math.min(minLng, n.lng); maxLng = Math.max(maxLng, n.lng);
    }
    const pad = 40;
    const spanLng = Math.max(maxLng - minLng, 1e-9);
    const spanLat = Math.max(maxLat - minLat, 1e-9);
    const scale = Math.min((W - pad * 2) / spanLng, (H - pad * 2) / spanLat);
    const midLng = (minLng + maxLng) / 2, midLat = (minLat + maxLat) / 2;

    const proj = (n) => ({
      x: W / 2 + (n.lng - midLng) * scale,
      y: H / 2 - (n.lat - midLat) * scale,
    });

    this.geom.clear();
    for (const e of this.net.edges.values()) {
      const a = this.net.getNode(e.from), bq = this.net.getNode(e.to);
      if (!a.hasCoords() || !bq.hasCoords()) continue;
      const pa = proj(a), pb = proj(bq);
      this.geom.set(e.id, { ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, lanes: Math.max(1, e.lanes | 0) });
    }

    /* static roads layer */
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const c = off.getContext('2d');
    c.fillStyle = '#0b1220';
    c.fillRect(0, 0, W, H);
    for (const g of this.geom.values()) {
      c.strokeStyle = '#1e293b';
      c.lineWidth = 4 + g.lanes * 3;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(g.ax, g.ay); c.lineTo(g.bx, g.by); c.stroke();
      c.strokeStyle = '#334155';
      c.lineWidth = Math.max(2, 1 + g.lanes * 1.5);
      c.beginPath(); c.moveTo(g.ax, g.ay); c.lineTo(g.bx, g.by); c.stroke();
    }
    this.staticLayer = off;
  }

  run() {
    if (!this.sim) throw new Error('load() first');
    this.running = true;
    if (!this.raf) this._loop();
  }

  pause() { this.running = false; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } }

  reset(seed) {
    if (!this._lastLoad) return;
    this.pause();
    this.load(this._lastLoad.netJSON,
              Object.assign({}, this._lastLoad.opts, { seed: seed ?? this._lastLoad.opts.seed }));
    this.run();
  }

  /** Advance deterministically (tests + throttled environments). */
  tick(n) {
    if (!this.sim) throw new Error('load() first');
    this.running = true;
    this.sim.run(Math.max(1, n | 0), 0.5);
    this.render();
  }

  _loop = () => {
    if (!this.running) { this.raf = null; return; }
    this.sim.step(0.25);
    this.render();
    this.raf = requestAnimationFrame(() => this._loop());
  };

  render() {
    if (!this.staticLayer) return;
    const ctx = this.ctx;
    ctx.drawImage(this.staticLayer, 0, 0);

    for (const v of this.sim.vehicles) {
      const g = this.geom.get(v.edgeId);
      if (!g) continue;
      const f = Math.min(1, v.offset / Math.max(v.edgeLength, 1));
      const x = g.ax + (g.bx - g.ax) * f;
      const y = g.ay + (g.by - g.ay) * f;
      const ang = Math.atan2(g.by - g.ay, g.bx - g.ax);
      const laneOff = ((g.lanes - 1) / 2 - Math.min(v.lane, g.lanes - 1)) * 3.2;
      ctx.save();
      ctx.translate(x - Math.sin(ang) * laneOff, y + Math.cos(ang) * laneOff);
      ctx.rotate(ang);
      const L = Math.max(4, v.length * 0.9);
      const Wd = Math.max(2.5, v.width * 0.9);
      ctx.fillStyle = v.color || '#38bdf8';
      ctx.globalAlpha = 0.95;
      ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    /* HUD */
    const s = this.sim.summary();
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.fillRect(8, 8, 210, 46);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(`t=${Math.round(s.time)}s  veh=${s.active}`, 14, 24);
    ctx.fillText(
      `done=${s.exited}  avgTT=${s.avgTravelTimeExited}s`,
      14, 40);
  }

  getStats() {
    if (!this.sim) return null;
    const sum = this.sim.summary();
    const kpis = this.sim.kpis || {};
    return {
      time: sum.time,
      active: sum.active,
      exited: sum.exited,
      spawned: sum.spawned,
      avgSpeedKmh: Math.round((kpis.avgSpeed ?? 0)),
      los: kpis.los ?? '-',
      routesBuilt: this.routes.length,
      running: this.running,
    };
  }

  dispose() {
    this.pause();
    this.sim = null; this.net = null; this.geom.clear(); this.staticLayer = null;
  }
}

export function createGraphSimRunner(canvasId) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  return new GraphSimRunner(el);
}
