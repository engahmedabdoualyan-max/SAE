/**
 * @file Traffic-noise model — simplified FHWA Traffic Noise Model (TNM).
 *
 * Each vehicle is an incoherent point source with sound power level
 *
 *     Lw = Lw0 + C_speed + C_accel            [dB(A)]
 *     C_speed = K_speed · log10(v / v_ref)
 *
 * The equivalent level at a receiver sums source energies over spherical
 * spreading (1/r²):
 *
 *     L_eq = 10·log10( Σ 10^(Lw_i/10) / (2·π·r_i²) )   [dB(A)]
 *
 * Optional features: ground absorption factor per receiver, simple barrier
 * insertion loss for sources screened by a segment, and a minimum-distance
 * clamp that stands in for near-field source extent.
 */

/** Reference sound-power levels Lw0 [dB(A)] at the reference speed. */
export const NOISE_LW0 = Object.freeze({
  'passenger car': 67,
  car: 67,
  sedan: 67,
  av: 67,
  truck: 78,
  bus: 79,
  motorcycle: 72,
});

/** Model constants. */
export const NOISE_CONSTANTS = Object.freeze({
  /** Speed correction coefficient [dB per decade of speed]. */
  kSpeed: 30,
  /** Reference speed [m/s] (≈ 50 km/h). */
  vRefMps: 50 / 3.6,
  /** Minimum source–receiver distance clamp [m] (near-field guard). */
  minDistanceM: 1,
});

const TYPE_ALIASES = {
  'passenger car': 'car',
  motorbike: 'motorcycle',
};

/**
 * Map a vehicle type label onto a noise class key.
 * @param {string} type @returns {'car'|'truck'|'bus'|'motorcycle'}
 */
export function normalizeNoiseType(type) {
  const t = String(type ?? '').toLowerCase();
  return NOISE_LW0[TYPE_ALIASES[t] ?? t] != null ? (TYPE_ALIASES[t] ?? t) : 'car';
}

/**
 * Source power level of one vehicle [dB(A)].
 *
 * @param {string} vehicleType Vehicle class (car/bus/truck/motorcycle/…).
 * @param {number} speed Speed [m/s] (SI) or km/h when `opts.speedKmh`.
 * @param {{speedKmh?:boolean}} [opts]
 * @returns {number} Lw in dB(A).
 *
 * @example
 * getNoiseLevel('car', 50 / 3.6); // ≈ 67 dB(A) at the reference speed
 */
export function getNoiseLevel(vehicleType, speed, opts = {}) {
  if (!Number.isFinite(speed) || speed <= 0) throw new TypeError(`getNoiseLevel: speed must be > 0`);
  const lw0 = NOISE_LW0[normalizeNoiseType(vehicleType)];
  const v = opts.speedKmh ? speed / 3.6 : speed;
  return lw0 + NOISE_CONSTANTS.kSpeed * Math.log10(Math.max(v, 0.5) / NOISE_CONSTANTS.vRefMps);
}

/**
 * Point-to-point distance helper.
 * @private
 */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Segment intersection test (for barrier screening).
 * @private
 * @returns {boolean}
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Normalize a vehicle into a noise source `{x, y, level}`.
 * Accepts `position`/`x,y` world coordinates; vehicles on edges without
 * coordinates are skipped by the caller.
 * @private
 */
function toSource(veh) {
  const p = veh.position ?? (Number.isFinite(veh.x) ? { x: veh.x, y: veh.y } : null);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  let level;
  if (Number.isFinite(veh.noiseLevel)) {
    level = veh.noiseLevel; // precomputed override
  } else {
    const rawSpeed = Number.isFinite(veh.speedKmh) ? veh.speedKmh : (veh.speed ?? 0);
    level = getNoiseLevel(veh.type ?? veh.vehicleType ?? 'car', rawSpeed, { speedKmh: Number.isFinite(veh.speedKmh) });
  }
  return { id: veh.id ?? null, x: p.x, y: p.y, level };
}

/**
 * Equivalent continuous level at ONE receiver from a list of point sources.
 *
 *     L_eq = 10·log10( Σ 10^(Lw_i − Δbarrier_i)/10 / (2π r_i²) )
 *
 * @param {Array<{x:number,y:number,level:number}>|Array<Object>} sources
 *   Noise sources (`level` in dB(A)) or raw vehicles with positions.
 * @param {{x:number,y:number,id?:string,groundFactor?:number}} receiver
 * @param {{barriers?:Array<{x1:number,y1:number,x2:number,y2:number,lossDb:number}>,
 *          calibrationDb?:number}} [opts]
 * @returns {number} Level at the receiver in dB(A).
 */
export function noiseAtReceiver(sources, receiver, opts = {}) {
  if (!receiver || !Number.isFinite(receiver.x) || !Number.isFinite(receiver.y)) {
    throw new TypeError('noiseAtReceiver: receiver {x,y} required');
  }
  const groundFactor = Number.isFinite(receiver.groundFactor) ? receiver.groundFactor : 1;
  const barriers = Array.isArray(opts.barriers) ? opts.barriers : [];
  const cal = Number.isFinite(opts.calibrationDb) ? opts.calibrationDb : 0;

  let energy = 0;
  for (const s of sources ?? []) {
    const src = s.level != null ? s : toSource(s);
    if (!src || !Number.isFinite(src.level)) continue;
    const r = Math.max(dist(src, receiver), NOISE_CONSTANTS.minDistanceM);

    // Barrier insertion loss applies when the barrier screens the path.
    let loss = 0;
    for (const b of barriers) {
      if (segmentsIntersect(src, receiver, { x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 })) {
        loss += Number.isFinite(b.lossDb) ? b.lossDb : 10;
      }
    }

    energy += Math.pow(10, (src.level - loss) / 10) / (2 * Math.PI * r * r);
  }

  if (energy <= 0) return -Infinity;
  return 10 * Math.log10(energy * groundFactor) + cal;
}

/**
 * Normalize an edges container into a Map keyed by edge id.
 * @private
 */
function normalizeEdges(edges) {
  if (!edges) return new Map();
  if (edges instanceof Map) return edges;
  if (Array.isArray(edges)) return new Map(edges.filter((e) => e?.id).map((e) => [e.id, e]));
  if (typeof edges === 'object') return new Map(Object.entries(edges));
  return new Map();
}

/**
 * Interpolate a vehicle position along its edge polyline (or straight line
 * between node anchors `{from:{x,y}, to:{x,y}}`).
 * @private
 */
function vehicleXY(veh, edgeMap) {
  const direct = veh.position ?? (Number.isFinite(veh.x) ? { x: veh.x, y: veh.y } : null);
  if (direct) return direct;
  const edge = edgeMap.get(veh.edgeId);
  if (!edge) return null;
  const pts = Array.isArray(edge.points) && edge.points.length >= 2 ? edge.points : null;
  if (!pts && !(edge.from && edge.to)) return null;
  const line = pts ?? [
    { x: edge.from.x, y: edge.from.y },
    { x: edge.to.x, y: edge.to.y },
  ];
  let total = 0;
  const segLens = [];
  for (let i = 0; i < line.length - 1; i++) {
    const l = dist(line[i], line[i + 1]);
    segLens.push(l);
    total += l;
  }
  let target = Math.max(0, Math.min(veh.offset ?? 0, total));
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] > 1e-9 ? target / segLens[i] : 0;
      return {
        x: line[i].x + (line[i + 1].x - line[i].x) * t,
        y: line[i].y + (line[i + 1].y - line[i].y) * t,
      };
    }
    target -= segLens[i];
  }
  return null;
}

/**
 * Compute noise levels at every receiver from the vehicle fleet.
 *
 * Vehicles provide either world coordinates or `(edgeId, offset)` resolved
 * against `edges`. Receivers are `{id?, x, y}` points.
 *
 * @param {Array<Object>} vehicles Vehicle list.
 * @param {Map<string,Object>|Object|Array|null} [edges=null] Edge geometry lookup.
 * @param {Array<{id?:string,x:number,y:number,groundFactor?:number}>} receivers Receiver points.
 * @param {Object} [opts] Forwarded to {@link noiseAtReceiver}.
 * @returns {Array<{id:string, x:number, y:number, level:number|null}>}
 *   One row per receiver, ordered as given; `null` level = no audible source.
 */
export function calculateNoise(vehicles, edges, receivers, opts = {}) {
  if (!Array.isArray(receivers)) throw new TypeError('calculateNoise: receivers array required');
  if (!Array.isArray(vehicles)) throw new TypeError('calculateNoise: vehicles array required');
  const edgeMap = normalizeEdges(edges);

  const sources = [];
  for (const v of vehicles) {
    const p = vehicleXY(v, edgeMap);
    if (!p) continue;
    const src = toSource({ ...v, position: p });
    if (src) sources.push(src);
  }

  return receivers.map((r, i) => ({
    id: r.id ?? `R${i + 1}`,
    x: r.x,
    y: r.y,
    level: sources.length > 0 ? +noiseAtReceiver(sources, r, opts).toFixed(2) : null,
  }));
}

/**
 * Raster noise map over an axis-aligned grid.
 *
 * @param {Array<Object>} vehicles Vehicle list.
 * @param {Map<string,Object>|Object|Array|null} edges Edge geometry lookup.
 * @param {Object} grid Grid definition:
 *   `{xmin, xmax, ymin, ymax, nx, ny}` (cell centers sampled).
 * @param {Object} [opts] Forwarded to {@link noiseAtReceiver}.
 * @returns {{nx:number, ny:number, xmin:number, ymin:number,
 *            cellW:number, cellH:number, values:number[][]}}
 *   `values[x][y]` holds dB(A) (−Infinity when no sources contribute).
 */
export function noiseMap(vehicles, edges, grid, opts = {}) {
  const nx = Math.floor(grid.nx);
  const ny = Math.floor(grid.ny);
  if (!(nx > 0) || !(ny > 0)) throw new TypeError('noiseMap: grid needs positive nx/ny');
  const { xmin, xmax, ymin, ymax } = grid;
  if (![xmin, xmax, ymin, ymax].every(Number.isFinite)) throw new TypeError('noiseMap: grid bounds must be finite');

  const edgeMap = normalizeEdges(edges);
  const sources = [];
  for (const v of vehicles) {
    const p = vehicleXY(v, edgeMap);
    if (!p) continue;
    const src = toSource({ ...v, position: p });
    if (src) sources.push(src);
  }

  const cellW = (xmax - xmin) / nx;
  const cellH = (ymax - ymin) / ny;
  const values = [];
  for (let ix = 0; ix < nx; ix++) {
    const col = [];
    const cx = xmin + (ix + 0.5) * cellW;
    for (let iy = 0; iy < ny; iy++) {
      const cy = ymin + (iy + 0.5) * cellH;
      col.push(sources.length > 0 ? +noiseAtReceiver(sources, { x: cx, y: cy }, opts).toFixed(2) : -Infinity);
    }
    values.push(col);
  }
  return { nx, ny, xmin, ymin, cellW: +cellW.toFixed(4), cellH: +cellH.toFixed(4), values };
}
