/**
 * @file Calibration & validation toolkit: GEH/RMSE/R² statistics plus an IDM
 * grid-search calibration driver built on the microsimulation engine.
 *
 * The classic traffic-engineering acceptance criterion — **GEH < 5** for 85 %
 * of detectors and mean GEH < 5 — is implemented in {@link validateCalibration}.
 *
 * @example
 * import { gehStatistic, calibrateNetwork, validateCalibration } from './sim-engine/calibration/wizard.js';
 *
 * const fieldData = [
 *   { edgeId: 'E1', observedFlow: 950 },   // veh/h
 *   { edgeId: 'E2', observedFlow: 1420 },
 * ];
 * const { bestParams, metrics, iterations } = calibrateNetwork(fieldData, net.toJSON(), { seed: 7 });
 * const verdict = validateCalibration(metrics);   // { passed, details[] }
 */

import { Simulator } from '../simulator.js';
import { DEFAULT_IDM_PARAMS } from '../models/idm.js';
import { createRNG } from '../utils/seedRandom.js';

/** GEH value below which a detector count "passes" (RTM standard). @type {number} */
export const GEH_PASS_THRESHOLD = 5;
/** Required share of detectors with GEH < 5 for an overall pass. @type {number} */
export const GEH_PASS_SHARE = 0.85;
/** Minimum coefficient of determination R² required for a pass. @type {number} */
export const R2_MIN = 0.7;

// ------------------------------------------------------------- statistics --

/**
 * Normalise statistic inputs to paired numeric arrays.
 * Scalars are promoted to single-element arrays; pairs are truncated to the
 * shorter input; non-finite entries are dropped from BOTH arrays.
 *
 * @param {number|number[]} observed @param {number|number[]} simulated
 * @returns {{obs:number[], sim:number[]}}
 */
function pairedValues(observed, simulated) {
  const o = Array.isArray(observed) ? observed : [observed];
  const s = Array.isArray(simulated) ? simulated : [simulated];
  const n = Math.min(o.length, s.length);
  const obs = [];
  const sim = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(o[i]) && Number.isFinite(s[i])) {
      obs.push(Number(o[i]));
      sim.push(Number(s[i]));
    }
  }
  return { obs, sim };
}

/**
 * GEH statistic (Sutherland & Williams): √( 2(M−C)² / (M+C) ).
 *
 * For arrays the per-pair GEH values are computed first and averaged — the
 * standard practice for link-flow calibration (never average counts first).
 * Interpretation: GEH < 5 ⇒ flows considered a match.
 *
 * @param {number|number[]} observed Observed counts/flows [veh or veh/h].
 * @param {number|number[]} simulated Modelled counts/flows (same unit).
 * @returns {number} Mean GEH value [unitless].
 * @throws {TypeError} When no valid observation/simulation pairs exist.
 *
 * @example
 * gehStatistic(900, 850);            // ≈ 1.65 → match
 * gehStatistic([900, 1200], [850, 1600]); // mean of both pairs
 */
export function gehStatistic(observed, simulated) {
  const { obs, sim } = pairedValues(observed, simulated);
  if (obs.length === 0) throw new TypeError('gehStatistic: no finite observation/simulation pairs');
  let sum = 0;
  for (let i = 0; i < obs.length; i++) {
    const m = sim[i];
    const c = obs[i];
    if (m + c === 0) continue; // both zero → perfect agreement, GEH := 0
    sum += Math.sqrt((2 * (m - c) ** 2) / (m + c));
  }
  return sum / obs.length;
}

/**
 * Root-mean-square error between observed and simulated values.
 *
 * @param {number|number[]} observed @param {number|number[]} simulated
 * @returns {number} RMSE in the units of the inputs.
 * @throws {TypeError} When no valid pairs exist.
 */
export function rmseError(observed, simulated) {
  const { obs, sim } = pairedValues(observed, simulated);
  if (obs.length === 0) throw new TypeError('rmseError: no finite observation/simulation pairs');
  let sumSq = 0;
  for (let i = 0; i < obs.length; i++) sumSq += (sim[i] - obs[i]) ** 2;
  return Math.sqrt(sumSq / obs.length);
}

/**
 * Coefficient of determination R² = 1 − SS_res / SS_tot.
 *
 * Edge cases: when the observations have zero variance, R² is defined as 1 if
 * the simulation reproduces that constant exactly and 0 otherwise.
 *
 * @param {number|number[]} observed @param {number|number[]} simulated
 * @returns {number} R² in `(-∞, 1]`.
 * @throws {TypeError} When fewer than two valid pairs exist.
 */
export function rSquared(observed, simulated) {
  const { obs, sim } = pairedValues(observed, simulated);
  if (obs.length < 2) throw new TypeError('rSquared: at least two finite pairs are required');

  const meanObs = obs.reduce((a, b) => a + b, 0) / obs.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < obs.length; i++) {
    ssRes += (obs[i] - sim[i]) ** 2;
    ssTot += (obs[i] - meanObs) ** 2;
  }
  if (ssTot === 0) return ssRes < 1e-12 ? 1 : 0;
  return 1 - ssRes / ssTot;
}

// ------------------------------------------------------------ calibration --

/**
 * Default grid searched by {@link calibrateNetwork} (urban-arterial oriented).
 * Override any axis via `opts.grid`.
 * @type {Readonly<Record<'v0'|'T'|'a'|'b', number[]>>}
 */
const DEFAULT_GRID = Object.freeze({
  v0: [11.2, 13.9, 16.7], // ≈ 40 / 50 / 60 km/h desired speed
  T: [0.9, 1.3, 1.7],     // desired time headway [s]
  a: [1.0, 1.4],          // max acceleration [m/s²]
  b: [1.6, 2.2],          // comfortable deceleration [m/s²]
});

/**
 * Normalise flexible field-data rows into validated detectors.
 * Accepted keys per row: `edgeId` (required) and one of
 * `observedFlow | observed | flow | count | observedCount` [veh/h].
 *
 * @param {Array<Object>} fieldData @param {Network|{edges:Map}} network
 * @param {string[]} warnings
 * @returns {Array<{edgeId:string, observedFlow:number}>}
 */
function normaliseDetectors(fieldData, network, warnings) {
  const edgeIds = new Set(
    network?.edges instanceof Map ? [...network.edges.keys()] : []
  );

  /** @type {Array<{edgeId:string, observedFlow:number}>} */
  const out = [];
  if (!Array.isArray(fieldData)) return out;

  for (let i = 0; i < fieldData.length; i++) {
    const row = fieldData[i];
    if (!row || typeof row !== 'object') continue;
    const edgeId = row.edgeId ?? row.edge ?? row.linkId;
    const raw = row.observedFlow ?? row.observed ?? row.flow ?? row.count ?? row.observedCount;
    const flow = Number(raw);

    if (typeof edgeId !== 'string' || edgeId.length === 0) {
      warnings.push(`fieldData[${i}]: missing edgeId — skipped`);
      continue;
    }
    if (!Number.isFinite(flow) || flow < 0) {
      warnings.push(`fieldData[${i}] ("${edgeId}"): non-finite/negative flow — skipped`);
      continue;
    }
    if (edgeIds.size > 0 && !edgeIds.has(edgeId)) {
      warnings.push(`fieldData[${i}]: unknown edge "${edgeId}" — skipped`);
      continue;
    }
    out.push({ edgeId, observedFlow: flow });
  }
  return out;
}

/**
 * Build the deterministic spawn schedule reproducing observed detector flows.
 *
 * Each detector's hourly flow is converted into N uniformly-spaced departures
 * across the run horizon with ±25 % slot jitter (seeded, identical for every
 * parameter combination so comparisons stay fair).
 *
 * @param {Array<{edgeId:string, observedFlow:number}>} detectors
 * @param {number} runSeconds @param {number} seed
 * @returns {Array<{id:string, departTime:number, route:string[], type:string}>}
 */
function buildDemand(detectors, runSeconds, seed) {
  const rng = createRNG(seed);
  const demand = [];
  for (let d = 0; d < detectors.length; d++) {
    const det = detectors[d];
    const n = Math.max(1, Math.round((det.observedFlow * runSeconds) / 3600));
    for (let k = 0; k < n; k++) {
      const jitter = rng.nextFloat(-0.25, 0.25);
      const t = ((k + jitter) * runSeconds) / n;
      demand.push({
        id: `det${d}-${k}`,
        departTime: Math.max(0, Math.min(runSeconds - 2, t)),
        route: [det.edgeId],
        type: 'sedan',
        _detectorIndex: d,
      });
    }
  }
  demand.sort((a, b) => a.departTime - b.departTime);
  return demand.map(({ id, departTime, route, type }) => ({ id, departTime, route, type }));
}

/**
 * Run one parameter combination and measure simulated flows per detector edge.
 *
 * Simulated flow per detector is the time-average of the collector's
 * instantaneous `q = k·v` estimate on that edge, discarding an initial warm-up
 * share of snapshots.
 *
 * @param {Object} combo Partial IDM params `{v0,T,a,b}`.
 * @param {Array<{edgeId:string, observedFlow:number}>} detectors
 * @param {any} network Network instance or JSON payload.
 * @param {Object} cfg Resolved options.
 * @returns {{flows:Record<string,number>, spawned:number, exited:number}}
 */
function evaluateCombo(combo, detectors, network, cfg) {
  const sim = new Simulator({
    dt: cfg.dt,
    seed: cfg.seed,
    maxVehicles: cfg.maxVehicles,
    kpiEverySteps: 5,
    idmOverrides: combo, // candidate {v0, T, a, b} applied to every spawned vehicle
  });
  sim.loadNetwork(network);
  sim.loadSignals(cfg.signals ?? []);
  sim.loadDemand(buildDemand(detectors, cfg.runSeconds, cfg.seed));

  const sums = new Map(); // edgeId -> {sum, n}
  for (const d of detectors) sums.set(d.edgeId, { sum: 0, n: 0 });

  const warmupShare = cfg.warmupShare;
  let snapshotCount = 0;

  const offKpi = sim.on('kpi-update', (kpis) => {
    snapshotCount += 1;
    // Skip ramp-up snapshots so early sparse traffic doesn't bias the average.
    if (snapshotCount <= warmupShare) return;
    for (const det of detectors) {
      const pe = kpis.perEdge?.[det.edgeId];
      if (!pe) continue;
      const acc = sums.get(det.edgeId);
      acc.sum += pe.flow;
      acc.n += 1;
    }
  });

  try {
    sim.run(Math.max(1, Math.ceil(cfg.runSeconds / cfg.dt)), cfg.dt);
  } finally {
    offKpi();
  }

  /** @type {Record<string, number>} */
  const flows = {};
  for (const det of detectors) {
    const acc = sums.get(det.edgeId);
    flows[det.edgeId] = acc.n > 0 ? acc.sum / acc.n : 0;
  }

  return {
    flows,
    spawned: sim.cumulative.spawned,
    exited: sim.cumulative.exited,
    dropped: sim.cumulative.dropped,
  };
}

/**
 * Grid-search calibration of the four key IDM parameters (`v0`, `T`, `a`, `b`)
 * against observed detector flows.
 *
 * For every combination the engine runs a seeded micro-simulation with demand
 * synthesised from the observed flows, measures the resulting per-detector
 * flows and scores the fit. The best combination minimises mean GEH (ties
 * broken by lower RMSE).
 *
 * ⚠️ Runtime scales as O(grid size × runSeconds/dt); the default 36-combination
 * grid over 600 s takes a few seconds per combo on commodity hardware. Shrink
 * `opts.grid` / `opts.runSeconds` or feed progress via `opts.onProgress` for
 * interactive use (wrap calls in chunks if you need to keep the UI responsive).
 *
 * @param {Array<Object>} fieldData Detector observations:
 *   `[{ edgeId: 'E1', observedFlow: 950 }, …]` [veh/h]. Aliased keys
 *   (`observed`, `flow`, `count`) are accepted.
 * @param {Network|{nodes:Object[],edges:Object[]}} network Network under study.
 * @param {Record<string, any>} [baseConfig] Baseline simulator config
 *   (`{ seed, dt, signals, … }`) merged under the searched parameters.
 * @param {Object} [opts]
 * @param {Record<string, number[]>} [opts.grid] Axis overrides, e.g. `{ v0:[13.9], T:[1.2] }`.
 * @param {number} [opts.seed=42] Shared RNG seed for every trial.
 * @param {number} [opts.runSeconds=600] Simulated horizon per trial [s].
 * @param {number} [opts.dt=1] Time step [s].
 * @param {number} [opts.maxVehicles=1500] Vehicle cap per trial.
 * @param {number} [opts.warmupFraction=0.25] Leading share of KPI snapshots ignored.
 * @param {(info:{index:number,total:number,params:Object})=>void} [opts.onProgress] Progress hook.
 * @returns {{bestParams: Object, metrics: Object, iterations: number, trials: Object[], warnings: string[]}}
 *   - `bestParams`: full IDM parameter set (searched keys + engine defaults)
 *   - `metrics`: `{ perDetector:[…], summary:{…}, simulatedFlows:{…} }`
 *   - `iterations`: number of evaluated combinations
 * @throws {TypeError} When no usable detectors remain after validation.
 */
export function calibrateNetwork(fieldData, network, baseConfig = {}, opts = {}) {
  if (!network || typeof network !== 'object') {
    throw new TypeError('calibrateNetwork: network instance or JSON required');
  }

  /** @type {string[]} */ const warnings = [];
  const detectors = normaliseDetectors(fieldData, network, warnings);
  if (detectors.length === 0) {
    throw new TypeError(
      'calibrateNetwork: fieldData must contain at least one valid row like {edgeId:"E1", observedFlow:900}'
    );
  }

  const grid = { ...DEFAULT_GRID, ...(opts.grid ?? {}) };
  for (const axis of ['v0', 'T', 'a', 'b']) {
    if (!Array.isArray(grid[axis]) || grid[axis].length === 0) {
      throw new TypeError(`calibrateNetwork: grid.${axis} must be a non-empty array`);
    }
  }

  const cfg = {
    seed: Number.isFinite(opts.seed) ? opts.seed : (Number(baseConfig.seed) || 42),
    dt: Number.isFinite(opts.dt) ? opts.dt : 1,
    runSeconds: Number.isFinite(opts.runSeconds) ? opts.runSeconds : 600,
    maxVehicles: Number.isFinite(opts.maxVehicles) ? opts.maxVehicles : 1500,
    warmupShare: 1,
    signals: baseConfig.signals ?? [],
  };
  const totalSnapshotsEstimate = Math.ceil(cfg.runSeconds / cfg.dt / 5);
  cfg.warmupShare = Math.max(0, Math.floor(totalSnapshotsEstimate * (Number.isFinite(opts.warmupFraction) ? opts.warmupFraction : 0.25)));

  // Enumerate the cartesian product.
  /** @type {Object[]} */ const combos = [];
  for (const v0 of grid.v0) {
    for (const T of grid.T) {
      for (const a of grid.a) {
        for (const b of grid.b) combos.push({ v0, T, a, b });
      }
    }
  }

  /** @type {Object[]} */ const trials = [];
  let best = null;

  for (let i = 0; i < combos.length; i++) {
    const params = combos[i];
    if (typeof opts.onProgress === 'function') {
      try { opts.onProgress({ index: i, total: combos.length, params }); } catch { /* user hook */ }
    }

    // Run the trial: candidate params flow into every spawned vehicle via
    // `idmOverrides`, demand is identical across combos (shared seed).
    const result = evaluateCombo(params, detectors, network, cfg);

    const observedArr = detectors.map((d) => d.observedFlow);
    const simulatedArr = detectors.map((d) => result.flows[d.edgeId]);

    let meanGEH;
    let rmseVal;
    let r2Val;
    try { meanGEH = gehStatistic(observedArr, simulatedArr); } catch { meanGEH = Infinity; }
    try { rmseVal = rmseError(observedArr, simulatedArr); } catch { rmseVal = Infinity; }
    try { r2Val = rSquared(observedArr, simulatedArr); } catch { r2Val = NaN; }

    const passingPairs = observedArr.filter((o, j) => {
      try { return gehStatistic(o, simulatedArr[j]) < GEH_PASS_THRESHOLD; } catch { return false; }
    }).length;

    const score = { meanGEH, rmse: rmseVal, rSquared: r2Val, pctGEHunder5: passingPairs / observedArr.length };
    const trial = {
      params: { ...params },
      score,
      simulatedFlows: { ...result.flows },
      spawned: result.spawned,
      exited: result.exited,
      dropped: result.dropped,
    };
    trials.push(trial);

    const better =
      best === null ||
      score.meanGEH < best.score.meanGEH - 1e-9 ||
      (Math.abs(score.meanGEH - best.score.meanGEH) <= 1e-9 && score.rmse < best.score.rmse);
    if (better) best = trial;
  }

  if (!best) throw new Error('calibrateNetwork: no trial produced a score');

  const bestParams = {
    ...DEFAULT_IDM_PARAMS,
    ...best.params,
    ...(baseConfig.idmOverrides ?? {}),
  };

  const perDetector = detectors.map((d) => {
    const s = best.simulatedFlows[d.edgeId];
    let geh = null;
    try { geh = gehStatistic(d.observedFlow, s); } catch { geh = null; }
    return {
      edgeId: d.edgeId,
      observedFlow: d.observedFlow,
      simulatedFlow: Math.round(s),
      geh: geh == null ? null : Math.round(geh * 1000) / 1000,
      pctError: d.observedFlow > 0 ? Math.round(((s - d.observedFlow) / d.observedFlow) * 10000) / 100 : null,
      passes: geh != null && geh < GEH_PASS_THRESHOLD,
    };
  });

  const summary = {
    meanGEH: round3(best.score.meanGEH),
    pctGEHunder5: round3(best.score.pctGEHunder5),
    rmse: round3(best.score.rmse),
    rSquared: Number.isFinite(best.score.rSquared) ? round3(best.score.rSquared) : null,
    iterations: combos.length,
    evaluatedAt: new Date().toISOString(),
    seedUsed: cfg.seed,
    runSeconds: cfg.runSeconds,
  };

  return {
    bestParams,
    metrics: {
      perDetector,
      summary,
      simulatedFlows: mapRounded(best.simulatedFlows),
      droppedVehicles: best.dropped,
    },
    iterations: combos.length,
    trials,
    warnings,
  };
}

/** Round to 3 decimals. @param {number} x @returns {number} */
function round3(x) { return Math.round(x * 1000) / 1000; }

/** Round every value of a record to integers. @param {Record<string,number>} m @returns {Record<string,number>} */
function mapRounded(m) {
  const out = {};
  for (const [k, v] of Object.entries(m)) out[k] = Math.round(v);
  return out;
}

// -------------------------------------------------------------- validation --

/**
 * Judge a calibration result against standard acceptance criteria:
 *
 *  1. mean GEH < {@link GEH_PASS_THRESHOLD} (5)
 *  2. ≥ {@link GEH_PASS_SHARE} (85 %) of individual detectors have GEH < 5
 *  3. R² ≥ {@link R2_MIN} (0.7) — skipped when R² unavailable
 *
 * Accepts the full object returned by {@link calibrateNetwork} (i.e.
 * `{summary:{…}, perDetector:[…]}`) or a bare metrics object with flat fields.
 *
 * @param {Object} metrics Calibration metrics.
 * @returns {{passed:boolean, details:string[]}} Human-readable check list.
 * @throws {TypeError} When `metrics` lacks usable values.
 *
 * @example
 * const verdict = validateCalibration(cal.metrics);
 * if (!verdict.passed) console.log(verdict.details.join('\n'));
 */
export function validateCalibration(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    throw new TypeError('validateCalibration: metrics object required');
  }

  const sum = metrics.summary ?? {};
  const meanGEH = numOr(sum.meanGEH, metrics.meanGEH);
  const shareRaw = numOr(sum.pctGEHunder5, metrics.pctGEHunder5);
  const r2 = numOr(sum.rSquared, metrics.rSquared);

  // Share may arrive as fraction (0.92) or percent (92).
  const pctUnder5 = shareRaw != null && shareRaw > 1 ? shareRaw / 100 : shareRaw;

  const perDetector = Array.isArray(metrics.perDetector) ? metrics.perDetector : [];
  let computedShare = pctUnder5;
  if (computedShare == null && perDetector.length > 0) {
    const passing = perDetector.filter((d) => d.passes || (Number.isFinite(d.geh) && d.geh < GEH_PASS_THRESHOLD)).length;
    computedShare = passing / perDetector.length;
  }

  if (meanGEH == null && computedShare == null) {
    throw new TypeError('validateCalibration: metrics must include meanGEH or pctGEHunder5/perDetector data');
  }

  /** @type {string[]} */ const details = [];
  let passed = true;

  if (meanGEH != null) {
    const ok = meanGEH < GEH_PASS_THRESHOLD;
    passed = passed && ok;
    details.push(`${ok ? 'PASS' : 'FAIL'} — mean GEH ${meanGEH.toFixed(2)} (criterion < ${GEH_PASS_THRESHOLD})`);
  }
  if (computedShare != null) {
    const ok = computedShare >= GEH_PASS_SHARE;
    passed = passed && ok;
    details.push(`${ok ? 'PASS' : 'FAIL'} — ${Math.round(computedShare * 100)}% of detectors with GEH < ${GEH_PASS_THRESHOLD} (criterion ≥ ${Math.round(GEH_PASS_SHARE * 100)}%)`);
  }
  if (r2 != null) {
    const ok = r2 >= R2_MIN;
    passed = passed && ok;
    details.push(`${ok ? 'PASS' : 'FAIL'} — R² ${r2.toFixed(3)} (criterion ≥ ${R2_MIN})`);
  } else {
    details.push('SKIP — R² not available');
  }

  return { passed, details };
}

/** First finite number among the arguments (null/undefined/'' are skipped), else null. @param {...any} vals @returns {number|null} */
function numOr(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
