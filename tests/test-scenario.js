'use strict';
// SAE AutoSim Hub — Scenario persistence/fork/diff tests.
// Run with: node tests/test-scenario.js
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

/** Isolated in-memory Storage backend (keeps Node runs quiet and hermetic). */
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    _map: map,
  };
}

async function run() {
  console.log('\n=== tests/test-scenario.js — scenario manager ===');

  ({ Network } = await import('../sim-engine/network/graph.js'));
  const { ScenarioManager, SCENARIO_STORAGE_KEY } =
    await import('../sim-engine/scenario/manager.js');

  await test('create + save + load round-trips a scenario', () => {
    const mgr = new ScenarioManager({ storage: makeStorage() });
    const sc = mgr.create('Base Scenario', { nodes: [], edges: [] }, { dt: 1, seed: 42 });
    assert.ok(sc.id.startsWith('base-scenario-'), `slug-based id expected, got ${sc.id}`);
    assert.strictEqual(sc.version, 1);
    assert.strictEqual(sc.forkedFrom, null);
    assert.strictEqual(sc.config.seed, 42);

    mgr.save(sc);
    const loaded = mgr.load(sc.id);
    assert.ok(loaded, 'scenario should be persisted');
    assert.strictEqual(loaded.name, 'Base Scenario');
    assert.strictEqual(loaded.config.dt, 1);
    assert.deepEqual(loaded.config, { dt: 1, seed: 42 });
    // Loading returns a detached clone — mutating it must not corrupt storage.
    loaded.config.dt = 99;
    assert.strictEqual(mgr.load(sc.id).config.dt, 1);

    assert.strictEqual(mgr.load('does-not-exist'), null);
    assert.throws(() => mgr.create('', null), TypeError);

    const net = new Network('n');
    net.addNode('A', 30, 31);
    const withNet = mgr.create('With Net', net, {});
    assert.ok(withNet.network.nodes.length === 1, 'Network instances are serialised via toJSON()');
  });

  await test('list shows every stored scenario', () => {
    const mgr = new ScenarioManager({ storage: makeStorage() });
    for (const name of ['alpha', 'beta', 'gamma']) {
      mgr.save(mgr.create(name, { nodes: [{ id: 'A' }], edges: [{ id: 'e' }] }));
    }
    const list = mgr.list();
    assert.strictEqual(list.length, 3);
    const names = list.map((s) => s.name).sort();
    assert.deepEqual(names, ['alpha', 'beta', 'gamma']);
    for (const entry of list) {
      assert.ok(entry.id && typeof entry.version === 'number');
      assert.strictEqual(entry.nodes, 1); // summary counts from the network payload
      assert.strictEqual(entry.edges, 1);
    }
  });

  await test('fork creates an independent bumped version linked to its parent', () => {
    const mgr = new ScenarioManager({ storage: makeStorage() });
    const parent = mgr.create('Corridor', { nodes: [], edges: [] }, { dt: 0.5, seed: 7 });
    mgr.save(parent);

    const fork = mgr.fork(parent.id, 'Corridor Tuned');
    assert.notStrictEqual(fork.id, parent.id);
    assert.strictEqual(fork.version, 2);
    assert.strictEqual(fork.forkedFrom, parent.id);
    assert.strictEqual(fork.name, 'Corridor Tuned');
    assert.deepEqual(fork.config, parent.config, 'fork starts as a copy of the parent');

    fork.config.dt = 1; // mutate the fork freely
    mgr.save(fork);
    assert.strictEqual(mgr.load(parent.id).config.dt, 0.5, 'parent untouched');
    assert.strictEqual(mgr.load(fork.id).config.dt, 1);

    // Forking the fork increments further.
    const fork2 = mgr.fork(fork.id);
    assert.strictEqual(fork2.version, 3);
    assert.ok(fork2.name.includes('v3'));

    assert.throws(() => mgr.fork('missing-id'), /not found/);
  });

  await test('diff reports changed/added/removed config keys', () => {
    const mgr = new ScenarioManager({ storage: makeStorage() });
    const base = mgr.create(
      'Base',
      { nodes: [], edges: [] },
      { dt: 1, seed: 42, signals: { J1: { green: 30 } } },
    );
    mgr.save(base);

    const variant = mgr.fork(base.id, 'Variant');
    variant.config = { dt: 2, seed: 42, signals: { J1: { green: 45 } }, extra: true };
    mgr.save(variant);

    const d = mgr.diff(base.id, variant.id);
    assert.deepEqual(d.changed.dt, [1, 2]);
    assert.deepEqual(d.changed['signals.J1.green'], [30, 45]);
    assert.strictEqual(d.added.extra, true);
    assert.strictEqual(Object.keys(d.removed).length, 0);
    assert.ok(d.unchangedKeys >= 1); // seed

    // Reverse direction flags a removal.
    const reverse = mgr.diff(variant.id, base.id);
    assert.strictEqual(reverse.removed.extra, true);
    assert.strictEqual(reverse.added.extra, undefined);

    // Accepts scenario objects as well as ids.
    const byObject = mgr.diff(base, mgr.load(variant.id));
    assert.ok(byObject.changed.dt);

    assert.throws(() => mgr.diff(base.id, 'ghost'), /not found/);
    assert.strictEqual(SCENARIO_STORAGE_KEY.length > 0, true);
  });

  await test('delete removes scenarios from storage', () => {
    const mgr = new ScenarioManager({ storage: makeStorage() });
    const a = mgr.create('one', null);
    const b = mgr.create('two', null);
    mgr.save(a);
    mgr.save(b);

    assert.strictEqual(mgr.delete(a.id), true);
    assert.strictEqual(mgr.load(a.id), null);
    assert.strictEqual(mgr.list().length, 1);
    assert.strictEqual(mgr.list()[0].name, 'two');
    assert.strictEqual(mgr.delete(a.id), false, 'deleting twice reports no-op');
    assert.strictEqual(mgr.delete(123), false, 'non-string ids are rejected');

    // Corrupt payloads are quarantined instead of crashing reads.
    const store = makeStorage();
    store.setItem(SCENARIO_STORAGE_KEY, '{not json');
    const resilient = new ScenarioManager({ storage: store });
    assert.deepEqual(resilient.list(), []);
    assert.ok(typeof store.getItem(`${SCENARIO_STORAGE_KEY}-corrupt`) === 'string');
  });

  console.log(`\n--- test-scenario summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
