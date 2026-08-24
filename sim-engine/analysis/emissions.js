/**
 * @file Emissions calculator — simplified COPERT-style emission model.
 *
 * CO₂ follows a speed polynomial per vehicle class:
 *
 *     CO2 [g/km] = a·v² + b·v + c + d/v          (v in km/h)
 *
 * Regulated pollutants scale with fuel consumption and a speed correction:
 *
 *     NOx = e · f(v) · fuel(v)      PM  = g · h(v) · fuel(v)
 *     CO  = i · j(v) · fuel(v)      HC  = k · m(v) · fuel(v)
 *
 * where fuel(v) [L/km] is its own quadratic and f/h/j/m are congestion
 * corrections that inflate factors at low urban speeds:
 *
 *     corr(v) = 1 + β · (v_ref / max(v, v_min) − 1)
 *
 * All `calculate*` inputs use SI speed (m/s) to match simulation state;
 * reference-speed helpers use km/h as in COPERT tables.
 */

/** Reference speed for tabulated factors [km/h]. */
export const REFERENCE_SPEED_KMH = 50;

/** Floor applied before the 1/v term (models cold-start/idle excess). */
const V_MIN_KMH = 5;

/**
 * CO₂ polynomial coefficients per vehicle class: a·v² + b·v + c + d/v.
 * @type {Readonly<Record<string,{a:number,b:number,c:number,d:number}>>}
 */
export const COPERT_CO2_COEFFS = Object.freeze({
  'passenger car': Object.freeze({ a: 0.0030, b: -0.250, c: 180, d: 500 }),
  bus: Object.freeze({ a: 0.0200, b: -1.000, c: 1100, d: 3000 }),
  truck: Object.freeze({ a: 0.0150, b: -0.800, c: 850, d: 2500 }),
  motorcycle: Object.freeze({ a: 0.0020, b: -0.150, c: 95, d: 250 }),
});

/**
 * Fuel-consumption quadratics f2·v² + f1·v + f0 [L/km] with idle floor,
 * plus base pollutant rates [g/L fuel] and low-speed correction exponents β.
 */
export const COPERT_FUEL_POLLUTANTS = Object.freeze({
  'passenger car': Object.freeze({ f0: 0.100, f1: -0.0024, f2: 0.00002, NOx: 8.0, PM: 0.010, CO: 15.0, HC: 1.5 }),
  bus: Object.freeze({ f0: 0.450, f1: -0.0090, f2: 0.00008, NOx: 28.0, PM: 1.20, CO: 9.0, HC: 3.0 }),
  truck: Object.freeze({ f0: 0.380, f1: -0.0075, f2: 0.00007, NOx: 25.0, PM: 1.00, CO: 8.0, HC: 2.5 }),
  motorcycle: Object.freeze({ f0: 0.045, f1: -0.0009, f2: 0.00001, NOx: 3.0, PM: 0.030, CO: 30.0, HC: 8.0 }),
});

/**
 * Low-speed congestion correction coefficients β per pollutant
 * (higher β → factor inflates more at crawl speeds).
 */
export const SPEED_CORRECTIONS = Object.freeze({
  NOx: 0.60,
  PM: 0.80,
  CO: 1.20,
  HC: 1.00,
});

/** Aliases from simulation vehicle types to COPERT classes. */
const TYPE_ALIASES = Object.freeze({
  'passenger car': 'passenger car',
  car: 'passenger car',
  sedan: 'passenger car',
  av: 'passenger car',
  bus: 'bus',
  truck: 'truck',
  motorcycle: 'motorcycle',
  motorbike: 'motorcycle',
});

const FUEL_IDLE_FLOOR_L_PER_KM = 0.03;

/**
 * Map an arbitrary vehicle type label onto a COPERT class.
 * @param {string} type Vehicle type (simulation key or COPERT name).
 * @returns {'passenger car'|'bus'|'truck'|'motorcycle'}
 */
export function normalizeVehicleType(type) {
  return TYPE_ALIASES[String(type ?? '').toLowerCase()] ?? 'passenger car';
}

/** Clamp helper. */
const clampV = (vKmh) => Math.min(160, Math.max(V_MIN_KMH, vKmh));

/**
 * Speed-dependent fuel consumption [L/km].
 * @param {string} vehicleType @param {number} vKmh Speed [km/h].
 * @returns {number}
 */
export function fuelConsumption(vehicleType, vKmh) {
  const p = COPERT_FUEL_POLLUTANTS[normalizeVehicleType(vehicleType)];
  const v = clampV(vKmh);
  return Math.max(FUEL_IDLE_FLOOR_L_PER_KM, p.f0 + p.f1 * v + p.f2 * v * v);
}

/** Generic congestion correction factor (dimensionless, ≥ 1 below v_ref). */
function congestionCorrection(vKmh, beta) {
  const v = clampV(vKmh);
  return 1 + beta * (REFERENCE_SPEED_KMH / Math.max(v, 1e-6) - 1);
}

/**
 * CO₂ emission factor at a given speed [g/km].
 * @param {string} vehicleType @param {number} vKmh Speed [km/h].
 */
export function co2Factor(vehicleType, vKmh) {
  const c = COPERT_CO2_COEFFS[normalizeVehicleType(vehicleType)];
  const v = clampV(vKmh);
  return Math.max(0, c.a * v * v + c.b * v + c.c + c.d / v);
}

/**
 * Pollutant emission factor at a given speed [g/km] (fuel × correction model).
 * @param {'NOx'|'PM'|'CO'|'HC'} pollutant @param {string} vehicleType @param {number} vKmh
 */
export function pollutantFactor(pollutant, vehicleType, vKmh) {
  const cls = normalizeVehicleType(vehicleType);
  const p = COPERT_FUEL_POLLUTANTS[cls];
  const beta = SPEED_CORRECTIONS[pollutant];
  return p[pollutant] * congestionCorrection(vKmh, beta) * fuelConsumption(cls, vKmh);
}

/**
 * Tabulated emission factors at the reference speed.
 *
 * @param {string} vehicleType One of: passenger car / car / sedan, bus,
 *   truck, motorcycle.
 * @param {number} [speedKmh=50] Evaluation speed.
 * @returns {{CO2:number, NOx:number, PM:number, CO:number, HC:number}} g/km.
 *
 * @example
 * getEmissionFactors('passenger car'); // ≈ { CO2:185, NOx:… } g/km @ 50 km/h
 */
export function getEmissionFactors(vehicleType, speedKmh = REFERENCE_SPEED_KMH) {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) throw new TypeError(`getEmissionFactors: speedKmh must be > 0`);
  return {
    CO2: +co2Factor(vehicleType, speedKmh).toFixed(4),
    NOx: +pollutantFactor('NOx', vehicleType, speedKmh).toFixed(6),
    PM: +pollutantFactor('PM', vehicleType, speedKmh).toFixed(6),
    CO: +pollutantFactor('CO', vehicleType, speedKmh).toFixed(6),
    HC: +pollutantFactor('HC', vehicleType, speedKmh).toFixed(6),
  };
}

/* -------------------------------------------------------------- aggregation -- */

/**
 * Extract `(type, speedKmh, distanceM)` from either a simulation Vehicle or a
 * plain descriptor.
 * @private
 */
function vehTriple(v, edges, opts) {
  const type = v.type ?? v.vehicleType ?? 'car';
  let speedKmh;
  if (Number.isFinite(v.speedKmh)) speedKmh = v.speedKmh;
  else if (Number.isFinite(v.speed)) speedKmh = v.speed * 3.6; // SI m/s input
  else {
    const edge = edges.get?.(v.edgeId) ?? (edges instanceof Map ? null : edges?.[v.edgeId]) ?? null;
    const limit = Number.isFinite(edge?.speedLimit) ? edge.speedLimit : opts.defaultSpeedMps;
    speedKmh = limit * 3.6;
  }
  const distanceM = Number.isFinite(v.distanceM)
    ? v.distanceM
    : Number.isFinite(v.distanceTraveled)
      ? v.distanceTraveled
      : Number.isFinite(v.stats?.distance)
        ? v.stats.distance
        : 0;
  return { cls: normalizeVehicleType(type), speedKmh, distanceM };
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
 * Compute fleet emissions over the reported distances.
 *
 * Accepts simulation `Vehicle` instances (SI speed in m/s, `stats.distance`)
 * or plain descriptors `{type, speed|speedKmh, distanceM}`.
 *
 * @param {Array<Object>} vehicles Vehicle list.
 * @param {Map<string,Object>|Object|Array|null} [edges=null] Edge lookup used
 *   when a vehicle carries no speed of its own.
 * @param {Object} [opts]
 * @param {number} [opts.defaultSpeedMps=13.9] Fallback speed [m/s].
 * @returns {{
 *   totals:{CO2:number,NOx:number,PM:number,CO:number,HC:number,fuelLiters:number},
 *   byVehicleType:Object, byVehicle:Array<Object>,
 *   totalDistanceM:number, avgSpeedKmh:number
 * }}
 */
export function calculateEmissions(vehicles, edges = null, opts = {}) {
  if (!Array.isArray(vehicles)) throw new TypeError('calculateEmissions: vehicles array required');
  const edgeMap = normalizeEdges(edges);
  const defaultSpeedMps = Number.isFinite(opts.defaultSpeedMps) ? opts.defaultSpeedMps : 13.9;

  /** @type {Record<string,number>} */ const totals = { CO2: 0, NOx: 0, PM: 0, CO: 0, HC: 0, fuelLiters: 0 };
  const byVehicleType = {};
  const byVehicle = [];
  let totalDistanceM = 0;
  let weightedSpeed = 0;

  for (let i = 0; i < vehicles.length; i++) {
    const { cls, speedKmh, distanceM } = vehTriple(vehicles[i], edgeMap, { defaultSpeedMps });
    const km = distanceM / 1000;
    const grams = {
      CO2: co2Factor(cls, speedKmh) * km,
      NOx: pollutantFactor('NOx', cls, speedKmh) * km,
      PM: pollutantFactor('PM', cls, speedKmh) * km,
      CO: pollutantFactor('CO', cls, speedKmh) * km,
      HC: pollutantFactor('HC', cls, speedKmh) * km,
    };
    const liters = fuelConsumption(cls, speedKmh) * km;

    totals.CO2 += grams.CO2;
    totals.NOx += grams.NOx;
    totals.PM += grams.PM;
    totals.CO += grams.CO;
    totals.HC += grams.HC;
    totals.fuelLiters += liters;
    totalDistanceM += distanceM;
    weightedSpeed += speedKmh * distanceM;

    byVehicleType[cls] ??= { CO2: 0, NOx: 0, PM: 0, CO: 0, HC: 0, fuelLiters: 0, distanceM: 0, count: 0 };
    for (const pol of ['CO2', 'NOx', 'PM', 'CO', 'HC']) byVehicleType[cls][pol] += grams[pol];
    byVehicleType[cls].fuelLiters += liters;
    byVehicleType[cls].distanceM += distanceM;
    byVehicleType[cls].count += 1;

    byVehicle.push({
      index: i,
      id: vehicles[i].id ?? `veh-${i}`,
      type: cls,
      speedKmh: +speedKmh.toFixed(2),
      distanceM: +distanceM.toFixed(2),
      factors: getEmissionFactors(cls, speedKmh),
      grams: {
        CO2: +grams.CO2.toFixed(4),
        NOx: +grams.NOx.toFixed(5),
        PM: +grams.PM.toFixed(5),
        CO: +grams.CO.toFixed(5),
        HC: +grams.HC.toFixed(5),
      },
    });
  }

  const round = (x) => +x.toFixed(4);
  return {
    totals: {
      CO2: round(totals.CO2),
      NOx: round(totals.NOx),
      PM: round(totals.PM),
      CO: round(totals.CO),
      HC: round(totals.HC),
      fuelLiters: round(totals.fuelLiters),
    },
    byVehicleType,
    byVehicle,
    totalDistanceM: +totalDistanceM.toFixed(2),
    avgSpeedKmh: totalDistanceM > 0 ? +(weightedSpeed / totalDistanceM).toFixed(2) : 0,
  };
}

/**
 * Sum an array of emission results into grand totals.
 *
 * Accepts mixed item shapes:
 *  - {@link calculateEmissions} outputs (`{totals, totalDistanceM}`);
 *  - per-vehicle rows (`{grams:{...}, distanceM}`);
 *  - raw `{CO2, NOx, ...}` gram objects.
 *
 * @param {Array<Object>} emissionsArray
 * @returns {{total:Object, perKm:Object, perVehicle:Object}}
 *   `total`/`perKm`/`perVehicle` each carry `{CO2,NOx,PM,CO,HC,fuelLiters?}`
 *   (perKm normalized to km, perVehicle to vehicles); zeroed when empty.
 */
export function totalEmissions(emissionsArray) {
  if (!Array.isArray(emissionsArray)) throw new TypeError('totalEmissions: array required');

  const sum = { CO2: 0, NOx: 0, PM: 0, CO: 0, HC: 0, fuelLiters: 0 };
  let distanceM = 0;
  let nVehicles = 0;

  for (const item of emissionsArray ?? []) {
    if (!item || typeof item !== 'object') continue;
    if (item.totals) {
      for (const k of Object.keys(sum)) sum[k] += Number.isFinite(item.totals[k]) ? item.totals[k] : 0;
      distanceM += Number.isFinite(item.totalDistanceM) ? item.totalDistanceM : 0;
      nVehicles += Array.isArray(item.byVehicle) ? item.byVehicle.length : (item.vehicleCount ?? 1);
    } else {
      const g = item.grams ?? item; // per-vehicle row or raw gram object
      for (const k of ['CO2', 'NOx', 'PM', 'CO', 'HC']) sum[k] += Number.isFinite(g[k]) ? g[k] : 0;
      if (Number.isFinite(item.fuelLiters)) sum.fuelLiters += item.fuelLiters;
      distanceM += Number.isFinite(item.distanceM) ? item.distanceM : 0;
      nVehicles += 1;
    }
  }

  const round = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o)) out[k] = +v.toFixed(4);
    return out;
  };
  const km = distanceM / 1000;
  return {
    total: round(sum),
    perKm: round(km > 0 ? Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / km])) : sum),
    perVehicle: round(nVehicles > 0 ? Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / nVehicles])) : sum),
    totalDistanceM: +distanceM.toFixed(2),
    vehicleCount: nVehicles,
  };
}
