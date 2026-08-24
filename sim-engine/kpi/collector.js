/**
 * @file Network-wide KPI computation: speeds, delays, density, flow,
 * v/c ratios, queues and Level-of-Service grading.
 */

/** Queue detection speed threshold [m/s]: slower than this counts as queued. */
export const QUEUE_SPEED = 0.6;

/** Default saturation flow per lane [veh/h] used for v/c when unspecified. */
export const SATURATION_FLOW_PER_LANE = 1800;

/**
 * LOS thresholds on average DELAY per km travelled [s/km].
 * `maxDelay` is inclusive upper bound for that grade.
 *
 * @type {Readonly<Record<string, ReadonlyArray<{los:string, maxDelay:number}>>>}
 */
export const LOS_THRESHOLDS = Object.freeze({
  arterial: Object.freeze([
    { los: 'A', maxDelay: 10 },
    { los: 'B', maxDelay: 20 },
    { los: 'C', maxDelay: 35 },
    { los: 'D', maxDelay: 50 },
    { los: 'E', maxDelay: 70 },
    { los: 'F', maxDelay: Infinity },
  ]),
  highway: Object.freeze([
    { los: 'A', maxDelay: 5 },
    { los: 'B', maxDelay: 10 },
    { los: 'C', maxDelay: 15 },
    { los: 'D', maxDelay: 20 },
    { los: 'E', maxDelay: 25 },
    { los: 'F', maxDelay: Infinity },
  ]),
  collector: Object.freeze([
    { los: 'A', maxDelay: 12 },
    { los: 'B', maxDelay: 22 },
    { los: 'C', maxDelay: 35 },
    { los: 'D', maxDelay: 55 },
    { los: 'E', maxDelay: 80 },
    { los: 'F', maxDelay: Infinity },
  ]),
  residential: Object.freeze([
    { los: 'A', maxDelay: 15 },
    { los: 'B', maxDelay: 25 },
    { los: 'C', maxDelay: 40 },
    { los: 'D', maxDelay: 60 },
    { los: 'E', maxDelay: 85 },
    { los: 'F', maxDelay: Infinity },
  ]),
});

/**
 * Grade a delay value into LOS A–F.
 * @param {number} delaySecPerKm Average delay [s/km].
 * @param {'arterial'|'highway'|'collector'|'residential'} [roadClass='arterial']
 * @returns {'A'|'B'|'C'|'D'|'E'|'F'}
 */
export function losFromDelay(delaySecPerKm, roadClass = 'arterial') {
  const table = LOS_THRESHOLDS[roadClass] ?? LOS_THRESHOLDS.arterial;
  const d = Number.isFinite(delaySecPerKm) ? Math.max(0, delaySecPerKm) : 0;
  for (const row of table) {
    if (d < row.maxDelay) return row.los;
  }
  return 'F';
}

function collection(x) {
  if (x == null) return [];
  if (x instanceof Map) return [...x.values()];
  if (Array.isArray(x)) return x;
  if (typeof x === 'object') return Object.values(x);
  throw new TypeError('collector: expected array, Map or plain object');
}

function laneCountOf(edge) {
  if (typeof edge.laneCount === 'number') return edge.laneCount;
  if (typeof edge.lanes === 'number') return edge.lanes;
  if (Array.isArray(edge.lanes)) return edge.lanes.length;
  return 1;
}

/** Count vehicles queued contiguously from the stop line (front-most backwards). */
function queueCount(vehiclesOnLane) {
  let q = 0;
  // vehicles sorted descending by offset: index 0 is closest to the stop line
  for (const veh of vehiclesOnLane) {
    if ((veh.speed ?? 0) < QUEUE_SPEED) q += 1;
    else break;
  }
  return q;
}

/**
 * Compute network + per-edge KPIs from the current simulation state.
 *
 * @param {Iterable<Object>} vehicles Active vehicle-like objects. Expected:
 *   `{ id, type, edgeId, lane, offset, length, speed, stats?:{time,delay,distance} }`.
 * @param {Iterable<Object>|Map<string,Object>} edges Edge-like objects:
 *   `{ id, length, lanes|laneCount, speedLimit?, capacityPerLane? }`.
 * @param {Iterable<Object>|Map<string,Object>} [signals] Signal controllers with
 *   `getState()` returning `{ state:'green'|'yellow'|'red' }` (optional).
 * @param {Object} [opts]
 * @param {number} [opts.time] Simulation timestamp to embed.
 * @param {number} [opts.step] Step number to embed.
 * @param {{count:number, travelTime:number, delaySum:number, distanceKm:number}} [opts.completedAgg]
 *   Aggregate over already-exited vehicles so fleet averages stay monotonic.
 * @param {'arterial'|'highway'|'collector'|'residential'} [opts.roadClass='arterial']
 *   Road class used for LOS grading.
 * @param {number} [opts.capacityPerLane=SATURATION_FLOW_PER_LANE] Default capacity.
 *
 * @returns {Object} KPIs:
 *  - `avgSpeed` [km/h], `avgSpeedMS` [m/s]
 *  - `avgDelay` [s], `avgDelayPerKm` [s/km], `los` ('A'..'F')
 *  - `density` [veh/km], `flow` [veh/h], `vcRatio`, `maxVC`
 *  - `maxQueue` [veh], `totalTravelTime` [s]
 *  - `perEdge`: `{ [edgeId]: { count, speed, density, densityPerLane, flow, vc, queue, occupancy } }`
 *  - `signals`: `{ total, green, yellow, red }`
 */
export function computeKPIs(vehicles, edges, signals = null, opts = {}) {
  const vehArr = Array.from(vehicles ?? []);
  const edgeArr = Array.from(collection(edges));
  const sigArr = Array.from(signals ? collection(signals) : []);
  const roadClass = opts.roadClass ?? 'arterial';
  const capPerLane = Number.isFinite(opts.capacityPerLane) ? opts.capacityPerLane : SATURATION_FLOW_PER_LANE;
  const completed = opts.completedAgg ?? { count: 0, travelTime: 0, delaySum: 0, distanceKm: 0 };

  // ------------------------------------------------------------- grouping --
  /** @type {Map<string, {edge:Object, lanes:Array<Object[]>}>} */
  const byEdge = new Map();
  for (const e of edgeArr) {
    if (!e || typeof e.id !== 'string') continue;
    byEdge.set(e.id, { edge: e, lanes: Array.from({ length: laneCountOf(e) }, () => []) });
  }
  for (const v of vehArr) {
    const bucket = byEdge.get(v.edgeId);
    if (!bucket) continue;
    const laneIdx = Math.min(Math.max(0, v.lane | 0), bucket.lanes.length - 1);
    bucket.lanes[laneIdx].push(v);
  }

  // ------------------------------------------------------------ per-edge ---
  /** @type {Record<string, Object>} */
  const perEdge = {};
  let totalCount = 0;
  let sumSpeedMS = 0;
  let monitoredLenKm = 0;
  let totalCapacity = 0;
  let totalFlow = 0;
  let maxQueue = 0;
  let maxVC = 0;

  for (const [edgeId, { edge, lanes }] of byEdge) {
    const nLanes = Math.max(1, lanes.length);
    const lenKm = Math.max(edge.length / 1000, 1e-6);
    monitoredLenKm += lenKm;
    const capacity = nLanes * (Number.isFinite(edge.capacityPerLane) ? edge.capacityPerLane : capPerLane);
    totalCapacity += capacity;

    const all = lanes.flat();
    const count = all.length;
    totalCount += count;

    let speedSum = 0;
    for (const v of all) speedSum += v.speed ?? 0;
    const avgMS = count > 0 ? speedSum / count : 0;

    // q = k * v  (space-averaged fundamental relation)
    const densityVehPerKm = count / lenKm; // whole edge, all lanes
    const flowVehH = (densityVehPerKm * (avgMS * 3.6)); // veh/h across all lanes
    const vc = capacity > 0 ? flowVehH / capacity : 0;
    totalFlow += flowVehH;
    if (vc > maxVC) maxVC = vc;

    let queue = 0;
    for (const laneVehs of lanes) {
      laneVehs.sort((a, b) => b.offset - a.offset); // front-most first
      queue = Math.max(queue, queueCount(laneVehs));
    }
    if (queue > maxQueue) maxQueue = queue;

    const bodyLength = all.reduce((s, v) => s + (v.length ?? 5), 0);

    perEdge[edgeId] = {
      count,
      speed: Math.round(avgMS * 3.6 * 100) / 100,          // km/h
      density: Math.round(densityVehPerKm * 100) / 100,     // veh/km (all lanes)
      densityPerLane: Math.round((densityVehPerKm / nLanes) * 100) / 100, // veh/km/lane
      flow: Math.round(flowVehH),
      vc: Math.round(vc * 1000) / 1000,
      queue,
      occupancy: Math.round((bodyLength / (lenKm * 1000)) * 10000) / 100, // %
    };
  }

  // ------------------------------------------------------------ aggregates --
  const activeCount = vehArr.length;
  for (const v of vehArr) sumSpeedMS += v.speed ?? 0;
  const avgSpeedMS = activeCount > 0 ? sumSpeedMS / activeCount : 0;

  const aggCount = activeCount + (completed.count || 0);
  const totalTime =
    vehArr.reduce((s, v) => s + (v.stats?.time ?? 0), 0) + (completed.travelTime || 0);
  const totalDelay =
    vehArr.reduce((s, v) => s + (v.stats?.delay ?? 0), 0) + (completed.delaySum || 0);
  const totalDistanceKm =
    vehArr.reduce((s, v) => s + (v.stats?.distance ?? 0), 0) / 1000 + (completed.distanceKm || 0);

  const avgDelay = aggCount > 0 ? totalDelay / aggCount : 0;
  const avgDelayPerKm = totalDistanceKm > 1e-6 ? totalDelay / totalDistanceKm : 0;

  const networkDensity = monitoredLenKm > 1e-9 ? totalCount / monitoredLenKm : 0;
  const vcRatio = totalCapacity > 0 ? totalFlow / totalCapacity : 0;

  // -------------------------------------------------------------- signals --
  const signalStats = { total: sigArr.length, green: 0, yellow: 0, red: 0 };
  for (const s of sigArr) {
    try {
      const st = typeof s.getState === 'function' ? s.getState() : s;
      if (st && st.state in signalStats) signalStats[st.state] += 1;
    } catch { /* ignore malformed controllers */ }
  }

  return {
    time: opts.time ?? null,
    step: opts.step ?? null,
    generatedAt: new Date().toISOString(),
    roadClass,

    avgSpeed: Math.round(avgSpeedMS * 3.6 * 100) / 100,
    avgSpeedMS: Math.round(avgSpeedMS * 1000) / 1000,
    avgDelay: Math.round(avgDelay * 100) / 100,
    avgDelayPerKm: Math.round(avgDelayPerKm * 100) / 100,
    los: losFromDelay(avgDelayPerKm, roadClass),

    density: Math.round(networkDensity * 1000) / 1000,
    flow: Math.round(totalFlow),
    vcRatio: Math.round(vcRatio * 1000) / 1000,
    maxVC: Math.round(maxVC * 1000) / 1000,

    maxQueue,
    totalTravelTime: Math.round(totalTime * 100) / 100,

    vehicleCount: activeCount,
    perEdge,
    signals: signalStats,
  };
}
