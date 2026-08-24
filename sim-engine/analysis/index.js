/**
 * @file Analysis bundle — re-exports every analysis module and provides
 * {@link runFullAnalysis}, the one-call comprehensive post-processing report.
 */

export * from './emissions.js';
export * from './noise.js';
export * from './safety.js';
export * from './energy.js';
export * from './v2x.js';

/**
 * Run the full advanced-analysis suite over simulation output.
 *
 * Each sub-analysis is isolated: a failure in one records an error entry
 * instead of aborting the whole report.
 *
 * @param {Object} [simResults={}] Simulation outputs:
 *   `{ vehicles?:Array, edges?:Map|Object|Array, trajectories?:Array,
 *      receivers?:Array, network?:Object, durationS?:number }`.
 * @param {Object} [config={}] Per-module options forwarded to each analyzer
 *   (e.g. `{ noise:{barriers}, safety:{ttcThresholdS}, v2x:{range} }`).
 * @returns {{
 *   emissions:Object|null, noise:Object|null, safety:Object|null,
 *   energy:Object|null, v2x:Object|null, errors:Object,
 *   summary:{totalCO2Kg:number, maxNoiseLevel:number|null,
 *            conflictCount:number, energyKWh:number,
 *            v2xEquipped:number, riskScore:number}
 * }}
 */
export function runFullAnalysis(simResults = {}, config = {}) {
  const results = simResults ?? {};
  const vehicles = Array.isArray(results.vehicles) ? results.vehicles : [];
  const edges = results.edges ?? results.network?.edges ?? null;
  const errors = {};

  // ---- emissions -----------------------------------------------------------
  let emissions = null;
  try {
    emissions = analyzeEmissions(vehicles, edges);
  } catch (err) {
    errors.emissions = String(err.message ?? err);
  }

  // ---- noise ---------------------------------------------------------------
  let noise = null;
  try {
    const receivers = Array.isArray(results.receivers) && results.receivers.length > 0
      ? results.receivers
      : defaultReceivers(results);
    noise = analyzeNoise(vehicles, edges, receivers);
  } catch (err) {
    errors.noise = String(err.message ?? err);
  }

  // ---- safety ----------------------------------------------------------------
  let safety = null;
  try {
    if (Array.isArray(results.trajectories)) safety = analyzeSafetyMod(results.trajectories, config.safety);
    else throw new Error('no trajectories supplied');
  } catch (err) {
    errors.safety = String(err.message ?? err);
  }

  // ---- energy ---------------------------------------------------------------
  let energy = null;
  try {
    energy = analyzeEnergyMod(vehicles, results.network ?? null);
  } catch (err) {
    errors.energy = String(err.message ?? err);
  }

  // ---- V2X -------------------------------------------------------------------
  let v2x = null;
  try {
    v2x = analyzeV2XMod(vehicles, {
      range: config.v2x?.range,
      durationS: results.durationS,
      network: results.network ?? null,
      baseResults: config.v2x?.baseResults ?? results.kpis,
    });
  } catch (err) {
    errors.v2x = String(err.message ?? err);
  }

  const totalCO2Kg = emissions ? +(emissions.totals.CO2 / 1000).toFixed(4) : 0;
  const levels = Array.isArray(noise?.receivers)
    ? noise.receivers.map((r) => r.level).filter((l) => l != null && Number.isFinite(l))
    : [];
  const maxNoiseLevel = levels.length > 0 ? +Math.max(...levels).toFixed(2) : null;

  return {
    emissions,
    noise,
    safety,
    energy,
    v2x,
    errors,
    summary: {
      totalCO2Kg,
      maxNoiseLevel,
      conflictCount: safety?.conflictCount ?? 0,
      energyKWh: energy?.totalKWh ?? 0,
      v2xEquipped: v2x?.penetration.equipped ?? 0,
      riskScore: safety?.riskScore ?? 0,
    },
  };
}

/* ---- lazy-import wrappers (keeps this module test-friendly) */
import { calculateEmissions as _calcEmissions } from './emissions.js';
import { calculateNoise as _calcNoise } from './noise.js';
import { analyzeSafety as _analyzeSafety } from './safety.js';
import { analyzeEnergy as _analyzeEnergy } from './energy.js';
import { analyzeV2X as _analyzeV2X } from './v2x.js';

function analyzeEmissions(vehicles, edges) {
  return _calcEmissions(vehicles, edges);
}
function analyzeNoise(vehicles, edges, receivers) {
  const rows = _calcNoise(vehicles, edges, receivers);
  const finite = rows.map((r) => r.level).filter((l) => l != null && Number.isFinite(l));
  return {
    receivers: rows,
    maxLevel: finite.length > 0 ? +Math.max(...finite).toFixed(2) : null,
    avgLevel: finite.length > 0 ? +(finite.reduce((a, b) => a + b, 0) / finite.length).toFixed(2) : null,
  };
}
function analyzeSafetyMod(trajs, opts) {
  return _analyzeSafety(trajs, null, opts);
}
function analyzeEnergyMod(vehicles, network) {
  return _analyzeEnergy(vehicles, network);
}
function analyzeV2XMod(vehicles, cfg) {
  return _analyzeV2X(vehicles, cfg);
}

/** Auto-place receivers along the bounding box of vehicle positions. */
function defaultReceivers(results) {
  const pts = [];
  for (const v of results.vehicles ?? []) {
    const p = v.position ?? (Number.isFinite(v.x) ? { x: v.x, y: v.y } : null);
    if (p) pts.push(p);
  }
  if (pts.length === 0) return [{ id: 'R1', x: 10, y: 10 }];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return [
    { id: 'R-near', x: x0 - 10, y: y0 },
    { id: 'R-mid', x: (x0 + x1) / 2, y: y1 + 20 },
    { id: 'R-far', x: x1 + 50, y: y1 + 50 },
  ];
}
