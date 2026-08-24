'use strict';
// SAE AutoSim Hub — KPI collector tests.
// Run with: node tests/test-kpi.js
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

function veh(edgeId, offset, speed, lane = 0) {
  return { id: `v-${edgeId}-${offset}`, type: 'sedan', edgeId, lane, offset, length: 4.5, speed };
}

async function run() {
  console.log('\n=== tests/test-kpi.js — KPI computation ===');

  const { computeKPIs, losFromDelay, LOS_THRESHOLDS, QUEUE_SPEED } =
    await import('../sim-engine/kpi/collector.js');

  await test('empty inputs produce zeroed KPIs', () => {
    const k = computeKPIs([], []);
    assert.strictEqual(k.vehicleCount, 0);
    assert.strictEqual(k.avgSpeed, 0);
    assert.strictEqual(k.flow, 0);
    assert.strictEqual(k.density, 0);
    assert.strictEqual(k.vcRatio, 0);
    assert.strictEqual(k.maxQueue, 0);
    assert.ok(k.perEdge && Object.keys(k.perEdge).length === 0);
  });

  await test('losFromDelay grades arterial/highway thresholds correctly', () => {
    // Arterial: <10 A, <20 B, <35 C, <50 D, <70 E, ≥70 F.
    assert.strictEqual(losFromDelay(0), 'A');
    assert.strictEqual(losFromDelay(9), 'A');
    assert.strictEqual(losFromDelay(10), 'B');
    assert.strictEqual(losFromDelay(20), 'C');
    assert.strictEqual(losFromDelay(35), 'D');
    assert.strictEqual(losFromDelay(69.9), 'E');
    assert.strictEqual(losFromDelay(70), 'F');
    assert.strictEqual(losFromDelay(500), 'F');
    // Highway bands are tighter.
    assert.strictEqual(losFromDelay(4.9, 'highway'), 'A');
    assert.strictEqual(losFromDelay(5, 'highway'), 'B');
    assert.strictEqual(losFromDelay(25, 'highway'), 'F');
    // Other classes resolve too.
    assert.strictEqual(losFromDelay(12, 'collector'), 'B');
    assert.strictEqual(losFromDelay(15, 'residential'), 'B');
    // Tables are well-formed: strictly increasing maxDelay ending at Infinity.
    for (const [cls, rows] of Object.entries(LOS_THRESHOLDS)) {
      assert.strictEqual(rows.length, 6, `${cls} needs 6 rows`);
      assert.strictEqual(rows[rows.length - 1].los, 'F');
      for (let i = 1; i < rows.length; i++) {
        assert.ok(rows[i].maxDelay > rows[i - 1].maxDelay, `${cls} thresholds must increase`);
      }
    }
    // Queue threshold constant sanity.
    assert.strictEqual(QUEUE_SPEED, 0.6);
  });

  await test('V/C ratio computed against saturation flow', () => {
    const vms = 50 / 3.6; // 50 km/h in m/s
    // 18 vehicles on a 1 km single-lane edge at 50 km/h:
    // density 18 veh/km × 50 km/h = 900 veh/h; capacity 1800 veh/h → V/C = 0.5.
    const vehicles = Array.from({ length: 18 }, (_, i) => veh('E', i * 40 + 10, vms));
    const edges = [{ id: 'E', length: 1000, lanes: 1 }];
    const k = computeKPIs(vehicles, edges);
    assert.strictEqual(k.perEdge.E.count, 18);
    assert.ok(Math.abs(k.perEdge.E.vc - 0.5) < 0.001, `per-edge V/C expected ~0.5, got ${k.perEdge.E.vc}`);
    assert.ok(Math.abs(k.vcRatio - 0.5) < 0.001, `network V/C expected ~0.5, got ${k.vcRatio}`);
    assert.strictEqual(k.maxVC, k.perEdge.E.vc);
  });

  await test('average speed aggregates across vehicles in km/h', () => {
    const edges = [{ id: 'E', length: 1000, lanes: 1 }];
    const vehicles = [veh('E', 10, 10), veh('E', 500, 20)]; // avg 15 m/s = 54 km/h
    const k = computeKPIs(vehicles, edges);
    assert.strictEqual(k.avgSpeed, 54);
    assert.strictEqual(k.avgSpeedMS, 15);
    assert.strictEqual(k.vehicleCount, 2);
    assert.strictEqual(k.perEdge.E.speed, 54);
  });

  await test('queue detection counts contiguous stopped vehicles from the front', () => {
    const edges = [{ id: 'Q', length: 200, lanes: 1 }];
    // Three stopped cars nose-to-tail near the stop line, one free-flowing car behind.
    const vehicles = [
      veh('Q', 195, 0),
      veh('Q', 190, 0),
      veh('Q', 185, QUEUE_SPEED - 0.1),
      veh('Q', 100, 8), // moving → ends the queue count
    ];
    let k = computeKPIs(vehicles, edges);
    assert.strictEqual(k.maxQueue, 3);
    assert.strictEqual(k.perEdge.Q.queue, 3);

    // All moving → no queue anywhere.
    k = computeKPIs([veh('Q', 195, 5), veh('Q', 190, 6)], edges);
    assert.strictEqual(k.maxQueue, 0);

    // Queues are per-lane: a stopped car in lane 1 counts separately.
    const multiLane = [{ id: 'M', length: 200, lanes: 2 }];
    k = computeKPIs([veh('M', 195, 0, 0), veh('M', 190, 0, 0), veh('M', 193, 0, 1)], multiLane);
    assert.strictEqual(k.perEdge.M.queue, 2); // longest queue wins (lane 0)
  });

  console.log(`\n--- test-kpi summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
