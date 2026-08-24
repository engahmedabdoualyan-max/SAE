/**
 * @file Cyclist agent — IDM-based bicycle rider with bike-lane preference and
 * an explicit vulnerability factor.
 *
 * Cyclists are Vulnerable Road Users (VRUs):
 *  - lower desired speed and gentler dynamics than motor vehicles;
 *  - when NO bike lane is available they share the road with motor traffic,
 *    which lowers desired speed further and increases the desired time
 *    headway (defensive riding);
 *  - `vulnerabilityFactor` quantifies exposure to motorized traffic.
 *
 * Position convention inherited from {@link Vehicle}: `offset` is the distance
 * from the edge start to the FRONT of the bicycle [m].
 */

import { Vehicle } from './vehicle.js';

/**
 * Bicycle IDM parameters (different from motor-vehicle presets):
 * v0 = 5.5 m/s ≈ 20 km/h, gentle acceleration, moderate comfortable deceleration.
 *
 * @type {Readonly<{v0:number, a:number, b:number, s0:number, T:number}>}
 */
export const CYCLIST_IDM_PARAMS = Object.freeze({
  v0: 5.5, // desired speed [m/s] (20 km/h)
  a: 1.0,  // maximum acceleration [m/s^2]
  b: 2.0,  // comfortable deceleration [m/s^2]
  s0: 1.0, // minimum standstill gap [m]
  T: 1.2,  // desired time headway [s]
  delta: 4 // free-acceleration exponent [-]
});

/** Riding-environment factors. */
export const CYCLIST_FACTORS = Object.freeze({
  /** Desired-speed multiplier when sharing the road with motor traffic. */
  ROAD_SPEED_FACTOR: 0.7,
  /** Time-headway multiplier on shared roads (defensive riding). */
  ROAD_HEADWAY_FACTOR: 1.25,
  /**
   * Vulnerability multiplier applied to the time headway for every heavy
   * vehicle (bus/truck) immediately ahead in mixed traffic.
   */
  HEAVY_LEADER_FACTOR: 1.2,
});

/**
 * Simulation cyclist.
 */
export class Cyclist extends Vehicle {
  /**
   * @param {Object} cfg Vehicle-compatible config plus:
   * @param {boolean} [cfg.bikeLane=false] True while riding in dedicated bike
   *   infrastructure; false → shares the road with motor traffic.
   * @param {Partial<typeof CYCLIST_IDM_PARAMS>} [cfg.idmParams] Parameter overrides.
   */
  constructor(cfg = {}) {
    super({ type: 'bicycle', ...cfg });
    // Replace vehicle-resolved IDM parameters with cyclist-specific ones.
    this.idmParams = { ...CYCLIST_IDM_PARAMS, ...(cfg.idmParams ?? {}) };

    this.bikeLane = cfg.bikeLane === true;
    this.cyclistStats = { distanceInBikeLane: 0, distanceSharedRoad: 0 };
    this._lastBikeLane = this.bikeLane;
    /** @private */ this._lastStatDistance = this.stats.distance;
  }

  /**
   * Exposure to motorized traffic: 1.0 inside a bike lane, higher when
   * sharing the road (used to scale defensive-riding headways).
   * @returns {number}
   */
  get vulnerabilityFactor() {
    return this.bikeLane ? 1.0 : 1 + (CYCLIST_FACTORS.ROAD_HEADWAY_FACTOR - 1) + 0.05;
  }

  /**
   * Preferred lane index given an edge's lane count: cyclists keep as far
   * right as possible — lane 0 when a bike lane exists, otherwise the
   * rightmost through lane (sharing the road).
   * @param {number} [laneCount=1] Number of lanes on the current edge.
   * @returns {number} Zero-based lane index.
   */
  preferredLane(laneCount = 1) {
    return 0; // rightmost lane in both cases (bike lane is always index 0)
  }

  /**
   * Recompute effective IDM parameters for the current riding environment,
   * then run the standard {@link Vehicle#update}.
   *
   * @param {number} dt Time step [s].
   * @param {Vehicle|{vehicle:Vehicle,gap:number}|null} [leader] Leader vehicle.
   * @param {{state:string, allowed?:boolean}|null} [signal] Signal at edge end.
   * @param {{length:number, speedLimit?:number}|null} [edge] Current edge data.
   * @returns {Cyclist} this
   */
  update(dt, leader = null, signal = null, edge = null) {
    const p = CYCLIST_IDM_PARAMS;
    let v0 = p.v0;
    let T = p.T;

    if (!this.bikeLane) {
      // Sharing the road: slower and more cautious (vulnerability).
      v0 *= CYCLIST_FACTORS.ROAD_SPEED_FACTOR;
      T *= CYCLIST_FACTORS.ROAD_HEADWAY_FACTOR;
      // Extra caution behind heavy vehicles.
      const lv = leader?.vehicle ?? leader;
      if (lv && (lv.type === 'bus' || lv.type === 'truck')) T *= CYCLIST_FACTORS.HEAVY_LEADER_FACTOR;
    }

    // Never exceed the infrastructure speed limit when it is stricter.
    if (edge && Number.isFinite(edge.speedLimit) && edge.speedLimit > 0 && edge.speedLimit < v0) {
      v0 = edge.speedLimit;
    }

    this.idmParams = { ...p, v0, T };

    super.update(dt, leader, signal, edge);

    // Accumulate environment-specific distance statistics.
    const ds = this.stats.distance - this._lastStatDistance;
    if (Number.isFinite(ds)) {
      if (this._lastBikeLane) this.cyclistStats.distanceInBikeLane += Math.max(0, ds);
      else this.cyclistStats.distanceSharedRoad += Math.max(0, ds);
    }
    this._lastBikeLane = this.bikeLane;
    this._lastStatDistance = this.stats.distance;
    return this;
  }

  /** Compact serializable snapshot including cyclist fields. */
  toJSON() {
    return {
      ...super.toJSON(),
      bikeLane: this.bikeLane,
      vulnerabilityFactor: +this.vulnerabilityFactor.toFixed(3),
    };
  }
}
