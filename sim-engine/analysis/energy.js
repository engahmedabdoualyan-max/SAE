/**
 * @file Energy analysis for electric vehicles (EV).
 *
 * Physics-based trip energy:
 *
 *     E = E_rolling + E_aero + E_accel + E_climb
 *     E_rolling = m·g·Cr·d                       [J]
 *     E_aero    = ½·ρ·Cd·A·v²·d                  [J]
 *     E_accel   = ½·m·v²  (kinetic, net of regen) [J]
 *     E_climb   = m·g·sin(grade)·d               [J]
 *
 * Mechanical energy is divided by the drivetrain efficiency; braking energy
 * is partially recovered at `regenEff`. Results are reported in kWh.
 */

/** Physical constants. */
export const ENERGY_PHYS = Object.freeze({
  g: 9.81,        // m/s²
  rho: 1.225,     // air density kg/m³
  joulePerKWh: 3.6e6,
});

/**
 * EV parameter sets per vehicle class.
 * @type {Readonly<Record<string,{mass:number,Cd:number,A:number,Cr:number,
 *          batteryKWh:number,drivetrainEff:number,regenEff:number}>>}
 */
export const EV_SPECS = Object.freeze({
  car: Object.freeze({ mass: 1800, Cd: 0.25, A: 2.2, Cr: 0.010, batteryKWh: 60, drivetrainEff: 0.90, regenEff: 0.65 }),
  bus: Object.freeze({ mass: 14000, Cd: 0.60, A: 6.5, Cr: 0.012, batteryKWh: 300, drivetrainEff: 0.88, regenEff: 0.60 }),
  truck: Object.freeze({ mass: 15000, Cd: 0.70, A: 7.5, Cr: 0.012, batteryKWh: 350, drivetrainEff: 0.88, regenEff: 0.60 }),
  motorcycle: Object.freeze({ mass: 250, Cd: 0.60, A: 0.7, Cr: 0.015, batteryKWh: 6, drivetrainEff: 0.92, regenEff: 0.50 }),
});

/** Reference speed for range estimation [m/s] (≈ 50 km/h). */
export const RANGE_REF_SPEED_MPS = 50 / 3.6;

/** Aliases → spec keys. */
const TYPE_ALIASES = Object.freeze({
  'passenger car': 'car',
  sedan: 'car',
  av: 'car',
  bicycle: null, // human-powered: zero traction energy
});

function specFor(type) {
  const key = TYPE_ALIASES[String(type ?? '').toLowerCase()] ?? String(type ?? 'car').toLowerCase();
  return EV_SPECS[key] ?? EV_SPECS.car;
}

const J_TO_KWH = (j) => j / ENERGY_PHYS.joulePerKWh;

/* ------------------------------------------------------------ components -- */

/**
 * Per-component energy decomposition over a distance at constant speed.
 *
 * @param {{mass:number,Cd:number,A:number,Cr:number,drivetrainEff:number,regenEff:number}} spec
 * @param {number} v Speed [m/s].
 * @param {number} d Distance [m].
 * @param {number} [grade=0] Road grade as rise/run fraction (e.g. 0.04 = 4%).
 * @param {{stopAtEnd?:boolean}} [opts] When `stopAtEnd` (default true), one
 *   stop-start cycle is charged per traversal: kinetic energy is spent and
 *   only the `regenEff` fraction is recovered.
 * @returns {{rollingJ:number, aeroJ:number, accelJ:number, climbJ:number,
 *            regenRecoveredJ:number, totalJ:number}}
 */
export function energyBreakdown(spec, v, d, grade = 0, opts = {}) {
  if (!Number.isFinite(v) || !Number.isFinite(d)) throw new TypeError('energyBreakdown: numeric speed/distance required');
  const vv = Math.max(0, v);
  const dd = Math.max(0, d);
  const sinGrade = Math.sin(Math.atan(Number.isFinite(grade) ? grade : 0));

  const rollingJ = spec.mass * ENERGY_PHYS.g * spec.Cr * dd;
  const aeroJ = 0.5 * ENERGY_PHYS.rho * spec.Cd * spec.A * vv * vv * dd;
  const climbJ = spec.mass * ENERGY_PHYS.g * sinGrade * dd;

  // Net acceleration energy for one stop-start cycle (defaults to true).
  const stopAtEnd = opts.stopAtEnd !== false;
  const kinetic = 0.5 * spec.mass * vv * vv;
  const accelJ = stopAtEnd ? kinetic : 0;
  const regenRecoveredJ = stopAtEnd ? kinetic * spec.regenEff : 0;

  const mechJ = Math.max(0, rollingJ + aeroJ + climbJ - regenRecoveredJ);
  const totalJ = mechJ / Math.max(spec.drivetrainEff, 0.5) + (stopAtEnd ? accelJ : 0);

  return {
    rollingJ,
    aeroJ,
    accelJ,
    climbJ,
    regenRecoveredJ,
    totalJ,
  };
}

/* -------------------------------------------------------------- consumers -- */

/**
 * Distance source helper: prefer explicit distance fields, then edge length.
 * @private
 */
function distanceOf(vehicle, edge) {
  if (Number.isFinite(vehicle?.distanceM)) return vehicle.distanceM;
  if (Number.isFinite(vehicle?.stats?.distance)) return vehicle.stats.distance;
  if (Number.isFinite(vehicle?.distanceTraveled)) return vehicle.distanceTraveled;
  if (edge && Number.isFinite(edge.length)) return edge.length;
  return 0;
}

/**
 * Energy consumed on one edge [kWh], decomposed.
 *
 * @param {Object} vehicle `{type, speed?, distanceM?|stats.distance?}`.
 * @param {Object|null} [edge=null] `{length?, grade?, speedLimit?, hasStop?}`.
 * @returns {{
 *   kWh:number, breakdown:Object, distanceM:number, type:string
 * }}
 */
export function energyConsumption(vehicle, edge = null) {
  if (!vehicle || typeof vehicle !== 'object') throw new TypeError('energyConsumption: vehicle object required');
  const spec = specFor(vehicle.type);
  const d = distanceOf(vehicle, edge);
  const v = Number.isFinite(vehicle.speed)
    ? vehicle.speed
    : Number.isFinite(edge?.speedLimit)
      ? edge.speedLimit
      : RANGE_REF_SPEED_MPS;
  const grade = Number.isFinite(edge?.grade) ? edge.grade : 0;
  const stopAtEnd = edge?.hasStop !== undefined ? !!edge.hasStop : true;

  const bd = energyBreakdown(spec, v, d, grade, { stopAtEnd });
  return {
    kWh: +J_TO_KWH(bd.totalJ).toFixed(6),
    breakdown: {
      rollingKWh: +J_TO_KWH(bd.rollingJ).toFixed(6),
      aeroKWh: +J_TO_KWH(bd.aeroJ).toFixed(6),
      accelKWh: +J_TO_KWH(bd.accelJ).toFixed(6),
      climbKWh: +J_TO_KWH(bd.climbJ).toFixed(6),
      regenRecoveredKWh: +J_TO_KWH(bd.regenRecoveredJ).toFixed(6),
    },
    distanceM: d,
    type: vehicle.type ?? 'car',
  };
}

/**
 * Estimated full-battery range [m] under steady-speed cruising.
 *
 * Consumption rate is evaluated analytically from the same physics as
 * {@link energyConsumption}; when a network is supplied the cruise speed is
 * the length-weighted mean edge speed limit.
 *
 * @param {'car'|'bus'|'truck'|'motorcycle'} [vehicleType='car']
 * @param {number|null} [batteryCapacity=null] Usable capacity [kWh];
 *   defaults to the class spec.
 * @param {Object|null} [network=null] Road network or `{edges}` container —
 *   edges refine the average operating speed.
 * @returns {{rangeM:number, batteryKWh:number, consumptionKWhPerKm:number,
 *            cruiseSpeedMps:number}} Range in meters plus derivation inputs.
 *
 * @example
 * evRangeCalc('car', 60).rangeM; // idealized steady-50 km/h range
 */
export function evRangeCalc(vehicleType = 'car', batteryCapacity = null, network = null) {
  const spec = specFor(vehicleType);
  const capacity = Number.isFinite(batteryCapacity) && batteryCapacity > 0 ? batteryCapacity : spec.batteryKWh;

  let cruise = RANGE_REF_SPEED_MPS;
  const edges = collectEdges(network);
  if (edges.length > 0) {
    let wSum = 0;
    let vSum = 0;
    for (const e of edges) {
      const L = Number.isFinite(e.length) && e.length > 0 ? e.length : 100;
      const lim = Number.isFinite(e.speedLimit) && e.speedLimit > 0
        ? Math.min(e.speedLimit, 33.3)
        : RANGE_REF_SPEED_MPS;
      wSum += L;
      vSum += lim * L;
    }
    if (wSum > 0) cruise = vSum / wSum;
  }

  // Steady-state mechanical power [W]: rolling + aero (no climb).
  const powerW = spec.mass * ENERGY_PHYS.g * spec.Cr * cruise +
    0.5 * ENERGY_PHYS.rho * spec.Cd * spec.A * cruise ** 3;
  const powerAtWheels = powerW / spec.drivetrainEff; // electrical draw [W]

  const consumptionKWhPerKm = (powerAtWheels / cruise) / ENERGY_PHYS.joulePerKWh * 1000;
  const rangeM = capacity / consumptionKWhPerKm; // kWh / (kWh/km) → km… ×1000

  return {
    rangeM: +(rangeM * 1000).toFixed(0),
    batteryKWh: capacity,
    consumptionKWhPerKm: +consumptionKWhPerKm.toFixed(5),
    cruiseSpeedMps: +cruise.toFixed(3),
  };
}

/** Collect edges from a Network instance or plain container. */
function collectEdges(network) {
  if (!network) return [];
  if (typeof network.getAllEdges === 'function') return network.getAllEdges();
  const c = network.edges;
  if (c instanceof Map) return [...c.values()];
  if (Array.isArray(c)) return c;
  if (c && typeof c === 'object') return Object.values(c);
  return [];
}

/* ------------------------------------------------------------- charging -- */

/**
 * Charging-station demand derived from remaining state-of-charge at trip end.
 *
 * Each vehicle contributes `capacity · (1 − soc)` kWh at its destination
 * node (`route` tail, explicit `destinationNodeId`, or current edge's `to`).
 *
 * @param {Array<Object>} vehicles Vehicles with optional `soc` (0..1),
 *   `batteryKWh`, `destinationNodeId`, `route`.
 * @param {Object|null} [network=null] Network used to resolve destination nodes.
 * @returns {{
 *   stations:Array<{nodeId:string, demandKWh:number, vehicleCount:number}>,
 *   totalDemandKWh:number, peakStationKWh:number
 * }}
 */
export function chargingDemand(vehicles, network = null) {
  if (!Array.isArray(vehicles)) throw new TypeError('chargingDemand: vehicles array required');

  const byNode = new Map();
  for (const veh of vehicles) {
    if (!veh || typeof veh !== 'object') continue;
    const spec = specFor(veh.type);
    const cap = Number.isFinite(veh.batteryKWh) && veh.batteryKWh > 0 ? veh.batteryKWh : spec.batteryKWh;
    const socRaw = Number.isFinite(veh.soc) ? veh.soc : 0.3;
    const soc = Math.max(0, Math.min(1, socRaw));
    const needKWh = cap * (1 - soc);

    const nodeId = resolveDestNode(veh, network);
    if (!nodeId) continue;
    const entry = byNode.get(nodeId) ?? { nodeId, demandKWh: 0, vehicleCount: 0 };
    entry.demandKWh += needKWh;
    entry.vehicleCount += 1;
    byNode.set(nodeId, entry);
  }

  const stations = [...byNode.values()]
    .map((s) => ({ ...s, demandKWh: +s.demandKWh.toFixed(3) }))
    .sort((a, b) => b.demandKWh - a.demandKWh);

  return {
    stations,
    totalDemandKWh: +stations.reduce((a, s) => a + s.demandKWh, 0).toFixed(3),
    peakStationKWh: stations.length > 0 ? stations[0].demandKWh : 0,
  };
}

/** Destination-node resolution order: explicit field → route tail → edge.to. */
function resolveDestNode(veh, network) {
  if (typeof veh.destinationNodeId === 'string') return veh.destinationNodeId;
  if (Array.isArray(veh.route) && veh.route.length > 0) {
    const lastId = veh.route[veh.route.length - 1];
    const e = getEdge(network, lastId);
    if (e?.to) return e.to;
  }
  if (typeof veh.edgeId === 'string') {
    const e = getEdge(network, veh.edgeId);
    if (e?.to) return e.to;
  }
  return null;
}

function getEdge(network, id) {
  if (!network || !id) return null;
  if (typeof network.getEdge === 'function') return network.getEdge(id);
  const c = network.edges;
  if (c instanceof Map) return c.get(id) ?? null;
  if (Array.isArray(c)) return c.find((e) => e.id === id) ?? null;
  if (c && typeof c === 'object') return c[id] ?? null;
  return null;
}

/* ------------------------------------------------------------ entrypoint -- */

/**
 * Fleet-level energy analysis.
 *
 * @param {Array<Object>} vehicles Vehicle list (simulation instances or plain).
 * @param {Object|null} [network=null] Network for edge metadata & destinations.
 * @returns {{
 *   totalKWh:number, totalDistanceM:number, efficiencyWhPerKm:number,
 *   regenRecoveredKWh:number, byType:Object, perVehicle:Array<Object>,
 *   estimatedRangeM:number, charging:Object
 * }}
 */
export function analyzeEnergy(vehicles, network = null) {
  if (!Array.isArray(vehicles)) throw new TypeError('analyzeEnergy: vehicles array required');

  let totalJ = 0;
  let regenJ = 0;
  let distanceM = 0;
  /** @type {Record<string,{kWh:number,distanceM:number,count:number}>} */
  const byType = {};
  const perVehicle = [];

  for (const veh of vehicles) {
    if (!veh || typeof veh !== 'object') continue;
    const edge = getEdge(network, veh.edgeId);
    const res = energyConsumption(veh, edge);
    totalJ += res.kWh * ENERGY_PHYS.joulePerKWh;
    regenJ += res.breakdown.regenRecoveredKWh * ENERGY_PHYS.joulePerKWh;
    distanceM += res.distanceM;

    byType[res.type] ??= { kWh: 0, distanceM: 0, count: 0 };
    byType[res.type].kWh += res.kWh;
    byType[res.type].distanceM += res.distanceM;
    byType[res.type].count += 1;

    perVehicle.push({ id: veh.id ?? null, ...res });
  }

  const totalKWh = J_TO_KWH(totalJ);
  const round2 = (x) => +x.toFixed(2);

  return {
    totalKWh: +totalKWh.toFixed(4),
    totalDistanceM: round2(distanceM),
    efficiencyWhPerKm: distanceM > 0 ? +((totalKWh * 1000) / (distanceM / 1000)).toFixed(2) : 0,
    regenRecoveredKWh: +J_TO_KWH(regenJ).toFixed(4),
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [
        k,
        {
          kWh: +v.kWh.toFixed(4),
          distanceM: round2(v.distanceM),
          count: v.count,
          efficiencyWhPerKm: v.distanceM > 0 ? +((v.kWh * 1000) / (v.distanceM / 1000)).toFixed(2) : 0,
        },
      ]),
    ),
    perVehicle,
    estimatedRangeM: evRangeCalc('car', null, network).rangeM,
    charging: chargingDemand(vehicles, network),
  };
}
