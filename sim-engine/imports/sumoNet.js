/**
 * @file SUMO `.net.xml` network importer.
 *
 * Converts a SUMO network definition into the sim-engine {@link Network}
 * format: `<junction>` → nodes, `<edge>` (non-internal) → directed edges with
 * lanes, `<connection>` → turn-type metadata + lane typing, `<tlLogic>` →
 * signal plans ready for {@link Simulator#loadSignals}.
 *
 * Junction type mapping:
 *  - `traffic_light*`        → intersection node + signal plan
 *  - `dead_end*`             → exit node
 *  - `priority`, `right_before_left`, `allway_stop`, `priority_stop` → intersection
 *
 * Coordinates: SUMO networks are planar meters. When the `<location>` element
 * carries a real projection (`projParameter` ≠ `"!"`) with `+lat_0/+lon_0`
 * terms, an equirectangular inverse approximation is used around that origin
 * (after undoing `netOffset`). Otherwise coordinates are projected around
 * `(0, 0)` and a warning recorded. Raw bounds are preserved in metadata as
 * `convBoundary` / `netBoundary`.
 *
 * @example
 * import { parseSUMONetwork } from './sim-engine/imports/sumoNet.js';
 * const net = parseSUMONetwork(netXmlText);
 * simulator.loadNetwork(net).loadSignals(net.signals);
 */

import { Network } from '../network/graph.js';
import {
  parseXMLDocument, tagOf, attr, numAttr, getChild, getChildren, textContent,
} from './xmlMini.js';

/** Default speed [m/s] when a lane omits `speed`. */
const DEFAULT_SPEED_MS = 13.9;
const EARTH_RADIUS_M = 6378137;
const DEG = 180 / Math.PI;

/** SUMO junction types treated as signalised intersections. */
const TL_TYPES = /^traffic_light/;
/** SUMO junction types treated as dead ends. */
const DEAD_TYPES = /^dead_end/;

/**
 * Map a SUMO connection `dir` to our lane movement type.
 * @param {string|undefined} dir One of `s l L r R t T` (SUMO dirs).
 * @returns {'through'|'left'|'right'|null} `null` when not classifiable.
 */
function dirToTurn(dir) {
  switch (dir) {
    case 'l': case 'L': return 'left';
    case 'r': case 'R': return 'right';
    default: return null; // s / t / unknown stay 'through'
  }
}

/**
 * Parse a SUMO network XML document into a {@link Network}.
 *
 * Extra data attached to the returned instance:
 *  - `net.metadata.source='sumo'`, plus `version`, `netOffset`, `convBoundary`,
 *    `origBoundary` (netBoundary), `projParameter`, `warnings[]`.
 *  - `net.shape` per edge: sampled `[lat, lng]` polyline (from lane shapes).
 *  - `net.connections[]`: `{ from, to, fromLane, toLane, dir, state, via }`.
 *  - `net.signals[]`: loadSignals-compatible plans
 *    `{ nodeId, mode?, plan:{ id, offset, phases:[{green,yellow,red}] } }`
 *    converted from `<tlLogic>` (SUMO yellow/red interstages folded into the
 *    preceding green phase).
 *
 * @param {string} xmlString Raw contents of a `.net.xml` file.
 * @returns {Network}
 * @throws {TypeError} When the argument is not a non-empty string.
 * @throws {Error} On malformed XML or a non-`<net>` root element.
 */
export function parseSUMONetwork(xmlString) {
  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new TypeError('parseSUMONetwork: expected a non-empty XML string');
  }

  const root = parseXMLDocument(xmlString);
  if (tagOf(root) !== 'net') {
    throw new Error(`parseSUMONetwork: root element is <${tagOf(root)}>, expected <net>`);
  }

  /** @type {string[]} */ const warnings = [];

  // ------------------------------------------------------------- location --
  const locEl = getChild(root, 'location');
  const meta = parseLocation(locEl, warnings);
  const toGeo = meta._projector;
  delete meta._projector;

  const net = new Network('sumo-network');

  // ------------------------------------------------------------ junctions --
  /** @type {Map<string, {type:string}>} */ const junctionTypes = new Map();
  for (const j of getChildren(root, 'junction')) {
    const id = attr(j, 'id');
    if (!id || id.startsWith(':')) continue; // internal junctions are implicit in our model
    if (net.nodes.has(id)) { warnings.push(`duplicate junction "${id}" skipped`); continue; }

    const x = numAttr(j, 'x', NaN);
    const y = numAttr(j, 'y', NaN);
    const rawType = attr(j, 'type') ?? 'priority';
    let type = 'intersection';
    if (DEAD_TYPES.test(rawType)) type = 'exit';
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      warnings.push(`junction "${id}" has no coordinates — placed at origin`);
      net.addNode(id, 0, 0, type);
    } else {
      const p = toGeo(x, y);
      net.addNode(id, p.lat, p.lng, type);
    }
    junctionTypes.set(id, { type: rawType });
  }

  // ---------------------------------------------------------------- edges --
  /** @type {Map<string, number>} */ const edgeLanes = new Map();
  for (const edgeEl of getChildren(root, 'edge')) {
    const id = attr(edgeEl, 'id');
    if (!id) continue;
    if ((attr(edgeEl, 'function') ?? '') === 'internal' || id.startsWith(':')) continue;

    const from = attr(edgeEl, 'from');
    const to = attr(edgeEl, 'to');
    if (!from || !to) { warnings.push(`edge "${id}" missing from/to — skipped`); continue; }

    for (const nid of [from, to]) {
      if (!net.nodes.has(nid)) {
        net.addNode(nid, 0, 0, 'intersection');
        warnings.push(`edge "${id}" references unknown junction "${nid}" — placeholder node created`);
      }
    }

    const laneEls = getChildren(edgeEl, 'lane');
    if (laneEls.length === 0) { warnings.push(`edge "${id}" has no lanes — skipped`); continue; }
    laneEls.sort((a, b) => numAttr(a, 'index', 0) - numAttr(b, 'index', 0));

    const laneCount = laneEls.length;
    if (net.edges.has(id)) { warnings.push(`duplicate edge "${id}" skipped`); continue; }

    const speed = (() => {
      for (const l of laneEls) {
        const v = numAttr(l, 'speed', NaN);
        if (Number.isFinite(v) && v > 0) return v; // m/s in SUMO
      }
      return DEFAULT_SPEED_MS;
    })();

    const length = inferEdgeLength(edgeEl, laneEls, net, from, to);

    try {
      const edge = net.addEdge({ id, from, to, lanes: laneCount, speedLimit: speed, length });
      edgeLanes.set(id, laneCount);
      attachShape(net, edge, edgeEl, laneEls[0], toGeo);
    } catch (err) {
      warnings.push(`edge "${id}" could not be added: ${err.message}`);
    }
  }

  // ----------------------------------------------------------- connections --
  /** @type {Array<Object>} */ const connectionsOut = [];
  /** @type {Map<string, Set<string>>} */ const turnsByLane = new Map();
  for (const c of getChildren(root, 'connection')) {
    const from = attr(c, 'from');
    const to = attr(c, 'to');
    if (!from || !to) continue;
    if (from.startsWith(':') || to.startsWith(':')) continue;

    const rec = {
      from,
      to,
      fromLane: numAttr(c, 'fromLane', 0),
      toLane: numAttr(c, 'toLane', 0),
      dir: attr(c, 'dir') ?? '',
      state: attr(c, 'state') ?? '',
      via: attr(c, 'via') ?? '',
    };
    connectionsOut.push(rec);

    const turn = dirToTurn(rec.dir);
    if (turn) {
      const key = `${from}:${rec.fromLane}`;
      if (!turnsByLane.has(key)) turnsByLane.set(key, new Set());
      turnsByLane.get(key).add(turn);
    }
  }

  // Lane typing: unanimous non-straight directions win ('left'/'right').
  for (const [key, turns] of turnsByLane) {
    const [edgeId, laneIdxRaw] = key.split(':');
    const edge = net.getEdge(edgeId);
    if (!edge) continue;
    const idx = Number(laneIdxRaw);
    if (!(idx >= 0 && idx < edge.lanes.length) || turns.size !== 1) continue;
    const t = [...turns][0];
    if (t === 'left' || t === 'right') edge.lanes[idx].type = t;
  }

  net.connections = connectionsOut;

  // ------------------------------------------------------------- tlLogic ---
  const signalsOut = [];
  const seenTlNodes = new Set();
  for (const tl of getChildren(root, 'tlLogic')) {
    const nodeId = attr(tl, 'id');
    if (!nodeId) continue;
    if (seenTlNodes.has(nodeId)) {
      warnings.push(`multiple programs for traffic light "${nodeId}" — first kept`);
      continue;
    }
    seenTlNodes.add(nodeId);

    const phases = [];
    for (const ph of getChildren(tl, 'phase')) {
      const duration = numAttr(ph, 'duration', NaN);
      const state = attr(ph, 'state') ?? '';
      if (Number.isFinite(duration) && duration > 0) phases.push({ duration, state });
    }

    const converted = convertPhases(phases);
    if (converted.length === 0) {
      warnings.push(`tlLogic "${nodeId}" produced no usable phases — skipped`);
      continue;
    }

    const programId = attr(tl, 'programID') ?? '0';
    const offset = Math.max(0, numAttr(tl, 'offset', 0));
    const type = attr(tl, 'type') ?? 'static';

    signalsOut.push({
      nodeId,
      mode: type === 'actuated' ? 'actuated' : undefined,
      plan: { id: programId, offset, phases: converted },
    });

    // Make sure the node exists even if the file had no matching <junction>.
    if (!net.nodes.has(nodeId)) {
      net.addNode(nodeId, 0, 0, 'intersection');
    }
  }
  net.signals = signalsOut;

  // -------------------------------------------------------------- output --
  net.metadata = {
    source: 'sumo',
    version: attr(root, 'version') ?? '',
    ...meta,
    warnings,
  };
  return net;
}

// ----------------------------------------------------------------- helpers --

/**
 * Interpret `<location>` attributes and build the meter→WGS84 projector.
 * @param {Element|any|null} locEl @param {string[]} warnings
 */
function parseLocation(locEl, warnings) {
  const meta = {};
  if (!locEl) {
    warnings.push('no <location> element — assuming identity projection around (0,0)');
    meta._projector = (x, y) => ({ lat: y / EARTH_RADIUS_M * DEG, lng: x / EARTH_RADIUS_M * DEG });
    return meta;
  }

  const parsePair = (s) => {
    const [a, b] = String(s ?? '').split(',').map(Number);
    return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
  };

  const netOffset = parsePair(attr(locEl, 'netOffset'));
  meta.netOffset = attr(locEl, 'netOffset') ?? '';
  meta.projParameter = attr(locEl, 'projParameter') ?? '!';

  const conv = parsePair4(attr(locEl, 'convBoundary'));
  if (conv) {
    meta.convBoundary = { minX: conv[0], minY: conv[1], maxX: conv[2], maxY: conv[3] };
  }
  const orig = parsePair4(attr(locEl, 'origBoundary'));
  if (orig) {
    meta.origBoundary = { minX: orig[0], minY: orig[1], maxX: orig[2], maxY: orig[3] };
  }

  const proj = meta.projParameter;
  const latM = /[+-]?lat_0\s*=\s*(-?\d+(?:\.\d+)?)/.exec(proj);
  const lonM = /[+-]?lon_0\s*=\s*(-?\d+(?:\.\d+)?)/.exec(proj);

  let lat0 = latM ? Number(latM[1]) : 0;
  let lng0 = lonM ? Number(lonM[1]) : 0;

  if (proj === '!' || proj === '' ) {
    warnings.push('projection parameter "!" (plain cartesian) — geo coordinates approximated around (0,0)');
  } else if (!latM || !lonM) {
    warnings.push(`unsupported projParameter "${proj}" — geo coordinates approximated around (0,0)`);
  }

  // geo = network - netOffset, then equirectangular inverse about (lat0, lng0).
  meta._projector = (x, y) => ({
    lat: lat0 + ((y - netOffset[1]) / EARTH_RADIUS_M) * DEG,
    lng: lng0 + ((x - netOffset[0]) / (EARTH_RADIUS_M * Math.cos(lat0 / DEG))) * DEG,
  });
  return meta;
}

/** Parse "minX,minY,maxX,maxY" → [4 numbers] or null. */
function parsePair4(s) {
  if (!s) return null;
  const parts = String(s).split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  return parts;
}

/**
 * Edge length preference: explicit lane `length` > lane shape polyline >
 * haversine between junction nodes (computed by Network.addEdge when omitted).
 * @returns {number|undefined} length in meters or undefined to defer
 */
function inferEdgeLength(edgeEl, laneEls, net, from, to) {
  void edgeEl;
  const laneLen = numAttr(laneEls[0], 'length', NaN);
  if (Number.isFinite(laneLen) && laneLen > 0) return laneLen;

  const shape = attr(laneEls[0], 'shape') ?? attr(edgeEl, 'shape');
  if (shape) {
    const pts = parseShape(shape);
    if (pts.length >= 2) {
      let sum = 0;
      for (let i = 1; i < pts.length; i++) {
        sum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      }
      if (sum > 0) return sum;
    }
  }

  const a = net.nodes.get(from);
  const b = net.nodes.get(to);
  if (a && b && (a.lat !== 0 || a.lng !== 0)) return undefined; // let addEdge compute haversine
  return undefined;
}

/** Parse a SUMO "x1,y1 x2,y2 …" shape into [[x,y],…]. */
function parseShape(s) {
  return String(s)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => pair.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

/**
 * Attach a geodetic polyline to an edge (`edge.shape = [[lat,lng],…]`),
 * preferring the edge-level `shape` attribute over the first lane's.
 */
function attachShape(net, edge, edgeEl, firstLaneEl, toGeo) {
  const raw = attr(edgeEl, 'shape') || attr(firstLaneEl, 'shape');
  if (!raw) return;
  const pts = parseShape(raw);
  if (pts.length < 2) return;
  edge.shape = pts.map(([x, y]) => {
    const g = toGeo(x, y);
    return [g.lat, g.lng];
  });
  void net;
}

/**
 * Convert SUMO phase states ("GGrrYY") into our SignalPhase configs by folding
 * each green interval with any immediately-following yellow/all-red intervals.
 *
 * @param {{duration:number, state:string}[]} rawPhases
 * @returns {Array<{green:number, yellow:number, red:number}>}
 */
function convertPhases(rawPhases) {
  const kindOf = (state) => {
    const hasG = /[Gg]/.test(state);
    const hasY = /[yY]/.test(state);
    if (hasG && !hasY) return 'green';
    if (hasY) return 'yellow';
    return 'red';
  };

  /** @type {Array<{green:number, yellow:number, red:number}>} */
  const out = [];
  /** Leading interstage (yellow before the first green of the cycle). */
  let pendingYellow = 0;
  let pendingRed = 0;
  let i = 0;

  while (i < rawPhases.length) {
    const kind = kindOf(rawPhases[i].state);
    if (kind === 'green') {
      let green = rawPhases[i].duration;
      let yellow = 0;
      let red = 0;
      let j = i + 1;
      while (j < rawPhases.length && kindOf(rawPhases[j].state) !== 'green') {
        if (kindOf(rawPhases[j].state) === 'yellow') yellow += rawPhases[j].duration;
        else red += rawPhases[j].duration;
        j++;
      }
      // Wrap-around: trailing interstages close the cycle onto the next green.
      if (j >= rawPhases.length && pendingYellow + pendingRed > 0) {
        yellow += pendingYellow;
        red += pendingRed;
        pendingYellow = 0;
        pendingRed = 0;
      }
      out.push({ green: Math.max(green, 0.1), yellow, red });
      i = j;
    } else {
      if (out.length === 0) {
        // Interstage before any green belongs to the END of the cycle.
        if (kind === 'yellow') pendingYellow += rawPhases[i].duration;
        else pendingRed += rawPhases[i].duration;
      } else {
        // Orphan interstage after a completed group (two greens in a row were
        // already merged above, so this only happens on malformed files).
        out[out.length - 1].red += rawPhases[i].duration;
      }
      i++;
    }
  }

  if (out.length === 0 && pendingYellow + pendingRed > 0) {
    // Degenerate file: only interstages. Model one minimal flash phase.
    out.push({ green: 0.1, yellow: pendingYellow, red: pendingRed });
  }
  return out.map((p) => ({ green: p.green, yellow: Math.max(0, p.yellow), red: Math.max(0, p.red) }));
}
