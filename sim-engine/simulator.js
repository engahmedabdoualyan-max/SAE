/**
 * @file Main micro-simulation loop: spawning, signal control, car-following,
 * lane-changing and KPI collection — orchestrated per time step.
 *
 * Per-step pipeline:
 *  1. spawn due vehicles from the demand queue
 *  2. tick signal controllers
 *  3. index lanes & find leaders (including cross-edge lookahead)
 *  4. compute IDM accelerations (signal-aware)
 *  5. MOBIL lane-change decisions (+ acceleration refresh)
 *  6. integrate positions / advance to next edges / remove exited vehicles
 *  7. collect KPIs periodically
 *
 * Events emitted via {@link Simulator#on}:
 *  'step', 'kpi-update', 'vehicle-added', 'vehicle-removed', 'spawn-failed',
 *  'complete', 'paused', 'resumed', 'reset'.
 */

import { Vehicle } from './models/vehicle.js';
import { computeKPIs } from './kpi/collector.js';
import { SignalController, SignalPlan } from './signals/controller.js';
import { Network } from './network/graph.js';

/** Minimal EventEmitter (browser/node safe, zero deps). */
export class MiniEventEmitter {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event @param {Function} fn @returns {()=>void} unsubscribe.
   */
  on(event, fn) {
    if (typeof fn !== 'function') throw new TypeError('on: listener must be a function');
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  /** @param {string} event @param {Function} fn */
  off(event, fn) {
    const list = this._listeners.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  /** Subscribe for a single occurrence. */
  once(event, fn) {
    const off = this.on(event, (...args) => { off(); fn(...args); });
    return off;
  }

  /** Dispatch; listener exceptions are logged without breaking the loop. */
  emit(event, payload = null) {
    const list = this._listeners.get(event);
    if (!list || list.length === 0) return;
    for (const fn of [...list]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[simulator] listener error on "${event}":`, err);
      }
    }
  }
}

/** Deterministic 32-bit RNG (mulberry32). @param {number} [seed] @returns {function():number} */
export function mulberry32(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn classification from bearing difference [deg]. */
function classifyTurn(bearingDiffDeg) {
  let d = ((bearingDiffDeg + 180) % 360) - 180;
  if (d < -180) d += 360;
  if (d > 30 && d <= 150) return 'left';
  if (d < -30 && d >= -150) return 'right';
  return 'through';
}

/**
 * The simulation engine.
 */
export class Simulator {
  /**
   * @param {Object} [config]
   * @param {number} [config.dt=1] Default time step [s].
   * @param {number|null} [config.seed] RNG seed for reproducibility.
   * @param {number} [config.spawnRate=1] Demand multiplier.
   * @param {number} [config.maxVehicles=4000] Hard cap on active vehicles.
   * @param {number} [config.kpiEverySteps=5] KPI cadence in steps.
   * @param {number} [config.laneChangeEverySteps=1] MOBIL cadence in steps.
   * @param {number} [config.leaderHorizon=200] Cross-edge leader search range [m].
   * @param {number} [config.spawnClearance=2.5] Required clearance when inserting at an edge start [m].
   * @param {Partial<import('./models/idm.js').IdmParams>} [config.idmOverrides] Fleet-wide
   *   IDM parameter overrides applied to every spawned vehicle (used by the
   *   calibration wizard's grid search).
   */
  constructor(config = {}) {
    this.config = {
      dt: 1,
      seed: null,
      spawnRate: 1,
      maxVehicles: 4000,
      kpiEverySteps: 5,
      laneChangeEverySteps: 1,
      leaderHorizon: 200,
      spawnClearance: 2.5,
      ...config,
    };

    this.events = new MiniEventEmitter();

    /** @type {Network|null} */
    this.network = null;
    /** @type {Map<string, Vehicle>} */
    this.vehicleById = new Map();
    /** @type {Vehicle[]} */
    this.vehicles = [];
    /** @type {Map<string, SignalController>} nodeId -> controller */
    this.signals = new Map();

    /** @type {Array<Object>} routed demand items */
    this.demand = [];
    this.completedSampleCap = 5000;
    /** @type {Array<Object>} rolling sample of exited-vehicle stats */
    this.completedSamples = [];

    this.cumulative = { spawned: 0, exited: 0, dropped: 0, travelTime: 0, delay: 0, distanceKm: 0 };
    /** @type {Object|null} latest KPI object */
    this.kpis = null;
    /** @type {Array<Object>} compact KPI history */
    this.history = [];

    this.paused = false;

    const seed = this.config.seed ?? (Date.now() & 0xffffffff) >>> 0;
    this.rng = mulberry32(seed);

    this.time = 0;
    this.stepCount = 0;
  }

  // ------------------------------------------------------------- events ----

  /** @param {string} e @param {Function} f */
  on(e, f) { return this.events.on(e, f); }
  /** @param {string} e @param {Function} f */
  off(e, f) { this.events.off(e, f); }
  /** @param {string} e @param {Function} f */
  once(e, f) { return this.events.once(e, f); }
  /** @param {string} e @param {any} [p] */
  emit(e, p) { this.events.emit(e, p); }

  // -------------------------------------------------------------- loading --

  /**
   * Load the road network.
   * @param {Network|{nodes:Object[],edges:Object[]}} network Instance or JSON.
   * @returns {Simulator} this
   * @throws {TypeError} On invalid input.
   */
  loadNetwork(network) {
    if (network instanceof Network) {
      this.network = network;
    } else if (network && Array.isArray(network.nodes) && Array.isArray(network.edges)) {
      this.network = Network.fromJSON(network);
    } else {
      throw new TypeError('loadNetwork: expected a Network instance or {nodes[], edges[]} JSON');
    }
    return this;
  }

  /**
   * Register signal controllers.
   * Accepts an array (or Map/object of values) of `SignalController` instances
   * or plain configs `{ nodeId, plan:{phases:[...]}, mode? , options? }`.
   * @param {Iterable<Object>|SignalController[]} signals
   * @returns {Simulator} this
   */
  loadSignals(signals) {
    const arr = signals instanceof Map ? [...signals.values()] : Array.from(signals ?? []);
    for (const item of arr) {
      if (item instanceof SignalController) {
        this.signals.set(item.nodeId, item);
        continue;
      }
      if (!item || typeof item.nodeId !== 'string') {
        throw new TypeError('loadSignals: each entry needs a "nodeId"');
      }
      const opts = { ...(item.options ?? {}), ...(item.mode ? { mode: item.mode } : {}) };
      const ctl = new SignalController(item.nodeId, item.plan, opts);
      this.signals.set(ctl.nodeId, ctl);
    }
    return this;
  }

  /**
   * Load demand. Items should already be routed (`route` present, e.g. via
   * `routeDemand`); raw `{origin,dest}` items are auto-routed when a network
   * is loaded first.
   * @param {Array<{route?:string[], origin?:string, dest?:string, departTime:number, type?:string, vehicleType?:string, id?:string}>} items
   * @returns {Simulator} this
   */
  loadDemand(items) {
    if (!Array.isArray(items)) throw new TypeError('loadDemand: expected an array');
    const net = this.network;
    const out = [];
    for (const raw of items) {
      if (!raw || !Number.isFinite(raw.departTime)) continue;
      let route = Array.isArray(raw.route) ? raw.route.slice() : null;
      if ((!route || route.length === 0)) {
        if (net && typeof raw.origin === 'string' && typeof raw.dest === 'string') {
          try {
            route = net.findRoute(raw.origin, raw.dest);
          } catch {
            this.cumulative.dropped += 1;
            continue;
          }
          if (!route) { // unreachable destination
            this.cumulative.dropped += 1;
            continue;
          }
        } else {
          this.cumulative.dropped += 1;
          continue;
        }
      }
      if (!net.getEdge(route[0])) {
        this.cumulative.dropped += 1;
        continue;
      }
      out.push({
        id: raw.id ?? `veh-${this.demand.length + out.length}`,
        departTime: raw.departTime,
        nextTry: raw.departTime,
        attempts: 0,
        spawned: false,
        type: raw.vehicleType ?? raw.type ?? 'sedan',
        route,
      });
    }
    out.sort((a, b) => a.departTime - b.departTime);
    this.demand = out;
    return this;
  }

  // ----------------------------------------------------------- main loop ---

  /**
   * Advance the simulation by one step.
   * @param {number} [dt] Time step [s] (defaults to config.dt).
   * @returns {{step:number,time:number}} New state counters.
   * @throws {Error} When called before loadNetwork().
   */
  step(dt = this.config.dt) {
    if (!this.network) throw new Error('Simulator.step: no network loaded (call loadNetwork first)');
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`step: dt must be > 0, got ${dt}`);
    }

    this.stepCount += 1;
    this.time += dt;

    this._spawnDue();                                   // (1)
    this._tickSignals(dt);                              // (2)
    const lanesIndex = this._buildLaneIndex();          // (3a)
    const leaders = this._findLeaders(lanesIndex);      // (3b)
    this._computeAccelerations(leaders);                // (4)

    if (this.stepCount % this.config.laneChangeEverySteps === 0) {
      const changed = this._mobilLaneChanges(lanesIndex);       // (5)
      if (changed) {
        const lanesIndex2 = this._buildLaneIndex();
        const leaders2 = this._findLeaders(lanesIndex2);
        this._computeAccelerations(leaders2);
      }
    }

    this._moveAndTransition(dt);                        // (6)

    if (this.stepCount % this.config.kpiEverySteps === 0 || this.stepCount === 1) {
      this._collectKPIs();                              // (7)
    }

    this.emit('step', {
      step: this.stepCount,
      time: this.time,
      vehicleCount: this.vehicles.length,
    });
    return { step: this.stepCount, time: this.time };
  }

  /**
   * Run multiple steps (stops early when paused).
   * @param {number} numSteps Steps to execute (> 0).
   * @param {number} [dt] Time step [s].
   * @fires Simulator#event:'complete'
   * @returns {{step:number,time:number}}
   */
  run(numSteps, dt = this.config.dt) {
    if (!Number.isInteger(numSteps) || numSteps <= 0) {
      throw new RangeError(`run: numSteps must be a positive integer, got ${numSteps}`);
    }
    for (let i = 0; i < numSteps; i++) {
      if (this.paused) break;
      this.step(dt);
      if (i === numSteps - 1) {
        this.emit('complete', this.summary());
      }
    }
    return { step: this.stepCount, time: this.time };
  }

  /** Pause the loop (checked between steps of run()/worker chunks). */
  pause() {
    this.paused = true;
    this.emit('paused', { time: this.time, step: this.stepCount });
  }

  /** Resume after pause(). */
  resume() {
    this.paused = false;
    this.emit('resumed', { time: this.time, step: this.stepCount });
  }

  /** Reset everything to the freshly-loaded state (keeps network/demand/signals). */
  reset() {
    this.time = 0;
    this.stepCount = 0;
    this.vehicles = [];
    this.vehicleById.clear();
    this.completedSamples = [];
    this.cumulative = { spawned: 0, exited: 0, dropped: this.cumulative.dropped, travelTime: 0, delay: 0, distanceKm: 0 };
    for (const item of this.demand) {
      item.spawned = false;
      item.attempts = 0;
      item.nextTry = item.departTime;
    }
    for (const sig of this.signals.values()) sig.reset();
    this.kpis = null;
    this.history = [];
    const seed = this.config.seed ?? (Date.now() & 0xffffffff) >>> 0;
    this.rng = mulberry32(seed);
    this.paused = false;
    this.emit('reset', { time: 0, step: 0 });
  }

  // ------------------------------------------------------------- stages ----

  /** Stage 1: spawn vehicles whose departure is due. */
  _spawnDue() {
    const net = this.network;
    for (const item of this.demand) {
      if (item.spawned || item.nextTry > this.time) continue;
      if (this.vehicles.length >= this.config.maxVehicles) return; // system full; retry later

      if (this._trySpawn(item, net)) {
        item.spawned = true;
        this.cumulative.spawned += 1;
        const veh = this.vehicleById.get(item.id);
        this.emit('vehicle-added', veh);
      } else {
        item.attempts += 1;
        if (item.attempts > 300) {
          item.spawned = true;
          this.cumulative.dropped += 1;
          this.emit('spawn-failed', { id: item.id, reason: 'no-space-timeout' });
        } else {
          item.nextTry = this.time + 1;
        }
      }
    }
  }

  _trySpawn(item, net) {
    const firstEdge = net.requireEdge(item.route[0]);
    const laneIdxs = firstEdge.lanes.map((_, i) => i);
    // shuffle for variety
    for (let i = laneIdxs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [laneIdxs[i], laneIdxs[j]] = [laneIdxs[j], laneIdxs[i]];
    }
    const clearance = firstEdge.length < 20 ? firstEdge.length * 0.25 : this.config.spawnClearance;
    for (const laneIdx of laneIdxs) {
      let minOffset = Infinity;
      for (const other of this.vehicles) {
        if (other.edgeId === firstEdge.id && other.lane === laneIdx && other.offset < minOffset) {
          minOffset = other.offset;
        }
      }
      const vehLen = (item.type === 'bus' ? 12 : item.type === 'truck' ? 8.5 : item.type === 'bicycle' ? 1.8 : 4.5);
      if (minOffset !== Infinity && minOffset < vehLen + clearance) continue;
      const speedLimit = Number.isFinite(firstEdge.speedLimit) ? firstEdge.speedLimit : 13.9;
      const veh = new Vehicle({
        id: item.id,
        type: item.type,
        edgeId: firstEdge.id,
        edgeLength: firstEdge.length,
        lane: laneIdx,
        offset: 0,
        speed: Math.min(speedLimit, 8),
        route: item.route.slice(),
        routeIndex: 0,
        ...(this.config.idmOverrides ? { idmParams: this.config.idmOverrides } : {}),
      });
      this.vehicles.push(veh);
      this.vehicleById.set(veh.id, veh);
      return true;
    }
    return false;
  }

  /** Stage 2: tick all controllers with current queues as detector input. */
  _tickSignals(dt) {
    if (this.signals.size === 0) return;
    const waitingByNode = this._queuesNearNodes();
    for (const [nodeId, ctl] of this.signals) {
      if (ctl.mode === 'actuated') {
        ctl.updateDetectors(waitingByNode.get(nodeId) ?? {});
      }
      ctl.tick(dt);
    }
  }

  /** Vehicles within 30 m of each downstream node, grouped per approach edge. */
  _queuesNearNodes() {
    const map = new Map(); // nodeId -> { approachEdgeId: count }
    for (const v of this.vehicles) {
      if (v.speed >= 2) continue; // only slow/stopped vehicles count as demand
      const edge = this.network.getEdge(v.edgeId);
      if (!edge) continue;
      const distToEnd = edge.length - v.offset;
      if (distToEnd > 30) continue;
      let perApproach = map.get(edge.to);
      if (!perApproach) { perApproach = {}; map.set(edge.to, perApproach); }
      perApproach[edge.id] = (perApproach[edge.id] ?? 0) + 1;
    }
    return map;
  }

  /** Index all vehicles per edge/lane, each lane sorted front-most first. */
  _buildLaneIndex() {
    /** @type {Map<string, Vehicle[][]>} */
    const idx = new Map();
    for (const v of this.vehicles) {
      let lanes = idx.get(v.edgeId);
      if (!lanes) {
        const edge = this.network.requireEdge(v.edgeId);
        lanes = Array.from({ length: edge.laneCount }, () => []);
        idx.set(v.edgeId, lanes);
      }
      const li = Math.min(Math.max(0, v.lane), lanes.length - 1);
      lanes[li].push(v);
    }
    for (const lanes of idx.values()) {
      for (const lane of lanes) lane.sort((a, b) => b.offset - a.offset); // desc: front first
    }
    return idx;
  }

  /**
   * Leader lookup per vehicle: same-lane predecessor or, failing that, the
   * nearest vehicle on the next route edge within `leaderHorizon`.
   * @param {Map<string, Vehicle[][]>} idx
   * @returns {Map<string, {vehicle:Vehicle, gap:number}>}
   */
  _findLeaders(idx) {
    const leaders = new Map();
    for (const v of this.vehicles) {
      const lanes = idx.get(v.edgeId);
      if (!lanes) continue;
      const laneVehs = lanes[Math.min(Math.max(0, v.lane), lanes.length - 1)];
      const pos = laneVehs.indexOf(v);
      if (pos > 0) {
        const lead = laneVehs[pos - 1];
        leaders.set(v.id, { vehicle: lead, gap: lead.rearOffset - v.offset });
        continue;
      }
      // Cross-edge lookahead through the junction.
      const nextId = v.route[v.routeIndex + 1];
      if (!nextId) continue;
      const nextLanes = idx.get(nextId);
      if (!nextLanes) continue;
      const curEdge = this.network.requireEdge(v.edgeId);
      void curEdge;
      let best = null;
      for (const laneVehs2 of nextLanes) {
        if (laneVehs2.length === 0) continue;
        const cand = laneVehs2[laneVehs2.length - 1]; // rearmost on that lane
        if (!best || cand.offset < best.vehicle.offset) best = { vehicle: cand };
      }
      if (!best) continue;
      const gap = curEdge.length - v.offset + best.vehicle.rearOffset;
      if (gap <= this.config.leaderHorizon) {
        leaders.set(v.id, { vehicle: best.vehicle, gap: Math.max(gap, 0.05) });
      }
    }
    return leaders;
  }

  /** Stage 4: IDM accelerations incl. red-light stop-line constraints. */
  _computeAccelerations(leaders) {
    for (const v of this.vehicles) {
      const edge = this.network.requireEdge(v.edgeId);
      const leader = leaders.get(v.id) ?? null;
      const signal = this._signalFor(v, edge);
      v.computeAccel(this._lastDt(), leader, signal, edge);
    }
  }

  #lastDt = null;
  _lastDt() { return this.#lastDt ?? this.config.dt; }

  /** Resolve signal constraint info for a vehicle approaching `edge.to`. */
  _signalFor(v, edge) {
    const ctl = this.signals.get(edge.to);
    if (!ctl) return null;
    const st = ctl.getState();
    const movement = this._movementFor(v, edge);
    const allowed = ctl.allows(edge.id, movement);
    return { state: st.state, allowed };
  }

  /** Classify the upcoming turn from bearings when coordinates allow. */
  _movementFor(v, edge) {
    const nextId = v.route[v.routeIndex + 1];
    if (!nextId) return 'through';
    try {
      const b1 = this.network.getBearingDeg(edge.id);
      const b2 = this.network.getBearingDeg(nextId);
      return classifyTurn(b2 - b1);
    } catch {
      return 'through';
    }
  }

  /** Stage 5: MOBIL decisions using same-edge neighbours. Returns true if any changed. */
  _mobilLaneChanges(lanesIndex) {
    let changedAny = false;
    for (const v of this.vehicles) {
      if (v.pendingAdvance) continue;
      const lanes = lanesIndex.get(v.edgeId);
      if (!lanes || lanes.length < 2) continue;
      const li = Math.min(Math.max(0, v.lane), lanes.length - 1);
      const cur = lanes[li];
      const pos = cur.indexOf(v);
      const targets = [];
      if (li - 1 >= 0) targets.push(li - 1);
      if (li + 1 < lanes.length) targets.push(li + 1);

      let bestDecision = null;
      for (const tl of targets) {
        const target = lanes[tl];
        const tPos = target.findIndex((o) => o.offset <= v.offset); // first vehicle behind/at me
        const newLeader = tPos > 0 ? target[tPos - 1] : target.find((o) => o.offset > v.offset) ?? null;
        const newFollower = target.find((o) => o.offset <= v.offset) ?? null;
        const oldLeader = pos > 0 ? cur[pos - 1] : null;
        const oldFollower = pos < cur.length - 1 ? cur[pos + 1] : null;
        const decision = v.changeLane(tl, {
          oldLeader,
          oldFollower,
          newLeader,
          newFollower,
          params: {},
        });
        if (decision.change) {
          if (!bestDecision || (decision.metrics.incentive ?? 0) > (bestDecision.metrics.incentive ?? 0)) {
            bestDecision = decision;
          }
        }
      }
      if (bestDecision) changedAny = true;
    }
    return changedAny;
  }

  /** Stage 6: integrate motion; handle edge transitions & exits. */
  _moveAndTransition(dt) {
    this.#lastDt = dt;
    const exitedList = [];
    for (const v of this.vehicles) {
      const edge = this.network.getEdge(v.edgeId);
      v.applyMove(dt, edge ? edge.length : undefined);
    }
    for (const v of this.vehicles) {
      if (!v.pendingAdvance) continue;
      const nextId = v.route[v.routeIndex + 1];
      if (nextId) {
        const nextEdge = this.network.getEdge(nextId);
        if (nextEdge) {
          v.advanceToNextEdge(nextEdge);
          continue;
        }
      }
      // Route finished (or broken): exit.
      v.exited = true;
      exitedList.push(v);
    }
    if (exitedList.length > 0) {
      this.vehicles = this.vehicles.filter((v) => !v.exited);
      for (const v of exitedList) {
        this.vehicleById.delete(v.id);
        this.cumulative.exited += 1;
        this.cumulative.travelTime += v.stats.time;
        this.cumulative.delay += v.stats.delay;
        this.cumulative.distanceKm += v.stats.distance / 1000;
        this.completedSamples.push({ id: v.id, type: v.type, ...v.stats });
        if (this.completedSamples.length > this.completedSampleCap) this.completedSamples.shift();
        this.emit('vehicle-removed', { vehicle: v, reason: 'arrived', stats: { ...v.stats } });
      }
    }
  }

  /** Stage 7: KPI collection + history snapshot. */
  _collectKPIs() {
    const completedAgg = {
      count: this.cumulative.exited,
      travelTime: this.cumulative.travelTime,
      delaySum: this.cumulative.delay,
      distanceKm: this.cumulative.distanceKm,
    };
    this.kpis = computeKPIs(
      this.vehicles,
      this.network ? this.network.getAllEdges() : [],
      this.signals.values(),
      { time: this.time, step: this.stepCount, completedAgg }
    );
    this.history.push({
      t: Math.round(this.time * 100) / 100,
      count: this.vehicles.length,
      avgSpeed: this.kpis.avgSpeed,
      flow: this.kpis.flow,
      density: this.kpis.density,
      los: this.kpis.los,
    });
    if (this.history.length > 10000) this.history.shift();
    this.emit('kpi-update', this.kpis);
  }

  // -------------------------------------------------------------- output --

  /**
   * Aggregate statistics over the whole run so far.
   * @returns {Object} summary
   */
  summary() {
    const c = this.cumulative;
    return {
      time: this.time,
      steps: this.stepCount,
      spawned: c.spawned,
      exited: c.exited,
      dropped: c.dropped,
      active: this.vehicles.length,
      avgTravelTimeExited: c.exited > 0 ? Math.round((c.travelTime / c.exited) * 100) / 100 : 0,
      avgDelayExited: c.exited > 0 ? Math.round((c.delay / c.exited) * 100) / 100 : 0,
      totalDistanceKm: Math.round(c.distanceKm * 1000) / 1000,
      lastKpis: this.kpis,
    };
  }

  /**
   * Full serializable state snapshot (used by the worker protocol).
   * @param {boolean} [includeVehicles=true]
   * @returns {Object}
   */
  getState(includeVehicles = true) {
    return {
      step: this.stepCount,
      time: this.time,
      paused: this.paused,
      vehicleCount: this.vehicles.length,
      vehicles: includeVehicles ? this.vehicles.map((v) => v.toJSON()) : [],
      signals: Object.fromEntries([...this.signals.entries()].map(([k, s]) => [k, s.getState()])),
      kpis: this.kpis,
    };
  }
}
