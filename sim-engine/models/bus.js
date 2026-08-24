/**
 * @file Bus / transit agent extending the IDM vehicle with a stop service
 * state machine, a passenger dwell-time model and schedule-adherence tracking.
 *
 * Stop service sequence:
 *   decelerate → stop → open doors → dwell → close doors → accelerate
 *
 * Dwell time model (linear in passenger volumes):
 *   t_dwell = t_board + n_alighting · t_alight + n_boarding · t_board
 *
 * Position convention inherited from {@link Vehicle}: `offset` is the distance
 * from the edge start to the FRONT bumper [m].
 */

import { Vehicle } from './vehicle.js';

/**
 * Dwell parameters.
 * @typedef {Object} BusDwellParams
 * @property {number} tBoard   Fixed base term AND per-boarding-passenger time [s].
 * @property {number} tAlight  Per-alighting-passenger time [s].
 */

/** Default dwell parameters: t_board = 3 s, t_alight = 2.5 s. */
export const BUS_DWELL_DEFAULTS = Object.freeze({ tBoard: 3.0, tAlight: 2.5 });

/** Door cycle durations and geometric tolerances. */
export const BUS_STOP_DEFAULTS = Object.freeze({
  doorOpenTime: 2.0,   // s to fully open
  doorCloseTime: 1.0,  // s to close before departing
  stopMargin: 0.5,     // m kept between front bumper and stop point
  arriveEps: 4.5,      // m — "at stop" tolerance once stopped
  onTimeWindowSec: 60, // |Δ| within this window counts as on-time
});

/**
 * Pure dwell-time calculation.
 *
 *   t_dwell = t_board + n_alighting · t_alight + n_boarding · t_board
 *
 * @param {number} nBoarding  Passengers boarding at this stop.
 * @param {number} nAlighting Passengers alighting at this stop.
 * @param {Partial<BusDwellParams>} [params] Overrides (defaults 3 s / 2.5 s).
 * @returns {number} Dwell time [s] (≥ base term).
 */
export function computeBusDwellTime(nBoarding = 0, nAlighting = 0, params = BUS_DWELL_DEFAULTS) {
  const p = { ...BUS_DWELL_DEFAULTS, ...params };
  if (!Number.isFinite(nBoarding) || nBoarding < 0) throw new TypeError(`computeBusDwellTime: nBoarding invalid (${nBoarding})`);
  if (!Number.isFinite(nAlighting) || nAlighting < 0) throw new TypeError(`computeBusDwellTime: nAlighting invalid (${nAlighting})`);
  return p.tBoard + nAlighting * p.tAlight + nBoarding * p.tBoard;
}

/** Valid bus service phases. */
const PHASES = new Set(['drive', 'doors-opening', 'dwelling', 'doors-closing']);

/**
 * Simulation bus.
 *
 * `stops` is an ordered service list; each entry pins the stop to an edge and
 * an offset along that edge where the bus must berth:
 *
 *     { stopId:'S1', edgeId:'e1', offset:120, boarding?:8, alighting?:3 }
 *
 * `schedule` maps stopId → planned arrival time [s since simulation start];
 * actual arrivals are recorded automatically and classified as early /
 * on-time / late.
 */
export class Bus extends Vehicle {
  /**
   * @param {Object} cfg Vehicle config plus:
   * @param {string} [cfg.routeId='route-0'] Transit route identifier.
   * @param {Array<{stopId:string, edgeId:string, offset:number,
   *                boarding?:number, alighting?:number}>|string[]} [cfg.stops=[]]
   *   Ordered stops. String entries are rejected (edge+offset required).
   * @param {Object<string,number>|Map<string,number>} [cfg.schedule={}] stopId → scheduled arrival [s].
   * @param {number} [cfg.capacity=60] Passenger capacity.
   * @param {number} [cfg.passengerCount=0] Initial onboard passengers.
   * @param {Partial<BusDwellParams>} [cfg.dwellParams] tBoard/tAlight overrides.
   * @param {Partial<typeof BUS_STOP_DEFAULTS>} [cfg.stopParams] Door/tolerance overrides.
   */
  constructor(cfg = {}) {
    super({ type: 'bus', ...cfg });

    this.routeId = typeof cfg.routeId === 'string' && cfg.routeId ? cfg.routeId : 'route-0';
    this.capacity = Number.isFinite(cfg.capacity) && cfg.capacity > 0 ? cfg.capacity : 60;
    const p0 = Number.isFinite(cfg.passengerCount) && cfg.passengerCount >= 0 ? cfg.passengerCount : 0;
    this.passengerCount = Math.min(p0, this.capacity);

    /** @type {Array<{stopId:string, edgeId:string, offset:number, boarding:number, alighting:number}>} */
    this.stops = Bus.normalizeStops(cfg.stops);
    this._stopIndex = 0;

    /** @type {Map<string, number>} stopId → scheduled arrival [s]. */
    this.schedule = Bus.normalizeSchedule(cfg.schedule);

    this.dwellParams = {
      tBoard: Number.isFinite(cfg.dwellParams?.tBoard) ? cfg.dwellParams.tBoard : BUS_DWELL_DEFAULTS.tBoard,
      tAlight: Number.isFinite(cfg.dwellParams?.tAlight) ? cfg.dwellParams.tAlight : BUS_DWELL_DEFAULTS.tAlight,
    };
    this.stopParams = { ...BUS_STOP_DEFAULTS, ...(cfg.stopParams ?? {}) };

    /** Service phase: 'drive' | 'doors-opening' | 'dwelling' | 'doors-closing'. */
    this.phase = 'drive';
    this.doorsOpen = false;
    this.simTime = 0;

    /** Stop currently being served (null while driving). */
    this.currentStopId = null;
    /** Duration of the most recent dwell [s] (0 while driving). */
    this.lastDwellSeconds = 0;

    this._doorTimer = 0;
    this._dwellRemaining = 0;
    this._pendingBoard = 0;
    this._pendingAlight = 0;

    /** Recorded arrivals: {stopId, actualSec, scheduledSec, deltaSec, status}. */
    this.arrivals = [];
  }

  /**
   * Validate/normalize the ordered stop list.
   * @param {unknown} raw
   * @returns {Array<{stopId:string, edgeId:string, offset:number, boarding:number, alighting:number}>}
   * @throws {TypeError} On malformed entries.
   */
  static normalizeStops(raw) {
    if (raw == null) return [];
    if (!Array.isArray(raw)) throw new TypeError('Bus: stops must be an array');
    return raw.map((s, i) => {
      if (!s || typeof s !== 'object') {
        throw new TypeError(`Bus.stops[${i}]: expected {stopId, edgeId, offset}`);
      }
      const { stopId, edgeId, offset } = s;
      if (typeof stopId !== 'string' || !stopId) throw new TypeError(`Bus.stops[${i}]: string stopId required`);
      if (typeof edgeId !== 'string' || !edgeId) throw new TypeError(`Bus stop "${stopId}": string edgeId required`);
      if (!Number.isFinite(offset) || offset < 0) throw new TypeError(`Bus stop "${stopId}": numeric offset >= 0 required`);
      const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
      return { stopId, edgeId, offset, boarding: num(s.boarding), alighting: num(s.alighting) };
    });
  }

  /**
   * Normalize schedule input into a Map.
   * @param {Object<string,number>|Map<string,number>|undefined} raw
   * @returns {Map<string, number>}
   */
  static normalizeSchedule(raw) {
    if (raw == null) return new Map();
    if (raw instanceof Map) return new Map([...raw].filter(([, v]) => Number.isFinite(v)));
    if (typeof raw === 'object') {
      const m = new Map();
      for (const [k, v] of Object.entries(raw)) if (Number.isFinite(v)) m.set(k, v);
      return m;
    }
    throw new TypeError('Bus: schedule must be an object or Map of stopId → seconds');
  }

  /** True while the bus is serving (or berthing at) a stop. */
  get isServingStop() {
    return this.phase !== 'drive';
  }

  /**
   * The pending stop if it lies on the CURRENT edge ahead of us, else null.
   * @private
   */
  _pendingStopOnEdge() {
    const stop = this.stops[this._stopIndex];
    return stop && stop.edgeId === this.edgeId ? stop : null;
  }

  /**
   * Board up to `count` waiting passengers (capacity-limited).
   * @param {number} count Requested boardings.
   * @returns {number} Passengers actually boarded.
   */
  boardPassengers(count) {
    if (!Number.isFinite(count) || count < 0) throw new TypeError(`boardPassengers: count invalid (${count})`);
    const actual = Math.min(Math.floor(count), Math.max(0, Math.floor(this.capacity - this.passengerCount)));
    this.passengerCount += actual;
    return actual;
  }

  /**
   * Alight up to `count` passengers.
   * @param {number} count Requested alightings.
   * @returns {number} Passengers actually alighted.
   */
  alightPassengers(count) {
    if (!Number.isFinite(count) || count < 0) throw new TypeError(`alightPassengers: count invalid (${count})`);
    const actual = Math.min(Math.floor(count), Math.floor(this.passengerCount));
    this.passengerCount -= actual;
    return actual;
  }

  /**
   * One simulation step: drives the stop-service state machine and otherwise
   * follows the IDM (inherited from {@link Vehicle}) with the next pending
   * stop treated as a virtual stopped leader at the berth position.
   *
   * @param {number} dt Time step [s].
   * @param {Vehicle|{vehicle:Vehicle,gap:number}|null} [leader] Leader vehicle.
   * @param {{state:string, allowed?:boolean}|null} [signal] Signal at edge end.
   * @param {{length:number, speedLimit?:number}|null} [edge] Current edge data.
   * @returns {Bus} this
   */
  update(dt, leader = null, signal = null, edge = null) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`Bus.update: dt must be > 0, got ${dt}`);
    }
    this.simTime += dt;

    switch (this.phase) {
      case 'doors-opening': {
        this._doorTimer -= dt;
        if (this._doorTimer <= 0) {
          // Doors fully open: process passenger exchange, start dwell clock.
          const alighted = this.alightPassengers(this._pendingAlight);
          const boarded = this.boardPassengers(this._pendingBoard);
          this._dwellRemaining = computeBusDwellTime(
            boarded, alighted,
            { tBoard: this.dwellParams.tBoard, tAlight: this.dwellParams.tAlight },
          );
          this.lastDwellSeconds = this._dwellRemaining;
          this.phase = 'dwelling';
        }
        return this;
      }
      case 'dwelling': {
        this._dwellRemaining -= dt;
        if (this._dwellRemaining <= 0) {
          this._doorTimer = this.stopParams.doorCloseTime;
          this.phase = 'doors-closing';
        }
        return this;
      }
      case 'doors-closing': {
        this._doorTimer -= dt;
        if (this._doorTimer <= 0) {
          this.doorsOpen = false;
          this.currentStopId = null;
          this.phase = 'drive';
          this._stopIndex += 1; // stop served; proceed to the next one
          this.accel = 0;
        }
        return this;
      }
      case 'drive':
      default:
        break;
    }

    // ---- driving: constrain toward the pending berth ----------------------
    const stop = this._pendingStopOnEdge();
    let effLeader = leader;
    if (stop) {
      const distToBerth = stop.offset - this.offset - this.stopParams.stopMargin;
      const leadGap = leader
        ? (typeof leader.gap === 'number'
            ? leader.gap
            : leader.vehicle.offset - leader.vehicle.length - this.offset)
        : Infinity;
      if (distToBerth > 0.05 && distToBerth < leadGap) {
        effLeader = { vehicle: { speed: 0 }, gap: distToBerth }; // virtual stopped leader
      }
    }

    this.computeAccel(dt, effLeader, signal, edge);
    this.applyMove(dt, edge && Number.isFinite(edge.length) ? edge.length : undefined);

    // ---- arrival detection -------------------------------------------------
    if (stop && this.speed < 0.12 && stop.offset - this.offset <= this.stopParams.arriveEps) {
      this._arriveAtStop(stop);
    }
    return this;
  }

  /**
   * Berth handling: open doors, record schedule adherence, stage passengers.
   * @private
   * @param {{stopId:string, boarding:number, alighting:number}} stop
   */
  _arriveAtStop(stop) {
    this.speed = 0;
    this.accel = 0;
    this.doorsOpen = true;
    this.currentStopId = stop.stopId;
    this._doorTimer = this.stopParams.doorOpenTime;
    this.phase = 'doors-opening';
    this._pendingBoard = stop.boarding ?? 0;
    this._pendingAlight = stop.alighting ?? 0;

    const scheduled = this.schedule.has(stop.stopId) ? this.schedule.get(stop.stopId) : null;
    const delta = scheduled == null ? null : this.simTime - scheduled;
    let status = 'unscheduled';
    if (delta != null) {
      const tol = this.stopParams.onTimeWindowSec;
      status = delta < -tol ? 'early' : delta > tol ? 'late' : 'on-time';
    }
    this.arrivals.push({
      stopId: stop.stopId,
      actualSec: +this.simTime.toFixed(3),
      scheduledSec: scheduled,
      deltaSec: delta == null ? null : +delta.toFixed(3),
      status,
    });
  }

  /**
   * Schedule adherence records (optionally filtered to scheduled stops only).
   * @param {{scheduledOnly?:boolean}} [opts]
   * @returns {Array<{stopId:string, actualSec:number, scheduledSec:(number|null),
   *                    deltaSec:(number|null), status:string}>}
   */
  getScheduleAdherence(opts = {}) {
    return opts.scheduledOnly ? this.arrivals.filter((a) => a.status !== 'unscheduled') : this.arrivals.slice();
  }

  /**
   * Fraction of scheduled arrivals within the on-time window [0..1]
   * (0 when no scheduled arrivals have been recorded yet).
   * @returns {number}
   */
  onTimeRate() {
    const sched = this.arrivals.filter((a) => a.status !== 'unscheduled');
    if (sched.length === 0) return 0;
    return sched.filter((a) => a.status === 'on-time').length / sched.length;
  }

  /** Compact serializable snapshot including transit fields. */
  toJSON() {
    return {
      ...super.toJSON(),
      routeId: this.routeId,
      phase: this.phase,
      doorsOpen: this.doorsOpen,
      passengerCount: this.passengerCount,
      capacity: this.capacity,
      currentStopId: this.currentStopId,
      lastDwellSeconds: +this.lastDwellSeconds.toFixed(2),
      stopsServed: this.arrivals.length,
      onTimeRate: +this.onTimeRate().toFixed(3),
    };
  }
}
