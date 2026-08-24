'use strict';
// SAE AutoSim Hub — Network graph unit tests.
// Run with: node tests/test-network.js
// Uses only the Node built-in assert module.

const assert = require('node:assert/strict');

/** Populated at the top of run(). */
let Network;
let haversineM;

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

/** Diamond network:
 *        e1(100)      e2(300)
 *     A ------> B   A ------> C
 *        e3(100)      e4(100)
 *     B ------> D   C ------> D
 */
function makeDiamond() {
  const net = new Network('diamond');
  net.addNode('A', 30.0, 31.0);
  net.addNode('B', 30.001, 31.0);
  net.addNode('C', 30.0, 31.003);
  net.addNode('D', 30.001, 31.003);
  net.addEdge({ id: 'e1', from: 'A', to: 'B', length: 100 });
  net.addEdge({ id: 'e2', from: 'A', to: 'C', length: 300 });
  net.addEdge({ id: 'e3', from: 'B', to: 'D', length: 100 });
  net.addEdge({ id: 'e4', from: 'C', to: 'D', length: 100 });
  return net;
}

async function run() {
  console.log('\n=== tests/test-network.js — Network graph ===');

  ({ Network, haversineM } = await import('../sim-engine/network/graph.js'));

  await test('addNode / getNode works', () => {
    const net = new Network();
    const n = net.addNode('A', 30.05, 31.23, 'intersection');
    assert.strictEqual(n.id, 'A');
    assert.strictEqual(n.lat, 30.05);
    assert.strictEqual(n.lng, 31.23);
    const fetched = net.getNode('A');
    assert.ok(fetched === n);
    // Duplicate ids are rejected.
    assert.throws(() => net.addNode('A', 0, 0), /duplicate/);
    // Unknown ids throw.
    assert.throws(() => net.getNode('nope'), /unknown node/);
  });

  await test('addEdge / getEdge works', () => {
    const net = new Network();
    net.addNode('A', 30.0, 31.0);
    net.addNode('B', 30.001, 31.0);
    net.addEdge({ id: 'e1', from: 'A', to: 'B', length: 111, lanes: 2, speedLimit: 20 });
    const e = net.getEdge('e1');
    assert.ok(e, 'edge should be stored');
    assert.strictEqual(e.from, 'A');
    assert.strictEqual(e.to, 'B');
    assert.strictEqual(e.length, 111);
    assert.strictEqual(e.laneCount, 2);
    assert.strictEqual(net.getEdge('missing'), null);
    assert.throws(() => net.addEdge({ id: 'bad', from: 'A', to: 'X', length: 10 }), /unknown node/);
  });

  await test('getOutgoingEdges returns correct edges', () => {
    const net = makeDiamond();
    const outIds = net.getOutgoingEdges('A').map((e) => e.id).sort();
    assert.deepEqual(outIds, ['e1', 'e2']);
    const inIds = net.getIncomingEdges('D').map((e) => e.id).sort();
    assert.deepEqual(inIds, ['e3', 'e4']);
    assert.deepEqual(net.getOutgoingEdges('D').map((e) => e.id), []);
  });

  await test('findRoute finds the shortest path (Dijkstra)', () => {
    const net = makeDiamond();
    // A→D via B costs 200; via C costs 400.
    const route = net.findRoute('A', 'D');
    assert.deepEqual(route, ['e1', 'e3']);
    // Time-weighted routing also resolves.
    const byTime = net.findRoute('A', 'D', { weightBy: 'time' });
    assert.ok(Array.isArray(byTime) && byTime.length >= 2);
    // Route from an edge id prepends that edge.
    const fromEdge = net.findRoute('e1', 'D');
    assert.deepEqual(fromEdge, ['e1', 'e3']);
  });

  await test('findRoute with no path returns null', () => {
    const net = makeDiamond();
    net.addNode('Z', 40.0, 32.0); // isolated
    assert.strictEqual(net.findRoute('A', 'Z'), null);
    assert.strictEqual(net.findRoute('Z', 'A'), null);
  });

  await test('two-way road creates edges in both directions', () => {
    const net = new Network();
    net.addNode('A', 30.0, 31.0);
    net.addNode('B', 30.001, 31.0);
    const fwd = net.addEdge({ id: 'r1', from: 'A', to: 'B', length: 120, bidirectional: true });
    assert.strictEqual(fwd.from, 'A');
    const rev = net.getEdge('r1-r');
    assert.ok(rev, 'reverse edge auto-created');
    assert.strictEqual(rev.from, 'B');
    assert.strictEqual(rev.to, 'A');
    assert.strictEqual(rev.laneCount, fwd.laneCount);
    assert.deepEqual(
      net.getOutgoingEdges('B').map((e) => e.id),
      ['r1-r'],
    );
  });

  await test('getEdgeLength returns the correct distance', () => {
    const net = new Network();
    net.addNode('A', 30.0, 31.0);
    net.addNode('B', 30.01, 31.0); // ~1112 m north
    net.addEdge({ id: 'explicit', from: 'A', to: 'B', length: 999 });
    assert.strictEqual(net.getEdgeLength('explicit'), 999);

    net.addEdge({ id: 'computed', from: 'A', to: 'B' }); // length from coords
    const expected = haversineM(30.0, 31.0, 30.01, 31.0);
    const got = net.getEdgeLength('computed');
    assert.ok(Math.abs(got - expected) / expected < 0.02, `computed length ${got} vs haversine ${expected}`);
  });

  await test('complex network (diamond + loop) has correct connectivity and routing', () => {
    const net = makeDiamond();
    net.addEdge({ id: 'loop1', from: 'D', to: 'A', length: 50 }); // closes a loop D→A

    assert.strictEqual(net.stats().nodes, 4);
    // 4 diamond edges + reverse of nothing (diamond is one-way) + loop.
    assert.strictEqual(net.stats().edges, 5);

    // Loop connectivity: from D you can reach everything again.
    assert.deepEqual(net.findRoute('D', 'B'), ['loop1', 'e1']);
    assert.ok(net.findRoute('C', 'B')); // C→D→A→B around the loop
    // Self-loop-safe: routing ignores degenerate zero-length loops but real
    // cycles terminate because Dijkstra marks nodes done.
    assert.deepEqual(net.findRoute('A', 'A'), []);

    // Out-degrees reflect the loop.
    assert.deepEqual(
      net.getOutgoingEdges('D').map((e) => e.id).sort(),
      ['loop1'],
    );

    // Round-trip through JSON preserves connectivity.
    const clone = Network.fromJSON(JSON.parse(JSON.stringify(net.toJSON())));
    assert.strictEqual(clone.stats().nodes, net.stats().nodes);
    assert.strictEqual(clone.stats().edges, net.stats().edges);
    assert.deepEqual(clone.findRoute('A', 'D'), ['e1', 'e3']);
  });

  console.log(`\n--- test-network summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
