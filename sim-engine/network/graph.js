/**
 * @file Directed road-network graph: nodes, edges, lanes, and routing.
 *
 * A road is modelled as one or two directed {@link Edge}s between {@link Node}s.
 * Two-way roads are represented by a forward edge plus an auto-generated reverse
 * edge (id `<id>-r`). Routing uses Dijkstra over node weights derived from edge
 * length (or free-flow travel time).
 */

const EARTH_RADIUS_M = 6371000;

/**
 * Haversine great-circle distance between two lat/lng points [m].
 * @param {number} lat1 @param {number} lng1 @param {number} lat2 @param {number} lng2
 * @returns {number}
 */
export function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Minimal binary min-heap for Dijkstra. */
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
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
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

const NODE_TYPES = new Set(['intersection', 'entry', 'exit']);
const LANE_TYPES = new Set(['through', 'left', 'right']);

/**
 * A network node (junction or endpoint).
 */
export class Node {
  /**
   * @param {string} id Unique identifier.
   * @param {number} [lat] Latitude [deg].
   * @param {number} [lng] Longitude [deg].
   * @param {'intersection'|'entry'|'exit'} [type]
   */
  constructor(id, lat = 0, lng = 0, type = 'intersection') {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('Node: id must be a non-empty string');
    if (!NODE_TYPES.has(type)) throw new TypeError(`Node: unknown type "${type}"`);
    this.id = id;
    this.lat = Number(lat);
    this.lng = Number(lng);
    this.type = type;
  }

  /** @returns {boolean} true when coordinates look like real coordinates. */
  hasCoords() {
    return Number.isFinite(this.lat) && Number.isFinite(this.lng) && (this.lat !== 0 || this.lng !== 0);
  }

  /** @returns {Object} plain JSON representation. */
  toJSON() {
    return { id: this.id, lat: this.lat, lng: this.lng, type: this.type };
  }
}

/**
 * One directional lane on an edge.
 */
export class Lane {
  /**
   * @param {string} edgeId Parent edge id.
   * @param {number} index Zero-based lane index (0 = rightmost by convention).
   * @param {'through'|'left'|'right'} [type]
   */
  constructor(edgeId, index, type = 'through') {
    if (typeof edgeId !== 'string' || edgeId.length === 0) throw new TypeError('Lane: edgeId required');
    if (!Number.isInteger(index) || index < 0) throw new TypeError('Lane: index must be a non-negative integer');
    if (!LANE_TYPES.has(type)) throw new TypeError(`Lane: unknown type "${type}"`);
    this.id = `${edgeId}:${index}`;
    this.edgeId = edgeId;
    this.index = index;
    this.type = type;
  }

  toJSON() {
    return { id: this.id, edgeId: this.edgeId, index: this.index, type: this.type };
  }
}

/**
 * A directed edge carrying `lanes` parallel lanes.
 *
 * Vehicle position convention: `offset` is measured from the edge start (`from`
 * node) to the vehicle's FRONT bumper.
 */
export class Edge {
  /**
   * @param {Object} cfg
   * @param {string} cfg.id Unique edge id.
   * @param {string} cfg.from Origin node id.
   * @param {string} cfg.to Destination node id.
   * @param {number|Array<{type?:string}>} [cfg.lanes=1] Lane count or per-lane configs.
   * @param {number} [cfg.speedLimit=13.9] Speed limit [m/s].
   * @param {number} [cfg.length] Length [m]; REQUIRED unless computed by Network from node coords.
   * @param {string} [cfg.name=''] Human-readable road name.
   * @param {number} [cfg.capacityPerLane=1800] Saturation flow per lane [veh/h].
   */
  constructor(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new TypeError('Edge: config object required');
    const { id, from, to } = cfg;
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('Edge: id required');
    if (typeof from !== 'string' || typeof to !== 'string') throw new TypeError(`Edge "${id}": from/to node ids required`);

    this.id = id;
    this.from = from;
    this.to = to;
    this.name = cfg.name ?? '';
    this.speedLimit = Number.isFinite(cfg.speedLimit) ? cfg.speedLimit : 13.9;
    this.capacityPerLane = Number.isFinite(cfg.capacityPerLane) ? cfg.capacityPerLane : 1800;

    if (!Number.isFinite(cfg.length) || cfg.length <= 0) {
      throw new TypeError(`Edge "${id}": positive numeric "length" is required`);
    }
    this.length = cfg.length;

    // Build lanes
    const raw = cfg.lanes ?? 1;
    /** @type {Lane[]} */
    this.lanes = [];
    if (typeof raw === 'number') {
      if (!Number.isInteger(raw) || raw < 1) throw new TypeError(`Edge "${id}": lanes must be >= 1`);
      for (let i = 0; i < raw; i++) this.lanes.push(new Lane(id, i, raw === 1 ? 'through' : i === raw - 1 ? 'through' : 'through'));
    } else if (Array.isArray(raw)) {
      if (raw.length === 0) throw new TypeError(`Edge "${id}": lanes array cannot be empty`);
      raw.forEach((l, i) => {
        const type = l instanceof Lane ? l.type : (l?.type ?? 'through');
        this.lanes.push(new Lane(id, i, type));
      });
    } else {
      throw new TypeError(`Edge "${id}": lanes must be a number or array`);
    }
  }

  /** @returns {number} number of lanes. */
  get laneCount() {
    return this.lanes.length;
  }

  /** @param {number} i @returns {Lane|undefined} */
  getLane(i) {
    return this.lanes[i];
  }

  /** Free-flow travel time [s]. */
  travelTime() {
    return this.length / Math.max(this.speedLimit, 0.1);
  }

  toJSON() {
    return {
      id: this.id, from: this.from, to: this.to,
      lanes: this.laneCount, laneTypes: this.lanes.map((l) => l.type),
      speedLimit: this.speedLimit, length: this.length,
      name: this.name, capacityPerLane: this.capacityPerLane,
    };
  }
}

/**
 * Road network graph with Dijkstra routing.
 */
export class Network {
  /** @param {string} [name] */
  constructor(name = 'network') {
    this.name = name;
    /** @type {Map<string, Node>} */ this.nodes = new Map();
    /** @type {Map<string, Edge>} */ this.edges = new Map();
    /** @type {Map<string, string[]>} nodeId -> outgoing edge ids */ this._out = new Map();
    /** @type {Map<string, string[]>} nodeId -> incoming edge ids */ this._in = new Map();
  }

  // ---------------------------------------------------------------- nodes --

  /**
   * Add a node.
   * @param {Node|{id:string,lat?:number,lng?:number,type?:string}|string} nodeOrId
   * @param {number} [lat] @param {number} [lng] @param {string} [type]
   * @returns {Node}
   * @throws {Error} on duplicate id.
   */
  addNode(nodeOrId, lat, lng, type) {
    const node = nodeOrId instanceof Node ? nodeOrId : new Node(nodeOrId, lat, lng, type);
    if (this.nodes.has(node.id)) throw new Error(`Network: duplicate node "${node.id}"`);
    this.nodes.set(node.id, node);
    this._out.set(node.id, []);
    this._in.set(node.id, []);
    return node;
  }

  /**
   * Fetch a node or throw.
   * @param {string} id
   * @returns {Node}
   */
  getNode(id) {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`Network: unknown node "${id}"`);
    return n;
  }

  /** @returns {Node[]} all nodes (stable insertion order). */
  getAllNodes() {
    return [...this.nodes.values()];
  }

  // ---------------------------------------------------------------- edges --

  /**
   * Add a directed edge. Set `bidirectional: true` to also create the reverse
   * edge with id `${cfg.reverseId || cfg.id + '-r'}`.
   *
   * @param {Object} cfg See {@link Edge}. If `length` is omitted it is computed
   *   via haversine from the endpoint coordinates (both nodes then need coords).
   * @returns {Edge} The forward edge.
   * @throws {Error} on duplicate id, missing endpoints, or missing length.
   */
  addEdge(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new TypeError('addEdge: config object required');
    if (this.edges.has(cfg.id)) throw new Error(`Network: duplicate edge "${cfg.id}"`);
    if (!this.nodes.has(cfg.from)) throw new Error(`Network: edge "${cfg.id}" references unknown node "${cfg.from}"`);
    if (!this.nodes.has(cfg.to)) throw new Error(`Network: edge "${cfg.id}" references unknown node "${cfg.to}"`);

    let length = cfg.length;
    if (!Number.isFinite(length)) {
      const a = this.getNode(cfg.from);
      const b = this.getNode(cfg.to);
      if (!a.hasCoords() || !b.hasCoords()) {
        throw new Error(`Network: edge "${cfg.id}" needs an explicit "length" (endpoints lack coordinates)`);
      }
      length = Math.max(1, Math.round(haversineM(a.lat, a.lng, b.lat, b.lng)));
    }

    const edge = new Edge({ ...cfg, length });

    this.edges.set(edge.id, edge);
    this._out.get(edge.from).push(edge.id);
    this._in.get(edge.to).push(edge.id);

    if (cfg.bidirectional) {
      const revId = cfg.reverseId ?? `${cfg.id}-r`;
      if (!this.edges.has(revId)) {
        this.addEdge({
          ...cfg,
          id: revId,
          from: cfg.to,
          to: cfg.from,
          bidirectional: false,
          name: cfg.name ? `${cfg.name} (reverse)` : '',
        });
      }
    }
    return edge;
  }

  /**
   * Fetch an edge (or null).
   * @param {string} id
   * @returns {Edge|null}
   */
  getEdge(id) {
    return this.edges.get(id) ?? null;
  }

  /** Require an edge; throws when missing. @param {string} id @returns {Edge} */
  requireEdge(id) {
    const e = this.edges.get(id);
    if (!e) throw new Error(`Network: unknown edge "${id}"`);
    return e;
  }

  /**
   * Length of an edge [m].
   * @param {string} edgeId
   * @returns {number}
   * @throws {Error} Unknown edge id.
   */
  getEdgeLength(edgeId) {
    return this.requireEdge(edgeId).length;
  }

  /** @returns {Edge[]} all edges in insertion order. */
  getAllEdges() {
    return [...this.edges.values()];
  }

  /**
   * Edges leaving a node.
   * @param {string} nodeId
   * @returns {Edge[]}
   */
  getOutgoingEdges(nodeId) {
    this.getNode(nodeId);
    return (this._out.get(nodeId) ?? []).map((id) => this.edges.get(id)).filter(Boolean);
  }

  /**
   * Edges entering a node.
   * @param {string} nodeId
   * @returns {Edge[]}
   */
  getIncomingEdges(nodeId) {
    this.getNode(nodeId);
    return (this._in.get(nodeId) ?? []).map((id) => this.edges.get(id)).filter(Boolean);
  }

  // ------------------------------------------------------- route context --

  /**
   * Next edge a vehicle will traverse.
   *
   * Route-aware: returns `route[routeIndex+1]` when available, otherwise the
   * first outgoing edge of the current edge's terminal node. Returns `null`
   * when the vehicle's route/edge is exhausted (it will exit the network).
   *
   * @param {{edgeId:string, route?:string[], routeIndex?:number}} veh
   * @returns {Edge|null}
   */
  getPredecessor(veh) {
    if (!veh || !veh.edgeId) return null;
    if (Array.isArray(veh.route)) {
      const nextId = veh.route[(veh.routeIndex ?? 0) + 1];
      if (nextId !== undefined) return this.getEdge(nextId);
      return null;
    }
    const cur = this.getEdge(veh.edgeId);
    if (!cur) return null;
    const outs = this.getOutgoingEdges(cur.to);
    return outs.length > 0 ? outs[0] : null;
  }

  /** Alias of {@link Network#getPredecessor}. */
  getNextEdge(veh) {
    return this.getPredecessor(veh);
  }

  /**
   * Previous edge in the vehicle's route (null at the start / without a route).
   * @param {{route?:string[], routeIndex?:number}} veh
   * @returns {Edge|null}
   */
  getPreviousEdge(veh) {
    if (!Array.isArray(veh.route)) return null;
    const prevId = veh.route[Math.max(0, (veh.routeIndex ?? 0) - 1)];
    return prevId !== undefined ? this.getEdge(prevId) : null;
  }

  // ------------------------------------------------------------- routing --

  /**
   * Find the shortest path between origin and destination using Dijkstra.
   *
   * Arguments may be NODE ids or EDGE ids:
   *  - an edge origin prepends that edge and starts from its `to` node;
   *  - an edge destination appends that edge and targets its `from` node.
   *
   * @param {string} origin Node or edge id.
   * @param {string} dest   Node or edge id.
   * @param {{weightBy?:'length'|'time'}} [opts]
   * @returns {string[]|null} Ordered edge ids (empty when origin equals
   *   destination), or `null` when the destination is unreachable.
   * @throws {TypeError} Non-string arguments.
   * @throws {Error} Unknown node/edge ids.
   */
  findRoute(origin, dest, opts = {}) {
    const weightBy = opts.weightBy === 'time' ? 'time' : 'length';
    if (typeof origin !== 'string' || typeof dest !== 'string') {
      throw new TypeError('findRoute: origin and dest must be strings');
    }

    /** @type {string[]} */ let prefix = [];
    /** @type {string[]} */ let suffix = [];

    const resolveEndpoint = (id, isOrigin) => {
      if (this.nodes.has(id)) return id;
      const e = this.edges.get(id);
      if (e) {
        if (isOrigin) prefix = [e.id];
        else suffix = [e.id];
        return isOrigin ? e.to : e.from;
      }
      throw new Error(`findRoute: "${id}" is neither a node nor an edge`);
    };

    const start = resolveEndpoint(origin, true);
    const goal = resolveEndpoint(dest, false);

    if (start === goal && prefix.length === 0 && suffix.length === 0) return [];
    // Same edge given as both origin and destination.
    if (prefix.length > 0 && suffix.length > 0 && prefix[0] === suffix[0]) {
      return prefix.slice(0, 1);
    }

    const weight = (e) => (weightBy === 'time' ? e.travelTime() : e.length);

    /** @type {Map<string,number>} */ const dist = new Map([[start, 0]]);
    /** @type {Map<string,{edge:Edge,from:string}>} */ const prev = new Map();
    const done = new Set();
    const heap = new MinHeap();
    heap.push(start, 0);

    while (heap.size > 0) {
      const u = heap.pop();
      if (done.has(u)) continue;
      done.add(u);
      if (u === goal) break;
      for (const e of this.getOutgoingEdges(u)) {
        if (e.to === e.from) continue; // ignore degenerate loops
        const nd = dist.get(u) + weight(e);
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, { edge: e, from: u });
          heap.push(e.to, nd);
        }
      }
    }

    if (!done.has(goal)) {
      return null; // destination unreachable
    }

    // Reconstruct edge sequence.
    const chain = [];
    let cur = goal;
    while (cur !== start) {
      const step = prev.get(cur);
      if (!step) break;
      chain.push(step.edge.id);
      cur = step.from;
    }
    chain.reverse();
    return [...prefix, ...chain, ...suffix];
  }

  // ------------------------------------------------------------ utilities --

  /** Compass bearing of an edge [deg, 0 = north]. Requires node coords. */
  getBearingDeg(edgeId) {
    const e = this.requireEdge(edgeId);
    const a = this.getNode(e.from);
    const b = this.getNode(e.to);
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  /** Total edge length [km] across the network. */
  totalLengthKm() {
    let sum = 0;
    for (const e of this.edges.values()) sum += e.length;
    return sum / 1000;
  }

  stats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      totalLengthKm: Number(this.totalLengthKm().toFixed(3)),
    };
  }

  toJSON() {
    return {
      name: this.name,
      nodes: this.getAllNodes().map((n) => n.toJSON()),
      edges: this.getAllEdges().map((e) => ({
        ...e.toJSON(),
        lanes: e.laneCount,
      })),
    };
  }

  /**
   * Rebuild a network from {@link Network#toJSON} output.
   * @param {{name?:string,nodes:Object[],edges:Object[]}} data
   * @returns {Network}
   */
  static fromJSON(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      throw new TypeError('Network.fromJSON: data must contain nodes[] and edges[]');
    }
    const net = new Network(data.name ?? 'network');
    for (const n of data.nodes) net.addNode(n.id, n.lat, n.lng, n.type);
    for (const e of data.edges) net.addEdge({ ...e });
    return net;
  }
}
