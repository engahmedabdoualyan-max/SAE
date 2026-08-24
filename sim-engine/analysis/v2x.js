/**
 * @file V2X (vehicle-to-everything) communication analysis.
 *
 * Message families modeled after SAE J2735:
 *  - BSM  Basic Safety Message   — 10 Hz heartbeat from every equipped vehicle
 *  - MAP  Intersection geometry  — static, sent by RSUs
 *  - SPAT Signal Phasing & Timing — per approach, sent by RSUs
 *  - TIM  Traveler Information   — event-driven, low rate
 *
 * Connectivity model: single-hop DSRC/C-V2X with a fixed radio range;
 * latency grows with local channel load; platooning and cooperative speed
 * harmonization emerge from connected vehicles sharing intent.
 */

/** Radio + protocol constants. */
export const V2X_CONSTANTS = Object.freeze({
  /** BSM transmission rate [Hz]. */
  bsmRateHz: 10,
  /** MAP message rate [Hz] (per RSU). */
  mapRateHz: 1,
  /** SPAT message rate [Hz] (per RSU). */
  spatRateHz: 2,
  /** TIM message rate [Hz]. */
  timRateHz: 0.1,
  /** Default DSRC radio range [m]. */
  defaultRangeM: 300,
  /** Idle-channel medium-access latency [ms]. */
  baseLatencyMs: 20,
  /** Added latency per in-range neighbour [ms] (channel contention). */
  latencyPerNeighborMs: 0.5,
  /** Max latency before the channel is considered congested [ms]. */
  congestionLatencyMs: 100,
});

/**
 * Determine whether a vehicle is V2X-equipped: explicit flag, AV default-on,
 * or deterministic MPR sampling by id hash.
 * @private
 */
function isEquipped(v, mpr) {
  if (v.v2x === true || v.isAV === true || v.type === 'av') return true;
  if (v.v2x === false) return false;
  if (Number.isFinite(mpr)) {
    let h = 0;
    const s = String(v.id ?? '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h % 1000) / 1000 < mpr;
  }
  return false;
}

/**
 * Message flow statistics for one simulation snapshot/period.
 *
 * @param {Array<Object>} vehicles Vehicle list.
 * @param {number} [range=300] Radio range [m].
 * @param {{durationS?:number, mpr?:number}} [opts]
 *   `durationS` aggregation window [s] (default 1 s); `mpr` equipment rate
 *   [0..1] applied deterministically to vehicles without an explicit flag.
 * @returns {{
 *   totalMessages:number, messagesPerSecond:number,
 *   latencyMs:number, coverage:number,
 *   equipped:number, participants:number,
 *   byType:{BSM:number, MAP:number, SPAT:number, TIM:number}
 * }}
 */
export function messageFlow(vehicles, range = V2X_CONSTANTS.defaultRangeM, opts = {}) {
  if (!Array.isArray(vehicles)) throw new TypeError('messageFlow: vehicles array required');
  if (!Number.isFinite(range) || range <= 0) throw new TypeError('messageFlow: range must be > 0');
  const durationS = Number.isFinite(opts.durationS) && opts.durationS > 0 ? opts.durationS : 1;

  const fleet = vehicles.filter((v) => v && typeof v === 'object' && (v.position || Number.isFinite(v.x)));
  const equippedList = fleet.filter((v) => isEquipped(v, opts.mpr));

  // Neighbour counts within radio range (pairwise scan).
  let neighborsSum = 0;
  let covered = 0;
  for (const v of equippedList) {
    const pv = v.position ?? { x: v.x, y: v.y };
    let n = 0;
    for (const w of equippedList) {
      if (w === v) continue;
      const pw = w.position ?? { x: w.x, y: w.y };
      if (Math.hypot(pv.x - pw.x, pv.y - pw.y) <= range) n += 1;
    }
    neighborsSum += n;
    if (n > 0) covered += 1;
  }

  const avgNeighbors = equippedList.length > 0 ? neighborsSum / equippedList.length : 0;
  const perVehicleRate =
    V2X_CONSTANTS.bsmRateHz +
    V2X_CONSTANTS.mapRateHz +
    V2X_CONSTANTS.spatRateHz +
    V2X_CONSTANTS.timRateHz;

  const totalMessages = equippedList.length * perVehicleRate * durationS;
  const latencyMs = Math.min(
    V2X_CONSTANTS.congestionLatencyMs,
    V2X_CONSTANTS.baseLatencyMs + avgNeighbors * V2X_CONSTANTS.latencyPerNeighborMs,
  );

  return {
    totalMessages: Math.round(totalMessages),
    messagesPerSecond: +(equippedList.length * perVehicleRate).toFixed(1),
    latencyMs: +latencyMs.toFixed(2),
    coverage: equippedList.length > 0 ? +(covered / equippedList.length).toFixed(3) : 0,
    equipped: equippedList.length,
    participants: fleet.length,
    byType: {
      BSM: Math.round(equippedList.length * V2X_CONSTANTS.bsmRateHz * durationS),
      MAP: Math.round(equippedList.length * V2X_CONSTANTS.mapRateHz * durationS),
      SPAT: Math.round(equippedList.length * V2X_CONSTANTS.spatRateHz * durationS),
      TIM: Math.round(equippedList.length * V2X_CONSTANTS.timRateHz * durationS),
    },
  };
}

/**
 * Detect platoons: chains of same-edge/same-lane vehicles with small gaps and
 * matched speeds.
 *
 * @param {Array<Object>} vehicles Vehicle list (`edgeId`, `lane?`, `offset`,
 *   `speed`, `id`).
 * @param {{maxGapM?:number, maxSpeedDiffMps?:number, minSize?:number}} [opts]
 * @returns {Array<{members:string[], size:number, edgeId:string, lane:number,
 *                  avgSpeed:number, avgGap:number}>}
 */
export function platooning(vehicles, opts = {}) {
  const maxGap = Number.isFinite(opts.maxGapM) ? opts.maxGapM : 15;
  const maxDv = Number.isFinite(opts.maxSpeedDiffMps) ? opts.maxSpeedDiffMps : 2.0;
  const minSize = Number.isFinite(opts.minSize) ? opts.minSize : 2;
  if (!Array.isArray(vehicles)) throw new TypeError('platooning: vehicles array required');

  const byEdgeLane = new Map();
  for (const v of vehicles) {
    if (!v?.edgeId || !Number.isFinite(v.offset)) continue;
    const key = `${v.edgeId}|${v.lane ?? 0}`;
    if (!byEdgeLane.has(key)) byEdgeLane.set(key, []);
    byEdgeLane.get(key).push(v);
  }

  /** @type {Array<Object>} */ const platoons = [];
  for (const [key, list] of byEdgeLane) {
    list.sort((a, b) => a.offset - b.offset);
    let chain = [];
    const flush = () => {
      if (chain.length >= minSize) {
        const gaps = [];
        for (let k = 1; k < chain.length; k++) {
          gaps.push(chain[k].offset - chain[k].length - chain[k - 1].length);
        }
        platoons.push({
          members: chain.map((v) => v.id ?? null),
          size: chain.length,
          edgeId: list[0].edgeId,
          lane: chain[0].lane ?? 0,
          avgSpeed: +(chain.reduce((s, v) => s + (v.speed ?? 0), 0) / chain.length).toFixed(2),
          avgGap: gaps.length > 0 ? +(gaps.reduce((s, g) => s + g, 0) / gaps.length).toFixed(2) : 0,
          key,
        });
      }
      chain = [];
    };
    for (let k = 0; k < list.length; k++) {
      if (chain.length === 0) {
        chain.push(list[k]);
        continue;
      }
      const prev = chain[chain.length - 1];
      const gap = list[k].offset - (list[k].length ?? 4.5) - prev.length;
      const dv = Math.abs((list[k].speed ?? 0) - (prev.speed ?? 0));
      if (gap >= 0 && gap <= maxGap && dv <= maxDv) chain.push(list[k]);
      else {
        flush();
        chain.push(list[k]);
      }
    }
    flush();
  }

  return platoons.sort((a, b) => b.size - a.size);
}

/**
 * Cooperative speed harmonization: recommend smooth target speeds so
 * platoon-mates and approaching vehicles avoid stop-and-go waves.
 *
 * Recommendation per vehicle:
 *   v_rec = min(edgeLimit, weighted blend of own speed with neighbours'
 *   speeds within `harmonizationRangeM`).
 *
 * @param {Array<Object>} vehicles Vehicle list with positions or offsets.
 * @param {Object|null} [network=null] Network providing edge speed limits via
 *   `getEdge(id).speedLimit`.
 * @param {{harmonizationRangeM?:number}} [opts]
 * @returns {Array<{vehicleId:string, currentSpeed:number, recommendedSpeed:number,
 *                  deltaMps:number, groupSize:number}>}
 */
export function cooperativeSpeed(vehicles, network = null, opts = {}) {
  const range = Number.isFinite(opts.harmonizationRangeM) ? opts.harmonizationRangeM : 150;
  if (!Array.isArray(vehicles)) throw new TypeError('cooperativeSpeed: vehicles array required');

  const posOf = (v) => v.position ?? (Number.isFinite(v.x) ? { x: v.x, y: v.y } : null);

  const out = [];
  for (const v of vehicles) {
    if (!v || !Number.isFinite(v.speed)) continue;
    const pv = posOf(v);
    let sumW = v.speed;
    let sumWs = v.speed; // weight × speed (weight 1 for self)
    let group = 1;

    for (const w of vehicles) {
      if (w === v || !w || !Number.isFinite(w.speed)) continue;
      let within = false;
      const pw = posOf(w);
      if (pv && pw) {
        within = Math.hypot(pv.x - pw.x, pv.y - pw.y) <= range;
      } else if (v.edgeId && w.edgeId && v.edgeId === w.edgeId) {
        within = Math.abs((v.offset ?? 0) - (w.offset ?? 0)) <= range;
      }
      if (!within) continue;
      group += 1;
      sumW += 1;
      sumWs += w.speed;
    }

    const mean = sumWs / sumW;
    const limit = speedLimitFor(v, network);
    const recommended = Math.max(0, Math.min(limit, mean));

    out.push({
      vehicleId: v.id ?? null,
      currentSpeed: +(v.speed ?? 0).toFixed(2),
      recommendedSpeed: +recommended.toFixed(2),
      deltaMps: +(recommended - v.speed).toFixed(2),
      groupSize: group,
    });
  }
  return out;
}

function speedLimitFor(v, network) {
  const e = network && typeof network.getEdge === 'function' ? network.getEdge(v.edgeId) : null;
  const lim = Number.isFinite(e?.speedLimit) ? e.speedLimit : 13.9;
  return lim;
}

/**
 * Project baseline simulation results under a given V2X market penetration
 * rate (MPR).
 *
 * Effects modeled (linear in MPR):
 *  - effective car-following headway:  T_eff = T · (1 − 0.5·MPR)
 *  - capacity gain up to +40% at full penetration:  cap·(1 + 0.4·MPR)
 *  - delay reduction up to −30%:  d·(1 − 0.3·MPR)
 *
 * @param {number} mpr Market penetration rate [0..1].
 * @param {{capacity?:number, avgHeadway?:number, throughput?:number,
 *          avgDelay?:number, travelTimeIndex?:number}} baseResults Baseline KPIs.
 * @returns {Object} New object with adjusted fields plus `{mpr, headwayScale,
 *                   capacityGainPct, delayReductionPct}` metadata.
 */
export function v2xPenetrationImpact(mpr, baseResults = {}) {
  const m = Math.max(0, Math.min(1, Number(mpr)));
  if (!Number.isFinite(m)) throw new TypeError('v2xPenetrationImpact: mpr must be a finite number');

  const headwayScale = 1 - 0.5 * m;
  const capacityScale = 1 + 0.4 * m;
  const delayScale = 1 - 0.3 * m;

  const out = { ...baseResults };
  if (Number.isFinite(baseResults.capacity)) out.capacity = +(baseResults.capacity * capacityScale).toFixed(2);
  if (Number.isFinite(baseResults.avgHeadway)) out.avgHeadway = +(baseResults.avgHeadway * headwayScale).toFixed(4);
  if (Number.isFinite(baseResults.throughput)) {
    out.throughput = +(baseResults.throughput * Math.min(capacityScale, 1.4)).toFixed(2);
  }
  if (Number.isFinite(baseResults.avgDelay)) out.avgDelay = +(baseResults.avgDelay * delayScale).toFixed(2);
  if (Number.isFinite(baseResults.travelTimeIndex)) {
    out.travelTimeIndex = +(baseResults.travelTimeIndex * (1 - 0.15 * m)).toFixed(4);
  }

  out.mpr = m;
  out.headwayScale = +headwayScale.toFixed(4);
  out.capacityGainPct = +(40 * m).toFixed(1);
  out.delayReductionPct = +(30 * m).toFixed(1);
  return out;
}

/* ------------------------------------------------------------ entrypoint -- */

/**
 * Comprehensive V2X analysis over a vehicle set.
 *
 * @param {Array<Object>} vehicles Vehicle list.
 * @param {Object} [config]
 * @param {number} [config.range] Radio range [m].
 * @param {number} [config.durationS=60] Aggregation window [s].
 * @param {number} [config.mpr] Equipment rate override [0..1].
 * @param {Object|null} [config.network] Network (for speed limits).
 * @param {Object} [config.baseResults] Baseline KPIs for penetration impact.
 * @param {number} [config.targetMpr=1] MPR used for the projection table.
 * @returns {{
 *   penetration:{equipped:number, participants:number, rate:number},
 *   messageFlow:Object, platoons:Array<Object>, cooperative:Object,
 *   penetrationImpact:Object, projections:Array<Object>
 * }}
 */
export function analyzeV2X(vehicles, config = {}) {
  const range = Number.isFinite(config.range) ? config.range : V2X_CONSTANTS.defaultRangeM;
  const durationS = Number.isFinite(config.durationS) ? config.durationS : 60;
  const mpr = Number.isFinite(config.mpr) ? config.mpr : undefined;

  const flow = messageFlow(vehicles, range, { durationS, mpr });
  const platoons = platooning(vehicles);
  const coop = cooperativeSpeed(vehicles, config.network ?? null);
  const equippedCount = vehicles.filter((v) => isEquipped(v, mpr)).length;

  const impactBase = config.baseResults ?? {};
  const impact = v2xPenetrationImpact(
    Number.isFinite(config.targetMpr) ? config.targetMpr : 1,
    Object.keys(impactBase).length > 0 ? impactBase : synthBaseline(vehicles),
  );

  const projections = [0, 0.25, 0.5, 0.75, 1].map((m) =>
    v2xPenetrationImpact(m, Object.keys(impactBase).length > 0 ? impactBase : synthBaseline(vehicles)),
  );

  return {
    penetration: {
      equipped: equippedCount,
      participants: vehicles.length,
      rate: vehicles.length > 0 ? +(equippedCount / vehicles.length).toFixed(3) : 0,
    },
    messageFlow: flow,
    platoons,
    cooperative: {
      recommendations: coop.length,
      avgDeltaMps: coop.length > 0
        ? +(coop.reduce((s, r) => s + r.deltaMps, 0) / coop.length).toFixed(3)
        : 0,
      top: coop.slice().sort((a, b) => Math.abs(b.deltaMps) - Math.abs(a.deltaMps)).slice(0, 5),
    },
    penetrationImpact: impact,
    projections,
  };
}

/** Deterministic synthetic baseline derived from fleet size. */
function synthBaseline(vehicles) {
  const n = Array.isArray(vehicles) ? vehicles.length : 0;
  return {
    capacity: Math.max(1800, n * 60),
    avgHeadway: 1.5,
    throughput: Math.max(1800, n * 60),
    avgDelay: 45,
    travelTimeIndex: 1.25,
  };
}
