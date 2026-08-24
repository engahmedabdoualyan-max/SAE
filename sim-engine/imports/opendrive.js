/**
 * @file OpenDRIVE (.xodr) network importer.
 *
 * Converts an OpenDRIVE 1.4–1.7 XML document into the sim-engine {@link Network}
 * format (nodes + directed edges with lanes).
 *
 * Supported subset:
 *  - `<planView>` geometry: `line`, `arc` and `spiral` (poly3 approximated as line);
 *    centerlines are sampled adaptively into polylines.
 *  - `<lanes>` lane sections: right-side lanes (`id > 0`) drive in `+s` direction,
 *    left-side lanes (`id < 0`) against it — each side becomes one directed edge.
 *  - Road topology via `<junction>` references and `<link><predecessor|successor>`
 *    road-to-road stitching; standalone ends become entry/exit nodes.
 *  - `<signal>` elements → geolocated signal records on `network.signals`.
 *
 * Local metric coordinates are projected to lat/lng with an equirectangular
 * approximation anchored at the header geo-reference origin (`+lat_0/+lon_0`
 * of the proj4 string) when present, else at `(0, 0)` — a warning is recorded
 * in that case. Lengths remain exact because they come from sampled geometry,
 * not from lat/lng back-projection.
 *
 * @example
 * import { parseOpenDRIVE } from './sim-engine/imports/opendrive.js';
 * const net = parseOpenDRIVE(xodrText);
 * console.log(net.stats(), net.signals.length);
 */

import { Network } from '../network/graph.js';
import {
  parseXMLDocument, tagOf, attr, numAttr, getChild, getChildren, findAllDeep,
  textContent,
} from './xmlMini.js';

/** Default speed limit [m/s] when neither the road type nor lanes declare one (~50 km/h). */
const DEFAULT_SPEED_MS = 13.9;
/** Preferred centerline sampling step [m]. */
const SAMPLE_STEP_M = 5;
/** Max samples per geometry element (protects against pathological inputs). */
const MAX_SAMPLES_PER_GEOM = 400;
/** Distance within which a signal is attached to a junction node [m]. */
const SIGNAL_NODE_SNAP_M = 15;
/** Earth radius used by the local equirectangular projection [m]. @type {number} */
const EARTH_RADIUS_M = 6378137;

const DEG = 180 / Math.PI;

/**
 * Lane types considered drivable for edge construction.
 * Footways etc. are ignored with a warning.
 * @type {ReadonlySet<string>}
 */
const DRIVABLE_LANE_TYPES = new Set([
  'driving', 'stop', 'shoulder', 'exit', 'entry', 'onRamp', 'offRamp',
  'connectingRamp', 'slipLane', 'biking', 'none',
]);

/**
 * Parse an OpenDRIVE document into a {@link Network}.
 *
 * The returned instance carries extra importer metadata:
 *  - `net.metadata.source` = `'opendrive'`
 *  - `net.metadata.origin` = `{ lat0, lng0 }` projection anchor
 *  - `net.metadata.warnings[]` non-fatal issues encountered while importing
 *  - `net.signals[]` parsed `<signal>` elements `{ id, name, roadId, s, t, lat,
 *    lng, dynamic, orientation, type, subtype, value, nodeId? }`
 *
 * @param {string} xmlString Raw contents of a `.xodr` file.
 * @returns {Network} Populated network (name from `<header><name>` if present).
 * @throws {TypeError} When the argument is not a non-empty string.
 * @throws {Error} When the XML cannot be parsed or contains no roads.
 */
export function parseOpenDRIVE(xmlString) {
  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new TypeError('parseOpenDRIVE: expected a non-empty XML string');
  }

  const root = parseXMLDocument(xmlString);
  if (tagOf(root) !== 'OpenDRIVE') {
    throw new Error(`parseOpenDRIVE: root element is <${tagOf(root)}>, expected <OpenDRIVE>`);
  }

  /** @type {string[]} */ const warnings = [];
  const { lat0, lng0 } = parseGeoOrigin(root, warnings);

  /** Equirectangular local-meters → WGS84 projection anchored at the origin. */
  const project = (x, y) => ({
    lat: lat0 + (y / EARTH_RADIUS_M) * DEG,
    lng: lng0 + (x / (EARTH_RADIUS_M * Math.cos(lat0 / DEG))) * DEG,
  });

  const net = new Network(
    textContent(getChild(getChild(root, 'header'), 'name')).trim() || 'opendrive-network'
  );

  // ------------------------------------------------------------- roads ----
  const roadEls = getChildren(root, 'road');
  if (roadEls.length === 0) throw new Error('parseOpenDRIVE: no <road> elements found');

  /** @type {Map<string, {el:any, pts:Array<{x:number,y:number}>, hdgs:number[], ss:number[], length:number}>} */
  const roads = new Map();

  for (const roadEl of roadEls) {
    const id = attr(roadEl, 'id');
    if (id === undefined) { warnings.push('road without id skipped'); continue; }
    if (roads.has(id)) { warnings.push(`duplicate road id "${id}" — later definition kept`); }

    let planView = getChild(roadEl, 'planView');
    if (!planView) {
      // Some exporters nest planView oddly; search deep as a fallback.
      planView = findAllDeep(roadEl, 'planView')[0] ?? null;
    }
    const geomEls = planView ? getChildren(planView, 'geometry') : [];
    if (geomEls.length === 0) {
      warnings.push(`road "${id}" has no planView geometry — skipped`);
      continue;
    }
    geomEls.sort((a, b) => numAttr(a, 's') - numAttr(b, 's'));

    try {
      const sampled = sampleCenterline(geomEls);
      let length = numAttr(roadEl, 'length', NaN);
      if (!Number.isFinite(length) || length <= 0) length = sampled.ss[sampled.ss.length - 1];
      roads.set(id, { el: roadEl, ...sampled, length });
    } catch (err) {
      warnings.push(`road "${id}" geometry failed: ${err.message}`);
    }
  }

  // --------------------------------------------- endpoint node resolution --
  // Key: `${roadId}:${start|end}` → assigned node id. Filled eagerly so links
  // between roads can be resolved regardless of processing order.
  /** @type {Map<string, string>} */ const endpointNode = new Map();
  /** @type {Map<string, {nodeId:string, points:Array<{lat:number,lng:number}>}>} */ const junctions = new Map();
  const endKey = (roadId, which) => `${roadId}:${which}`;

  /**
   * Get or create the junction-level node for an OpenDRIVE `<junction>` id.
   * Positions are averaged over every attached road end in a final pass.
   */
  function junctionNodeId(junctionId, firstPoint) {
    let rec = junctions.get(junctionId);
    if (!rec) {
      const nodeId = `junc-${junctionId}`;
      const p = firstPoint ? project(firstPoint.x, firstPoint.y) : { lat: 0, lng: 0 };
      net.addNode(nodeId, p.lat, p.lng, 'intersection');
      rec = { nodeId, points: [] };
      junctions.set(junctionId, rec);
    }
    return rec.nodeId;
  }

  /**
   * Resolve (and register) the node for one end of a road.
   * @param {string} roadId @param {'start'|'end'} which @param {any} roadRec
   * @returns {{nodeId:string, point:{x:number,y:number}}}
   */
  function resolveEndpointNode(roadId, which, roadRec) {
    const key = endKey(roadId, which);
    const existing = endpointNode.get(key);
    const point = which === 'start'
      ? roadRec.pts[0]
      : roadRec.pts[roadRec.pts.length - 1];

    if (existing) return { nodeId: existing, point };

    const roadEl = roadRec.el;
    const junctionRef = attr(roadEl, 'junction');
    const linkTag = which === 'start' ? 'predecessor' : 'successor';

    // 1. Explicit junction membership.
    if (junctionRef && junctionRef !== '-1') {
      const nodeId = junctionNodeId(junctionRef, point);
      endpointNode.set(key, nodeId);
      return { nodeId, point };
    }

    // 2. Road-to-road link (<link><predecessor/successor elementType="road">).
    const linkEl = getChild(getChild(roadEl, 'link'), linkTag);
    if (linkEl && attr(linkEl, 'elementType') === 'road') {
      const otherId = attr(linkEl, 'elementId');
      const contact = attr(linkEl, 'contactPoint') ?? (which === 'start' ? 'end' : 'start');
      if (otherId !== undefined) {
        const otherKey = endKey(otherId, contact);
        const otherAssigned = endpointNode.get(otherKey);
        if (otherAssigned) {
          endpointNode.set(key, otherAssigned);
          return { nodeId: otherAssigned, point };
        }
        // Counterpart not processed yet — pre-register our shared node under its key.
        const p = project(point.x, point.y);
        const nodeId = `nd-${roadId}-${which}`;
        net.addNode(nodeId, p.lat, p.lng, 'intersection');
        endpointNode.set(key, nodeId);
        endpointNode.set(otherKey, nodeId);
        return { nodeId, point };
      }
    }

    // 3. Link pointing at a junction element (elementType="junction").
    if (linkEl && attr(linkEl, 'elementType') === 'junction') {
      const jid = attr(linkEl, 'elementId');
      if (jid !== undefined) {
        const nodeId = junctionNodeId(jid, point);
        endpointNode.set(key, nodeId);
        return { nodeId, point };
      }
    }

    // 4. Standalone endpoint (motorway ramp mouth, map border…).
    const p = project(point.x, point.y);
    const nodeId = `nd-${roadId}-${which}`;
    net.addNode(nodeId, p.lat, p.lng, 'intersection');
    endpointNode.set(key, nodeId);
    return { nodeId, point };
  }

  // ------------------------------------------------------------ lanes -----
  /**
   * Analyse the lane section covering the middle of the road.
   * @param {any} roadEl @param {number} roadLength
   * @returns {{right:number, left:number, speedLimit:number}}
   */
  function analyseLanes(roadEl, roadLength) {
    const lanesRoot = getChild(roadEl, 'lanes');
    const sections = lanesRoot ? getChildren(lanesRoot, 'laneSection') : [];
    if (sections.length === 0) return { right: 0, left: 0, speedLimit: NaN };

    const midS = roadLength / 2;
    let section = sections[0];
    for (let i = 0; i < sections.length; i++) {
      const sStart = numAttr(sections[i], 's', 0);
      const sEnd = i + 1 < sections.length ? numAttr(sections[i + 1], 's', Infinity) : Infinity;
      if (midS >= sStart && midS < sEnd) { section = sections[i]; break; }
    }

    let right = 0;
    let left = 0;
    let laneSpeed = NaN;

    for (const side of ['left', 'center', 'right']) {
      const sideEl = getChild(section, side);
      if (!sideEl) continue;
      for (const lane of getChildren(sideEl, 'lane')) {
        const lid = numAttr(lane, 'id', 0);
        const type = attr(lane, 'type') ?? 'driving';
        if (lid === 0 || !DRIVABLE_LANE_TYPES.has(type)) {
          if (!DRIVABLE_LANE_TYPES.has(type) && lid !== 0) {
            warnings.push(`road lane type "${type}" treated as non-drivable`);
          }
          continue;
        }
        if (lid > 0) right += 1;
        else left += 1;

        if (!Number.isFinite(laneSpeed)) {
          const sp = getChild(lane, 'speed');
          const v = sp ? numAttr(sp, 'max', NaN) : NaN; // OpenDRIVE speeds are m/s
          if (Number.isFinite(v) && v > 0) laneSpeed = v;
        }
      }
    }
    return { right, left, speedLimit: laneSpeed };
  }

  /** Road-level speed cap from `<type maxSpeed>` (m/s), else NaN. */
  function roadTypeSpeed(roadEl) {
    const t = getChild(roadEl, 'type');
    if (!t) return NaN;
    const v = numAttr(t, 'maxSpeed', NaN);
    return Number.isFinite(v) && v > 0 ? v : NaN;
  }

  // ------------------------------------------------------------ edges -----
  for (const [roadId, rec] of roads) {
    const lanesInfo = analyseLanes(rec.el, rec.length);
    const speed = Number.isFinite(lanesInfo.speedLimit)
      ? lanesInfo.speedLimit
      : Number.isFinite(roadTypeSpeed(rec.el))
        ? roadTypeSpeed(rec.el)
        : DEFAULT_SPEED_MS;

    const start = resolveEndpointNode(roadId, 'start', rec);
    const end = resolveEndpointNode(roadId, 'end', rec);
    if (start.nodeId === end.nodeId) {
      warnings.push(`road "${roadId}" forms a closed loop onto one node — skipped`);
      continue;
    }
    const name = attr(rec.el, 'name') ?? '';
    const length = Math.max(rec.length, 1);

    try {
      if (lanesInfo.right > 0) {
        net.addEdge({
          id: `od-${roadId}+`,
          from: start.nodeId,
          to: end.nodeId,
          lanes: lanesInfo.right,
          speedLimit: speed,
          length,
          name,
        });
      }
      if (lanesInfo.left > 0) {
        net.addEdge({
          id: `od-${roadId}-`,
          from: end.nodeId,
          to: start.nodeId,
          lanes: lanesInfo.left,
          speedLimit: speed,
          length,
          name: name ? `${name} (opposite)` : '',
        });
      }
      if (lanesInfo.right === 0 && lanesInfo.left === 0) {
        warnings.push(`road "${roadId}" has no drivable lanes — no edge created`);
      }
    } catch (err) {
      warnings.push(`edge creation failed for road "${roadId}": ${err.message}`);
    }

    // Record actual endpoints for junction position averaging.
    for (const jrec of junctions.values()) {
      if (start.nodeId === jrec.nodeId) jrec.points.push(start.point);
      if (end.nodeId === jrec.nodeId) jrec.points.push(end.point);
    }
  }

  // Average junction node positions over all attached road endpoints.
  for (const jrec of junctions.values()) {
    if (jrec.points.length < 2) continue;
    const node = net.nodes.get(jrec.nodeId);
    if (!node) continue;
    let lat = 0; let lng = 0;
    for (const pt of jrec.points) {
      const pr = project(pt.x, pt.y);
      lat += pr.lat; lng += pr.lng;
    }
    node.lat = lat / jrec.points.length;
    node.lng = lng / jrec.points.length;
  }

  // Classify standalone nodes: entry (only outgoing), exit (only incoming).
  classifyDeadEnds(net);

  // ----------------------------------------------------------- signals ----
  /** @type {Array<Object>} */ const signalsOut = [];
  for (const [roadId, rec] of roads) {
    const signalsEl = getChild(rec.el, 'signals');
    if (!signalsEl) continue;
    for (const sig of getChildren(signalsEl, 'signal')) {
      const s = numAttr(sig, 's', 0);
      const t = numAttr(sig, 't', 0);
      const idx = indexAt(rec.ss, Math.max(0, Math.min(s, rec.length)));
      const hdg = rec.hdgs[idx];
      // OpenDRIVE lateral offset `t` is positive to the LEFT of the +s heading.
      const x = rec.pts[idx].x - Math.sin(hdg) * t;
      const y = rec.pts[idx].y + Math.cos(hdg) * t;
      const pr = project(x, y);
      const record = {
        id: attr(sig, 'id') ?? `${roadId}-sig-${signalsOut.length}`,
        name: attr(sig, 'name') ?? '',
        roadId,
        s, t,
        lat: pr.lat,
        lng: pr.lng,
        dynamic: attr(sig, 'dynamic') === 'yes',
        orientation: attr(sig, 'orientation') ?? '+',
        country: attr(sig, 'country') ?? '',
        type: attr(sig, 'type') ?? '',
        subtype: attr(sig, 'subtype') ?? '',
        value: numAttr(sig, 'value', NaN),
      };
      attachNearestJunction(record, net);
      signalsOut.push(record);
    }
  }

  // ---------------------------------------------------------- metadata ----
  net.metadata = {
    source: 'opendrive',
    revision: {
      major: numAttr(getChild(root, 'header'), 'revMajor', NaN),
      minor: numAttr(getChild(root, 'header'), 'revMinor', NaN),
    },
    origin: { lat0, lng0 },
    warnings,
  };
  net.signals = signalsOut;
  return net;
}

// ----------------------------------------------------------------- helpers --

/**
 * Extract the projection anchor from `<header><geoReference>`.
 * Recognises proj4-style `+lat_0=` / `+lon_0=` terms; otherwise defaults to
 * (0, 0) and records a warning.
 */
function parseGeoOrigin(root, warnings) {
  const header = getChild(root, 'header');
  const geo = header ? getChild(header, 'geoReference') : null;
  let text = geo ? textContent(geo) : '';
  if (!text) {
    // Some files place bing-srsName style tags; scan raw text as fallback.
    const srs = geo ? findAllDeep(geo, 'srsName')[0] : null;
    text = srs ? textContent(srs) : '';
  }
  const latM = /[+-]?lat_0\s*=\s*(-?\d+(?:\.\d+)?)/.exec(text);
  const lonM = /[+-]?lon_0\s*=\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (latM && lonM) {
    return { lat0: Number(latM[1]), lng0: Number(lonM[1]) };
  }
  warnings.push('no usable geoReference origin (+lat_0/+lon_0) — projecting around (0,0)');
  return { lat0: 0, lng0: 0 };
}

/**
 * Sample a road's planView into a polyline using RK2 integration of the heading.
 * Handles `line`, `arc` and `spiral`; unknown geometry kinds degrade to a
 * straight segment over the declared length (with a returned warning flag list).
 *
 * @param {any[]} geomEls Sorted `<geometry>` elements.
 * @returns {{pts:Array<{x:number,y:number}>, hdgs:number[], ss:number[]}}
 * @throws {Error} When a geometry element lacks mandatory attributes.
 */
function sampleCenterline(geomEls) {
  const pts = [];
  const hdgs = [];
  const ss = [];

  let sGlobal = 0;

  for (let g = 0; g < geomEls.length; g++) {
    const el = geomEls[g];
    const gx = numAttr(el, 'x', NaN);
    const gy = numAttr(el, 'y', NaN);
    const ghdg = numAttr(el, 'hdg', NaN);
    const glen = numAttr(el, 'length', NaN);
    if (![gx, gy, ghdg, glen].every(Number.isFinite)) {
      throw new Error(`geometry #${g} missing x/y/hdg/length attributes`);
    }

    const kindEl =
      getChild(el, 'line') ? { kind: 'line' } :
      getChild(el, 'arc') ? { kind: 'arc', k: numAttr(getChild(el, 'arc'), 'curvature', 0) } :
      (() => {
        const sp = getChild(el, 'spiral');
        return sp
          ? { kind: 'spiral', k0: numAttr(sp, 'curvStart', 0), k1: numAttr(sp, 'curvEnd', 0) }
          : { kind: 'other' };
      })();

    const nSamples = Math.min(MAX_SAMPLES_PER_GEOM, Math.max(2, Math.ceil(glen / SAMPLE_STEP_M) + 1));
    const ds = glen / (nSamples - 1);

    let x = gx;
    let y = gy;
    let hdg = ghdg;

    for (let i = 0; i < nSamples; i++) {
      const u = i * ds;
      pts.push({ x, y });
      hdgs.push(hdg);
      ss.push(sGlobal + u);

      if (i === nSamples - 1) break; // endpoint of this geometry == start of next

      // Midpoint (RK2) integration of dθ/ds = curvature(u).
      let kMid = 0;
      if (kindEl.kind === 'arc') kMid = kindEl.k;
      else if (kindEl.kind === 'spiral') {
        kMid = kindEl.k0 + ((kindEl.k1 - kindEl.k0) * (u + ds / 2)) / glen;
      }
      x += Math.cos(hdg + (kMid * ds) / 2) * ds;
      y += Math.sin(hdg + (kMid * ds) / 2) * ds;
      hdg += kMid * ds;
    }
    sGlobal += glen;
  }

  if (pts.length < 2) throw new Error('planView too short to sample');
  return { pts, hdgs, ss };
}

/**
 * Index of the last sample with cumulative-s <= target (binary search).
 * @param {number[]} ss @param {number} s @returns {number}
 */
function indexAt(ss, s) {
  let lo = 0;
  let hi = ss.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ss[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Mark nodes with only outgoing edges as `'entry'` and only-incoming as
 * `'exit'`; keeps everything else `'intersection'`.
 * @param {Network} net
 */
function classifyDeadEnds(net) {
  const outCount = new Map();
  const inCount = new Map();
  for (const e of net.edges.values()) {
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }
  for (const node of net.nodes.values()) {
    const o = outCount.get(node.id) ?? 0;
    const i = inCount.get(node.id) ?? 0;
    if (i === 0 && o > 0) node.type = 'entry';
    else if (o === 0 && i > 0) node.type = 'exit';
  }
}

/**
 * Snap a signal record to the nearest junction node within
 * {@link SIGNAL_NODE_SNAP_M} and set `.nodeId`.
 * @param {{lat:number,lng:number,nodeId?:string}} record @param {Network} net
 */
function attachNearestJunction(record, net) {
  let best = null;
  for (const node of net.nodes.values()) {
    if (!node.id.startsWith('junc-')) continue;
    const dLat = (node.lat - record.lat) * 111320;
    const dLng = (node.lng - record.lng) * 111320 * Math.cos(record.lat / DEG);
    const d = Math.hypot(dLat, dLng);
    if (d <= SIGNAL_NODE_SNAP_M && (!best || d < best.d)) best = { node, d };
  }
  if (best) record.nodeId = best.node.id;
}
