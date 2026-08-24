/**
 * @file MOBIL lane-changing model — Kesting, Treiber & Helbing (2007).
 *
 * Minimizing Overall Braking Induced by Lane changes combines:
 *  1. Safety criterion   – the new follower must not be forced below `bSafe`
 *                          and the ego vehicle must stay above `bHard`.
 *  2. Incentive criterion –
 *      acc_ego(new) - acc_ego(old)
 *        + politeness * (acc_newFollower(after-before) + acc_oldFollower(after-before))
 *        > aThr + bias
 *
 * Vehicles are expected to expose: `{ id, offset, length, speed, type, isAV,
 * idmParams?, accel? }` where `offset` is the FRONT-bumper position along the edge.
 */

import { idmAcceleration, resolveIdmParams } from './idm.js';

/**
 * Default MOBIL parameters.
 *
 * @typedef {Object} MobilParams
 * @property {number} aThr       Politeness-free acceleration threshold [m/s^2].
 * @property {number} bias       Bias toward staying in the current lane [m/s^2].
 * @property {number} politeness Politeness factor for others' acceleration changes [-].
 * @property {number} bSafe      Maximum deceleration allowed for the new follower [m/s^2] (negative).
 * @property {number} bHard      Hard deceleration floor for the ego vehicle [m/s^2] (negative).
 * @property {number} minGap     Minimum physical gap required to both neighbours [m].
 */
export const MOBIL_PARAMS = Object.freeze({
  aThr: 0.2,
  bias: 0.3,
  politeness: 0.0,
  bSafe: -4.0,
  bHard: -9.0,
  minGap: 0.5,
});

/**
 * Bumper-to-bumper gap from a follower's front bumper to a leader's rear bumper.
 * @param {{offset:number,length:number}|null|undefined} leader
 * @param {{offset:number}|null|undefined} follower
 * @returns {number} gap [m], Infinity if either is absent.
 */
function gap(leader, follower) {
  if (!leader || !follower) return Infinity;
  return leader.offset - leader.length - follower.offset;
}

/** IDM params for an arbitrary vehicle-like object. */
function paramsOf(veh) {
  return resolveIdmParams(veh.isAV ? 'av' : veh.type, veh.idmParams);
}

/**
 * Evaluate a prospective lane change with MOBIL.
 *
 * @param {Object|null} veh Ego vehicle (must have offset/length/speed/lane).
 * @param {number} newLane Index of the target lane.
 * @param {number} currentLane Index of the current lane.
 * @param {Object} [trafficState] Neighbour context on the SAME edge:
 *   - `oldLeader`, `oldFollower`: neighbours in the current lane (or null).
 *   - `newLeader`, `newFollower`: neighbours in the target lane (or null).
 *   - `params`: optional {@link MobilParams} overrides.
 * @returns {{change:boolean, reason:string, metrics:Object}}
 *   `reason` ∈ 'same-lane' | 'no-vehicle' | 'blocked-no-gap' | 'unsafe-braking' |
 *             'threshold-not-met' | 'incentive-met'.
 *
 * @example
 * const d = mobilDecision(veh, 1, 0, { newLeader: v2, newFollower: v3 });
 * if (d.change) veh.lane = 1;
 */
export function mobilDecision(veh, newLane, currentLane, trafficState = {}) {
  if (!veh || typeof veh !== 'object') {
    return { change: false, reason: 'no-vehicle', metrics: {} };
  }
  if (newLane === currentLane) {
    return { change: false, reason: 'same-lane', metrics: {} };
  }

  const p = { ...MOBIL_PARAMS, ...(trafficState.params ?? {}) };
  const st = trafficState;
  const my = paramsOf(veh);

  const gNewLeader = st.newLeaderGap ?? gap(st.newLeader, veh);
  const gMeFromNewFol = st.newFollowerGap ?? gap(veh, st.newFollower);
  const gOldLeader = gap(st.oldLeader, veh);
  const gOldFolToMe = gap(veh, st.oldFollower);
  const gNewFolToNewLeader = gap(st.newLeader, st.newFollower);
  const gOldFolToOldLeader = gap(st.oldLeader, st.oldFollower);

  // Physical blocking: no room to either neighbour in the target lane.
  if (Number.isFinite(gNewLeader) && gNewLeader < p.minGap) {
    return { change: false, reason: 'blocked-no-gap', metrics: { gNewLeader } };
  }
  if (Number.isFinite(gMeFromNewFol) && gMeFromNewFol < p.minGap) {
    return { change: false, reason: 'blocked-no-gap', metrics: { gMeFromNewFol } };
  }

  // --- Accelerations -------------------------------------------------------
  const dvMy = (l) => veh.speed - (l ? l.speed : 0);
  const accMeNew = idmAcceleration(veh.speed, gNewLeader, dvMy(st.newLeader), my);
  const accMeOld = idmAcceleration(veh.speed, gOldLeader, dvMy(st.oldLeader), my);

  let accNFoAfter = 0, accNFoBefore = 0;
  if (st.newFollower) {
    const fp = paramsOf(st.newFollower);
    const dvF = st.newFollower.speed - veh.speed;
    const dvL = st.newFollower.speed - (st.newLeader ? st.newLeader.speed : 0);
    accNFoAfter = idmAcceleration(st.newFollower.speed, gMeFromNewFol, dvF, fp);
    accNFoBefore = idmAcceleration(st.newFollower.speed, gNewFolToNewLeader, dvL, fp);
  }
  let accOFoAfter = 0, accOFoBefore = 0;
  if (st.oldFollower) {
    const fp = paramsOf(st.oldFollower);
    // After the change the old follower inherits the old leader.
    const dvA = st.oldFollower.speed - (st.oldLeader ? st.oldLeader.speed : 0);
    const dvB = st.oldFollower.speed - veh.speed;
    accOFoAfter = idmAcceleration(st.oldFollower.speed, gOldFolToOldLeader, dvA, fp);
    accOFoBefore = idmAcceleration(st.oldFollower.speed, gOldFolToMe, dvB, fp);
  }

  // --- Safety criterion ----------------------------------------------------
  if (st.newFollower && accNFoAfter < p.bSafe) {
    return {
      change: false,
      reason: 'unsafe-braking',
      metrics: { accNewFollowerAfter: accNFoAfter, bSafe: p.bSafe },
    };
  }
  if (accMeNew < p.bHard) {
    return {
      change: false,
      reason: 'unsafe-braking',
      metrics: { accEgoNew: accMeNew, bHard: p.bHard },
    };
  }

  // --- Incentive criterion -------------------------------------------------
  const others = p.politeness * ((accNFoAfter - accNFoBefore) + (accOFoAfter - accOFoBefore));
  const incentive = accMeNew - accMeOld + others;
  const threshold = p.aThr + p.bias;

  if (incentive <= threshold) {
    return {
      change: false,
      reason: 'threshold-not-met',
      metrics: { incentive, threshold, accMeNew, accMeOld },
    };
  }

  return {
    change: true,
    reason: 'incentive-met',
    metrics: {
      incentive,
      threshold,
      accMeNew,
      accMeOld,
      accNewFollowerAfter: accNFoAfter,
      accNewFollowerBefore: accNFoBefore,
      accOldFollowerAfter: accOFoAfter,
      accOldFollowerBefore: accOFoBefore,
    },
  };
}
