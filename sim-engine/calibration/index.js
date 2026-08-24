/**
 * @file Calibration statistics and IDM parameter fitting.
 *
 * Provides the standard traffic-calibration metrics:
 *  - {@link geh}      — GEH statistic (Smit, 1983); < 5 for ≥ 85 % of links
 *                       indicates a well-calibrated model (UK DMRB / FHWA).
 *  - {@link rmse}     — root-mean-square error.
 *  - {@link mae}      — mean absolute error.
 *  - {@link mape}     — mean absolute percentage error [%].
 *  - {@link r2}       — coefficient of determination.
 *
 * plus {@link calibrateIdmParams}, a deterministic grid-search fitter that
 * tunes IDM parameters against observed driving behaviour samples
 * `{ v, s, dv, target }` (speed, gap, approach rate, observed acceleration).
 */

import { idmAcceleration } from '../models/idm.js';

// ---------------------------------------------------------------------------
// metrics
// ---------------------------------------------------------------------------

/**
 * GEH statistic between modelled and counted flows.
 * @param {number} modelled Flow/volume from the model [veh/h].
 * @param {number} observed Observed flow/volume [veh/h].
 * @returns {number} GEH value; 0 when both inputs are 0.
 */
export function geh(modelled, observed) {
  const m = Number(modelled);
  const c = Number(observed);
  if (!Number.isFinite(m) || !Number.isFinite(c)) return NaN;
  if (m < 0 || c < 0) return NaN;
  if (m + c === 0) return 0;
  return Math.sqrt((2 * (m - c) ** 2) / (m + c));
}

/**
 * Share of link comparisons whose GEH is below a threshold (0..1).
 * @param {Array<[number,number]>} pairs `[modelled, observed]` pairs.
 * @param {number} [threshold=5]
 * @returns {number}
 */
export function gehAcceptanceRatio(pairs, threshold = 5) {
  if (!Array.isArray(pairs) || pairs.length === 0) return 0;
  let ok = 0;
  for (const [m, c] of pairs) {
    if (geh(m, c) < threshold) ok += 1;
  }
  return ok / pairs.length;
}

function pairsOf(predObs) {
  if (!Array.isArray(predObs)) throw new TypeError('expected an array of [predicted, observed] pairs');
  const clean = predObs.filter(([p, o]) => Number.isFinite(p) && Number.isFinite(o));
  return clean;
}

/**
 * Root-mean-square error.
 * @param {Array<[number,number]>} predObs `[predicted, observed]` pairs.
 * @returns {number}
 */
export function rmse(predObs) {
  const xs = pairsOf(predObs);
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const [p, o] of xs) sum += (p - o) ** 2;
  return Math.sqrt(sum / xs.length);
}

/**
 * Mean absolute error.
 * @param {Array<[number,number]>} predObs
 * @returns {number}
 */
export function mae(predObs) {
  const xs = pairsOf(predObs);
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const [p, o] of xs) sum += Math.abs(p - o);
  return sum / xs.length;
}

/**
 * Mean absolute percentage error [%]. Observations of 0 are skipped.
 * @param {Array<[number,number]>} predObs
 * @returns {number}
 */
export function mape(predObs) {
  const xs = pairsOf(predObs).filter(([, o]) => o !== 0);
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const [p, o] of xs) sum += Math.abs((p - o) / o);
  return (100 * sum) / xs.length;
}

/**
 * Coefficient of determination R².
 *
 * R² = 1 − SSres / SStot. When SStot is 0 (all observations identical):
 * returns 1 when predictions match exactly, else 0 (no spread to explain).
 *
 * @param {Array<[number,number]>} predObs
 * @returns {number} In (-inf, 1].
 */
export function r2(predObs) {
  const xs = pairsOf(predObs);
  if (xs.length === 0) return 0;
  const mean = xs.reduce((s, [, o]) => s + o, 0) / xs.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const [p, o] of xs) {
    ssRes += (o - p) ** 2;
    ssTot += (o - mean) ** 2;
  }
  if (ssTot <= 1e-12) return ssRes <= 1e-12 ? 1 : 0;
  return 1 - ssRes / ssTot;
}

// ---------------------------------------------------------------------------
// IDM parameter calibration (grid search)
// ---------------------------------------------------------------------------

/** Default search grids per tunable IDM parameter. */
export const CALIBRATION_GRIDS = Object.freeze({
  a: [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5],
  T: [0.8, 1.0, 1.2, 1.4, 1.5, 1.7, 2.0],
  s0: [1.0, 1.5, 2.0, 2.5],
  v0: [15, 20, 25, 27.8, 30, 33.3, 36],
});

/**
 * Mean squared error between predicted and target accelerations over all
 * behaviour samples.
 *
 * @param {Array<{v:number,s:number,dv:number,target:number}>} samples
 * @param {Object} params Candidate IDM parameter set.
 * @param {Object} [fixed] Parameters held constant during search.
 * @returns {number}
 */
export function idmMse(samples, params, fixed = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return Infinity;
  let sum = 0;
  for (const s of samples) {
    const pred = idmAcceleration(s.v, s.s ?? Infinity, s.dv ?? 0, { ...params, ...fixed });
    sum += (pred - s.target) ** 2;
  }
  return sum / samples.length;
}

/**
 * Calibrate IDM parameters with an exhaustive coordinate grid search.
 *
 * The search is deterministic: parameters are optimised one at a time in the
 * order given by `tunable`, repeating `sweeps` passes so interactions between
 * parameters are captured.
 *
 * @param {Array<{v:number,s:number,dv:number,target:number}>} samples
 *   Observed driving behaviour. Use `s: Infinity` for free-road samples.
 * @param {Object} [opts]
 * @param {string[]} [opts.tunable=['a','T']] Parameter names to fit
 *   (subset of the keys of {@link CALIBRATION_GRIDS}).
 * @param {Record<string,number[]>} [opts.grids] Custom value grids per param.
 * @param {Partial<import('../models/idm.js').IdmParams>} [opts.fixed]
 *   Parameters held at fixed values (not searched).
 * @param {Partial<import('../models/idm.js').IdmParams>} [opts.initial]
 *   Starting parameter values (defaults to engine defaults).
 * @param {number} [opts.sweeps=2] Coordinate-descent passes.
 * @returns {{best:Object, mse:number, initialMse:number, evaluated:number,
 *   improved:boolean}}
 */
export function calibrateIdmParams(samples, opts = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('calibrateIdmParams: samples array required');
  }
  const grids = { ...CALIBRATION_GRIDS, ...(opts.grids ?? {}) };
  const tunable = opts.tunable ?? ['a', 'T'];
  const fixed = opts.fixed ?? {};
  const sweeps = Math.max(1, opts.sweeps ?? 2);

  let current = { v0: 33.3, s0: 2.0, T: 1.5, a: 1.4, b: 2.0, delta: 4, ...fixed, ...(opts.initial ?? {}) };
  const initialMse = idmMse(samples, current, fixed);
  let bestMse = initialMse;
  let best = { ...current };
  let evaluated = 0;

  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (const key of tunable) {
      const values = grids[key];
      if (!Array.isArray(values) || values.length === 0) continue;
      for (const value of values) {
        const candidate = { ...current, [key]: value };
        evaluated += 1;
        const mse = idmMse(samples, candidate, fixed);
        if (mse < bestMse - 1e-12) {
          bestMse = mse;
          best = candidate;
        }
      }
      current = best;
    }
  }

  return {
    best,
    mse: bestMse,
    initialMse,
    evaluated,
    improved: bestMse < initialMse - 1e-9,
  };
}
