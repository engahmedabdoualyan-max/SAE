/**
 * @file Network import/export: GeoJSON, OpenDRIVE (subset) and SUMO (subset).
 *
 * All exporters accept either a {@link Network} instance or its plain JSON
 * (`{name?, nodes[], edges[]}`). All importers return a
 * {@link module:network/graph.Network} instance.
 *
 * The bundled XML reader is a small, dependency-free parser sufficient for the
 * OpenDRIVE `<road>/<planView>/<geometry>` subset and SUMO `<net>` files; it is
 * not a general-purpose DOM implementation.
 */

import { Network } from '../network/graph.js';
import { parseOSM } from '../imports/osm.js';

/** Re-export so editor/tests can import everything from one module. */
export { parseOSM };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Round to `n` decimals without float noise. */
function round(x, n = 7) {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

/** Normalize any accepted input into `{name,nodes[],edges[]}` plain data. */
function toPlain(networkOrJson) {
  if (networkOrJson instanceof Network) return networkOrJson.toJSON();
  if (!networkOrJson || typeof networkOrJson !== 'object') {
    throw new TypeError('networkIO: expected a Network instance or {nodes[],edges[]} JSON');
  }
  if (!Array.isArray(networkOrJson.nodes) || !Array.isArray(networkOrJson.edges)) {
    throw new TypeError('networkIO: JSON must contain nodes[] and edges[]');
  }
  return { name: networkOrJson.name ?? 'network', nodes: networkOrJson.nodes, edges: networkOrJson.edges };
}

/** Equirectangular local XY [m] from lat/lng around an origin (for OpenDRIVE/SUMO). */
function makeLocalProjection(origin) {
  const R = 6378137;
  const lat0 = (origin.lat * Math.PI) / 180;
  return function project(lat, lng) {
    return {
      x: round(((lng - origin.lng) * Math.PI * R * Math.cos(lat0)) / 180),
      y: round(((lat - origin.lat) * Math.PI * R) / 180),
    };
  };
}

/**
 * Escape text for XML attribute/context use.
 * @param {any} v
 * @returns {string}
 */
export function xmlEscape(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

/**
 * Export a network as a GeoJSON FeatureCollection (WGS84, [lng, lat] order).
 *
 * Features:
 *  - `Point` per node with properties `{ id, type, element:'node' }`
 *  - `LineString` per edge with properties
 *    `{ id, from, to, lanes, speedLimit, length, name, capacityPerLane, element:'edge' }`
 *
 * @param {Network|Object} networkOrJson
 * @returns {Object} GeoJSON FeatureCollection.
 */
export function exportGeoJSON(networkOrJson) {
  const data = toPlain(networkOrJson);
  const features = [];

  for (const n of data.nodes) {
    if (!Number.isFinite(n.lat) || !Number.isFinite(n.lng) || (n.lat === 0 && n.lng === 0)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round(n.lng), round(n.lat)] },
      properties: { element: 'node', id: n.id, type: n.type ?? 'intersection' },
    });
  }

  for (const e of data.edges) {
    const a = data.nodes.find((n) => n.id === e.from);
    const b = data.nodes.find((n) => n.id === e.to);
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) continue;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [round(a.lng), round(a.lat)],
          [round(b.lng), round(b.lat)],
        ],
      },
      properties: {
        element: 'edge',
        id: e.id,
        from: e.from,
        to: e.to,
        lanes: typeof e.lanes === 'number' ? e.lanes : e.laneCount ?? e.lanes?.length ?? 1,
        speedLimit: e.speedLimit ?? 13.9,
        length: e.length,
        name: e.name ?? '',
        capacityPerLane: e.capacityPerLane ?? 1800,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name: data.name ?? 'network',
    features,
  };
}

/**
 * Import a GeoJSON FeatureCollection produced by {@link exportGeoJSON} (or an
 * equivalent external file). Edge lengths are taken from feature properties
 * when present, otherwise computed from the endpoint coordinates.
 *
 * @param {Object|string} geojson FeatureCollection object or JSON string.
 * @returns {Network}
 * @throws {TypeError} On malformed input.
 */
export function importGeoJSON(geojson) {
  let gj = geojson;
  if (typeof gj === 'string') {
    try {
      gj = JSON.parse(gj);
    } catch (err) {
      throw new TypeError(`importGeoJSON: invalid JSON (${err.message})`);
    }
  }
  if (!gj || gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) {
    throw new TypeError('importGeoJSON: expected a FeatureCollection with features[]');
  }

  const net = new Network(gj.name ?? 'network');

  // Pass 1: points → nodes.
  /** @type {Map<string,{lng:number,lat:number}>} */
  const coords = new Map();
  for (const f of gj.features) {
    if (!f || f.type !== 'Feature' || !f.geometry) continue;
    if (f.geometry.type !== 'Point') continue;
    const p = f.properties ?? {};
    const id = p.id != null ? String(p.id) : `node-${coords.size}`;
    const [lng, lat] = f.geometry.coordinates;
    net.addNode(id, Number(lat), Number(lng), p.type ?? 'intersection');
    coords.set(id, { lng, lat });
  }

  // Pass 2: line strings → edges.
  for (const f of gj.features) {
    if (!f || f.type !== 'Feature' || !f.geometry) continue;
    if (f.geometry.type !== 'LineString') continue;
    const p = f.properties ?? {};
    const line = f.geometry.coordinates;
    if (!Array.isArray(line) || line.length < 2) continue;

    let id = p.id != null ? String(p.id) : undefined;
    let from = p.from != null ? String(p.from) : undefined;
    let to = p.to != null ? String(p.to) : undefined;

    // Fall back to coordinate-snapped endpoints when ids are missing.
    if (!from || !net.nodes.has(from)) {
      from = nearestNode(coords, line[0]);
      if (!from) {
        from = `node-${coords.size}`;
        net.addNode(from, Number(line[0][1]), Number(line[0][0]));
        coords.set(from, { lng: line[0][0], lat: line[0][1] });
      }
    }
    if (!to || !net.nodes.has(to)) {
      const last = line[line.length - 1];
      to = nearestNode(coords, last);
      if (!to || to === from) {
        to = `node-${coords.size}`;
        net.addNode(to, Number(last[1]), Number(last[0]));
        coords.set(to, { lng: last[0], lat: last[1] });
      }
    }
    if (from === to) continue;

    if (id && net.edges.has(id)) id = `${id}-${net.edges.size}`;
    const cfg = {
      id: id ?? `edge-${net.edges.size}`,
      from,
      to,
      lanes: Number.isFinite(Number(p.lanes)) && Number(p.lanes) >= 1 ? Number(p.lanes) : 1,
      speedLimit: Number.isFinite(Number(p.speedLimit)) ? Number(p.speedLimit) : 13.9,
      capacityPerLane: Number.isFinite(Number(p.capacityPerLane)) ? Number(p.capacityPerLane) : 1800,
      name: String(p.name ?? ''),
    };
    if (Number.isFinite(Number(p.length)) && Number(p.length) > 0) cfg.length = Number(p.length);
    try {
      net.addEdge(cfg);
    } catch {
      /* skip degenerate features instead of failing the whole import */
    }
  }

  return net;
}

/** Nearest imported node to an [lng,lat] within 1e-6 deg (~10 cm). */
function nearestNode(coords, coord) {
  for (const [id, c] of coords) {
    if (Math.abs(c.lng - coord[0]) < 1e-6 && Math.abs(c.lat - coord[1]) < 1e-6) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal XML parsing (no dependencies)
// ---------------------------------------------------------------------------

/**
 * Parse a small, well-formed XML document into a node tree.
 *
 * @param {string} xml
 * @returns {{tag:string, attrs:Object<string,string>, children:Array}} Root node.
 *   Children mix element objects and plain strings (text content).
 * @throws {Error} On structurally invalid XML.
 */
export function parseXML(xml) {
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new Error('parseXML: empty input');
  }
  let src = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, s) => escapeCdata(s))
    .replace(/<!DOCTYPE[^>[]*(\[[^\]]*\])?[^>]*>/g, '');

  function escapeCdata(s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  const root = { tag: '#document', attrs: {}, children: [] };
  const stack = [root];

  const tokenRe = /<\s*(\/?)([\w:.\-]+)((?:\s+[\w:.\-]+\s*=\s*"[^"]*"|\s+[\w:.\-]+\s*=\s*'[^']*')*)\s*(\/?)\s*>|([^<]+)/g;

  let m;
  while ((m = tokenRe.exec(src)) !== null) {
    const [, closeSlash, tagRaw, attrBlob, selfSlash, text] = m;
    if (text !== undefined) {
      const decoded = decodeEntities(text);
      if (decoded.trim().length > 0) {
        stack[stack.length - 1].children.push(decoded);
      }
      continue;
    }
    if (closeSlash) {
      // closing tag
      if (stack.length === 1) throw new Error(`parseXML: unexpected </${tagRaw}>`);
      const top = stack.pop();
      if (top.tag !== tagRaw) throw new Error(`parseXML: expected </${top.tag}>, got </${tagRaw}>`);
      continue;
    }
    const attrs = {};
    if (attrBlob) {
      const attrRe = /([\w:.\-]+)\s*=\s*"([^"]*)"|([\w:.\-]+)\s*=\s*'([^']*)'/g;
      let am;
      while ((am = attrRe.exec(attrBlob)) !== null) {
        attrs[am[1] ?? am[3]] = decodeEntities(am[2] ?? am[4] ?? '');
      }
    }
    const node = { tag: tagRaw, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfSlash) stack.push(node);
  }

  if (stack.length > 1) throw new Error(`parseXML: unclosed element <${stack[stack.length - 1].tag}>`);
  const docEl = root.children.find((c) => typeof c !== 'string');
  if (!docEl) throw new Error('parseXML: no root element found');
  return docEl;
}

/** Decode the five predefined XML entities. */
function decodeEntities(s) {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Collect all descendant elements with the given tag name. */
function findAll(node, tag, out = []) {
  for (const c of node.children) {
    if (typeof c === 'string') continue;
    if (c.tag === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}

/** First descendant element with the given tag name (or null). */
function findFirst(node, tag) {
  const all = findAll(node, tag);
  return all.length > 0 ? all[0] : null;
}

const num = (v, fallback = NaN) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// OpenDRIVE (straight-line subset)
// ---------------------------------------------------------------------------

/**
 * Export a network as a minimal OpenDRIVE 1.6 document: one `<road>` per edge
 * with a single straight `<geometry>` sample in local XY coordinates.
 *
 * @param {Network|Object} networkOrJson
 * @param {{origin?:{lat:number,lng:number}}} [opts]
 * @returns {string} XML document.
 */
export function exportOpenDRIVE(networkOrJson, opts = {}) {
  const data = toPlain(networkOrJson);
  const locatedNodes = data.nodes.filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
  const origin = opts.origin ?? locatedNodes[0] ?? { lat: 0, lng: 0 };
  const project = makeLocalProjection(origin);

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<OpenDRIVE>
  <header revMajor="1" revMinor="6" name="${xmlEscape(data.name)}" version="1.00"/>`);

  let roadId = 0;
  const junctionIds = [];
  for (const n of locatedNodes) junctionIds.push(n.id);

  for (const e of data.edges) {
    const a = data.nodes.find((n) => n.id === e.from);
    const b = data.nodes.find((n) => n.id === e.to);
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) continue;
    const pa = project(a.lat, a.lng);
    const pb = project(b.lat, b.lng);
    const hdg = Math.atan2(pb.y - pa.y, pb.x - pa.x);
    const lanes = typeof e.lanes === 'number' ? e.lanes : e.laneCount ?? 1;
    const laneRows = [];
    laneRows.push(`        <lane id="-1" type="driving" level="false"/>`);
    for (let i = 0; i < lanes; i++) laneRows.push(`        <lane id="${i}" type="driving" level="false"/>`);
    lines.push(`  <road id="${roadId}" name="${xmlEscape(e.name || e.id)}" length="${round(Math.max(e.length, 1), 3)}" junction="-1">
    <planView>
      <geometry s="0" x="${pa.x}" y="${pa.y}" hdg="${round(hdg, 6)}" length="${round(Math.max(e.length, 1), 3)}">
        <line/>
      </geometry>
    </planView>
    <lanes>
      <laneSection s="0">
${laneRows.join('\n')}
      </laneSection>
    </lanes>
    <userData>
      <saeEdge id="${xmlEscape(e.id)}" from="${xmlEscape(e.from)}" to="${xmlEscape(e.to)}" speedLimit="${e.speedLimit ?? 13.9}" lanes="${lanes}" bidirectional="${e.bidirectional ? 'true' : 'false'}"/>
    </userData>
  </road>`);
    roadId += 1;
  }

  lines.push(`  <junctions>
${junctionIds.map((j) => `    <junctionReference id="${xmlEscape(j)}"/>`).join('\n')}
  </junctions>`);
  lines.push('</OpenDRIVE>');
  return lines.join('\n');
}

/**
 * Parse a (subset) OpenDRIVE document into a Network.
 *
 * Each road's plan-view geometry polyline becomes chained edges between
 * auto-numbered nodes snapped at shared endpoints. `userData/saeEdge`
 * metadata (written by {@link exportOpenDRIVE}) is honoured so that
 * round-trips preserve ids, connectivity and attributes.
 *
 * @param {string} xml
 * @returns {Network}
 * @throws {TypeError|Error} On invalid XML / wrong root element.
 */
export function parseOpenDRIVE(xml) {
  if (typeof xml !== 'string') throw new TypeError('parseOpenDRIVE: xml string required');
  const root = parseXML(xml);
  if (root.tag !== 'OpenDRIVE') throw new Error(`parseOpenDRIVE: expected <OpenDRIVE> root, got <${root.tag}>`);

  const net = new Network(root.attrs.name ?? 'opendrive-network');

  // Node dedup on rounded local coordinates.
  /** @type {Map<string,string>} key "x:y" -> nodeId */
  const pointIndex = new Map();

  const nodeAt = (x, y) => {
    const key = `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
    const existing = pointIndex.get(key);
    if (existing) return existing;
    const id = `od-node-${pointIndex.size}`;
    net.addNode(id, y, x, 'intersection'); // store local meters as lat=y, lng=x
    pointIndex.set(key, id);
    return id;
  };

  const roads = findAll(root, 'road');
  let implicitRoadIdx = 0;

  for (const road of roads) {
    const planView = findFirst(road, 'planView');
    const geometries = planView ? findAll(planView, 'geometry') : [];
    const userData = findFirst(road, 'userData');
    const sae = userData ? findFirst(userData, 'saeEdge') : null;

    // Sample the centreline: each geometry contributes its start point; the
    // final point closes the polyline using hdg + length.
    const pts = [];
    for (const g of geometries) {
      pts.push({ x: num(g.attrs.x), y: num(g.attrs.y), hdg: num(g.attrs.hdg, 0), len: num(g.attrs.length, 0) });
    }
    if (pts.length === 0) continue;
    const last = pts[pts.length - 1];
    pts.push({
      x: last.x + Math.cos(last.hdg) * last.len,
      y: last.y + Math.sin(last.hdg) * last.len,
      hdg: last.hdg,
      len: 0,
    });

    if (sae) {
      // Rich round-trip path: rebuild the exact original edge.
      const fromId = sae.attrs.from ?? nodeAt(pts[0].x, pts[0].y);
      const toId = sae.attrs.to ?? nodeAt(pts[pts.length - 1].x, pts[pts.length - 1].y);
      if (!net.nodes.has(fromId)) net.addNode(fromId, pts[0].y, pts[0].x);
      if (!net.nodes.has(toId)) net.addNode(toId, pts[pts.length - 1].y, pts[pts.length - 1].x);
      try {
        net.addEdge({
          id: sae.attrs.id ?? road.attrs.id ?? `road-${implicitRoadIdx}`,
          from: fromId,
          to: toId,
          length: num(road.attrs.length, Math.max(1, Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y))),
          speedLimit: num(sae.attrs.speedLimit, 13.9),
          lanes: Math.max(1, num(sae.attrs.lanes, 1)),
          name: road.attrs.name ?? '',
          bidirectional: String(sae.attrs.bidirectional).toLowerCase() === 'true',
          reverseId: sae.attrs.id ? `${sae.attrs.id}-r` : undefined,
        });
      } catch {
        /* duplicate edge ids are skipped */
      }
      implicitRoadIdx += 1;
      continue;
    }

    // Generic OpenDRIVE: chain consecutive geometry samples.
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const na = nodeAt(a.x, a.y);
      const nb = nodeAt(b.x, b.y);
      if (na === nb) continue;
      const segLen = Math.max(1, Math.round(num(road.attrs.length, 0) > 0 && i === 0 ? num(road.attrs.length) : Math.hypot(b.x - a.x, b.y - a.y)));
      try {
        net.addEdge({
          id: `${road.attrs.id ?? 'road'}-${i}`,
          from: na,
          to: nb,
          length: segLen,
          lanes: 1,
          name: road.attrs.name ?? '',
        });
      } catch {
        /* skip duplicates */
      }
    }
    implicitRoadIdx += 1;
  }

  return net;
}

// ---------------------------------------------------------------------------
// SUMO (subset)
// ---------------------------------------------------------------------------

/**
 * Export a network as a minimal SUMO `.net.xml` document (plain edges +
 * junctions; internal links omitted).
 *
 * @param {Network|Object} networkOrJson
 * @returns {string} XML document.
 */
export function exportSUMO(networkOrJson) {
  const data = toPlain(networkOrJson);
  const locatedNodes = data.nodes.filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
  const origin = locatedNodes[0] ?? { lat: 0, lng: 0 };
  const project = makeLocalProjection(origin);

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<net version="1.16" junctionCornerDetail="5" limitTurnSpeed="5.50">`);
  lines.push(`    <location netOffset="0.00,0.00" convBoundary="0.00,0.00,0.00,0.00" origBoundary="0.00,0.00,0.00,0.00" projParameter="!"/>`);

  for (const n of locatedNodes) {
    const p = project(n.lat, n.lng);
    lines.push(`    <junction id="${xmlEscape(n.id)}" type="${n.type === 'entry' || n.type === 'exit' ? 'dead_end' : 'priority'}" x="${p.x}" y="${p.y}"/>`);
  }

  for (const e of data.edges) {
    const a = data.nodes.find((n) => n.id === e.from);
    const b = data.nodes.find((n) => n.id === e.to);
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) continue;
    const pa = project(a.lat, a.lng);
    const pb = project(b.lat, b.lng);
    const lanes = typeof e.lanes === 'number' ? e.lanes : e.laneCount ?? 1;
    const speed = round(e.speedLimit ?? 13.9, 3);
    const laneLen = round(e.length, 2);
    const laneLines = [];
    for (let i = 0; i < lanes; i++) {
      laneLines.push(`        <lane id="${xmlEscape(e.id)}_${i}" index="${i}" speed="${speed}" length="${laneLen}"/>`);
    }
    lines.push(`    <edge id="${xmlEscape(e.id)}" from="${xmlEscape(e.from)}" to="${xmlEscape(e.to)}" priority="1" name="${xmlEscape(e.name ?? '')}">
${laneLines.join('\n')}
        <laneShape x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>
    </edge>`);
  }

  lines.push('</net>');
  return lines.join('\n');
}

/**
 * Parse a SUMO `.net.xml` document into a Network.
 * Internal edges (`function="internal"`) are skipped.
 *
 * @param {string} xml
 * @returns {Network}
 * @throws {TypeError|Error} On invalid XML / wrong root element.
 */
export function parseSUMONetwork(xml) {
  if (typeof xml !== 'string') throw new TypeError('parseSUMONetwork: xml string required');
  const root = parseXML(xml);
  if (root.tag !== 'net') throw new Error(`parseSUMONetwork: expected <net> root, got <${root.tag}>`);

  const net = new Network(root.attrs.name ?? 'sumo-network');

  for (const j of findAll(root, 'junction')) {
    const id = j.attrs.id;
    if (!id || id.startsWith(':')) continue; // internal junctions start with ':'
    net.addNode(id, num(j.attrs.y, 0), num(j.attrs.x, 0), j.attrs.type === 'dead_end' ? 'entry' : 'intersection');
  }

  for (const e of findAll(root, 'edge')) {
    if (String(e.attrs.function ?? '') === 'internal') continue;
    const id = e.attrs.id;
    const from = e.attrs.from;
    const to = e.attrs.to;
    if (!id || !from || !to || from.startsWith(':')) continue;
    if (!net.nodes.has(from)) net.addNode(from, 0, 0, 'entry');
    if (!net.nodes.has(to)) net.addNode(to, 0, 0, 'exit');

    const lanes = findAll(e, 'lane');
    const first = lanes[0];
    const speed = num(first?.attrs.speed, 13.9);
    let length = num(first?.attrs.length, NaN);
    if (!Number.isFinite(length) || length <= 0) {
      const shape = first ? findFirst(e, 'laneShape') : null;
      if (shape && shape.attrs.x1 !== undefined) {
        length = Math.max(1, Math.round(Math.hypot(
          num(shape.attrs.x2, 0) - num(shape.attrs.x1, 0),
          num(shape.attrs.y2, 0) - num(shape.attrs.y1, 0),
        )));
      } else {
        length = 100;
      }
    }

    try {
      net.addEdge({
        id,
        from,
        to,
        lanes: Math.max(1, lanes.length),
        speedLimit: speed,
        length,
        name: e.attrs.name ?? '',
      });
    } catch {
      /* skip duplicates/degenerate edges */
    }
  }

  return net;
}

// ---------------------------------------------------------------------------
// unified facade
// ---------------------------------------------------------------------------

/**
 * Serialize a network in one of the supported formats.
 * @param {Network|Object} networkOrJson
 * @param {'json'|'geojson'|'opendrive'|'sumo'} format
 * @returns {string} Serialized document (JSON string for json/geojson).
 */
export function exportNetwork(networkOrJson, format = 'json') {
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify(toPlain(networkOrJson), null, 2);
    case 'geojson':
      return JSON.stringify(exportGeoJSON(networkOrJson), null, 2);
    case 'opendrive':
    case 'xodr':
      return exportOpenDRIVE(networkOrJson);
    case 'sumo':
    case 'net.xml':
      return exportSUMO(networkOrJson);
    default:
      throw new Error(`exportNetwork: unknown format "${format}"`);
  }
}

/**
 * Parse a document into a Network, auto-detecting the format when not given.
 * @param {string} content File contents.
 * @param {'json'|'geojson'|'opendrive'|'sumo'} [format]
 * @returns {Network}
 */
export function importNetwork(content, format) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new TypeError('importNetwork: non-empty content string required');
  }
  const fmt = (format ?? sniffFormat(content)).toLowerCase();
  switch (fmt) {
    case 'json':
      return Network.fromJSON(JSON.parse(content));
    case 'geojson':
      return importGeoJSON(content);
    case 'opendrive':
    case 'xodr':
      return parseOpenDRIVE(content);
    case 'sumo':
    case 'net.xml':
      return parseSUMONetwork(content);
    case 'osm':
      return parseOSM(content);
    default:
      throw new Error(`importNetwork: unknown format "${format}"`);
  }
}

/** Guess the format of serialized content from its shape. */
export function sniffFormat(content) {
  const head = content.slice(0, 2048).trim();
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed?.type === 'FeatureCollection') return 'geojson';
      return 'json';
    } catch {
      /* fall through */
    }
  }
  if (/<OpenDRIVE/i.test(head)) return 'opendrive';
  if (/<net[\s>]/i.test(head)) return 'sumo';
  if (/<osm\b/i.test(head)) return 'osm';
  throw new Error('sniffFormat: unable to detect format');
}
