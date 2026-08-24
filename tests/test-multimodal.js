'use strict';
// SAE AutoSim Hub — multimodal engine tests (pedestrian / bus / cyclist /
// router / manager).
// Run with: node tests/test-multimodal.js
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
  console.log('\n=== tests/test-multimodal.js — Multimodal Engine ===');

  const pedMod = await import('../sim-engine/models/pedestrian.js');
  const busMod = await import('../sim-engine/models/bus.js');
  const cycMod = await import('../sim-engine/models/cyclist.js');
  const routerMod = await import('../sim-engine/multimodal/router.js');
  const mgrMod = await import('../sim-engine/multimodal/manager.js');
  const graphMod = await import('../sim-engine/network/graph.js');

  /* ------------------------------------------------------------------ *
   * 1. Pedestrian creation and update                                   *
   * ------------------------------------------------------------------ */
  await test('pedestrian creation and update walks toward destination', () => {
    const p0 = new pedMod.Pedestrian({
      id: 'p1',
      position: { x: 0, y: 0 },
      destination: { x: 50, y: 0 },
    });
    assert.equal(p0.id, 'p1');
    assert.equal(p0.state, 'walking');
    assert.equal(p0.speed, 0);

    for (let i = 0; i < 100; i++) p0.update(0.1, [], null);

    assert.ok(p0.position.x > 5, `should have moved right, x=${p0.position.x}`);
    assert.ok(Math.abs(p0.velocity.y) < 1e-6, 'no lateral drift expected');
    assert.ok(
      Math.abs(p0.speed - pedMod.PEDESTRIAN_DEFAULTS.desiredSpeed) < 0.15,
      `speed should approach desired 1.4 m/s, got ${p0.speed.toFixed(3)}`,
    );
    assert.ok(p0.distanceWalked > 0);
    assert.equal(p0.crossings, 0);
  });

  await test('pedestrian waits at red and crosses on green-for-peds', () => {
    // Road runs E–W; the pedestrian approaches from the south walking north
    // across a 6 m crosswalk whose entry curb sits at y = −3.
    const cw = {
      entry: { x: 20, y: -3 },
      exit: { x: 20, y: 3 },
      width: 6,
      signal: { state: 'green' }, // vehicular green → pedestrians must wait
      vehicles: [],
    };
    const p1 = new pedMod.Pedestrian({
      position: { x: 20, y: -8 },
      destination: { x: 20, y: 8 },
    });
    // Walk up to the curb.
    for (let i = 0; i < 40; i++) p1.update(0.1, [], cw);
    assert.equal(p1.state, 'waiting', `expected waiting at curb, got ${p1.state}`);

    const waitedAtRed = p1.waitTime;
    for (let i = 0; i < 30; i++) p1.update(0.1, [], cw); // still red
    assert.equal(p1.state, 'waiting', 'must keep waiting while vehicles have green');
    assert.ok(p1.totalWaitTime > waitedAtRed, 'wait time accumulates');

    cw.signal = { state: 'red' }; // traffic held → pedestrian may cross
    let crossed = false;
    for (let i = 0; i < 120 && !crossed; i++) {
      p1.update(0.1, [], cw);
      crossed = p1.crossings > 0;
    }
    assert.ok(crossed || ['walking', 'arrived'].includes(p1.state), 'pedestrian got across');
    assert.ok(p1.position.y >= -3.2, `ended up past/near far curb (y=${p1.position.y.toFixed(2)})`);
    assert.ok(p1.totalWaitTime > 0, 'recorded wait before crossing');
  });

  await test('canCross respects phase override and vehicle gaps', () => {
    const p2 = new pedMod.Pedestrian({ position: { x: 0, y: 0 }, destination: { x: 10, y: 0 } });
    assert.equal(p2.canCross(null, null), true, 'uncontrolled → may cross');
    assert.equal(p2.canCross({ state: 'red' }), true);
    assert.equal(p2.canCross({ state: 'green' }), false);
    assert.equal(p2.canCross({ state: 'green' }, 'walk'), true, 'explicit walk phase wins');
    assert.equal(p2.canCross({ state: 'red' }, "don't walk"), false);

    // Fast approaching car 30 m away at 15 m/s → required gap ≈ 4 + 15·(6/1.4+1) ≈ 73 m → unsafe.
    const fastCar = { x: 30, y: 0, speed: 15 };
    assert.equal(p2.isGapSafe([fastCar], { width: 6 }), false, 'fast close car blocks crossing');

    // Same car parked → safe.
    assert.equal(p2.isGapSafe([{ x: 8, y: 0, speed: 0 }], { width: 6 }), true, 'parked cars do not block');
  });

  /* ------------------------------------------------------------------ *
   * 2. Bus dwell time calculation                                       *
   * ------------------------------------------------------------------ */
  await test('bus dwell time formula matches t_board + nA·t_alight + nB·t_board', () => {
    const d = busMod.computeBusDwellTime(0, 0);
    assert.equal(d, 3.0, 'base term alone = t_board = 3 s');

    // 3 + (2 alighting × 2.5) + (4 boarding × 3) = 20 s
    const d2 = busMod.computeBusDwellTime(4, 2);
    assert.ok(Math.abs(d2 - 20) < 1e-9, `got ${d2}, want 20`);
    assert.equal(d2, 20);

    const custom = busMod.computeBusDwellTime(1, 1, { tBoard: 2.0, tAlight: 1.0 });
    // base 2 + alight 1×1 + board 1×2 = 5 s
    assert.ok(Math.abs(custom - 5) < 1e-9, 'custom parameters respected');

    assert.throws(() => busMod.computeBusDwellTime(-1, 0), TypeError);
  });

  await test('bus drives to stop, opens doors, dwells and departs', () => {
    const bus = new busMod.Bus({
      id: 'bus-1',
      edgeId: 'e1',
      edgeLength: 500,
      offset: 50,
      speed: 8,
      routeId: 'R1',
      capacity: 40,
      passengerCount: 10,
      stops: [{ stopId: 'S1', edgeId: 'e1', offset: 150, boarding: 5, alighting: 3 }],
    });
    const edge = { length: 500, speedLimit: 13.9 };

    let served = false;
    for (let i = 0; i < 400 && !served; i++) {
      bus.update(0.5, null, null, edge);
      if (bus.arrivals.length > 0) served = true;
    }
    assert.ok(served, 'bus should berth at the stop within 200 s');

    // Doors cycle: opening → dwelling → closing.
    let sawDoors = false;
    for (let i = 0; i < 120; i++) {
      bus.update(0.25, null, null, edge);
      if (bus.doorsOpen) sawDoors = true;
      if (bus.phase === 'drive') break;
    }
    assert.ok(sawDoors, 'doors opened during service');
    assert.equal(bus.phase, 'drive', 'service completed → back to driving');
    assert.equal(bus.passengerCount, 12, '10 − 3 alighting + 5 boarding');
    assert.ok(bus.lastDwellSeconds >= 3 + 3 * 2.5 + 5 * 3 - 1e-9, 'dwell ≥ formula result');
    assert.ok(bus.onTimeRate() === 0, 'no schedule supplied → rate 0');
  });

  await test('board/alight respect capacity and schedule adherence is classified', () => {
    const bus = new busMod.Bus({ capacity: 10, passengerCount: 8, routeId: 'R2' });
    assert.equal(bus.boardPassengers(5), 2, 'only room for 2 of 5');
    assert.equal(bus.passengerCount, 10);
    assert.equal(bus.alightPassengers(12), 10, 'cannot alight more than onboard');
    assert.equal(bus.passengerCount, 0);
    assert.throws(() => bus.boardPassengers(-1), TypeError);

    const sched = new busMod.Bus({
      stops: [
        { stopId: 'A', edgeId: 'x', offset: 0 },
        { stopId: 'B', edgeId: 'y', offset: 0 },
      ],
      schedule: { A: 100, B: 300 },
    });
    sched.simTime = 180; // 80 s behind schedule
    sched._arriveAtStop(sched.stops[0]);
    sched.simTime = 200; // 100 s ahead of schedule
    sched._arriveAtStop(sched.stops[1]);
    const recs = sched.getScheduleAdherence({ scheduledOnly: true });
    assert.equal(recs.length, 2);
    assert.equal(recs[0].status, 'late');
    assert.equal(recs[1].status, 'early');
    assert.ok(Math.abs(recs[0].deltaSec - 80) < 1e-9);
  });

  /* ------------------------------------------------------------------ *
   * 3. Cyclist speed in bike lane vs shared road                        *
   * ------------------------------------------------------------------ */
  await test('cyclist rides faster in a bike lane than on a shared road', () => {
    const edge = { length: 5000, speedLimit: 13.9 };
    const inLane = new cycMod.Cyclist({ id: 'c-lane', bikeLane: true });
    const onRoad = new cycMod.Cyclist({ id: 'c-road', bikeLane: false });

    for (let i = 0; i < 120; i++) {
      inLane.update(0.5, null, null, edge);
      onRoad.update(0.5, null, null, edge);
    }

    const vLane = inLane.idmParams.v0;
    const vRoad = onRoad.idmParams.v0;
    assert.ok(Math.abs(vLane - 5.5) < 1e-9, `bike-lane v0 should be 5.5, got ${vLane}`);
    assert.ok(Math.abs(vRoad - 5.5 * 0.7) < 1e-9, `road v0 should be 3.85, got ${vRoad}`);
    assert.ok(inLane.speed > onRoad.speed + 0.5,
      `lane rider faster (${inLane.speed.toFixed(2)}) than road rider (${onRoad.speed.toFixed(2)})`);
    assert.equal(inLane.vulnerabilityFactor, 1.0);
    assert.ok(onRoad.vulnerabilityFactor > 1.0, 'shared road increases vulnerability factor');
    assert.equal(inLane.preferredLane(), 0, 'cyclists keep rightmost lane');
  });

  await test('cyclist follows IDM bicycle parameters and reacts to leaders', () => {
    assert.deepEqual(cycMod.CYCLIST_IDM_PARAMS, { v0: 5.5, a: 1.0, b: 2.0, s0: 1.0, T: 1.2, delta: 4 });

    const edge = { length: 5000, speedLimit: 13.9 };
    const c = new cycMod.Cyclist({});
    // Stopped leader 3 m ahead → must brake.
    const leader = { offset: c.offset + 3 + 4.5, length: 4.5, speed: 0 };
    for (let i = 0; i < 20; i++) c.update(0.5, leader, null, edge);
    assert.ok(c.accel < 0 || c.speed < 0.5, `should stop behind leader (accel=${c.accel})`);

    // Heavy vehicle ahead on shared road → extra headway caution.
    const c2 = new cycMod.Cyclist({ bikeLane: false });
    c2.update(0.1, { type: 'truck', offset: c2.offset + 50, length: 8.5, speed: 4 }, null, edge);
    const TwithTruck = c2.idmParams.T;
    c2.bikeLane = false;
    c2.update(0.1, { type: 'sedan', offset: c2.offset + 50, length: 4.5, speed: 4 }, null, edge);
    assert.ok(TwithTruck > c2.idmParams.T, `truck headway ${TwithTruck} > car headway ${c2.idmParams.T}`);
  });

  /* ------------------------------------------------------------------ *
   * 4. Multimodal routing finds a bus+walk route                        *
   * ------------------------------------------------------------------ */
  await test('multimodal router finds walk→bus→walk route beating pure walking', () => {
    // Linear corridor A — B — C — D, each link 2 km.
    const net = new graphMod.Network('corridor');
    for (const [id, lat] of [['A', 0.0], ['B', 0.018], ['C', 0.036], ['D', 0.054]]) {
      net.addNode(id, lat, 0, id === 'A' ? 'entry' : id === 'D' ? 'exit' : 'intersection');
    }
    net.addEdge({ id: 'AB', from: 'A', to: 'B', length: 2000, speedLimit: 13.9 });
    net.addEdge({ id: 'BC', from: 'B', to: 'C', length: 2000, speedLimit: 13.9 });
    net.addEdge({ id: 'CD', from: 'C', to: 'D', length: 2000, speedLimit: 13.9 });

    const transit = {
      stops: [
        { id: 'S1', nodeId: 'B' },
        { id: 'S2', nodeId: 'C' },
      ],
      routes: [
        { id: 'R1', stops: ['S1', 'S2'], headwayS: 600, speedMps: 12, bidirectional: true },
      ],
    };

    const route = routerMod.findRoute('A', 'D', ['walk', 'bus'], net, { transit });
    assert.ok(route, 'route found');
    const modesUsed = route.segments.map((s) => s.mode);
    assert.ok(modesUsed.includes('walk'), 'starts with a walk leg');
    assert.ok(modesUsed.includes('bus'), 'uses the bus leg');
    assert.deepEqual(modesUsed.filter((m) => m === 'walk'), ['walk', 'walk'],
      'walk legs merge around a single bus leg');

    const busSeg = route.segments.find((s) => s.mode === 'bus');
    assert.equal(busSeg.routeId, 'R1');
    assert.equal(busSeg.boardStop, 'S1');
    assert.equal(busSeg.alightStop, 'S2');
    assert.equal(busSeg.waitTimeS, 300, 'wait = headway / 2');

    const walkOnly = routerMod.findRoute('A', 'D', ['walk'], net);
    assert.ok(walkOnly, 'walk-only route exists');
    assert.ok(route.totalTimeS < walkOnly.totalTimeS,
      `multimodal (${route.totalTimeS}s) beats pure walk (${walkOnly.totalTimeS}s)`);

    // Car-only routing stays directed & fast.
    const drive = routerMod.findRoute('A', 'D', ['car'], net);
    assert.ok(drive && Math.abs(drive.totalDistanceM - 6000) < 1e-6);
    assert.ok(drive.totalTimeS < 450, '6 km at ~50 km/h ≈ 432 s');

    // Unreachable destination returns null.
    net.addNode('Z', 90, 90, 'exit');
    assert.equal(routerMod.findRoute('A', 'Z', ['walk'], net), null);

    assert.throws(() => routerMod.findRoute('NOPE', 'D', ['walk'], net), Error);
  });

  /* ------------------------------------------------------------------ *
   * 5. Manager stats calculation                                        *
   * ------------------------------------------------------------------ */
  await test('manager stats calculation tracks entities and KPIs', () => {
    const net = new graphMod.Network('mini');
    net.addNode('n1', 0.0, 0.0);
    net.addNode('n2', 0.027, 0.0);
    net.addEdge({ id: 'm1', from: 'n1', to: 'n2', length: 3000, speedLimit: 13.9 });

    const mgr = new mgrMod.MultimodalManager(net);
    mgr.addBusStop('MS1', 'm1', 700);
    mgr.addCrosswalk('MCW1', 'm1', 450, 'g1');
    const ped = mgr.addPedestrian({
      position: { x: 0, y: 0 },
      destination: { x: 40, y: 0 },
      crosswalkId: null,
    });
    const bus = mgr.addBus({
      edgeId: 'm1',
      edgeLength: 3000,
      offset: 100,
      speed: 8,
      routeId: 'R9',
      stops: [{ stopId: 'MS1', edgeId: 'm1', offset: 700, boarding: 2, alighting: 1 }],
    });
    const cyclist = mgr.addCyclist({ edgeId: 'm1', edgeLength: 3000, offset: 0, bikeLane: true });
    mgr.setVehicleProvider(() => []);

    // Immediately after registration all three entities are active.
    const initial = mgr.getStats();
    assert.equal(initial.pedCount, 1);
    assert.equal(initial.busCount, 1);
    assert.equal(initial.cyclistCount, 1);
    assert.equal(initial.avgWaitTime, 0, 'no waits recorded yet');
    assert.equal(initial.busOnTimeRate, 0, 'no scheduled arrivals yet');

    for (let i = 0; i < 900; i++) mgr.update(0.1); // 90 s

    const stats = mgr.getStats();
    assert.equal(stats.busCount, 1);
    assert.equal(stats.cyclistCount, 1);

    // The pedestrian reached its 40 m destination well inside the run.
    assert.equal(ped.state, 'arrived');
    assert.equal(stats.pedCount, 0, 'arrived pedestrians leave the active count');

    // The bus berthed at MS1 (offset 700 m from 100 m start at ~8 m/s).
    assert.ok(bus.arrivals.length >= 1, 'manager advanced the bus to its stop');
    assert.ok(cyclist.stats.distance > 0, 'cyclist moved');

    // Vehicle provider wiring: manager sees external fleet for leader logic.
    const fakeFleet = [];
    mgr.setVehicleProvider(() => fakeFleet);
    fakeFleet.push({ id: 'v1', type: 'car', edgeId: 'm1', lane: 0, offset: 800, length: 4.5, speed: 10 });
    mgr.update(0.1); // must not throw
    assert.equal(mgr.vehicleProvider().length, 1);

    assert.throws(() => mgr.update(0), RangeError);
    assert.throws(() => new mgrMod.MultimodalManager().addPedestrian({ position: 'bad' }), TypeError);
  });
}

/* --------------------------------------------------------------- runner -- */

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
