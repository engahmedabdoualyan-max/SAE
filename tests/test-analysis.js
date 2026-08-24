'use strict';
// SAE AutoSim Hub — advanced analysis tests (emissions / noise / safety /
// energy / V2X / full report).
// Run with: node tests/test-analysis.js
// Uses only the Node built-in assert module.

const assert = require('node:assert/strict');

const results = { total: 0, passed: 0, failed: 0 };

async function test(name, fn) {
  results.total += 1;
  try {
    await fn();
    results.passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    results.failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

async function run() {
  console.log('\n=== tests/test-analysis.js — Advanced Analysis ===');

  const em = await import('../sim-engine/analysis/emissions.js');
  const nz = await import('../sim-engine/analysis/noise.js');
  const sf = await import('../sim-engine/analysis/safety.js');
  const en = await import('../sim-engine/analysis/energy.js');
  const vx = await import('../sim-engine/analysis/v2x.js');
  const bundle = await import('../sim-engine/analysis/index.js');

  /* ------------------------------------------------------------------ *
   * 1. Emissions with known speeds/vehicles                             *
   * ------------------------------------------------------------------ */
  await test('emissions: factors match the COPERT polynomial at reference speed', () => {
    const f = em.getEmissionFactors('passenger car'); // 50 km/h
    const c = em.COPERT_CO2_COEFFS['passenger car'];
    const expectedCO2 = c.a * 50 * 50 + c.b * 50 + c.c + c.d / 50; // ≈ 185 g/km
    assert.ok(Math.abs(f.CO2 - expectedCO2) < 0.01, `CO2 factor ${f.CO2} vs analytic ${expectedCO2}`);
    assert.ok(f.CO2 > 100 && f.CO2 < 300, 'urban car CO2 plausible range');
    assert.ok(f.NOx > 0 && f.PM > 0 && f.CO > 0 && f.HC > 0, 'all pollutants positive');

    // Bus pollutes more per km than a car at the same speed.
    const fb = em.getEmissionFactors('bus');
    assert.ok(fb.CO2 > f.CO2 * 3, `bus CO2 (${fb.CO2}) >> car CO2 (${f.CO2})`);

    // Congestion correction inflates low-speed factors.
    const crawl = em.getEmissionFactors('truck', 10);
    const cruise = em.getEmissionFactors('truck', 50);
    assert.ok(crawl.NOx > cruise.NOx, 'NOx higher in congested crawl');
  });

  await test('emissions: fleet aggregation scales linearly with distance', () => {
    const fleet = [
      { id: 'a', type: 'car', speedKmh: 50, distanceM: 1000 },
      { id: 'b', type: 'bus', speedKmh: 50, distanceM: 1000 },
    ];
    const res = em.calculateEmissions(fleet, null);
    const fCar = em.getEmissionFactors('car', 50);
    const fBus = em.getEmissionFactors('bus', 50);
    assert.ok(Math.abs(res.totals.CO2 - (fCar.CO2 + fBus.CO2)) < 0.5,
      `total CO2 ${res.totals.CO2} ≈ ${fCar.CO2 + fBus.CO2}`);

    // Doubling distance doubles emissions (same speed).
    const twice = em.calculateEmissions(
      fleet.map((v) => ({ ...v, distanceM: 2000 })), null,
    );
    assert.ok(Math.abs(twice.totals.CO2 - 2 * res.totals.CO2) < 0.5, 'linear in distance');

    // totalEmissions sums batches and normalizes perKm/perVehicle.
    const agg = em.totalEmissions([res, twice]);
    assert.ok(Math.abs(agg.total.CO2 - 3 * res.totals.CO2) < 0.6);
    assert.ok(
      Math.abs(agg.perVehicle.CO2 - (3 * res.totals.CO2) / 4) < 0.6,
      'per-vehicle normalization over 4 vehicle-rows',
    );
    assert.equal(agg.vehicleCount, 4);

    assert.throws(() => em.calculateEmissions('nope'), TypeError);
  });

  /* ------------------------------------------------------------------ *
   * 2. Noise level at different distances                               *
   * ------------------------------------------------------------------ */
  await test('noise: level drops ~12 dB when distance quadruples, +Lw for trucks', () => {
    const lw = nz.getNoiseLevel('car', 50 / 3.6);
    assert.ok(Math.abs(lw - 67) < 1e-9, `reference speed returns Lw0=67, got ${lw}`);
    assert.equal(nz.getNoiseLevel('bus', 50 / 3.6), 79);
    assert.ok(nz.getNoiseLevel('motorcycle', 20) > nz.getNoiseLevel('car', 20),
      'motorcycle louder than car at equal speed (72 vs 67 Lw0)');
    assert.ok(nz.getNoiseLevel('car', 25) > nz.getNoiseLevel('car', 15), 'speed raises level');

    const src = [{ x: 0, y: 0, level: 67 }];
    const near = nz.noiseAtReceiver(src, { x: 10, y: 0 });
    const far = nz.noiseAtReceiver(src, { x: 40, y: 0 });
    assert.ok(near > far, 'closer receiver hears more');
    const drop = near - far;
    assert.ok(Math.abs(drop - 20 * Math.log10(40 / 10)) < 0.05,
      `drop should be 20·log10(4)=12.04 dB, got ${drop.toFixed(2)}`);

    // Two identical sources add +3 dB.
    const two = nz.noiseAtReceiver([src[0], { x: 0.1, y: 0.1, level: 67 }], { x: 10, y: 0 });
    assert.ok(Math.abs(two - near - 3) < 0.3, 'energy summing gives +3 dB for doubled sources');

    // Barrier screening reduces the level.
    const blocked = nz.noiseAtReceiver(src, { x: 10, y: 0 }, {
      barriers: [{ x1: 4, y1: -50, x2: 4, y2: 50, lossDb: 10 }],
    });
    assert.ok(Math.abs(blocked - (near - 10)) < 0.05, 'barrier inserts its loss exactly');

    assert.throws(() => nz.noiseAtReceiver(src, null), TypeError);
  });

  /* ------------------------------------------------------------------ *
   * 3. TTC calculation for approaching vehicles                         *
   * ------------------------------------------------------------------ */
  await test('safety: TTC/PET detect conflicts and risk score saturates', () => {
    // Car A at origin heading right at 10 m/s; stopped car B 50 m ahead → TTC 5 s.
    const ttc = sf.computeTTC(
      { x: 0, y: 0, vx: 10, vy: 0 },
      { x: 50, y: 0, vx: 0, vy: 0 },
    );
    assert.ok(Math.abs(ttc - 5) < 1e-9, `TTC should be 5 s, got ${ttc}`);

    // Receding traffic → no collision course → Infinity.
    assert.equal(sf.computeTTC({ x: 0, y: 0, vx: 10, vy: 0 }, { x: 50, y: 0, vx: 30, vy: 0 }), Infinity);
    // Perpendicular paths never close → Infinity.
    assert.equal(sf.computeTTC({ x: 0, y: 0, vx: 10, vy: 0 }, { x: 50, y: 40, vx: 0, vy: 5 }), Infinity);
    assert.throws(() => sf.computeTTC({}, { x: 1, y: 1 }), TypeError);

    // PET: A crosses the point first, B arrives 2 s after A left the zone.
    const mkTraj = (id, axis) => ({
      id,
      points: [0, 1, 2, 3, 4, 5, 6].map((t) => ({
        t,
        x: axis === 'x' ? t * 8 - 24 : 0,
        y: axis === 'y' ? t * 8 - 24 : 0,
        speed: 8,
      })),
    });
    const pet = sf.computePET(mkTraj('A', 'x'), mkTraj('B', 'y'), { x: 0, y: 0 });
    assert.ok(Number.isFinite(pet), `PET finite for crossing trajectories (got ${pet})`);

    // Conflict analysis on the same pair finds one conflict.
    const conflicts = sf.conflictAnalysis([mkTraj('A', 'x'), mkTraj('B', 'y')]);
    assert.ok(conflicts.length >= 1, 'crossing streams produce a conflict');
    assert.equal(conflicts[0].severity === undefined, false, 'severity classified');

    // Near-miss head-on approach scores high risk.
    const risky = [
      { agents: ['a', 'b'], ttc: 0.4, pet: 0.2 },
    ];
    assert.ok(sf.riskScore(risky) >= 80, `near-miss scores ≥ 80, got ${sf.riskScore(risky)}`);
    assert.equal(sf.riskScore([]), 0);

    // Full analyzeSafety aggregates DRS from braking speeds.
    const braking = {
      id: 'brake',
      points: [0, 1, 2].map((k) => ({ t: k, x: 60 - 14 * k, y: 0, speed: 14 - 6 * k })),
    };
    const safety = sf.analyzeSafety([mkTraj('A', 'x'), mkTraj('B', 'y'), braking]);
    assert.ok(safety.conflictCount >= 1);
    assert.ok(safety.drs.maxDecel >= 6, `hard braking detected (maxDecel=${safety.drs.maxDecel})`);
    assert.ok(safety.drs.exceedances >= 1, 'comfort threshold exceeded');
    assert.ok(safety.riskScore > 0 && safety.riskScore <= 100);
  });

  /* ------------------------------------------------------------------ *
   * 4. EV range matches closed-form physics                             *
   * ------------------------------------------------------------------ */
  await test('energy: EV range matches analytic steady-speed derivation', () => {
    const r = en.evRangeCalc('car', 60, null);
    const spec = en.EV_SPECS.car;
    const v = en.RANGE_REF_SPEED_MPS;

    const powerW = spec.mass * en.ENERGY_PHYS.g * spec.Cr * v +
      0.5 * en.ENERGY_PHYS.rho * spec.Cd * spec.A * v ** 3;
    const drawW = powerW / spec.drivetrainEff;
    const kWhPerKm = (drawW / v) / en.ENERGY_PHYS.joulePerKWh * 1000;
    const expectedRangeM = (60 / kWhPerKm) * 1000;

    assert.ok(Math.abs(r.rangeM - expectedRangeM) < 1,
      `range ${r.rangeM} m vs analytic ${expectedRangeM.toFixed(0)} m`);
    assert.ok(r.consumptionKWhPerKm > 0.02 && r.consumptionKWhPerKm < 0.2,
      `plausible ideal consumption (${r.consumptionKWhPerKm} kWh/km ≈ ${r.consumptionKWhPerKm * 1000} Wh/km)`);

    // Heavier bus has shorter range per kWh than a car.
    const busR = en.evRangeCalc('bus', 60);
    assert.ok(busR.rangeM < r.rangeM);

    // Network refines cruise speed via length-weighted limits.
    const netEdges = [
      { id: 'e1', length: 1000, speedLimit: 8.33 },
      { id: 'e2', length: 3000, speedLimit: 19.44 },
    ];
    const rn = en.evRangeCalc('car', 60, { edges: netEdges });
    const expectedCruise = (8.33 * 1000 + 19.44 * 3000) / 4000;
    assert.ok(Math.abs(rn.cruiseSpeedMps - expectedCruise) < 1e-2,
      'length-weighted average speed used');
    assert.throws(() => en.energyConsumption(null), TypeError);
  });

  await test('energy: consumption breakdown and charging demand aggregate', () => {
    const edge = { id: 'e1', length: 1000, speedLimit: 13.9, grade: 0 };
    const cons = en.energyConsumption({ type: 'car', speed: 13.9 }, edge);
    const spec = en.EV_SPECS.car;
    // Closed-form check of the rolling term over 1 km.
    expectClose(cons.breakdown.rollingKWh,
      (spec.mass * en.ENERGY_PHYS.g * spec.Cr * 1000) / en.ENERGY_PHYS.joulePerKWh, 1e-9);
    assert.ok(cons.kWh > cons.breakdown.rollingKWh, 'aero+accel add on top of rolling');

    const analysis = en.analyzeEnergy([
      { id: 'ev1', type: 'car', speed: 13.9, edgeId: 'e1', soc: 0.2, destinationNodeId: 'N1' },
      { id: 'ev2', type: 'car', speed: 13.9, edgeId: 'e1', soc: 0.8, destinationNodeId: 'N1' },
    ], { edges: [edge] });

    assert.equal(analysis.perVehicle.length, 2);
    assert.ok(analysis.efficiencyWhPerKm > 0);
    assert.ok(analysis.charging.totalDemandKWh > 0);
    // SOC 0.2 + 0.8 on 60 kWh batteries → 48 + 12 = 60 kWh demanded at N1.
    assert.ok(Math.abs(analysis.charging.stations[0].demandKWh - 60) < 0.01,
      `demand at N1 should be 60 kWh, got ${analysis.charging.stations[0].demandKWh}`);
    assert.equal(analysis.charging.peakStationKWh, 60);
    expectClose(cons.kWh * 2, analysis.totalKWh, 0.02, 'fleet total is the sum of vehicles');
  });

  /* ------------------------------------------------------------------ *
   * 5. V2X penetration impact increases capacity                        *
   * ------------------------------------------------------------------ */
  await test('v2x: penetration reduces headway and raises capacity up to +40%', () => {
    const base = { capacity: 2000, avgHeadway: 2.0, throughput: 2000, avgDelay: 60 };
    const full = vx.v2xPenetrationImpact(1.0, base);
    assert.ok(Math.abs(full.capacity - 2800) < 0.01, `capacity ×1.4 at MPR=1 → ${full.capacity}`);
    assert.ok(Math.abs(full.avgHeadway - 1.0) < 1e-9, `headway halved at MPR=1 → ${full.avgHeadway}`);
    assert.ok(full.avgDelay < base.avgDelay, 'delay shrinks under V2X');

    const half = vx.v2xPenetrationImpact(0.5, base);
    assert.ok(half.capacity > base.capacity && half.capacity < full.capacity, 'monotone in MPR');
    assert.ok(Math.abs(vx.v2xPenetrationImpact(0, base).capacity - 2000) < 0.01, 'MPR 0 → baseline');

    // Out-of-range inputs clamp to [0,1].
    assert.equal(vx.v2xPenetrationImpact(7, base).mpr, 1);

    // messageFlow counts BSM heartbeats and coverage.
    const flow = vx.messageFlow([
      { id: 'a', v2x: true, position: { x: 0, y: 0 } },
      { id: 'b', v2x: true, position: { x: 50, y: 0 } },
      { id: 'c', v2x: true, position: { x: 5000, y: 5000 } },
    ], 300, {});
    assert.equal(flow.participants, 3);
    assert.equal(flow.equipped, 3, 'explicit flags enable equipment');
    assert.ok(flow.totalMessages > 0);
    assert.ok(flow.coverage > 0 && flow.coverage < 1, `isolated vehicle uncovered (${flow.coverage})`);
    assert.ok(flow.byType.BSM === Math.round(3 * vx.V2X_CONSTANTS.bsmRateHz), '10 Hz BSM per vehicle');

    // Platoons group close same-lane followers.
    const platoons = vx.platooning([
      { id: 'p1', edgeId: 'e', lane: 0, offset: 10, length: 4.5, speed: 12 },
      { id: 'p2', edgeId: 'e', lane: 0, offset: 22, length: 4.5, speed: 12 },
      { id: 'q1', edgeId: 'e', lane: 0, offset: 900, length: 4.5, speed: 12 },
    ]);
    assert.equal(platoons.length, 1);
    assert.deepEqual(platoons[0].members, ['p1', 'p2']);

    const v2xAll = vx.analyzeV2X([{ id: 'av1', type: 'av', position: { x: 0, y: 0 } }], {});
    assert.equal(v2xAll.penetration.equipped, 1, 'AV counted as equipped by default');
  });

  /* ------------------------------------------------------------------ *
   * 6. runFullAnalysis produces complete results                        *
   * ------------------------------------------------------------------ */
  await test('runFullAnalysis combines every module into one report', () => {
    const simResults = {
      durationS: 120,
      edges: [
        { id: 'e1', length: 1000, speedLimit: 13.9 },
        { id: 'e2', length: 800, speedLimit: 11.1 },
      ],
      vehicles: [
        { id: 'v1', type: 'car', speed: 12, distanceM: 1500, edgeId: 'e1', position: { x: 10, y: 0 }, soc: 0.5 },
        { id: 'v2', type: 'bus', speed: 8, distanceM: 900, edgeId: 'e2', position: { x: 30, y: 0 }, soc: 0.4 },
        { id: 'v3', type: 'truck', speed: 10, distanceM: 1200, edgeId: 'e1', position: { x: 60, y: 0 } },
      ],
      receivers: [
        { id: 'R1', x: 10, y: 15 },
        { id: 'R2', x: 200, y: 100 },
      ],
      trajectories: [
        { id: 'A', points: [0, 1, 2, 3, 4].map((t) => ({ t, x: t * 10 - 20, y: 0, speed: 10 })) },
        { id: 'B', points: [0, 1, 2, 3, 4].map((t) => ({ t, x: 0, y: t * 10 - 20, speed: 10 })) },
      ],
      network: { edges: [{ id: 'e1', length: 1000, speedLimit: 13.9 }] },
    };

    const report = bundle.runFullAnalysis(simResults, {});

    for (const key of ['emissions', 'noise', 'safety', 'energy', 'v2x', 'summary']) {
      assert.ok(report[key] != null, `report.${key} present`);
    }
    assert.ok(report.emissions.totals.CO2 > 0, 'emissions computed');
    assert.equal(report.noise.receivers.length, 2, 'both receivers evaluated');
    assert.ok(report.safety.conflictCount >= 1, 'trajectory conflict detected');
    assert.ok(report.energy.totalKWh > 0, 'energy computed');
    assert.equal(report.v2x.penetration.participants, 3, 'V2X sees whole fleet');
    assert.deepEqual(report.errors, {}, `no sub-analysis errors: ${JSON.stringify(report.errors)}`);

    assert.ok(report.summary.totalCO2Kg > 0);
    assert.ok(report.summary.maxNoiseLevel > 0);
    assert.ok(report.summary.energyKWh > 0);
    assert.equal(report.summary.conflictCount, report.safety.conflictCount);
    assert.equal(Object.keys(bundle).length >= 5, true, 'bundle re-exports modules');

    // Missing trajectories degrade gracefully instead of throwing.
    const partial = bundle.runFullAnalysis({ vehicles: simResults.vehicles }, {});
    assert.ok(partial.safety === null || partial.errors.safety !== undefined,
      'safety skipped or error-noted without trajectories');
  });
}

/* --------------------------------------------------------------- helpers -- */

function expectClose(actual, expected, tol, msg) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    msg ?? `expected ${actual} ≈ ${expected} ± ${tol}`,
  );
}

async function __run() {
  results.total = 0;
  results.passed = 0;
  results.failed = 0;
  await run();
  return { ...results };
}

if (require.main === module) {
  __run().then((r) => {
    console.log(`\n  ${r.passed}/${r.total} tests passed, ${r.failed} failed\n`);
    process.exitCode = r.failed > 0 ? 1 : 0;
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { __run };
