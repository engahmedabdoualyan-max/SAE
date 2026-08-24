'use strict';
// SAE AutoSim Hub — IDM unit tests.
// Run with: node tests/test-idm.js
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
  console.log('\n=== tests/test-idm.js — Intelligent Driver Model ===');

  const { idmAcceleration, DEFAULT_IDM_PARAMS, IDM_PARAMS_BY_TYPE } =
    await import('../sim-engine/models/idm.js');

  const A = DEFAULT_IDM_PARAMS.a; // 1.4 m/s^2

  await test('idmAcceleration with zero speed → positive (vehicle starts)', () => {
    const acc = idmAcceleration(0, Infinity, 0);
    assert.ok(acc > 0, `expected positive acceleration from standstill, got ${acc}`);
    assert.ok(Math.abs(acc - A) < 1e-9, `free-road start should equal max accel ${A}, got ${acc}`);
  });

  await test('idmAcceleration with large gap at desired speed ≈ 0', () => {
    const v0 = DEFAULT_IDM_PARAMS.v0;
    const acc = idmAcceleration(v0, 1000, 0);
    assert.ok(
      Math.abs(acc) < 0.05,
      `at desired speed on a free road acceleration should be ~0, got ${acc}`,
    );
  });

  await test('idmAcceleration with very small gap → large negative (emergency braking)', () => {
    const acc = idmAcceleration(20, 0.5, 5);
    assert.ok(acc <= -6, `expected hard braking (<= -6 m/s^2), got ${acc}`);
  });

  await test('idmAcceleration approaching a slower leader decelerates', () => {
    // Follower at 25 m/s, leader 15 m ahead moving at 10 m/s.
    const acc = idmAcceleration(25, 15, 15);
    assert.ok(acc < 0, `expected deceleration when closing on slower leader, got ${acc}`);
  });

  await test('all parameter presets exist for each vehicle type', () => {
    const types = ['sedan', 'bus', 'truck', 'motorcycle', 'tuktuk', 'bicycle', 'av'];
    for (const type of types) {
      const p = IDM_PARAMS_BY_TYPE[type];
      assert.ok(p, `missing preset for "${type}"`);
      for (const key of ['v0', 's0', 'T', 'a', 'b', 'delta']) {
        assert.ok(
          Number.isFinite(p[key]) && p[key] > 0,
          `preset "${type}" has invalid ${key}=${p[key]}`,
        );
      }
    }
    // Defaults must match the sedan preset.
    for (const key of Object.keys(DEFAULT_IDM_PARAMS)) {
      assert.strictEqual(DEFAULT_IDM_PARAMS[key], IDM_PARAMS_BY_TYPE.sedan[key]);
    }
  });

  await test('negative acceleration when speed exceeds desired speed', () => {
    const acc = idmAcceleration(50, Infinity, 0); // v0 default is 33.3
    assert.ok(acc < 0, `overspeeding must brake, got ${acc}`);
  });

  await test('output is always a finite number (no NaN/Infinity)', () => {
    const speeds = [0, 0.1, 5, 15, 33.3, 45];
    const gaps = [Infinity, 500, 50, 10, 2, 0.01];
    const dvValues = [-10, -1, 0, 1, 10];
    for (const type of [undefined, ...Object.keys(IDM_PARAMS_BY_TYPE)]) {
      for (const v of speeds) {
        for (const s of gaps) {
          for (const dv of dvValues) {
            const acc = idmAcceleration(v, s, dv, type ? IDM_PARAMS_BY_TYPE[type] : undefined);
            assert.ok(Number.isFinite(acc), `non-finite accel for v=${v} s=${s} dv=${dv} type=${type}: ${acc}`);
            assert.ok(acc >= -8.000000001 && acc <= 3, `accel out of plausible range: ${acc}`);
          }
        }
      }
    }
  });

  console.log(`\n--- test-idm summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
