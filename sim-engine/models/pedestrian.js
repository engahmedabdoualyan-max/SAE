/**
 * @file Pedestrian agent — Social Force Model (Helbing & Molnár 1995) combined
 * with a pedestrian-specific Intelligent Driver Model for longitudinal
 * regulation and signal/gap-aware crossing decisions.
 *
 * Forces acting on a pedestrian:
 *   F_total = F_desired + Σ F_repulsive(pedestrians) + Σ F_repulsive(obstacles)
 *           + Σ F_repulsive(vehicles)
 *
 *   F_desired = (v0 · ê_i − v_i) / τ            (relaxation toward desired velocity)
 *   F_rep     = A · exp((r_ij − d_ij) / B) · n̂  (elastic repulsion, drops off fast)
 *
 * Units are SI: positions m, speeds m/s, forces m/s^2 (specific force).
 */

import { idmAcceleration } from './idm.js';

/**
 * Social Force Model parameters.
 *
 * @typedef {Object} PedestrianParams
 * @property {number} desiredSpeed Free-flow walking speed [m/s] (1.4 ≈ 5 km/h).
 * @property {number} maxAccel     Maximum acceleration [m/s^2].
 * @property {number} comfortDecel Comfortable deceleration [m/s^2].
 * @property {number} tau          Relaxation time τ [s].
 * @property {number} A_ped        Pedestrian-pedestrian repulsion strength.
 * @property {number} B_ped        Pedestrian-pedestrian repulsion range [m].
 * @property {number} A_obs        Obstacle repulsion strength.
 * @property {number} B_obs        Obstacle repulsion range [m].
 * @property {number} A_veh        Vehicle repulsion strength.
 * @property {number} B_veh        Vehicle repulsion range [m].
 * @property {number} radius       Body radius [m].
 * @property {number} baseSafeGap  Base clearance to a stopped vehicle [m].
 * @property {number} marginTime   Extra time buffer when judging gaps [s].
 */

/** Default pedestrian parameters (overridable per instance). */
export const PEDESTRIAN_DEFAULTS = Object.freeze({
  desiredSpeed: 1.4,
  maxAccel: 1.0,
  comfortDecel: 3.0,
  tau: 0.6,
  A_ped: 1.5,
  B_ped: 0.35,
  A_obs: 4.0,
  B_obs: 0.2,
  A_veh: 10.0,
  B_veh: 0.7,
  radius: 0.25,
  baseSafeGap: 4.0,
  marginTime: 1.0,
});

/**
 * Pedestrian IDM parameter set — deliberately different from motor vehicles:
 * very low desired speed, aggressive comfortable deceleration (pedestrians
 * stop quickly), short headways and small standstill gaps.
 *
 * @type {Readonly<{v0:number, a:number, b:number, s0:number, T:number}>}
 */
export const PED_IDM_PARAMS = Object.freeze({
  v0: 1.4,   // desired walking speed [m/s]
  a: 1.0,    // maximum acceleration [m/s^2]
  b: 3.0,    // comfortable deceleration [m/s^2] (vs 2.0 for cars)
  s0: 0.3,   // minimum standstill gap [m] (vs 2.0 for cars)
  T: 0.6,    // desired time headway [s]
  delta: 4,  // free-acceleration exponent [-]
});

/**
 * Longitudinal pedestrian acceleration via IDM with pedestrian parameters.
 *
 * @param {number} v   Current speed [m/s].
 * @param {number} s   Gap to the leader / obstruction [m]; `Infinity` = free.
 * @param {number} dv  Approach rate (v − v_leader) [m/s].
 * @param {Partial<typeof PED_IDM_PARAMS>} [params] Overrides.
 * @returns {number} Acceleration [m/s^2].
 */
export function pedestrianIdmAcceleration(v, s, dv, params = PED_IDM_PARAMS) {
  return idmAcceleration(v, s, dv, { ...PED_IDM_PARAMS, ...params });
}

const VALID_STATES = new Set(['walking', 'waiting', 'crossing', 'arrived']);
const MAX_INTERNAL_DT = 0.1; // substep cap keeps explicit Euler stable
const ARRIVE_EPS = 0.6;      // distance considered "at destination" [m]
const CURB_EPS = 2.0;        // distance to crosswalk entry treated as "at curb" [m]

function vec(x, y) { return { x, y }; }
function norm(v) {
  const m = Math.hypot(v.x, v.y);
  return m > 1e-9 ? vec(v.x / m, v.y / m) : vec(0, 0);
}
function sub(a, b) { return vec(a.x - b.x, a.y - b.y); }
function len(a) { return Math.hypot(a.x, a.y); }

/**
 * Distance from a point to a segment (for wall/curb obstacles).
 * @param {{x:number,y:number}} p @param {{x1:number,y1:number,x2:number,y2:number}} seg
 * @returns {number}
 */
function pointSegmentDist(p, seg) {
  const ax = seg.x1, ay = seg.y1, bx = seg.x2, by = seg.y2;
  const abx = bx - ax, aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 > 1e-12
    ? Math.max(0, Math.min(1, ((p.x - ax) * abx + (p.y - ay) * aby) / ab2))
    : 0;
  return Math.hypot(p.x - (ax + t * abx), p.y - (ay + t * aby));
}

/**
 * Simulation pedestrian.
 *
 * Lifecycle: `walking` → (approaches controlled crossing) `waiting` →
 * (signal allows AND vehicle gap is safe) `crossing` → far side → `walking`
 * again, until `arrived`.
 */
export class Pedestrian {
  /**
   * @param {Object} cfg
   * @param {string} [cfg.id] Unique id (auto-generated when omitted).
   * @param {{x:number,y:number}|number[]} [cfg.position] Start position {x,y} or [x,y].
   * @param {{x:number,y:number}|number[]} [cfg.destination] Goal position.
   * @param {number} [cfg.speed] Initial scalar speed [m/s] (direction = toward destination).
   * @param {'walking'|'waiting'|'crossing'} [cfg.state='walking'] Initial state.
   * @param {string|null} [cfg.crosswalkId] Crosswalk this pedestrian intends to use.
   * @param {Partial<PedestrianParams>} [cfg.params] Parameter overrides.
   * @param {Partial<typeof PED_IDM_PARAMS>} [cfg.idmParams] IDM overrides.
   */
  constructor(cfg = {}) {
    if (typeof cfg !== 'object' || cfg === null) throw new TypeError('Pedestrian: config object expected');
    this.id = typeof cfg.id === 'string' && cfg.id ? cfg.id : `ped-${Pedestrian._seq += 1}`;

    const toPt = (p, name) => {
      if (Array.isArray(p) && p.length >= 2) return vec(Number(p[0]), Number(p[1]));
      if (p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y)) return vec(p.x, p.y);
      throw new TypeError(`Pedestrian "${this.id}": ${name} must be {x,y} or [x,y]`);
    };
    /** @type {{x:number,y:number}} */ this.position = toPt(cfg.position ?? { x: 0, y: 0 }, 'position');
    /** @type {{x:number,y:number}} */ this.destination = toPt(cfg.destination ?? this.position, 'destination');

    this.params = { ...PEDESTRIAN_DEFAULTS, ...(cfg.params ?? {}) };
    this.idmParams = { ...PED_IDM_PARAMS, ...(cfg.idmParams ?? {}) };

    /** @type {{vx:number, vy:number}} */ this.velocity = vec(0, 0);
    const dir0 = norm(sub(this.destination, this.position));
    const s0 = Number.isFinite(cfg.speed) && cfg.speed >= 0 ? cfg.speed : 0;
    this.velocity = vec(dir0.x * s0, dir0.y * s0);

    const state = cfg.state ?? 'walking';
    if (!VALID_STATES.has(state)) throw new TypeError(`Pedestrian: invalid state "${state}"`);
    this.state = /** @type {'walking'|'waiting'|'crossing'|'arrived'} */ (state);

    /** Crosswalk this pedestrian is heading for (registered id, optional). */
    this.crosswalkId = typeof cfg.crosswalkId === 'string' ? cfg.crosswalkId : null;

    /** Active crossing context (set when entering `crossing`). */
    this._crossingCtx = null;

    // Lifetime statistics.
    this.waitTime = 0;          // current continuous wait [s]
    this.totalWaitTime = 0;     // cumulative waiting [s]
    this.crossings = 0;         // completed crossings
    this.distanceWalked = 0;    // [m]
    this.timeActive = 0;        // [s]

    /** Last computed resultant specific force [m/s^2] (diagnostics). */
    this.force = vec(0, 0);
  }

  /** Current scalar speed [m/s]. */
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  /** Unit vector pointing at the current movement target. */
  _target() {
    if (this.state === 'crossing' && this._crossingCtx) return this._crossingCtx.exit;
    return this.destination;
  }

  /**
   * True when the pedestrian may start crossing given the signal state and
   * pedestrian phase.
   *
   * Semantics: `phase` describes the PEDESTRIAN signal (`'walk'`,
   * `'flashing'`, `'don't walk'`) and takes precedence. Without an explicit
   * phase, `signal.state` is interpreted as the parallel VEHICULAR indication:
   * pedestrians may cross when facing traffic holds red.
   *
   * @param {{state?:string}|null} [signal] Signal state object (may be null = uncontrolled).
   * @param {string|null} [phase] Explicit pedestrian phase override.
   * @returns {boolean}
   */
  canCross(signal = null, phase = null) {
    if (phase === 'walk') return true;
    if (phase === 'flashing' || phase === 'dont_walk' || phase === "don't walk") return false;
    if (!signal) return true; // uncontrolled crossing
    const st = String(signal.state ?? '').toLowerCase();
    if (st === 'walk') return true;
    if (st === 'flashing' || st === "don't walk" || st === 'dont_walk') return false;
    // Vehicular indications: cross only on red (traffic held).
    if (st === 'red') return true;
    return false; // green / yellow / unknown → yield to vehicles
  }

  /**
   * Gap-safety check: is it safe to step in front of the listed vehicles?
   * A vehicle is unsafe when it is moving toward the pedestrian and closer
   * than `requiredGap = baseSafeGap + v_veh · (clearTime + margin)`, where
   * clearTime is the time needed to traverse the crosswalk width.
   *
   * @param {Array<{x:number,y:number,speed?:number,heading?:{x:number,y:number}}> | undefined} [vehicles]
   * @param {{width?:number}|null} [crosswalk] Provides the crossing width [m].
   * @returns {boolean} true when no conflicting vehicle is too close.
   */
  isGapSafe(vehicles, crosswalk = null) {
    if (!Array.isArray(vehicles) || vehicles.length === 0) return true;
    const width = Number.isFinite(crosswalk?.width) && crosswalk.width > 0 ? crosswalk.width : 6;
    const clearTime = width / Math.max(this.params.desiredSpeed, 0.2);

    for (const veh of vehicles) {
      if (!veh || !Number.isFinite(veh.x) || !Number.isFinite(veh.y)) continue;
      const vSpeed = Number.isFinite(veh.speed) ? Math.max(0, veh.speed) : 0;
      if (vSpeed < 0.1) continue; // parked / queued vehicles do not block

      // Ignore vehicles moving AWAY from the pedestrian.
      if (veh.heading && Number.isFinite(veh.heading.x) && Number.isFinite(veh.heading.y)) {
        const away = norm(veh.heading);
        const toPed = norm(sub(this.position, veh));
        if (away.x * toPed.x + away.y * toPed.y < 0.05) continue;
      }

      const d = len(sub(veh, this.position));
      const requiredGap = this.params.baseSafeGap + vSpeed * (clearTime + this.params.marginTime);
      if (d < requiredGap) return false; // yield: gap below safe gap
    }
    return true;
  }

  // ------------------------------------------------------------- dynamics --

  /**
   * Desired force: relaxes the current velocity toward `desiredSpeed · ê`.
   * @private
   */
  _desiredForce() {
    const target = this._target();
    const e = norm(sub(target, this.position));
    return vec(
      (this.params.desiredSpeed * e.x - this.velocity.x) / this.params.tau,
      (this.params.desiredSpeed * e.y - this.velocity.y) / this.params.tau,
    );
  }

  /**
   * Generic exponential repulsion from neighbour `j`.
   * @private
   */
  _repulse(from, A, B, extraRadius = 0) {
    const dvec = sub(this.position, from);
    const d = len(dvec);
    const rij = this.params.radius + extraRadius;
    if (d >= rij + 6 * B || d < 1e-6) return vec(0, 0);
    const n = vec(dvec.x / d, dvec.y / d);
    const mag = A * Math.exp((rij - d) / B);
    return vec(n.x * mag, n.y * mag);
  }

  /**
   * Sum of all repulsive contributions.
   * @private
   * @param {Array<Object>} neighbors Other pedestrians ({position, radius}).
   * @param {{obstacles?:Array<{x1:number,y1:number,x2:number,y2:number}>,
   *         vehicles?:Array<{x:number,y:number,speed?:number,radius?:number}>}|null} ctx
   */
  _repulsiveForces(neighbors, ctx) {
    const f = vec(0, 0);
    for (const o of neighbors ?? []) {
      const p = o?.position ?? o;
      if (!p || o === this) continue;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const r = Number.isFinite(o.radius) ? o.radius : this.params.radius;
      const rf = this._repulse(p, this.params.A_ped, this.params.B_ped, r);
      f.x += rf.x; f.y += rf.y;
    }
    for (const ob of ctx?.obstacles ?? []) {
      const d = pointSegmentDist(this.position, ob);
      if (!Number.isFinite(d) || d >= 6 * this.params.B_obs) continue;
      // Direction away from the closest point on the segment.
      const ax = ob.x1, ay = ob.y1, bx = ob.x2, by = ob.y2;
      const abx = bx - ax, aby = by - ay;
      const ab2 = abx * abx + aby * aby;
      const t = ab2 > 1e-12 ? Math.max(0, Math.min(1, ((this.position.x - ax) * abx + (this.position.y - ay) * aby) / ab2)) : 0;
      const dvec = sub(this.position, vec(ax + t * abx, ay + t * aby));
      const dl = len(dvec);
      if (dl < 1e-6) continue;
      const mag = this.params.A_obs * Math.exp((this.params.radius - dl) / this.params.B_obs);
      f.x += (dvec.x / dl) * mag; f.y += (dvec.y / dl) * mag;
    }
    for (const veh of ctx?.vehicles ?? []) {
      if (!veh || !Number.isFinite(veh.x) || !Number.isFinite(veh.y)) continue;
      // Vehicles repel harder the faster they move (dynamic danger).
      const dyn = 1 + (Number.isFinite(veh.speed) ? veh.speed : 0) / 5;
      const rf = this._repulse(veh, this.params.A_veh * dyn, this.params.B_veh, Number.isFinite(veh.radius) ? veh.radius : 2);
      f.x += rf.x; f.y += rf.y;
    }
    return f;
  }

  /**
   * Advance the pedestrian one step: state machine + Social Force integration.
   *
   * @param {number} dt Time step [s].
   * @param {Array<Object>} [neighbors] Nearby pedestrians.
   * @param {Object|null} [crosswalk] Crossing context:
   *   `{entry:{x,y}, exit:{x,y}, width?:number, signal?:{state:string},
   *     phase?:string, vehicles?:Array, obstacles?:Array}`.
   * @returns {Pedestrian} this
   * @throws {RangeError} If dt is not a positive finite number.
   */
  update(dt, neighbors = [], crosswalk = null) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`Pedestrian.update: dt must be > 0, got ${dt}`);
    }
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(MAX_INTERNAL_DT, remaining);
      this._step(h, neighbors, crosswalk);
      remaining -= h;
    }
    this.timeActive += dt;
    return this;
  }

  /** @private One internal substep of at most 0.1 s. */
  _step(dt, neighbors, crosswalk) {
    switch (this.state) {
      case 'walking': {
        if (this._reachedDestination()) {
          this.state = 'arrived';
          this.velocity = vec(0, 0);
          return;
        }
        // Arrived at the curb of our assigned/applicable crosswalk → wait.
        if (crosswalk && this._nearCurb(crosswalk)) {
          this.state = 'waiting';
          this.waitTime = 0;
          this.velocity = vec(0, 0);
          return;
        }
        this._integrate(dt, this._repulsiveForces(neighbors, crosswalk));
        return;
      }

      case 'waiting': {
        this.waitTime += dt;
        this.totalWaitTime += dt;
        this.velocity = vec(0, 0);
        if (!crosswalk) { // crossing context vanished → resume walking
          this.state = 'walking';
          return;
        }
        const signalOk = this.canCross(crosswalk.signal ?? null, crosswalk.phase ?? null);
        const gapOk = this.isGapSafe(crosswalk.vehicles, crosswalk);
        if (signalOk && gapOk) this._beginCrossing(crosswalk);
        return;
      }

      case 'crossing': {
        const ctx = this._crossingCtx;
        if (!ctx) { this.state = 'walking'; return; }
        this._integrate(dt, this._repulsiveForces(neighbors, ctx));
        // Finished when we pass the exit plane along the crossing axis.
        const prog = (this.position.x - ctx.entry.x) * ctx.axis.x + (this.position.y - ctx.entry.y) * ctx.axis.y;
        if (prog >= ctx.width) {
          this.crossings += 1;
          this.waitTime = 0;
          this._crossingCtx = null;
          this.state = 'walking';
        }
        return;
      }

      case 'arrived':
      default:
        this.velocity = vec(0, 0);
        return;
    }
  }

  /** @private */
  _beginCrossing(crosswalk) {
    const entry = crosswalk.entry ?? { x: this.position.x, y: this.position.y };
    const exit = crosswalk.exit ?? { x: this.position.x, y: this.position.y };
    const axis = norm(sub(exit, entry));
    const width = Number.isFinite(crosswalk.width) && crosswalk.width > 0 ? crosswalk.width : len(sub(exit, entry));
    this._crossingCtx = { entry, exit, axis, width, vehicles: crosswalk.vehicles, obstacles: crosswalk.obstacles };
    this.state = 'crossing';
  }

  /** @private Distance to the crosswalk entry point (or its anchor). */
  _nearCurb(crosswalk) {
    const anchor = crosswalk.entry ?? crosswalk.position;
    if (!anchor || !Number.isFinite(anchor.x)) return false;
    return len(sub(anchor, this.position)) <= CURB_EPS;
  }

  /** @private */
  _reachedDestination() {
    return len(sub(this.destination, this.position)) <= ARRIVE_EPS;
  }

  /**
   * Semi-implicit Euler integration with comfort-clamped acceleration.
   * @private
   */
  _integrate(dt, repulsive) {
    const des = this._desiredForce();
    let fx = des.x + repulsive.x;
    let fy = des.y + repulsive.y;

    // Clamp specific force to [−comfortDecel, +maxAccel].
    const fm = Math.hypot(fx, fy);
    if (fm > 1e-9) {
      const vmax = this.params.maxAccel;
      const vmin = -this.params.comfortDecel;
      const clamped = Math.min(vmax, Math.max(vmin, fm));
      fx = (fx / fm) * clamped;
      fy = (fy / fm) * clamped;
    }

    this.force = vec(fx, fy);
    let vx = this.velocity.x + fx * dt;
    let vy = this.velocity.y + fy * dt;

    // Cap free-flow overshoot at 1.2 × desired speed.
    const sp = Math.hypot(vx, vy);
    const cap = 1.2 * this.params.desiredSpeed;
    if (sp > cap) { vx = (vx / sp) * cap; vy = (vy / sp) * cap; }

    this.velocity = vec(vx, vy);
    const dx = vx * dt, dy = vy * dt;
    this.position = vec(this.position.x + dx, this.position.y + dy);
    this.distanceWalked += Math.hypot(dx, dy);
  }

  /** Compact serializable snapshot (rendering / worker transfer). */
  toJSON() {
    return {
      id: this.id,
      state: this.state,
      position: { x: +this.position.x.toFixed(3), y: +this.position.y.toFixed(3) },
      speed: +this.speed.toFixed(3),
      waitTime: +this.waitTime.toFixed(2),
      totalWaitTime: +this.totalWaitTime.toFixed(2),
      crossings: this.crossings,
      distanceWalked: +this.distanceWalked.toFixed(2),
    };
  }
}
