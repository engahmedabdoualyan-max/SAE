/**
 * @file PTV VISSIM (.inpx-style) network exporter.
 *
 * Converts the engine's network graph, fleet profiles, demand matrix, and
 * signal controllers into a VISSIM-compatible XML parameter file that can be
 * imported into PTV Vissim (or diffed against an existing .inpx project).
 *
 * Mapping rules
 *  - Network nodes        -> <NODES><NODE>       (numeric ids, 1-based)
 *  - Directed edges       -> <LINKS><LINK>       (numeric ids, 1-based)
 *  - Fleet profiles       -> <VEHICLES><VEHICLE> (numeric ids start at 100)
 *  - Fleet mix / shares   -> <VEHICLE_COMPOSITIONS>
 *  - Demand entries       -> <DEMAND><VEHICLE_INPUT>
 *  - Signal controllers   -> <SIGNAL_CONTROL>
 *
 * All inputs are optional / nullable; missing pieces simply produce empty
 * sections rather than throwing, so partial models remain exportable.
 *
 * @example
 * import { exportVISSIM } from './sim-engine/io/vissimExport.js';
 * const xml = exportVISSIM(network, fleetProfiles, demand, signals, { duration: 7200 });
 * downloadText('model.inpx', xml);
 */

const APP_TAG = 'SAE AutoSim Hub';

/** Default vehicle dynamics used when a fleet profile omits a field. */
const VEH_DEFAULTS = Object.freeze({
  length: 4.5,   // [m]
  width: 1.8,    // [m]
  desSpeed: 50,  // [km/h]
  maxAccel: 2.4, // [m/s^2]
  maxDecel: 5.0, // [m/s^2]
  minGap: 1.8,   // [m]
  reactTime: 0.85, // [s]
});

/** Default simulation settings written into <PROJECT>. */
const SIM_DEFAULTS = Object.freeze({
  simres: 10,     // simulation resolution [steps/simulation second]
  duration: 3600, // simulated time [s]
});

/**
 * XML-escape a value for use inside a double-quoted attribute.
 * @param {*} v Any value; coerced to string.
 * @returns {string} Escaped string.
 */
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Safe finite-number coercion with fallback.
 * @param {*} v Candidate value.
 * @param {number} [fallback=0] Returned when `v` is not finite.
 * @param {number} [min] Optional lower clamp.
 * @param {number} [max] Optional upper clamp.
 * @returns {number}
 */
function num(v, fallback = 0, min, max) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = fallback;
  if (Number.isFinite(min)) n = Math.max(min, n);
  if (Number.isFinite(max)) n = Math.min(max, n);
  return n;
}

/**
 * Normalize any collection (array / Map / plain object / null) to an array of values.
 * @template T
 * @param {Array<T>|Map<string,T>|Record<string,T>|null|undefined} c
 * @returns {T[]}
 */
function collection(c) {
  if (c == null) return [];
  if (Array.isArray(c)) return c.filter(Boolean);
  if (c instanceof Map) return [...c.values()].filter(Boolean);
  if (typeof c === 'object') return Object.values(c).filter(Boolean);
  return [];
}

/**
 * Pick the first finite number among candidates.
 * @param {...*} args Candidates in priority order.
 * @returns {number|null} First finite value or null.
 */
function firstFinite(...args) {
  for (const a of args) {
    const n = Number(a);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Extract `{nodes, edges}` from a network that may be a Network instance,
 * a plain `{nodes, edges}` bag, or null. Handles arrays and Maps.
 * @param {*} network Network-like input.
 * @returns {{nodes: Array<Object>, edges: Array<Object>}}
 */
function extractNodesEdges(network) {
  if (!network || typeof network !== 'object') return { nodes: [], edges: [] };
  const nodesSrc = network.nodes ?? network.vertices ?? [];
  const edgesSrc = network.edges ?? network.links ?? network.roads ?? [];
  return { nodes: collection(nodesSrc), edges: collection(edgesSrc) };
}

/**
 * Resolve the coordinate pair of a node following the exporter convention
 * (X = latitude-ish primary axis, Y = longitude-ish secondary axis), falling
 * back through common property names.
 * @param {Object} node Node-like object.
 * @returns {{x: number, y: number}}
 */
function nodeCoords(node) {
  const x = firstFinite(node.x, node.lat, node.latitude) ?? 0;
  const y = firstFinite(node.y, node.lng, node.lon, node.longitude) ?? 0;
  return { x, y };
}

/**
 * Lane count of an edge-like object (number, lane array, or `lanes` objects).
 * @param {Object} edge Edge-like object.
 * @returns {number} Positive integer lane count.
 */
function laneCount(edge) {
  const raw = edge.lanes ?? edge.laneCount ?? edge.numLanes;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  if (Array.isArray(raw)) return Math.max(1, raw.length);
  return 1;
}

/**
 * Normalize a fleet profile into a VISSIM vehicle-type record.
 * Speeds are interpreted as m/s when clearly subsonic-road-scale values and
 * converted to km/h; explicit `desSpeedKmh` bypasses conversion.
 * @param {Object} profile Fleet profile (engine model or plain object).
 * @param {number} index Position in fleet list (drives the 100-based id).
 * @returns {{id:number, name:string, length:number, width:number, desSpeed:number,
 *            maxAccel:number, maxDecel:number, minGap:number, reactTime:number,
 *            share:number|null}}
 */
function toVehicleType(profile, index) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const id = firstFinite(p.vissimId, p.typeId) ?? 100 + index;

  let desSpeed =
    firstFinite(p.desSpeedKmh, p.desiredSpeedKmh) ??
    (() => {
      const ms = firstFinite(p.desSpeed, p.maxSpeed, p.speedLimit, p.v0);
      if (ms == null) return VEH_DEFAULTS.desSpeed;
      // Heuristic: values below 45 are treated as m/s and converted to km/h.
      return ms < 45 ? ms * 3.6 : ms;
    })();

  const rawShare = firstFinite(p.share, p.fraction, p.percent, p.pct, p.probability);
  let share = null;
  if (rawShare != null) share = rawShare <= 1 ? rawShare * 100 : rawShare; // fraction -> percent

  return {
    id,
    name: String(p.name ?? p.label ?? p.id ?? `Vehicle ${id}`),
    length: num(p.length ?? p.len, VEH_DEFAULTS.length, 0.25),
    width: num(p.width ?? p.w, VEH_DEFAULTS.width, 0.5),
    desSpeed: num(desSpeed, VEH_DEFAULTS.desSpeed, 1),
    maxAccel: num(p.maxAccel ?? p.accel ?? p.aMax, VEH_DEFAULTS.maxAccel, 0.1),
    maxDecel: num(p.maxDecel ?? p.decel ?? p.bMax, VEH_DEFAULTS.maxDecel, 0.1),
    minGap: num(p.minGap ?? p.gap ?? p.s0, VEH_DEFAULTS.minGap, 0),
    reactTime: num(p.reactTime ?? p.tau ?? p.T, VEH_DEFAULTS.reactTime, 0.1),
    share,
  };
}

/**
 * Build <RELATIVE_FLOW> children for one composition, normalizing shares so
 * they sum to 100 (equal split when no share information is available).
 * @param {Array<ReturnType<toVehicleType>>} types Normalized vehicle types.
 * @param {string} indent Indentation prefix.
 * @returns {string[]} XML lines.
 */
function compositionFlows(types, indent) {
  const known = types.filter((t) => t.share != null);
  const useKnown = known.length > 0;
  const total = useKnown ? known.reduce((s, t) => s + t.share, 0) : types.length;
  return types.map((t) => {
    const flowPct = useKnown ? (t.share != null ? t.share : 0) : 100 / total;
    const pct = total > 0 ? (flowPct / total) * 100 : 100;
    return `${indent}<RELATIVE_FLOW VEH_TYPE="${t.id}" FLOW="${pct.toFixed(1)}"/>`;
  });
}

/**
 * Render a signal controller (fixed-time plan) as XML lines.
 * @param {Object} sig Controller-like object ({node, cycle, phases|groups}).
 * @param {number} id Numeric controller id.
 * @param {Map<string,number>} nodeIds node-key -> numeric VISSIM node id.
 * @param {string} indent Indentation prefix.
 * @returns {string[]} XML lines (may be empty when controller unusable).
 */
function signalLines(sig, id, nodeIds, indent) {
  const s = sig && typeof sig === 'object' ? sig : {};
  const phases = collection(s.phases ?? s.groups ?? s.plan?.phases);
  if (phases.length === 0) return [];

  const nodeKey = s.node ?? s.nodeId ?? s.intersection;
  const nodeRef = nodeIds.get(String(nodeKey));
  const cycle = num(s.cycle ?? s.period, phases.reduce((sum, ph) => sum + num(ph.green ?? ph.duration, 0) + num(ph.yellow ?? ph.red ?? 0, 0), 0), 1);

  const lines = [
    `${indent}<SIGNAL_CONTROLLER ID="${id}" NAME="${esc(s.name ?? s.id ?? `Signal ${id}`)}"` +
      ` NODE="${nodeRef ?? 0}" CYCLE="${Math.round(cycle)}">`,
  ];
  phases.forEach((ph, j) => {
    const p = ph && typeof ph === 'object' ? ph : {};
    const green = Math.round(num(p.green ?? p.duration ?? p.g, 30, 0));
    const yellow = Math.round(num(p.yellow ?? p.y, 3, 0));
    lines.push(
      `${indent}  <SIGNAL_GROUP ID="${j + 1}" NAME="${esc(p.name ?? p.id ?? `Group ${j + 1}`)}" PHASES="${green},${yellow}"/>`
    );
  });
  lines.push(`${indent}</SIGNAL_CONTROLLER>`);
  return lines;
}

/**
 * Export a full VISSIM-compatible XML document.
 *
 * @param {Object|null} [network] Network-like ({nodes, edges}), instance or null.
 * @param {Array<Object>|Map|Object|null} [fleet] Fleet profiles mapped to vehicle types.
 * @param {Array<Object>|null} [demand] Demand entries `{edge|link, flow, [composition]}`.
 * @param {Array<Object>|null} [signals] Signal controllers `{node, cycle, phases}`.
 * @param {Object} [opts]
 * @param {number} [opts.simres=10] Simulation resolution [steps/s].
 * @param {number} [opts.duration=3600] Simulated duration [s].
 * @param {string} [opts.comment] Comment embedded as an XML comment.
 * @returns {string} Complete XML document string.
 *
 * @example
 * const xml = exportVISSIM(net, fleet, demand, signals, { duration: 7200 });
 */
export function exportVISSIM(network = null, fleet = null, demand = null, signals = null, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const simres = num(o.simres, SIM_DEFAULTS.simres, 1);
  const duration = num(o.duration, SIM_DEFAULTS.duration, 1);

  const { nodes, edges } = extractNodesEdges(network);
  const fleetTypes = collection(fleet).map(toVehicleType);
  const demandEntries = collection(demand);
  const signalControllers = collection(signals);

  // --- id maps -------------------------------------------------------------
  /** @type {Map<string, number>} node key -> numeric id (1-based) */
  const nodeIds = new Map();
  nodes.forEach((nd, i) => nodeIds.set(String(nd.id ?? nd.nodeId ?? i), i + 1));

  /** @type {Map<string, number>} edge key -> numeric link id (1-based) */
  const linkIds = new Map();
  edges.forEach((ed, i) => linkIds.set(String(ed.id ?? ed.edgeId ?? ed.linkId ?? i), i + 1));

  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  if (o.comment) L.push(`<!-- ${esc(o.comment)} | generated by ${APP_TAG} -->`);
  L.push('<PARAMETERFILE>');

  // --- PROJECT -------------------------------------------------------------
  L.push('  <PROJECT>');
  L.push(`    <PARAM NAME="simres" VALUE="${Math.round(simres)}"/>`);
  L.push(`    <PARAM NAME="duration" VALUE="${Math.round(duration)}"/>`);
  L.push('  </PROJECT>');

  // --- NODES ---------------------------------------------------------------
  L.push('  <NODES>');
  nodes.forEach((nd, i) => {
    const { x, y } = nodeCoords(nd);
    L.push(
      `    <NODE ID="${i + 1}" NAME="${esc(nd.name ?? nd.id ?? `Node ${i + 1}`)}"` +
        ` X="${x.toFixed(4)}" Y="${y.toFixed(4)}"/>`
    );
  });
  L.push('  </NODES>');

  // --- LINKS ---------------------------------------------------------------
  L.push('  <LINKS>');
  edges.forEach((ed, i) => {
    const fromKey = ed.from ?? ed.fromNode ?? ed.source;
    const toKey = ed.to ?? ed.toNode ?? ed.target;
    const fromId = nodeIds.get(String(fromKey));
    const toId = nodeIds.get(String(toKey));
    if (fromId == null || toId == null) return; // dangling endpoint -> skip link
    const lanes = laneCount(ed);
    const length = num(ed.length ?? ed.len, 100, 0.01);
    const speedKmh = num(ed.speedLimit, 13.9) * 3.6;
    L.push(
      `    <LINK ID="${i + 1}" NAME="${esc(ed.name ?? ed.id ?? `Link ${i + 1}`)}"` +
        ` FROM_NODE="${fromId}" TO_NODE="${toId}" LANES="${lanes}"` +
        ` LENGTH="${length.toFixed(1)}" TYPE="1" SPEED="${speedKmh.toFixed(1)}"/>`
    );
  });
  L.push('  </LINKS>');

  // --- VEHICLES ------------------------------------------------------------
  L.push('  <VEHICLES>');
  fleetTypes.forEach((t) => {
    L.push(
      `    <VEHICLE TYPE="${t.id}" NAME="${esc(t.name)}" LENGTH="${t.length.toFixed(2)}"` +
        ` WIDTH="${t.width.toFixed(2)}" DES_SPEED="${t.desSpeed.toFixed(1)}"` +
        ` MAX_ACCEL="${t.maxAccel.toFixed(2)}" MAX_DECEL="${t.maxDecel.toFixed(2)}"` +
        ` MIN_GAP="${t.minGap.toFixed(2)}" REACT_TIME="${t.reactTime.toFixed(2)}"/>`
    );
  });
  L.push('  </VEHICLES>');

  // --- VEHICLE_COMPOSITIONS -----------------------------------------------
  L.push('  <VEHICLE_COMPOSITIONS>');
  if (fleetTypes.length > 0) {
    const compName = String(
      (collection(fleet)[0] ?? {}).compositionName ?? 'Default Fleet Mix'
    );
    L.push(`    <COMPOSITION ID="1" NAME="${esc(compName)}">`);
    L.push(...compositionFlows(fleetTypes, '      '));
    L.push('    </COMPOSITION>');
  }
  L.push('  </VEHICLE_COMPOSITIONS>');

  // --- DEMAND --------------------------------------------------------------
  L.push('  <DEMAND>');
  demandEntries.forEach((de) => {
    const d = de && typeof de === 'object' ? de : {};
    const linkKey = d.link ?? d.edge ?? d.edgeId ?? d.linkId;
    let linkId = linkIds.get(String(linkKey));
    if (linkId == null && Number.isFinite(Number(linkKey))) linkId = Number(linkKey);
    if (linkId == null) return; // unknown link -> skip entry
    const flow = num(d.flow ?? d.volume ?? d.rate, 0, 0);
    const comp = num(d.composition ?? d.comp, 1, 1);
    L.push(`    <VEHICLE_INPUT LINK="${linkId}" COMPOSITION="${comp}" FLOW="${flow.toFixed(0)}"/>`);
  });
  L.push('  </DEMAND>');

  // --- SIGNAL_CONTROL ------------------------------------------------------
  L.push('  <SIGNAL_CONTROL>');
  signalControllers.forEach((sig, i) => {
    L.push(...signalLines(sig, i + 1, nodeIds, '    '));
  });
  L.push('  </SIGNAL_CONTROL>');

  L.push('</PARAMETERFILE>');
  return L.join('\n');
}

export default exportVISSIM;
