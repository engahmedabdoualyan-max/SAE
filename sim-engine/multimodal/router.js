/**
 * @file Multimodal routing: Dijkstra over a (location × transport-mode) state
 * space built from a road network plus optional public-transit data.
 *
 * Graph model
 * -----------
 * - Road locations are pseudo-nodes `n:<nodeId>`; transit stops are `s:<stopId>`.
 * - ROAD links connect adjacent network nodes. Walk/bike traverse them in both
 *   directions (sidewalks/paths are bidirectional even on one-way streets);
 *   car follows edge directionality.
 * - ACCESS links connect a stop to its anchor node (`walk`, fixed time penalty).
 * - TRANSIT links connect consecutive stops of a bus route (`bus`); their cost
 *   includes half the headway as expected wait time plus a boarding penalty.
 * - Switching mode mid-path costs a generic TRANSFER penalty.
 *
 * Dijkstra runs over states `(nodeKey, mode)` so transfer penalties are
 * evaluated exactly rather than heuristically.
 */

/** Average cruising speeds by mode [m/s]. */
export const MODE_SPEEDS = Object.freeze({
  walk: 1.4,
  bike: 4.5,
  car: 13.9,
});

/** Routing cost defaults [s]. */
export const ROUTER_DEFAULTS = Object.freeze({
  /** Generic penalty for switching mode mid-route. */
  transferPenaltyS: 120,
  /** Fixed boarding friction added to every bus leg. */
  boardPenaltyS: 30,
  /** Walk penalty for the stop access link (each direction). */
  accessPenaltyS: 30,
  /** Fallback headway when a route does not define one [s]. */
  defaultHeadwayS: 900,
  /** Fallback commercial bus speed incl. stops [m/s]. */
  defaultBusSpeedMps: 8,
  /** Per-stop dwell added inside a bus leg [s]. */
  dwellPerStopS: 20,
});

const KNOWN_MODES = new Set(['walk', 'bike', 'bus', 'car']);

/** Split a state key `${nodeKey}|${mode}` into `[nodeKey, mode]`. */
function splitState(s) {
  const i = s.lastIndexOf('|');
  return [s.slice(0, i), s.slice(i + 1)];
}

/* ------------------------------------------------------------------ utils -- */

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item, priority) {
    const a = this.a;
    a.push({ item, priority });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= a[i].priority) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length > 0) {
      this.a[0] = last;
      const a = this.a;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].priority < a[m].priority) m = l;
        if (r < a.length && a[r].priority < a[m].priority) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.item;
  }
}

/**
 * Normalize a network-like input into `{nodes:Map, edges:Map}`.
 * Accepts a {@link Network} instance (duck-typed) or plain objects/maps.
 * @param {unknown} network
 * @returns {{nodes:Map<string,Object>, edges:Map<string,Object>, raw:unknown}}
 * @throws {TypeError} When the input lacks usable nodes/edges.
 */
function normalizeNetwork(network) {
  if (!network || typeof network !== 'object') throw new TypeError('findRoute: network object required');
  let nodes;
  let edges;
  if (typeof network.getAllNodes === 'function' && typeof network.getAllEdges === 'function') {
    nodes = new Map(network.getAllNodes().map((n) => [n.id, n]));
    edges = new Map(network.getAllEdges().map((e) => [e.id, e]));
  } else {
    const asEntries = (c) => {
      if (c instanceof Map) return [...c.entries()];
      if (Array.isArray(c)) return c.map((o) => [o.id, o]);
      if (c && typeof c === 'object') return Object.entries(c);
      return null;
    };
    const nE = asEntries(network.nodes);
    const eE = asEntries(network.edges);
    if (!nE || !eE) throw new TypeError('findRoute: network must expose getAllNodes/getAllEdges or nodes/edges');
    nodes = new Map(nE);
    edges = new Map(eE);
  }
  return { nodes, edges, raw: network };
}

/**
 * Resolve an endpoint spec to a road-node key.
 * @param {string|{nodeId:string}} spec Node id or wrapper object.
 * @param {Map<string,Object>} nodes
 * @param {string} label Argument name for error messages.
 * @returns {string} `n:<nodeId>`
 */
function resolveEndpoint(spec, nodes, label) {
  const id = typeof spec === 'string' ? spec : spec?.nodeId;
  if (typeof id !== 'string' || !id) throw new TypeError(`findRoute: ${label} must be a node id`);
  if (!nodes.has(id)) throw new Error(`findRoute: ${label} references unknown node "${id}"`);
  return `n:${id}`;
}

/**
 * Great-circle-ish planar distance between two network nodes [m]; falls back
 * to Euclidean lat/lng scaling, then Infinity when coordinates are missing.
 * @returns {number}
 */
function nodeDist(a, b) {
  const ax = Number.isFinite(a.lat) ? a.lat : null;
  const ay = Number.isFinite(a.lng) ? a.lng : null;
  const bx = Number.isFinite(b.lat) ? b.lat : null;
  const by = Number.isFinite(b.lng) ? b.lng : null;
  if (ax == null || bx == null || ay == null || by == null) return Infinity;
  const mLat = 111320;
  const mLng = 111320 * Math.cos(((ax + bx) / 2) * (Math.PI / 180));
  return Math.hypot((bx - ax) * mLat, (by - ay) * mLng);
}

/**
 * Extract transit configuration from opts or the network object itself.
 * @returns {{stops:Array, routes:Array}}
 */
function extractTransit(opts, networkRaw) {
  const t = opts.transit ?? {};
  const stops = t.stops ?? networkRaw?.busStops ?? [];
  const routes = t.routes ?? networkRaw?.busRoutes ?? [];
  return {
    stops: Array.isArray(stops) ? stops.filter((s) => s && typeof s.id === 'string') : [],
    routes: Array.isArray(routes) ? routes.filter((r) => r && typeof r.id === 'string') : [],
  };
}

/**
 * Shortest road distance between two nodes by edge length (mini-Dijkstra),
 * used to estimate bus-leg distances when coordinates are unavailable.
 * @returns {number} Distance [m] or Infinity when unreachable.
 */
function roadDistance(fromId, toId, nodes, edges, cache) {
  const key = `${fromId}>${toId}`;
  if (cache.has(key)) return cache.get(key);
  const adj = new Map();
  for (const e of edges.values()) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e);
  }
  const dist = new Map([[fromId, 0]]);
  const done = new Set();
  const heap = new MinHeap();
  heap.push(fromId, 0);
  let result = Infinity;
  while (heap.size > 0) {
    const u = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === toId) { result = dist.get(u); break; }
    for (const e of adj.get(u) ?? []) {
      const nd = dist.get(u) + (Number.isFinite(e.length) ? e.length : 0);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        heap.push(e.to, nd);
      }
    }
  }
  cache.set(key, result);
  return result;
}

/* --------------------------------------------------------------- routing -- */

/**
 * Find the best multimodal route between two locations.
 *
 * @param {string|{nodeId:string}} origin Origin road-network node id.
 * @param {string|{nodeId:string}} dest Destination road-network node id.
 * @param {string[]|'mixed'} [modes=['walk']] Allowed modes; `'mixed'` enables
 *   all of walk/bike/bus/car.
 * @param {Object} network Road network ({@link Network} instance or a plain
 *   `{nodes, edges}` container).
 * @param {Object} [opts]
 * @param {Object} [opts.transit] Transit data:
 *   `{ stops:[{id, nodeId}], routes:[{id, stops:[stopId], headwayS?,
 *      speedMps?, bidirectional?}] }`. Falls back to `network.busStops` /
 *      `network.busRoutes` when omitted.
 * @param {Partial<typeof ROUTER_DEFAULTS>} [opts.penalties] Cost overrides.
 * @returns {{
 *   found:boolean, origin:string, dest:string,
 *   segments:Array<Object>, modesUsed:string[],
 *   totalDistanceM:number, totalTimeS:number
 * }|null} Route description, or `null` when the destination is unreachable
 *   with the given modes.
 * @throws {TypeError|Error} On invalid arguments or unknown endpoints.
 *
 * @example
 * const route = findRoute('A', 'D', ['walk', 'bus'], network, { transit });
 * // route.segments → [{mode:'walk', ...}, {mode:'bus', routeId, ...}, ...]
 */
export function findRoute(origin, dest, modes = ['walk'], network, opts = {}) {
  if (!Array.isArray(modes)) {
    if (modes === 'mixed') modes = ['walk', 'bike', 'bus', 'car'];
    else throw new TypeError('findRoute: modes must be an array or "mixed"');
  }
  const allowed = modes.filter((m) => KNOWN_MODES.has(m));
  if (allowed.length === 0) {
    throw new TypeError(`findRoute: no valid modes in ${JSON.stringify(modes)}`);
  }

  const pen = { ...ROUTER_DEFAULTS, ...(opts.penalties ?? {}) };
  const { nodes, edges, raw } = normalizeNetwork(network);
  const startKey = resolveEndpoint(origin, nodes, 'origin');
  const goalKey = resolveEndpoint(dest, nodes, 'dest');
  const { stops, routes } = extractTransit(opts, raw);

  // ---------------------------------------------------------------- build --
  /** @type {Map<string, Array<Object>>} nodeKey → outgoing links */
  const adj = new Map();
  const addLink = (from, link) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(link);
  };

  // ROAD links (walk/bike undirected, car directed).
  for (const e of edges.values()) {
    const L = Number.isFinite(e.length) && e.length > 0 ? e.length : 100;
    const limit = Number.isFinite(e.speedLimit) && e.speedLimit > 0 ? e.speedLimit : MODE_SPEEDS.car;
    const from = `n:${e.from}`;
    const to = `n:${e.to}`;
    if (from === to) continue;

    if (allowed.includes('walk')) {
      const t = L / MODE_SPEEDS.walk;
      addLink(from, { kind: 'road', mode: 'walk', to, timeS: t, distM: L, edgeId: e.id });
      addLink(to, { kind: 'road', mode: 'walk', to: from, timeS: t, distM: L, edgeId: `${e.id}-w-rev` });
    }
    if (allowed.includes('bike')) {
      const t = L / MODE_SPEEDS.bike;
      addLink(from, { kind: 'road', mode: 'bike', to, timeS: t, distM: L, edgeId: e.id });
      addLink(to, { kind: 'road', mode: 'bike', to: from, timeS: t, distM: L, edgeId: `${e.id}-b-rev` });
    }
    if (allowed.includes('car')) {
      addLink(from, { kind: 'road', mode: 'car', to, timeS: L / Math.max(limit, 1), distM: L, edgeId: e.id });
    }
  }

  // Stops + ACCESS + TRANSIT links.
  const stopById = new Map();
  const distCache = new Map();
  for (const s of stops) {
    if (!nodes.has(s.nodeId)) continue; // skip stops anchored to unknown nodes
    stopById.set(s.id, s);
    const nk = `n:${s.nodeId}`;
    const sk = `s:${s.id}`;
    if (allowed.includes('walk')) {
      addLink(sk, { kind: 'access', mode: 'walk', to: nk, timeS: pen.accessPenaltyS, distM: 0 });
      addLink(nk, { kind: 'access', mode: 'walk', to: sk, timeS: pen.accessPenaltyS, distM: 0 });
    }
  }
  for (const r of routes) {
    if (!Array.isArray(r.stops) || r.stops.length < 2) continue;
    const speed = Number.isFinite(r.speedMps) && r.speedMps > 0 ? r.speedMps : pen.defaultBusSpeedMps;
    const headway = Number.isFinite(r.headwayS) && r.headwayS > 0 ? r.headwayS : pen.defaultHeadwayS;
    const wait = headway / 2;
    const legs = [];
    for (let i = 0; i < r.stops.length - 1; i++) legs.push([r.stops[i], r.stops[i + 1]]);
    if (r.bidirectional !== false && r.bidirectional === true) {
      for (let i = r.stops.length - 1; i > 0; i--) legs.push([r.stops[i], r.stops[i - 1]]);
    }
    if (!allowed.includes('bus')) continue;
    for (const [a, b] of legs) {
      if (!stopById.has(a) || !stopById.has(b)) continue;
      const na = nodes.get(stopById.get(a).nodeId);
      const nb = nodes.get(stopById.get(b).nodeId);
      let d = nodeDist(na, nb);
      if (!Number.isFinite(d)) d = roadDistance(stopById.get(a).nodeId, stopById.get(b).nodeId, nodes, edges, distCache);
      if (!Number.isFinite(d)) d = 500; // last-resort estimate
      const rideT = d / speed + pen.dwellPerStopS;
      addLink(`s:${a}`, {
        kind: 'transit', mode: 'bus', to: `s:${b}`,
        timeS: wait + rideT + pen.boardPenaltyS, distM: d,
        routeId: r.id, waitTimeS: wait,
      });
    }
  }

  // ------------------------------------------------------------ dijkstra ---
  // State = `${nodeKey}|${mode}`. Seed every allowed mode at the origin.
  /** @type {Map<string,number>} */ const dist = new Map();
  /** @type {Map<string,{state:string, link:Object}>} */ const prev = new Map();
  const done = new Set();
  const heap = new MinHeap();

  for (const m of allowed) {
    const s = `${startKey}|${m}`;
    dist.set(s, 0);
    heap.push(s, 0);
  }

  while (heap.size > 0) {
    const u = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    const du = dist.get(u);
    const [uNode, uMode] = splitState(u);

    if (uNode === goalKey) break; // first settled goal-state is optimal

    for (const link of adj.get(uNode) ?? []) {
      if (!allowed.includes(link.mode)) continue;
      const transfer = link.mode === uMode ? 0 : pen.transferPenaltyS;
      const v = `${link.to}|${link.mode}`;
      const nd = du + link.timeS + transfer;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, { state: u, link, transfer });
        heap.push(v, nd);
      }
    }
  }

  // Pick the cheapest settled goal state across modes.
  let goalState = null;
  let goalCost = Infinity;
  for (const m of allowed) {
    const g = `${goalKey}|${m}`;
    if (done.has(g) && (dist.get(g) ?? Infinity) < goalCost) {
      goalCost = dist.get(g);
      goalState = g;
    }
  }
  if (!goalState) return null; // unreachable

  // ---------------------------------------------------------- reconstruct --
  // Walk backwards collecting {fromKey, link} pairs, then reverse.
  /** @type {Array<{fromKey:string, link:Object}>} */ const steps = [];
  let cur = goalState;
  while (prev.has(cur)) {
    const step = prev.get(cur);
    const fromKey = step.state.slice(0, step.state.lastIndexOf('|'));
    steps.push({ fromKey, link: step.link });
    cur = step.state;
  }
  steps.reverse();

  const nodeIdOf = (key) => key.slice(2); // strip 'n:'/'s:'
  const stopOf = (key) => stopById.get(key.slice(2));

  /** @type {Array<Object>} */ const segments = [];
  for (const { fromKey, link } of steps) {
    const last = segments[segments.length - 1];
    const isRideLike = link.kind === 'transit';
    const mergeable = last && !isRideLike &&
      last.kind !== 'transit' && last.mode === link.mode;

    if (mergeable) {
      last.edges ??= [];
      if (link.edgeId) last.edges.push(link.edgeId);
      last.nodes.push(nodeIdOf(link.to));
      last.distanceM += link.distM;
      last.timeS += link.timeS;
    } else {
      /** @type {Object} */
      const seg = {
        mode: link.mode,
        kind: isRideLike ? 'transit' : 'road',
        // Start point: road-node id, or the anchor node of a stop we just left.
        nodes: [
          nodeIdOf(fromKey.startsWith('s:') ? `n:${stopOf(fromKey).nodeId}` : fromKey),
          nodeIdOf(link.to),
        ],
        distanceM: link.distM,
        timeS: link.timeS,
      };
      if (!isRideLike) seg.edges = [];
      if (isRideLike) {
        const boardStopObj = stopOf(fromKey);
        const alightStopObj = stopOf(link.to);
        seg.routeId = link.routeId;
        seg.waitTimeS = +link.waitTimeS.toFixed(2);
        seg.boardStop = boardStopObj.id;
        seg.alightStop = alightStopObj.id;
        seg.stops = [seg.boardStop, seg.alightStop];
        // Anchor node ids of the boarding/alighting stops.
        seg.nodes = [boardStopObj.nodeId, alightStopObj.nodeId];
      } else if (link.edgeId) {
        seg.edges = [link.edgeId];
      }
      segments.push(seg);
    }
  }

  const modesUsed = [...new Set(segments.map((s) => s.mode))];
  const totalDistanceM = segments.reduce((a, s) => a + s.distanceM, 0);
  const totalTimeS = segments.reduce((a, s) => a + s.timeS, 0);

  return {
    found: true,
    origin: typeof origin === 'string' ? origin : origin.nodeId,
    dest: typeof dest === 'string' ? dest : dest.nodeId,
    segments,
    modesUsed,
    totalDistanceM: +totalDistanceM.toFixed(2),
    totalTimeS: +totalTimeS.toFixed(2),
  };
}
