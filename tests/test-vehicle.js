'use strict';
// SAE AutoSim Hub — Vehicle agent unit tests.
// Run with: node tests/test-vehicle.js
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
  console.log('\n=== tests/test-vehicle.js — Vehicle dynamics ===');

  const { Vehicle, TYPE_SPECS } = await import('../sim-engine/models/vehicle.js');
  const { DEFAULT_IDM_PARAMS, IDM_PARAMS_BY_TYPE } = await import('../sim-engine/models/idm.js');

  await test('vehicle creation applies correct defaults', () => {
    const v = new Vehicle();
    assert.strictEqual(v.type, 'sedan');
    assert.strictEqual(v.length, TYPE_SPECS.sedan.length);
    assert.strictEqual(v.width, TYPE_SPECS.sedan.width);
    assert.strictEqual(v.speed, 0);
    assert.strictEqual(v.offset, 0);
    assert.strictEqual(v.lane, 0);
    assert.strictEqual(v.accel, 0);
    assert.strictEqual(v.exited, false);
    assert.ok(typeof v.id === 'string' && v.id.length > 0, 'auto id expected');
    assert.deepEqual(v.idmParams, { ...DEFAULT_IDM_PARAMS });
    // AV defaults to AV behaviour and params.
    const av = new Vehicle({ type: 'av' });
    assert.strictEqual(av.isAV, true);
    assert.strictEqual(av.idmParams.T, IDM_PARAMS_BY_TYPE.av.T);
    // Invalid configs rejected.
    assert.throws(() => new Vehicle(null), TypeError);
  });

  await test('vehicle update with no leader accelerates', () => {
    const v = new Vehicle({ speed: 0 });
    v.update(1); // dt = 1 s
    assert.ok(v.accel > 0, `expected positive accel, got ${v.accel}`);
    assert.ok(v.speed > 0, `expected speed to increase, got ${v.speed}`);
    const after5 = new Vehicle({ speed: 0 });
    for (let i = 0; i < 5; i++) after5.update(1);
    assert.ok(after5.speed > v.speed, 'speed should keep increasing over free road steps');
  });

  await test('vehicle update with a leader ahead adjusts its speed', () => {
    // Follower at 20 m/s, slow leader 45 m in front.
    const follower = new Vehicle({ speed: 20, offset: 10, edgeLength: 500 });
    const leader = { id: 'leader', offset: 60, length: 4.5, speed: 2 };

    const free = new Vehicle({ speed: 20, offset: 10, edgeLength: 500 });
    const freeAccel = free.computeAccel(0.5, null);
    const constrainedAccel = follower.computeAccel(0.5, leader);
    assert.ok(
      constrainedAccel < freeAccel,
      `constrained accel ${constrainedAccel} should be below free-road accel ${freeAccel}`,
    );

    // Simulate a few seconds: the follower must not collide.
    let gap = leader.offset - leader.length - follower.offset;
    for (let i = 0; i < 60 && follower.speed > leader.speed + 0.5; i++) {
      follower.computeAccel(0.5, leader);
      follower.applyMove(0.5);
      gap = leader.offset - leader.length - follower.offset;
      assert.ok(gap > -0.01, `collision! gap=${gap} at step ${i}`);
    }
    // Eventually matches leader speed instead of ramming through.
    assert.ok(follower.speed <= 3, `follower should match leader speed, got ${follower.speed}`);
    assert.ok(gap > 0.05, `still clear of leader, gap=${gap}`);
  });

  await test('vehicle position advances along the edge', () => {
    const v = new Vehicle({ speed: 10, offset: 0, edgeLength: 200 });
    const before = v.offset;
    v.update(1);
    assert.ok(v.offset > before, `offset should advance, got ${v.offset}`);
    assert.ok(v.stats.distance > 0);
    // Distance travelled ≈ integral of speed (single step: v*dt).
    assert.ok(Math.abs((v.offset - before) - v.speed * 1) < 1.5);
    assert.strictEqual(v.pendingAdvance, false);
  });

  await test('vehicle at end of edge moves to the next route edge', () => {
    const v = new Vehicle({
      speed: 20,
      offset: 90,
      edgeLength: 100,
      route: ['e1', 'e2'],
      routeIndex: 0,
    });
    assert.strictEqual(v.nextEdgeId, 'e2');
    v.applyMove(1); // travels 20 m → passes the end of e1
    assert.strictEqual(v.pendingAdvance, true);

    const nextEdge = { id: 'e2', length: 150 };
    v.advanceToNextEdge(nextEdge);
    assert.strictEqual(v.edgeId, 'e2');
    assert.strictEqual(v.routeIndex, 1);
    assert.strictEqual(v.edgeLength, 150);
    assert.ok(v.offset >= 0 && v.offset <= nextEdge.length - v.length, `overshoot carried over sanely (${v.offset})`);
    assert.strictEqual(v.pendingAdvance, false);

    // Route exhausted → the vehicle exits.
    v.offset = 149;
    v.speed = 5;
    v.applyMove(1);
    assert.strictEqual(v.pendingAdvance, true);
    v.advanceToNextEdge(null);
    assert.strictEqual(v.exited, true);
    assert.strictEqual(v.pendingAdvance, false);
  });

  await test('vehicle type presets expose correct dimensions', () => {
    const types = ['sedan', 'bus', 'truck', 'motorcycle', 'tuktuk', 'bicycle', 'av'];
    for (const type of types) {
      const spec = TYPE_SPECS[type];
      assert.ok(spec, `missing TYPE_SPECS entry for "${type}"`);
      assert.ok(spec.length > 0 && spec.width > 0);
      const veh = new Vehicle({ type });
      assert.strictEqual(veh.length, spec.length);
      assert.strictEqual(veh.width, spec.width);
    }
    assert.strictEqual(TYPE_SPECS.bus.length, 12.0);
    assert.strictEqual(TYPE_SPECS.bicycle.length, 1.8);
    assert.strictEqual(TYPE_SPECS.motorcycle.width, 0.8);
    // Buses use gentler acceleration than sedans.
    assert.ok(IDM_PARAMS_BY_TYPE.bus.a < IDM_PARAMS_BY_TYPE.sedan.a);
  });

  console.log(`\n--- test-vehicle summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
  return results;
}

if (require.main === module) {
  run().then((r) => {
    process.exitCode = r.failed > 0 ? 1 : 0;
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { __run: run };
