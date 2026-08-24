/**
 * @file Multimodal Manager — owns and advances every non-car entity in the
 * simulation (pedestrians, buses, cyclists) plus the multimodal street
 * furniture they depend on (bus stops, crosswalks).
 *
 * The manager is deliberately decoupled from the vehicle Simulator: motorized
 * traffic is supplied through a pluggable vehicle provider (defaults to
 * `network.vehicles` when present) and signal states through a signal
 * provider, so multimodal simulation works standalone or embedded.
 */

import { Pedestrian } from '../models/pedestrian.js';
import { Bus } from '../models/bus.js';
import { Cyclist } from '../models/cyclist.js';

/** Manager tuning constants. */
export const MANAGER_DEFAULTS = Object.freeze({
  /** Max distance [m] between pedestrian and crosswalk for auto-attachment. */
  crosswalkAttachRadiusM: 40,
  /** Default crosswalk crossing width [m]. */
  crosswalkWidthM: 6,
  /** Meters per degree latitude used by the local projection. */
  mPerDegLat: 110540,
});

/**
 * Central registry and stepper for all multimodal entities.
 */
export class MultimodalManager {
  /**
   * @param {Object|null} [network] Road network ({@link Network} instance or
   *   compatible). Used for edge metadata, leader lookups and coordinate
   *   projection; may be omitted for purely synthetic scenarios.
   * @param {Partial<typeof MANAGER_DEFAULTS>} [opts]
   */
  constructor(network = null, opts = {}) {
    this.network = network ?? null;
    this.opts = { ...MANAGER_DEFAULTS, ...opts };

    /** @type {Pedestrian[]} */ this.pedestrians = [];
    /** @type {Bus[]} */ this.buses = [];
    /** @type {Cyclist[]} */ this.cyclists = [];

    /** @type {Map<string,{stopId:string, edgeId:string, offset:number|null, position:{x:number,y:number}|null, name:string}>} */
    this.busStops = new Map();
    /** @type {Map<string,{crosswalkId:string, edgeId:string, offset:number|null, position:{x:number,y:number}|null, signalGroup:string|null, width:number}>} */
    this.crosswalks = new Map();

    /** Vehicle provider returning the motorized fleet each step. */
    this.vehicleProvider = () =>
      (this.network && Array.isArray(this.network.vehicles) ? this.network.vehicles : []);
    /** Signal provider: `(groupOrEdgeId, ent) => {state,...}|null`. */
    this.signalProvider = null;

    this.simTime = 0;
    /** @type {number[]} completed pedestrian waits [s]. */
    this._waitSamplesSec = [];
    /** @type {string[]} 'on-time' | 'early' | 'late' per scheduled arrival. */
    this._onTimeSamples = [];
    /** @type {WeakMap<Object,number>} bus → arrivals already consumed. */
    this._arrivalCounts = new WeakMap();
    /** @type {{toXY:function}|false|null} lazily built projector. */
    this._projection = null;
  }

  /* --------------------------------------------------------- registration -- */

  /**
   * Register a pedestrian.
   * @param {Object} pedConfig See {@link Pedestrian}.
   * @returns {Pedestrian}
   */
  addPedestrian(pedConfig = {}) {
    const ped = new Pedestrian(pedConfig);
    this.pedestrians.push(ped);
    return ped;
  }

  /**
   * Register a bus on a transit route.
   * @param {Object} busConfig See {@link Bus}.
   * @returns {Bus}
   */
  addBus(busConfig = {}) {
    const bus = new Bus(busConfig);
    this.buses.push(bus);
    this._arrivalCounts.set(bus, 0);
    return bus;
  }

  /**
   * Register a cyclist.
   * @param {Object} cyclistConfig See {@link Cyclist}.
   * @returns {Cyclist}
   */
  addCyclist(cyclistConfig = {}) {
    const cyc = new Cyclist(cyclistConfig);
    this.cyclists.push(cyc);
    return cyc;
  }

  /**
   * Register a bus stop on an edge.
   *
   * @param {string} stopId Unique stop identifier.
   * @param {string} edgeId Edge hosting the stop.
   * @param {number|{x:number,y:number}} position Offset along the edge [m]
   *   or a world-space anchor `{x,y}`.
   * @param {{name?:string}} [meta] Optional metadata.
   * @returns {Object} Registered stop descriptor.
   */
  addBusStop(stopId, edgeId, position = 0, meta = {}) {
    if (typeof stopId !== 'string' || !stopId) throw new TypeError('addBusStop: stopId required');
    if (typeof edgeId !== 'string' || !edgeId) throw new TypeError('addBusStop: edgeId required');
    const { offset, point } = this._parsePosition(position);
    const stop = { stopId, edgeId, offset, position: point, name: meta.name ?? '' };
    this.busStops.set(stopId, stop);
    return stop;
  }

  /**
   * Register a crosswalk on an edge.
   *
   * @param {string} crosswalkId Unique crosswalk identifier.
   * @param {string} edgeId Edge crossed by the walkway.
   * @param {number|{x:number,y:number}} position Curb anchor (offset or `{x,y}`).
   * @param {string|null} [signalGroup=null] Signal group controlling the crossing.
   * @param {{width?:number}} [meta] Optional overrides.
   * @returns {Object} Registered crosswalk descriptor.
   */
  addCrosswalk(crosswalkId, edgeId, position = 0, signalGroup = null, meta = {}) {
    if (typeof crosswalkId !== 'string' || !crosswalkId) throw new TypeError('addCrosswalk: crosswalkId required');
    if (typeof edgeId !== 'string' || !edgeId) throw new TypeError('addCrosswalk: edgeId required');
    const { offset, point } = this._parsePosition(position);
    const cw = {
      crosswalkId,
      edgeId,
      offset,
      position: point,
      signalGroup: typeof signalGroup === 'string' ? signalGroup : null,
      width: Number.isFinite(meta.width) && meta.width > 0 ? meta.width : this.opts.crosswalkWidthM,
    };
    this.crosswalks.set(crosswalkId, cw);
    return cw;
  }

  /** Override the motorized-fleet source: `() => Vehicle[]`. */
  setVehicleProvider(fn) {
    if (typeof fn !== 'function') throw new TypeError('setVehicleProvider: function required');
    this.vehicleProvider = fn;
    return this;
  }

  /** Provide signal states: `(groupOrEdgeId) => {state:'red'|'yellow'|'green'}|null`. */
  setSignalProvider(fn) {
    if (fn !== null && typeof fn !== 'function') throw new TypeError('setSignalProvider: function|null expected');
    this.signalProvider = fn;
    return this;
  }

  /**
   * Accept either a numeric offset or an `{x,y}` point.
   * @private
   */
  _parsePosition(position) {
    let offset = null;
    let point = null;
    if (Number.isFinite(position)) offset = position;
    else if (position && typeof position === 'object') {
      if (Number.isFinite(position.x) && Number.isFinite(position.y)) point = { x: position.x, y: position.y };
      else if (Number.isFinite(position.offset)) offset = position.offset;
    }
    if (offset == null && point == null) {
      throw new TypeError('position must be a numeric offset or {x,y}');
    }
    return { offset, point };
  }

  /* ------------------------------------------------------------ stepping -- */

  /**
   * Advance every multimodal entity by `dt` seconds.
   *
   * @param {number} dt Time step [s].
   * @throws {RangeError} When dt is not positive/finite.
   */
  update(dt) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`MultimodalManager.update: dt must be > 0, got ${dt}`);
    }
    this.simTime += dt;

    const vehicles = (this.vehicleProvider() ?? []).filter((v) => v && !v.exited);
    const byEdge = this._groupByEdge(vehicles);

    // --- pedestrians --------------------------------------------------------
    for (const ped of this.pedestrians) {
      if (ped.state === 'arrived') continue;
      const ctx = this._pedestrianContext(ped, byEdge);
      const wasWaiting = ped.state === 'waiting';
      ped.update(dt, this._pedNeighbors(ped), ctx.crosswalk);
      if (wasWaiting && ped.state === 'crossing') this._waitSamplesSec.push(ped.waitTime);
    }

    // --- buses ---------------------------------------------------------------
    for (const bus of this.buses) {
      if (!bus.exited) {
        const edge = this._edgeFor(bus.edgeId);
        bus.update(dt, this._leaderFor(bus, byEdge), this._signalFor(bus), edge);
        this._advanceAlongRoute(bus);
      }
      this._consumeArrivals(bus);
    }

    // --- cyclists --------------------------------------------------------------
    for (const cyc of this.cyclists) {
      if (cyc.exited) continue;
      const edge = this._edgeFor(cyc.edgeId);
      cyc.update(dt, this._leaderFor(cyc, byEdge), this._signalFor(cyc), edge);
      this._advanceAlongRoute(cyc);
    }
  }

  /* -------------------------------------------------------------- helpers -- */

  /** Group vehicles by edge id (lists sorted by descending offset). */
  _groupByEdge(vehicles) {
    const m = new Map();
    for (const v of vehicles) {
      if (!v.edgeId) continue;
      if (!m.has(v.edgeId)) m.set(v.edgeId, []);
      m.get(v.edgeId).push(v);
    }
    for (const list of m.values()) list.sort((a, b) => b.offset - a.offset);
    return m;
  }

  /** Nearest same-edge/same-lane vehicle ahead of `ent` (or null). */
  _leaderFor(ent, byEdge) {
    const list = byEdge.get(ent.edgeId);
    if (!list) return null;
    let best = null;
    for (const v of list) {
      if (v === ent) continue;
      if ((v.lane ?? 0) !== (ent.lane ?? 0)) continue;
      const gap = v.offset - (v.length ?? 4.5) - ent.offset;
      if (gap > 0 && (!best || gap < best.gap)) best = { vehicle: v, gap };
    }
    return best;
  }

  _signalFor(ent) {
    if (!this.signalProvider) return null;
    try {
      return this.signalProvider(ent.edgeId, ent) ?? null;
    } catch {
      return null;
    }
  }

  _edgeFor(edgeId) {
    if (!this.network || typeof this.network.getEdge !== 'function' || !edgeId) return null;
    try {
      return this.network.getEdge(edgeId);
    } catch {
      return null;
    }
  }

  /** Follow route transitions once an agent overruns its current edge. */
  _advanceAlongRoute(agent) {
    if (!agent.pendingAdvance || !this.network || typeof this.network.getPredecessor !== 'function') return;
    let next = null;
    try {
      next = this.network.getPredecessor(agent);
    } catch {
      next = null;
    }
    agent.advanceToNextEdge(next);
  }

  /** Other pedestrians within interaction range (simple O(n²) scan). */
  _pedNeighbors(ped) {
    const out = [];
    for (const other of this.pedestrians) {
      if (other === ped || other.state === 'arrived') continue;
      const dx = other.position.x - ped.position.x;
      const dy = other.position.y - ped.position.y;
      if (dx * dx + dy * dy < 25) out.push(other); // within 5 m
    }
    return out;
  }

  /**
   * Build the pedestrian update context: attached crosswalk + nearby vehicles.
   * @private
   */
  _pedestrianContext(ped, byEdge) {
    const cw = this._attachCrosswalk(ped);
    if (!cw) return { crosswalk: null };

    const geom = this._crosswalkGeometry(cw);
    const vehXY = [];
    for (const v of byEdge.get(cw.edgeId) ?? []) {
      const p = this._projectAgent(v);
      if (!p) continue;
      vehXY.push({
        id: v.id,
        x: p.x,
        y: p.y,
        speed: v.speed ?? 0,
        heading: p.heading ?? null,
      });
    }

    let signal = null;
    if (cw.signalGroup && this.signalProvider) {
      try {
        signal = this.signalProvider(cw.signalGroup, cw) ?? null;
      } catch {
        signal = null;
      }
    }

    return {
      crosswalk: {
        id: cw.crosswalkId,
        entry: geom.entry,
        exit: geom.exit,
        width: cw.width,
        signal: signal ?? { state: 'green' }, // default: traffic flowing
        phase: signal?.phase ?? null,
        vehicles: vehXY,
        obstacles: [],
      },
    };
  }

  /** Pick the pedestrian's crosswalk (explicit id wins, then proximity). */
  _attachCrosswalk(ped) {
    if (ped.crosswalkId) return this.crosswalks.get(ped.crosswalkId) ?? null;
    if (!Number.isFinite(ped.position?.x)) return null;
    let best = null;
    let bestD = this.opts.crosswalkAttachRadiusM;
    for (const cw of this.crosswalks.values()) {
      const p = this._facilityXY(cw);
      if (!p) continue;
      const d = Math.hypot(p.x - ped.position.x, p.y - ped.position.y);
      if (d < bestD) {
        bestD = d;
        best = cw;
      }
    }
    return best;
  }

  /** Curb/exit anchors; default orientation spans the Y axis around anchor. */
  _crosswalkGeometry(cw) {
    const anchor = this._facilityXY(cw) ?? { x: 0, y: 0 };
    const half = cw.width / 2;
    return {
      entry: { x: anchor.x, y: anchor.y - half },
      exit: { x: anchor.x, y: anchor.y + half },
    };
  }

  /* ---------------------------------------------------------- projection -- */

  /**
   * Lazily build a lat/lng → local-meters projector from network node coords
   * (`null` until first needed, `false` when unavailable).
   * @private
   */
  _buildProjector() {
    if (this._projection !== null) return this._projection;
    this._projection = false;
    const net = this.network;
    if (!net || typeof net.getAllNodes !== 'function' || typeof net.getNode !== 'function') {
      return this._projection;
    }
    const nodes = net.getAllNodes().filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
    if (nodes.length === 0) return this._projection;
    const lat0 = Math.min(...nodes.map((n) => n.lat));
    const lng0 = Math.min(...nodes.map((n) => n.lng));
    const cosLat = Math.cos(((lat0 + 1e-6) * Math.PI) / 180);
    this._projection = {
      toXY: (lat, lng) => ({
        x: (lng - lng0) * 111320 * cosLat,
        y: (lat - lat0) * this.opts.mPerDegLat,
      }),
    };
    return this._projection;
  }

  /** Project an edge endpoint pair to local meters (or null). */
  _edgeEndpointsXY(edge) {
    const proj = this._buildProjector();
    if (!proj || !edge) return null;
    try {
      const a = this.network.getNode(edge.from);
      const b = this.network.getNode(edge.to);
      if (!a.hasCoords?.() || !b.hasCoords?.()) return null;
      return { a: proj.toXY(a.lat, a.lng), b: proj.toXY(b.lat, b.lng) };
    } catch {
      return null;
    }
  }

  /** World-space anchor of a registered facility. */
  _facilityXY(facility) {
    if (facility.position) return facility.position;
    if (facility.offset == null) return null;
    const edge = this._edgeFor(facility.edgeId);
    const pts = this._edgeEndpointsXY(edge);
    if (!pts) return null;
    const t = Math.max(0, Math.min(1, facility.offset / Math.max(edge.length, 1e-6)));
    return { x: pts.a.x + (pts.b.x - pts.a.x) * t, y: pts.a.y + (pts.b.y - pts.a.y) * t };
  }

  /** Project any agent (vehicle/bus/cyclist) onto world space (+ heading). */
  _projectAgent(v) {
    if (v.position && Number.isFinite(v.position.x)) return { ...v.position, heading: null };
    const edge = this._edgeFor(v.edgeId);
    const pts = this._edgeEndpointsXY(edge);
    if (!pts || !Number.isFinite(v.offset)) return null;
    const t = Math.max(0, Math.min(1, v.offset / Math.max(edge.length, 1e-6)));
    const dx = pts.b.x - pts.a.x;
    const dy = pts.b.y - pts.a.y;
    const m = Math.hypot(dx, dy);
    return {
      x: pts.a.x + dx * t,
      y: pts.a.y + dy * t,
      heading: m > 1e-9 ? { x: dx / m, y: dy / m } : null,
    };
  }

  /** Pull new schedule-adherence records from a bus into manager samples. */
  _consumeArrivals(bus) {
    const seen = this._arrivalCounts.get(bus) ?? 0;
    for (let i = seen; i < bus.arrivals.length; i++) {
      if (bus.arrivals[i].status !== 'unscheduled') this._onTimeSamples.push(bus.arrivals[i].status);
    }
    this._arrivalCounts.set(bus, bus.arrivals.length);
  }

  /* ---------------------------------------------------------------- stats -- */

  /**
   * Aggregate multimodal KPIs.
   *
   * @returns {{pedCount:number, busCount:number, cyclistCount:number,
   *            avgWaitTime:number, busOnTimeRate:number}}
   */
  getStats() {
    const avgWait = this._waitSamplesSec.length > 0
      ? this._waitSamplesSec.reduce((a, b) => a + b, 0) / this._waitSamplesSec.length
      : 0;
    const onTimeRate = this._onTimeSamples.length > 0
      ? this._onTimeSamples.filter((s) => s === 'on-time').length / this._onTimeSamples.length
      : 0;

    return {
      pedCount: this.pedestrians.filter((p) => p.state !== 'arrived').length,
      busCount: this.buses.filter((b) => !b.exited).length,
      cyclistCount: this.cyclists.filter((c) => !c.exited).length,
      avgWaitTime: +avgWait.toFixed(3),
      busOnTimeRate: +onTimeRate.toFixed(3),
    };
  }

  /** Serializable snapshot of all entities (rendering / worker transfer). */
  toJSON() {
    return {
      simTime: +this.simTime.toFixed(3),
      pedestrians: this.pedestrians.map((p) => p.toJSON()),
      buses: this.buses.map((b) => b.toJSON()),
      cyclists: this.cyclists.map((c) => c.toJSON()),
      stats: this.getStats(),
    };
  }
}
