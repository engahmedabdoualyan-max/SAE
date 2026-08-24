/**
 * @file Origin-Destination demand generation and routing.
 *
 * An OD entry looks like:
 *   { from: 'A', to: 'C', flow: 600, type: 'sedan' }   // flow in veh/hour
 *
 * Departures are sampled from a Poisson process (exponential inter-arrivals),
 * which reproduces random arrival patterns for a given hourly flow.
 */

/**
 * Sample an exponential inter-arrival time [s].
 * @param {function():number} rng Uniform RNG in [0,1).
 * @param {number} lambda Rate [1/s], must be > 0.
 * @returns {number}
 */
export function sampleExponentialInterval(rng, lambda) {
  const u = Math.max(1e-12, Math.min(1 - 1e-12, rng()));
  return -Math.log(u) / lambda;
}

/**
 * Generate stochastic vehicle departures from an OD matrix.
 *
 * @param {Array<{from:string,to:string,flow:number,type?:string}>} odMatrix
 *   OD pairs; `flow` in veh/hour; `type` defaults to 'sedan'.
 * @param {import('../network/graph.js').Network} network Network used to
 *   validate that origin/destination exist (node or edge ids). May be null to
 *   skip validation.
 * @param {number} [startTime=0] Simulation start [s].
 * @param {number} [endTime=3600] Simulation end [s].
 * @param {number} [spawnRate=1] Global demand multiplier (0..n).
 * @param {function():number} [rng=Math.random] Seeded RNG for reproducibility.
 * @returns {Array<{id:string, origin:string, dest:string, departTime:number,
 *   vehicleType:string, type:string}>} Sorted by departTime.
 * @throws {TypeError|Error} On malformed matrix entries or unknown OD nodes.
 *
 * @example
 * const dem = generateDemand([{ from:'A', to:'C', flow:720, type:'sedan' }],
 *                            net, 0, 3600, 1.0, mulberry32(42));
 */
export function generateDemand(odMatrix, network, startTime = 0, endTime = 3600, spawnRate = 1, rng = Math.random) {
  if (!Array.isArray(odMatrix)) throw new TypeError('generateDemand: odMatrix must be an array');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw new RangeError(`generateDemand: need endTime > startTime, got [${startTime}, ${endTime}]`);
  }
  if (!Number.isFinite(spawnRate) || spawnRate < 0) throw new RangeError('generateDemand: spawnRate must be >= 0');
  if (typeof rng !== 'function') throw new TypeError('generateDemand: rng must be a function');

  /** @type {Array<{id:string,origin:string,dest:string,departTime:number,vehicleType:string,type:string}>} */
  const out = [];
  let req = 0;

  odMatrix.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') throw new TypeError(`odMatrix[${idx}]: entry must be an object`);
    const { from, to, flow } = entry;
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new TypeError(`odMatrix[${idx}]: "from" and "to" node ids are required`);
    }
    if (!Number.isFinite(flow) || flow <= 0) {
      throw new TypeError(`odMatrix[${idx}]: "flow" (veh/hour) must be > 0`);
    }
    if (network) {
      for (const [role, id] of [['from', from], ['to', to]]) {
        if (!network.nodes.has(id) && !network.getEdge(id)) {
          throw new Error(`generateDemand: odMatrix[${idx}] ${role} "${id}" not found in network`);
        }
      }
    }

    const type = entry.type ?? 'sedan';
    const ratePerSec = (flow / 3600) * spawnRate;
    if (ratePerSec <= 0) return;

    let t = startTime + sampleExponentialInterval(rng, ratePerSec);
    while (t < endTime) {
      out.push({
        id: `od-${idx}-${req++}`,
        origin: from,
        dest: to,
        departTime: t,
        vehicleType: type,
        type,
      });
      t += sampleExponentialInterval(rng, ratePerSec);
    }
  });

  out.sort((a, b) => a.departTime - b.departTime);
  return out;
}

/**
 * Resolve each demand item to an edge-level route through the network.
 *
 * @param {Array<{origin:string,dest:string,departTime:number,vehicleType?:string,type?:string,id?:string}>} demands
 * @param {import('../network/graph.js').Network} network
 * @param {{onError?:(id:any,message:string)=>void, weightBy?:'length'|'time'}} [opts]
 * @returns {Array<{id?:string, origin:string, dest:string, departTime:number,
 *   type:string, route:string[]}>} Routed demand sorted by departTime.
 *   Unroutable items are skipped and reported via `opts.onError`.
 */
export function routeDemand(demands, network, opts = {}) {
  if (!Array.isArray(demands)) throw new TypeError('routeDemand: demands must be an array');
  if (!network) throw new TypeError('routeDemand: network is required');

  const onError = typeof opts.onError === 'function' ? opts.onError : () => {};
  /** @type {Array<any>} */
  const routed = [];

  for (const d of demands) {
    if (!d || typeof d !== 'object') continue;
    try {
      const route = network.findRoute(d.origin, d.dest, { weightBy: opts.weightBy });
      if (!route || (route.length === 0 && d.origin !== d.dest)) {
        throw new Error('no route found');
      }
      routed.push({
        ...(d.id !== undefined ? { id: d.id } : {}),
        origin: d.origin,
        dest: d.dest,
        departTime: d.departTime,
        type: d.vehicleType ?? d.type ?? 'sedan',
        route,
      });
    } catch (err) {
      onError(d?.id ?? `${d.origin}->${d.dest}`, String(err.message ?? err));
    }
  }

  routed.sort((a, b) => a.departTime - b.departTime);
  return routed;
}
