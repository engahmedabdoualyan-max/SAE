/**
 * @file Vehicle agent combining IDM car-following, MOBIL lane changes and
 * route-following across consecutive edges.
 *
 * Position convention:
 *  - `edgeId`  : current edge.
 *  - `offset`  : distance from the edge start to the vehicle's FRONT bumper [m].
 *  - `lane`    : zero-based lane index (0 = rightmost).
 */

import { idmAcceleration, resolveIdmParams } from './idm.js';
import { mobilDecision } from './mobil.js';

/** Physical dimensions per vehicle type. */
export const TYPE_SPECS = Object.freeze({
  sedan: Object.freeze({ length: 4.5, width: 1.8 }),
  bus: Object.freeze({ length: 12.0, width: 2.5 }),
  truck: Object.freeze({ length: 8.5, width: 2.4 }),
  motorcycle: Object.freeze({ length: 2.2, width: 0.8 }),
  tuktuk: Object.freeze({ length: 3.2, width: 1.5 }),
  bicycle: Object.freeze({ length: 1.8, width: 0.6 }),
  av: Object.freeze({ length: 4.6, width: 1.9 }),
});

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

let _seq = 0;

/** Reset the auto-increment id counter (testing helper). */
export function resetVehicleIdCounter() {
  _seq = 0;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Simulation vehicle.
 */
export class Vehicle {
  /**
   * @param {Object} cfg
   * @param {string} [cfg.id] Unique id (auto-generated when omitted).
   * @param {string} [cfg.type='sedan'] One of the keys of {@link TYPE_SPECS}.
   * @param {string|null} [cfg.edgeId] Starting edge id.
   * @param {number} [cfg.edgeLength=100] Length of the starting edge [m].
   * @param {number} [cfg.lane=0] Starting lane index.
   * @param {number} [cfg.offset=0] Front-bumper offset on the edge [m].
   * @param {number} [cfg.speed=0] Initial speed [m/s].
   * @param {string[]} [cfg.route=[]] Ordered edge ids to traverse.
   * @param {number} [cfg.routeIndex=0] Index into `route` of `edgeId`.
   * @param {boolean} [cfg.isAV] Force AV behaviour (defaults true for type 'av').
   * @param {Partial<import('./idm.js').IdmParams>} [cfg.idmParams] Param overrides.
   * @param {number} [cfg.length] Override body length [m].
   * @param {number} [cfg.width] Override body width [m].
   * @param {string} [cfg.color] CSS color.
   */
  constructor(cfg = {}) {
    if (typeof cfg !== 'object' || cfg === null) throw new TypeError('Vehicle: config object expected');
    this.id = cfg.id ?? `veh-${++_seq}`;
    this.type = typeof cfg.type === 'string' ? cfg.type : 'sedan';
    const spec = TYPE_SPECS[this.type] ?? TYPE_SPECS.sedan;
    this.length = Number.isFinite(cfg.length) ? cfg.length : spec.length;
    this.width = Number.isFinite(cfg.width) ? cfg.width : spec.width;
    this.isAV = cfg.isAV ?? this.type === 'av';

    /** @type {import('./idm.js').IdmParams} */
    this.idmParams = resolveIdmParams(this.isAV ? 'av' : this.type, cfg.idmParams);

    this.edgeId = cfg.edgeId ?? null;
    this.edgeLength = Number.isFinite(cfg.edgeLength) && cfg.edgeLength > 0 ? cfg.edgeLength : 100;
    this.lane = Number.isInteger(cfg.lane) && cfg.lane >= 0 ? cfg.lane : 0;
    this.offset = Number.isFinite(cfg.offset) && cfg.offset >= 0 ? cfg.offset : 0;
    this.speed = Number.isFinite(cfg.speed) && cfg.speed >= 0 ? cfg.speed : 0;
    /** Last computed acceleration [m/s^2]. */
    this.accel = 0;

    this.route = Array.isArray(cfg.route) ? cfg.route.slice() : [];
    this.routeIndex = Number.isInteger(cfg.routeIndex) && cfg.routeIndex >= 0 ? cfg.routeIndex : 0;
    this.color = cfg.color ?? (this.isAV ? '#22d3ee' : PALETTE[hashString(this.id) % PALETTE.length]);

    /** Set when the front bumper passed the end of the current edge. */
    this.pendingAdvance = false;
    this.exited = false;
    this._overshoot = 0;
    this._wasStopped = false;
    this.laneChanges = 0;

    /** Lifetime statistics (updated by computeAccel/applyMove). */
    this.stats = { distance: 0, time: 0, delay: 0, stops: 0 };
  }

  // ------------------------------------------------------------- accessors --

  /** Rear-bumper offset along the edge [m]. */
  get rearOffset() {
    return this.offset - this.length;
  }

  /** Current route target edge id (null when the route is finished). */
  get nextEdgeId() {
    return this.route[this.routeIndex + 1] ?? null;
  }

  /**
   * Attach edge metadata (called by the Simulator when placing / advancing).
   * @param {{length?:number}|null} edge
   */
  setEdgeMeta(edge) {
    if (edge && Number.isFinite(edge.length) && edge.length > 0) this.edgeLength = edge.length;
  }

  // ------------------------------------------------------------ dynamics ----

  /**
   * Compute IDM acceleration for this step, including leader interaction
   * (possibly on the NEXT edge) and traffic-signal constraints at the end of
   * the current edge. Stores the result in {@link Vehicle#accel}.
   *
   * @param {number} dt Time step [s].
   * @param {Vehicle|{vehicle:Vehicle,gap:number}|null} [leader]
   *   Leader vehicle; an explicit precomputed gap may be supplied for
   *   cross-edge leaders: `{ vehicle, gap }`.
   * @param {{state:'green'|'yellow'|'red', allowed?:boolean}|null} [signal]
   *   Signal state at the end of the current edge (`allowed=false` means the
   *   movement faces a red even during a green phase).
   * @param {{length:number, speedLimit?:number}|null} [edge] Current edge data.
   * @returns {number} The computed acceleration [m/s^2].
   */
  computeAccel(dt, leader = null, signal = null, edge = null) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`Vehicle.computeAccel: dt must be > 0, got ${dt}`);
    }
    const len = edge && Number.isFinite(edge.length) ? edge.length : this.edgeLength;
    const limit = edge && Number.isFinite(edge.speedLimit) && edge.speedLimit > 0 ? edge.speedLimit : Infinity;
    const v0 = Math.max(0.5, Math.min(this.idmParams.v0, limit));

    // --- gap & relative speed to leader ------------------------------------
    let gap = Infinity;
    let leadSpeed = 0;
    if (leader) {
      const lv = leader.vehicle ?? leader;
      gap = typeof leader.gap === 'number' ? leader.gap : lv.offset - lv.length - this.offset;
      leadSpeed = lv.speed ?? 0;
      if (gap < 0.05) gap = 0.05; // overlap guard
    }

    // --- traffic-signal constraint (virtual stopped leader at stop line) ---
    if (signal && (signal.state === 'red' || signal.state === 'yellow')) {
      const movementAllowed = signal.allowed !== false;
      const stopDist = len - this.offset - 0.5; // keep half a meter behind line
      if (stopDist > 0) {
        const hardRed = signal.state === 'red' || !movementAllowed;
        if (hardRed) {
          if (gap > stopDist) { gap = stopDist; leadSpeed = 0; }
        } else {
          // Yellow: proceed only when stopping would be uncomfortably hard.
          const reqDecel = (this.speed * this.speed) / (2 * Math.max(stopDist, 0.1));
          if (reqDecel <= this.idmParams.b * 1.5 && gap > stopDist) {
            gap = stopDist;
            leadSpeed = 0;
          }
        }
      }
    }

    const dv = this.speed - leadSpeed;
    const acc = idmAcceleration(this.speed, gap, dv, { ...this.idmParams, v0 });
    this.accel = acc;

    // --- lifetime statistics ----------------------------------------------
    this.stats.time += dt;
    const desired = Math.max(v0, 0.1);
    this.stats.delay += dt * Math.max(0, 1 - Math.min(this.speed / desired, 1));
    const stopped = this.speed < 0.1;
    if (stopped && !this._wasStopped) this.stats.stops += 1;
    this._wasStopped = stopped;

    return acc;
  }

  /**
   * Integrate one motion step using the stored acceleration.
   * Flags {@link Vehicle#pendingAdvance} once the front bumper passes the edge end.
   * @param {number} dt Time step [s].
   * @param {number} [edgeLength] Current edge length (defaults to cached).
   * @returns {Vehicle} this
   */
  applyMove(dt, edgeLength = this.edgeLength) {
    let v = this.speed + this.accel * dt;
    if (v < 0.02 && this.accel < 0) v = 0;
    v = Math.max(0, v);
    const ds = v * dt;
    this.speed = v;
    this.offset += ds;
    this.stats.distance += ds;
    if (Number.isFinite(edgeLength) && this.offset >= edgeLength) {
      this._overshoot = this.offset - edgeLength;
      this.offset = edgeLength;
      this.pendingAdvance = true;
    }
    return this;
  }

  /**
   * Convenience single-call update: compute acceleration then move.
   * @param {number} dt @param {Vehicle|{vehicle:Vehicle,gap:number}|null} [leader]
   * @param {{state:string,allowed?:boolean}|null} [signal]
   * @param {{length:number,speedLimit?:number}|null} [edge]
   * @returns {Vehicle} this
   */
  update(dt, leader = null, signal = null, edge = null) {
    this.computeAccel(dt, leader, signal, edge);
    this.applyMove(dt, edge ? edge.length : undefined);
    return this;
  }

  // -------------------------------------------------------- lane changing --

  /**
   * Evaluate a lane change with MOBIL and execute it when safe+beneficial.
   *
   * @param {number} newLane Target lane index.
   * @param {Object|null} [trafficState] Neighbour context, see
   *   {@link module:models/mobil.mobilDecision}.
   * @returns {{change:boolean, reason:string, metrics:Object}} MOBIL decision.
   */
  changeLane(newLane, trafficState = null) {
    const decision = mobilDecision(this, newLane, this.lane, trafficState ?? {});
    if (decision.change) {
      this.lane = newLane;
      this.laneChanges += 1;
    }
    return decision;
  }

  // ---------------------------------------------------------------- route --

  /**
   * Move onto the next edge of the route after reaching the end of the
   * current one (carries over any overshoot distance).
   *
   * @param {{id:string,length:number}|string|null} nextEdge Edge object or id;
   *   `null` marks the vehicle as exited.
   * @returns {Vehicle} this
   */
  advanceToNextEdge(nextEdge) {
    if (!nextEdge) {
      this.exited = true;
      this.pendingAdvance = false;
      return this;
    }
    const isObj = typeof nextEdge === 'object';
    const overshoot = this._overshoot || Math.max(0, this.offset - this.edgeLength);
    this.routeIndex += 1;
    this.edgeId = isObj ? nextEdge.id : nextEdge;
    if (isObj && Number.isFinite(nextEdge.length)) this.edgeLength = nextEdge.length;
    // Never spawn deeper than where our rear bumper stays on the edge.
    this.offset = Math.min(overshoot, Math.max(0, this.edgeLength - this.length));
    this._overshoot = 0;
    this.pendingAdvance = false;
    this.accel = 0;
    return this;
  }

  /** Compact serializable snapshot (for rendering / worker transfer). */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      edgeId: this.edgeId,
      lane: this.lane,
      offset: Math.round(this.offset * 100) / 100,
      speed: Math.round(this.speed * 100) / 100,
      accel: Math.round(this.accel * 100) / 100,
      color: this.color,
      length: this.length,
      width: this.width,
      isAV: this.isAV,
      routeProgress: this.route.length > 0 ? (this.routeIndex + 1) / this.route.length : 0,
    };
  }
}
