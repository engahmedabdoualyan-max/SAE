'use strict';
// SAE AutoSim Hub — Calibration statistics & IDM fitting tests.
// Run with: node tests/test-calibration.js
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
  console.log('\n=== tests/test-calibration.js — GEH / RMSE / R² / IDM calibration ===');

  const { geh, gehAcceptanceRatio, rmse, r2 } = await import('../sim-engine/calibration/index.js');
  const { calibrateIdmParams, idmMse } = await import('../sim-engine/calibration/index.js');
  const { idmAcceleration } = await import('../sim-engine/models/idm.js');

  await test('GEH of identical flows is exactly zero', () => {
    assert.strictEqual(geh(100, 100), 0);
    assert.strictEqual(geh(0, 0), 0);
    assert.strictEqual(geh(12345, 12345), 0);
  });

  await test('GEH below 5 for a ~20% flow deviation', () => {
    const value = geh(100, 120); // sqrt(2·400/220) ≈ 1.91
    assert.ok(value > 1.5 && value < 2.3, `GEH(100,120) expected ≈1.9, got ${value}`);
    assert.ok(value < 5, 'a 20% deviation at this volume must pass the GEH<5 criterion');
  });

  await test('GEH above 5 for a large (100%) flow mismatch', () => {
    const value = geh(100, 200); // sqrt(2·10000/300) ≈ 8.16
    assert.ok(value > 7 && value < 9.5, `GEH(100,200) expected ≈8.16, got ${value}`);
    assert.ok(value >= 5, 'a doubling of flow must fail the GEH criterion');
    // Acceptance ratio over a mixed link set.
    const ratio = gehAcceptanceRatio([[100, 102], [50, 49], [100, 200], [80, 82]]);
    assert.ok(Math.abs(ratio - 0.75) < 1e-9);
  });

  await test('RMSE is zero for perfect predictions and exact otherwise', () => {
    assert.strictEqual(rmse([]), 0);
    assert.strictEqual(rmse([[100, 100], [200, 200]]), 0);
    // Residuals -10 and +10 → RMS = 10.
    assert.strictEqual(rmse([[100, 110], [110, 100]]), 10);
  });

  await test('R² equals 1 for perfect predictions', () => {
    // Constant observations with exact predictions → SStot=0 branch returns 1.
    assert.strictEqual(r2([[100, 100], [100, 100], [100, 100]]), 1);
    // Linear relationship predicted exactly.
    const linear = [];
    for (let x = 0; x < 5; x++) {
      const y = 2 * x + 1;
      linear.push([y, y]);
    }
    assert.ok(Math.abs(r2(linear) - 1) < 1e-9, `expected R²≈1, got ${r2(linear)}`);
  });

  await test('calibrateIdmParams recovers known IDM parameters', () => {
    // Ground truth: aggressive commuter (a=2.2, T=1.0), everything else default.
    const truth = { v0: 30, s0: 1.5, T: 1.0, a: 2.2, b: 2, delta: 4 };
    const scenarios = [];
    for (const v of [0, 5, 10, 15, 20, 25]) scenarios.push({ v, s: Infinity, dv: 0 });
    scenarios.push(
      { v: 10, s: 25, dv: 3 },
      { v: 15, s: 40, dv: 4 },
      { v: 20, s: 80, dv: 5 },
      { v: 25, s: 200, dv: 3 },
      { v: 10, s: 20, dv: -5 }, // leader pulling away
      { v: 5, s: 30, dv: 5 },
    );
    // Only keep samples whose targets are inside the non-clamped regime so
    // they actually discriminate between parameter sets.
    const samples = scenarios
      .map((sc) => ({ ...sc, target: idmAcceleration(sc.v, sc.s, sc.dv, truth) }))
      .filter((s) => Math.abs(s.target) < 7);

    const res = calibrateIdmParams(samples, {
      tunable: ['a', 'T'],
      fixed: { v0: 30, s0: 1.5 },
      initial: { T: 1.5, a: 1.4 },
    });

    assert.ok(res.improved === true, 'search must improve on the initial guess');
    assert.ok(res.mse < res.initialMse * 0.05,
      `final MSE ${res.mse} should be far below initial ${res.initialMse}`);
    assert.ok(Math.abs(res.best.a - 2.2) < 1e-9, `recovered a=${res.best.a}, expected 2.2`);
    assert.ok(Math.abs(res.best.T - 1.0) < 1e-9, `recovered T=${res.best.T}, expected 1.0`);
    assert.ok(res.evaluated >= 10 * 2, 'grid search should have evaluated many candidates');

    // The fitted parameter set reproduces the targets essentially exactly.
    const residualMse = idmMse(samples, res.best, { v0: 30, s0: 1.5 });
    assert.ok(residualMse < 1e-9, `residual MSE after fit should be ~0, got ${residualMse}`);

    // Malformed input is rejected.
    assert.throws(() => calibrateIdmParams([]), TypeError);
  });

  console.log(`\n--- test-calibration summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
