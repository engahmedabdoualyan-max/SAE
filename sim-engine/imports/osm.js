/**
 * @file OpenStreetMap (.osm XML) importer.
 *
 * Converts filtered vehicular ways (highway=*) into the engine's plain
 * network JSON { nodes[], edges[] } — the dialect consumed by the editor,
 * the cloud upload endpoint and netconvert via sumo_bridge.
 *
 * Two frontends feed one assembler:
 *   - Browser: DOMParser
 *   - Node/tests: dependency-free regex extraction
 */

import { haversineM } from '../network/graph.js';

/** Drivable highway classes with per-class defaults. */
const HIGHWAY_CLASSES = Object.freeze({
  motorway: { lanes: 3, speed: 33.3, oneway: true },
  motorway_link: { lanes: 1, speed: 20.8, oneway: true },
  trunk: { lanes: 2, speed: 25.0, oneway: false },
  trunk_link: { lanes: 1, speed: 18.0, oneway: true },
  primary: { lanes: 2, speed: 22.2, oneway: false },
  primary_link: { lanes: 1, speed: 16.7, oneway: true },
  secondary: { lanes: 1, speed: 19.4, oneway: false },
  tertiary: { lanes: 1, speed: 16.7, oneway: false },
  residential: { lanes: 1, speed: 11.1, oneway: false },
  unclassified: { lanes: 1, speed: 11.1, oneway: false },
  living_street: { lanes: 1, speed: 6.9, oneway: false }
});

function parseMaxSpeed(v) {
  if (!v) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(km\/h|kmh|kph)?$/i.exec(String(v).trim());
  return m ? parseFloat(m[1]) / 3.6 : null;
}

function parseLanes(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(6, n) : null;
}

/** Public entry: auto-selects the available parser frontend. */
export function parseOSM(xmlText, opts = {}) {
  if (typeof DOMParser !== 'undefined') return parseViaDOM(xmlText, opts);
  return parseViaRegex(xmlText, opts);
}

/* ----------------------------- browser ----------------------------- */

function parseViaDOM(xmlText, opts) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('parseOSM: invalid XML');

  const nodes = [...doc.getElementsByTagName('node')].map(el => ({
    id: String(el.getAttribute('id')),
    lat: parseFloat(el.getAttribute('lat')),
    lng: parseFloat(el.getAttribute('lon')),
  }));
  const ways = [...doc.getElementsByTagName('way')].map(el => ({
    refs: [...el.getElementsByTagName('nd')].map(nd => String(nd.getAttribute('ref'))),
    tags: Object.fromEntries(
      [...el.getElementsByTagName('tag')]
        .map(t => [t.getAttribute('k'), t.getAttribute('v')])
        .filter(([k]) => !!k)
    ),
  }));
  return assemble(nodes, ways, opts);
}

/* ------------------------------ node ------------------------------- */

const RE_NODE = /<node\b[^>]*?id="([^"]+)"[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?\/?>/g;
const RE_WAY = /<way\b[\s\S]*?<\/way>/g;
const RE_ND = /<nd\s+ref="([^"]+)"/g;
const RE_TAG = /<tag\s+k="([^"]+)"\s+v="([^"]*)"\s*\/>/g;

function parseViaRegex(xmlText, opts) {
  const nodes = [];
  let m;
  const reN = new RegExp(RE_NODE.source, 'g');
  while ((m = reN.exec(xmlText))) {
    nodes.push({ id: m[1], lat: parseFloat(m[2]), lng: parseFloat(m[3]) });
  }

  const ways = [];
  const reW = new RegExp(RE_WAY.source, 'g');
  while ((m = reW.exec(xmlText))) {
    const body = m[0];
    const refs = [];
    const reNd = new RegExp(RE_ND.source, 'g');
    let nd;
    while ((nd = reNd.exec(body))) refs.push(nd[1]);
    const tags = {};
    const reTg = new RegExp(RE_TAG.source, 'g');
    let tg;
    while ((tg = reTg.exec(body))) tags[tg[1]] = tg[2];
    ways.push({ refs, tags });
  }
  return assemble(nodes, ways, opts);
}

/* ---------------------------- assembler ---------------------------- */

/**
 * @param {{id:string,lat:number,lng:number}[]} rawNodes
 * @param {{refs:string[],tags:Object<string,string>}[]} rawWays
 */
export function assemble(rawNodes, rawWays, opts = {}) {
  const maxNodes = opts.maxNodes || 4000;
  const maxWays = opts.maxWays || 8000;

  const positions = new Map();
  for (const n of rawNodes) {
    if (positions.size >= maxNodes) break;
    if (!n.id || !Number.isFinite(n.lat) || !Number.isFinite(n.lng)) continue;
    positions.set(String(n.id), n);
  }
  if (positions.size === 0) throw new Error('parseOSM: no usable <node> elements');

  const nodes = [];
  const nodeIndex = new Map(); /* osmId -> engine id */
  const ensureEngineNode = (osmId) => {
    let eid = nodeIndex.get(osmId);
    if (eid !== undefined) return eid;
    const pos = positions.get(osmId);
    if (!pos) return null;
    eid = 'n' + nodeIndex.size + '_' + osmId;
    nodeIndex.set(osmId, eid);
    nodes.push({ id: eid, lat: pos.lat, lng: pos.lng, type: 'intersection' });
    return eid;
  };

  const edges = [];
  let accepted = 0, skipped = 0;

  for (const way of rawWays) {
    if (accepted >= maxWays) break;
    const cls = HIGHWAY_CLASSES[way.tags.highway];
    if (!cls || way.refs.length < 2) { skipped++; continue; }

    const oneway = way.tags.oneway === 'yes' || way.tags.oneway === '1' || cls.oneway;
    const name = way.tags.name || way.tags.highway;
    const lanesBase = parseLanes(way.tags.lanes) || cls.lanes;
    const speed = parseMaxSpeed(way.tags.maxspeed) || cls.speed;

    for (let i = 0; i < way.refs.length - 1; i++) {
      const aPos = positions.get(way.refs[i]);
      const bPos = positions.get(way.refs[i + 1]);
      if (!aPos || !bPos) continue;
      const from = ensureEngineNode(String(way.refs[i]));
      const to = ensureEngineNode(String(way.refs[i + 1]));
      if (from == null || to == null || from === to) continue;

      const length = Math.max(5, Math.round(haversineM(aPos.lat, aPos.lng, bPos.lat, bPos.lng) * 10) / 10);
      const shared = { to: undefined, length, speedLimit: speed, name, highwayClass: way.tags.highway };
      if (oneway) {
        edges.push(Object.assign(shared, {
          id: `w${accepted}_${i}`, from, to,
          lanes: Math.max(1, lanesBase),
        }));
      } else {
        const perDir = Math.max(1, Math.round(lanesBase / 2));
        edges.push(Object.assign({}, shared, {
          id: `w${accepted}_${i}_f`, from, to, lanes: perDir,
        }));
        edges.push({
          id: `w${accepted}_${i}_r`, from: to, to: from,
          lanes: perDir, length, speedLimit: speed,
          name, highwayClass: way.tags.highway,
        });
      }
    }
    accepted++;
  }

  /* drop isolated nodes */
  const connected = new Set();
  edges.forEach(e => { connected.add(e.from); connected.add(e.to); });
  const tightNodes = nodes.filter(n => connected.has(n.id));

  let bounds = null;
  if (tightNodes.length) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    tightNodes.forEach(n => {
      if (n.lat < minLat) minLat = n.lat; if (n.lat > maxLat) maxLat = n.lat;
      if (n.lng < minLng) minLng = n.lng; if (n.lng > maxLng) maxLng = n.lng;
    });
    bounds = [minLng, minLat, maxLng, maxLat];
  }

  return {
    nodes: tightNodes,
    edges,
    meta: {
      source: 'osm',
      bounds,
      waysAccepted: accepted,
      waysSkipped: skipped,
      isolatedDropped: nodes.length - tightNodes.length,
    },
  };
}
