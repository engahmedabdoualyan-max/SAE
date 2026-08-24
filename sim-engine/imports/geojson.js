/**
 * @file GeoJSON import/export for road networks (RFC 7946, WGS84).
 *
 * Import mapping:
 *  - `Point` features → {@link Node}s (`properties.id`, `properties.type`)
 *  - `LineString` / `MultiLineString` features → directed {@link Edge}s with
 *    auto-created endpoint nodes when `properties.from/to` are absent.
 *  - `Polygon`s and other geometry types are ignored (recorded as warnings).
 *
 * Recognised feature properties:
 *  | property                       | meaning                              |
 *  |--------------------------------|--------------------------------------|
 *  | `id` / `name`                  | node or edge identifier              |
 *  | `from`, `to`                   | edge endpoint node ids               |
 *  | `lanes`                        | lane count or array of `{type}`      |
 *  | `speedLimit`                   | speed limit in **m/s** (engine unit) |
 *  | `speedKmh` / `maxspeed`        | speed limit in km/h (converted)      |
 *  | `oneway`                       | `true` suppresses the reverse edge   |
 *  | `type` (nodes only)            | `intersection` | `entry` | `exit`    |
 *
 * Export produces a `FeatureCollection`: one `Point` per positioned node, one
 * `LineString` per edge (reverse edges included; both endpoint nodes must have
 * coordinates). Edge properties round-trip through `edge.toJSON()`.
 *
 * @example
 * import { importGeoJSON, exportGeoJSON } from './sim-engine/imports/geojson.js';
 * const net = importGeoJSON(roadGeoJson);
 * const fc = exportGeoJSON(net);
 */

import { Network, haversineM } from '../network/graph.js';

/** Speeds above this value in a `speedKmh`-style property are implausible [km/h]. */
const MAX_PLAUSIBLE_KMH = 200;

const NODE_TYPES = new Set(['intersection', 'entry', 'exit']);

/**
 * Import a GeoJSON object into a {@link Network}.
 *
 * Accepts a `FeatureCollection`, a single `Feature` or a bare geometry object.
 * Edge lengths are computed by summing great-circle segments of the coordinate
 * polyline (more accurate than end-to-end haversine).
 *
 * @param {Object} geojson Any RFC 7946 structure containing Point/LineString features.
 * @param {string} [networkName] Overrides the network name.
 * @returns {Network} Populated network; warnings on `net.metadata.warnings`.
 * @throws {TypeError} When `geojson` is missing/malformed.
 */
export function importGeoJSON(geojson, networkName) {
  if (!geojson || typeof geojson !== 'object') {
    throw new TypeError('importGeoJSON: geojson object required');
  }

  /** @type {Array<{feature:Object, geometry:Object}>} */
  const items = [];
  collectGeometries(geojson, items);

  if (items.length === 0) {
    throw new TypeError('importGeoJSON: no Point/LineString/MultiLineString geometries found');
  }

  const net = new Network(networkName || geojson.name || 'geojson-network');
  /** @type {string[]} */ const warnings = [];
  let autoNodeSeq = 0;
  let autoEdgeSeq = 0;

  for (const { feature, geometry } of items) {
    const props = (feature && typeof feature.properties === 'object' ? feature.properties : {}) ?? {};

    if (geometry.type === 'Point') {
      const [lng, lat] = geometry.coordinates;
      const id = String(props.id ?? props.name ?? `node-${autoNodeSeq++}`);
      try {
        net.addNode(id, lat, lng, NODE_TYPES.has(props.type) ? props.type : 'intersection');
      } catch {
        warnings.push(`duplicate/invalid node "${id}" skipped`);
      }
      continue;
    }

    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
      const parts = geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.coordinates;
      const baseId = String(props.id ?? props.name ?? `edge-${autoEdgeSeq++}`);

      parts.forEach((coords, partIdx) => {
        if (!Array.isArray(coords) || coords.length < 2) {
          warnings.push(`"${baseId}" part ${partIdx} has fewer than 2 positions — skipped`);
          return;
        }
        const edgeId = parts.length > 1 ? `${baseId}-${partIdx}` : baseId;
        importLine(net, edgeId, coords, props, warnings, () => `nd-${edgeId}-auto-${autoNodeSeq++}`);
      });
      continue;
    }

    warnings.push(`geometry type "${geometry?.type}" is not supported — ignored`);
  }

  net.metadata = { source: 'geojson', warnings };
  return net;
}

/**
 * Recursively gather point/line geometries from any GeoJSON structure.
 * @param {Object} node Current node (collection, feature or geometry).
 * @param {Array<{feature:Object, geometry:Object}>} out Accumulator.
 */
function collectGeometries(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FeatureCollection' && Array.isArray(node.features)) {
    for (const f of node.features) collectGeometries(f, out);
    return;
  }
  if (node.type === 'Feature') {
    if (node.geometry && typeof node.geometry === 'object') {
      out.push({ feature: node, geometry: node.geometry });
    }
    return;
  }
  // Bare geometry object.
  if (typeof node.type === 'string' && Array.isArray(node.coordinates)) {
    out.push({ feature: { properties: {} }, geometry: node });
  }
}

/**
 * Turn one coordinate polyline into an edge (+ reverse when not one-way).
 * @param {Network} net @param {string} edgeId @param {Array<number[]>} coords
 * @param {Object} props Feature properties. @param {string[]} warnings
 * @param {()=>string} autoNodeId Generator for synthetic endpoint ids.
 */
function importLine(net, edgeId, coords, props, warnings, autoNodeId) {
  const first = coords[0];
  const last = coords[coords.length - 1];

  const resolveNode = (ref, coord) => {
    const id = ref != null ? String(ref) : autoNodeId();
    if (!net.nodes.has(id)) {
      const [lng, lat] = coord;
      net.addNode(id, lat, lng, 'intersection');
    }
    return id;
  };

  const fromId = resolveNode(props.from, first);
  const toId = resolveNode(props.to, last);

  // Polyline length via haversine segments [m].
  let length = 0;
  for (let i = 1; i < coords.length; i++) {
    length += haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }

  const lanes = normaliseLanes(props.lanes);
  const speedLimit = normaliseSpeed(props, warnings, edgeId);
  const name = props.name ?? props.highway ?? '';
  const oneway = props.oneway === true;

  try {
    const cfg = {
      id: edgeId,
      from: fromId,
      to: toId,
      lanes,
      speedLimit,
      length: Math.max(length, 1),
      name,
      bidirectional: !oneway && props.from == null && props.to == null,
    };
    const edge = net.addEdge(cfg);
    attachShape(edge, coords);
  } catch (err) {
    warnings.push(`edge "${edgeId}" rejected: ${err.message}`);
  }
}

/**
 * Lane count / config normalisation: numbers pass through, arrays map to our
 * per-lane `{type}` shape, anything else defaults to 1.
 */
function normaliseLanes(raw) {
  if (Number.isInteger(raw) && raw >= 1) return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((l) => ({ type: l && typeof l === 'object' ? (l.type ?? 'through') : 'through' }));
  }
  return 1;
}

/**
 * Speed limit resolution precedence: `speedLimit` (m/s) > `speedKmh` >
 * `maxspeed` (km/h). Implausible km/h values (>200) are ignored with warning.
 */
function normaliseSpeed(props, warnings, edgeId) {
  if (Number.isFinite(props.speedLimit) && props.speedLimit > 0) return props.speedLimit;

  const kmhRaw = Number.isFinite(props.speedKmh) ? props.speedKmh : Number(props.maxspeed);
  if (Number.isFinite(kmhRaw) && kmhRaw > 0) {
    if (kmhRaw > MAX_PLAUSIBLE_KMH) {
      warnings.push(`edge "${edgeId}": implausible speed ${kmhRaw} km/h ignored`);
      return undefined;
    }
    return kmhRaw / 3.6;
  }
  return undefined; // Edge constructor default (13.9 m/s)
}

/** Store the source polyline on the edge as [[lat, lng], …] for map rendering. */
function attachShape(edge, coords) {
  edge.shape = coords.map(([lng, lat]) => [lat, lng]);
}

// ------------------------------------------------------------------ export --

/**
 * Export a {@link Network} as a GeoJSON `FeatureCollection`.
 *
 * - Nodes with coordinates become `Point` features.
 * - Edges whose endpoints both have coordinates become `LineString` features
 *   using each edge's stored `shape` polyline when present, else straight
 *   lines between endpoint nodes.
 * - Unpositioned nodes/edges are skipped (counted in `warnings`).
 *
 * @param {Network|{nodes:Object[],edges:Object[]}} network Network instance or JSON.
 * @param {Object} [opts]
 * @param {boolean} [opts.includeAllNodes=false] Also export placeholder nodes at (0,0).
 * @returns {Object} GeoJSON FeatureCollection (a `warnings` member lists skips).
 * @throws {TypeError} On invalid input.
 */
export function exportGeoJSON(network, opts = {}) {
  if (!network || typeof network !== 'object') {
    throw new TypeError('exportGeoJSON: network instance or JSON required');
  }

  let nodes = [];
  let edges = [];
  let name = 'network';
  if (typeof network.toJSON === 'function') {
    const json = network.toJSON();
    nodes = json.nodes ?? [];
    edges = json.edges ?? [];
    name = json.name ?? name;
    // Recover per-edge shapes lost in toJSON by reading live instances.
    edges = edges.map((e) => {
      const live = network.getEdge?.(e.id);
      return live?.shape ? { ...e, shape: live.shape } : e;
    });
  } else {
    nodes = network.nodes ?? [];
    edges = network.edges ?? [];
    name = network.name ?? name;
  }

  const warnings = [];
  const features = [];

  for (const n of nodes) {
    const hasCoords =
      Number.isFinite(n.lat) && Number.isFinite(n.lng) &&
      (n.lat !== 0 || n.lng !== 0 || opts.includeAllNodes);
    if (!hasCoords) { warnings.push(`node "${n.id}" has no coordinates — skipped`); continue; }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: { id: n.id, type: n.type ?? 'intersection' },
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const e of edges) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    const usable = (n) =>
      n && Number.isFinite(n.lat) && Number.isFinite(n.lng) && (n.lat !== 0 || n.lng !== 0);
    if (!usable(from) || !usable(to)) {
      warnings.push(`edge "${e.id}" has unpositioned endpoints — skipped`);
      continue;
    }
    const line = Array.isArray(e.shape) && e.shape.length >= 2
      ? e.shape.map(([lat, lng]) => [lng, lat])
      : [[from.lng, from.lat], [to.lng, to.lat]];

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: {
        id: e.id,
        from: e.from,
        to: e.to,
        name: e.name ?? '',
        lanes: e.lanes ?? e.laneCount ?? 1,
        laneTypes: e.laneTypes ?? undefined,
        speedLimit: e.speedLimit,
        length: e.length,
        capacityPerLane: e.capacityPerLane,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name,
    features,
    warnings,
  };
}
