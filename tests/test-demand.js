'use strict';
// SAE AutoSim Hub — Demand generation & routing tests.
// Run with: node tests/test-demand.js
// Uses only the Node built-in assert module.

const assert = require('node:assert/strict');

/** Populated at the top of run(). */
let Network;

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

/** Deterministic RNG so counts are stable across runs. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLinearNetwork() {
  const net = new Network('linear');
  net.addNode('A', 30.0, 31.0);
  net.addNode('B', 30.001, 31.0);
  net.addNode('C', 30.002, 31.0);
  net.addEdge({ id: 'e1', from: 'A', to: 'B', length: 100 });
  net.addEdge({ id: 'e2', from: 'B', to: 'C', length: 150 });
  return net;
}

async function run() {
  console.log('\n=== tests/test-demand.js — OD demand generation ===');

  ({ Network } = await import('../sim-engine/network/graph.js'));
  const { generateDemand, routeDemand } = await import('../sim-engine/demand/odMatrix.js');

  await test('generates the correct number of vehicles for a flow rate', () => {
    const net = makeLinearNetwork();
    // flow 360 veh/h over exactly one hour → expectation 360 vehicles.
    const demand = generateDemand(
      [{ from: 'A', to: 'C', flow: 360, type: 'sedan' }],
      net, 0, 3600, 1.0, mulberry32(42),
    );
    assert.ok(
      demand.length >= 280 && demand.length <= 440,
      `expected ~360 vehicles (±2σ), got ${demand.length}`,
    );
  });

  await test('departure times are within the time window and sorted', () => {
    const net = makeLinearNetwork();
    const demand = generateDemand(
      [{ from: 'A', to: 'C', flow: 720 }],
      net, 100, 3700, 1.0, mulberry32(7),
    );
    assert.ok(demand.length > 0, 'should generate some departures');
    let sorted = true;
    for (let i = 1; i < demand.length; i++) {
      if (demand[i].departTime < demand[i - 1].departTime) sorted = false;
    }
    assert.ok(sorted, 'departures must be sorted ascending');
    for (const d of demand) {
      assert.ok(d.departTime >= 100 && d.departTime < 3700, `departure ${d.departTime} outside window`);
    }
    // Every item carries ids and defaults.
    for (const d of demand) {
      assert.strictEqual(d.origin, 'A');
      assert.strictEqual(d.dest, 'C');
      assert.strictEqual(d.type, 'sedan'); // default type
      assert.ok(d.id);
    }
  });

  await test('routeDemand resolves each departure to a connected edge path', () => {
    const net = makeLinearNetwork();
    const demand = generateDemand(
      [{ from: 'A', to: 'C', flow: 600 }],
      net, 0, 3600, 1.0, mulberry32(99),
    );
    const routed = routeDemand(demand, net);
    assert.strictEqual(routed.length, demand.length, 'every departure should route');
    for (const r of routed) {
      assert.ok(Array.isArray(r.route) && r.route.length === 2, `expected 2-edge route, got ${JSON.stringify(r.route)}`);
      assert.strictEqual(r.route[0], 'e1');
      // Edges must connect end-to-start.
      for (let i = 1; i < r.route.length; i++) {
        const prev = net.getEdge(r.route[i - 1]);
        const cur = net.getEdge(r.route[i]);
        assert.strictEqual(prev.to, cur.from, `route breaks between ${prev.id} and ${cur.id}`);
      }
    }
    // Unroutable pairs are skipped and reported via onError.
    const errors = [];
    const bad = routeDemand([{ origin: 'A', dest: 'Z', departTime: 1 }], net, {
      onError: (id, msg) => errors.push([id, msg]),
    });
    assert.strictEqual(bad.length, 0);
    assert.strictEqual(errors.length, 1);
  });

  await test('vehicle types are preserved through generation and routing', () => {
    const net = makeLinearNetwork();
    const od = [
      { from: 'A', to: 'C', flow: 300, type: 'sedan' },
      { from: 'A', to: 'C', flow: 120, type: 'bus' },
      { from: 'A', to: 'C', flow: 60, type: 'bicycle' },
    ];
    const routed = routeDemand(generateDemand(od, net, 0, 3600, 1.0, mulberry32(3)), net);
    const byType = { sedan: 0, bus: 0, bicycle: 0 };
    for (const r of routed) byType[r.type] += 1;
    assert.ok(byType.sedan > 0 && byType.bus > 0 && byType.bicycle > 0,
      `all three types should appear, got ${JSON.stringify(byType)}`);
    // Relative magnitudes follow the flows.
    assert.ok(byType.sedan > byType.bus, 'sedan count should exceed bus count');
    assert.ok(byType.bus > byType.bicycle, 'bus count should exceed bicycle count');
  });

  await test('flow=100 veh/h produces roughly 100 vehicles in one hour', () => {
    const net = makeLinearNetwork();
    const demand = generateDemand(
      [{ from: 'A', to: 'C', flow: 100 }],
      net, 0, 3600, 1.0, mulberry32(123),
    );
    assert.ok(
      demand.length >= 70 && demand.length <= 130,
      `expected ~100 vehicles (±30), got ${demand.length}`,
    );
  });

  console.log(`\n--- test-demand summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
