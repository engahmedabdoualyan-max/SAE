'use strict';
// SAE AutoSim Hub — Traffic signal controller tests.
// Run with: node tests/test-signals.js
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

/** Two-phase plan: P1 = 10g + 3y + 2r = 15s, P2 = 20g + 3y + 2r = 25s. */
function twoPhasePlan() {
  return {
    id: 'test-plan',
    phases: [
      { id: 'phase-0', name: 'NS', green: 10, yellow: 3, red: 2 },
      { id: 'phase-1', name: 'EW', green: 20, yellow: 3, red: 2 },
    ],
    offset: 0,
  };
}

async function run() {
  console.log('\n=== tests/test-signals.js — Signal controllers ===');

  const { SignalController, SignalPlan, SignalPhase } =
    await import('../sim-engine/signals/controller.js');

  await test('signal cycles through phases and wraps around', () => {
    const ctl = new SignalController('J1', twoPhasePlan());
    let st = ctl.getState();
    assert.strictEqual(st.phaseIndex, 0);

    st = ctl.tick(15); // exactly phase 0 duration
    assert.strictEqual(st.phaseIndex, 1, 'should advance to phase 1 after its duration');

    st = ctl.tick(25); // rest of the cycle
    assert.strictEqual(st.phaseIndex, 0, 'cycle should wrap back to phase 0');

    // Many small ticks keep cycling deterministically.
    for (let i = 0; i < 40; i++) ctl.tick(1);
    const wrapped = ctl.getState();
    assert.ok(wrapped.phaseIndex === 0 || wrapped.phaseIndex === 1);
    assert.strictEqual(ctl.elapsed % 40 < 40, true);
    assert.ok(Number.isFinite(wrapped.cycleTimeElapsed));
  });

  await test('green → yellow → red transition inside a phase', () => {
    const ctl = new SignalController('J2', twoPhasePlan());
    assert.strictEqual(ctl.getState().state, 'green');

    ctl.tick(9);
    assert.strictEqual(ctl.getState().state, 'green', '9 s into a 10 s green should still be green');

    ctl.tick(2); // now at t = 11 s (past green, inside yellow)
    assert.strictEqual(ctl.getState().state, 'yellow');

    ctl.tick(3); // t = 14 s (inside red clearance)
    assert.strictEqual(ctl.getState().state, 'red');

    ctl.tick(1); // t = 15 s → next phase begins with green again
    const st = ctl.getState();
    assert.strictEqual(st.state, 'green');
    assert.strictEqual(st.phaseIndex, 1);
  });

  await test('cycle time equals the sum of all phase durations', () => {
    const plan = new SignalPlan(twoPhasePlan());
    const manual = plan.phases.reduce((s, p) => s + p.green + p.yellow + p.red, 0);
    assert.strictEqual(plan.cycleLength, manual);
    assert.strictEqual(plan.cycleLength, 40);

    // SignalPhase helper agrees.
    const phase = new SignalPhase({ green: 12, yellow: 3, red: 5 });
    assert.strictEqual(phase.totalDuration, 20);
    assert.strictEqual(new SignalPlan({ phases: [phase] }).cycleLength, 20);
  });

  await test('actuated mode extends green while vehicles are waiting', () => {
    const plan = {
      phases: [{ id: 'p0', green: 10, yellow: 3, red: 2, minGreen: 5, maxGreen: 30 }],
    };
    const actuated = new SignalController('JA', plan, { mode: 'actuated' });
    const fixed = new SignalController('JF', plan, { mode: 'fixed' });

    actuated.updateDetectors({ north: 5 }); // demand on the served approach
    actuated.tick(14);
    fixed.tick(14);

    const aSt = actuated.getState();
    const fSt = fixed.getState();
    assert.strictEqual(aSt.mode, 'actuated');
    assert.strictEqual(
      aSt.state, 'green',
      `actuated controller should still be green at t=14 s (maxGreen 30), got ${aSt.state}`,
    );
    assert.strictEqual(fSt.state, 'red', 'fixed-time controller must already be past its green');
    assert.strictEqual(fSt.timeIntoPhase, 14);
    assert.ok(aSt.timeIntoPhase >= 14, `actuated green elapsed ${aSt.timeIntoPhase}`);

    // Without demand the actuated controller runs its (shorter) cycle and is
    // already serving the next one while fixed time still shows red.
    const idle = new SignalController('JI', plan, { mode: 'actuated' });
    idle.tick(14);
    const iSt = idle.getState();
    assert.strictEqual(fSt.state, 'red');
    assert.strictEqual(iSt.state, 'green', 'idle actuated wraps into its next cycle earlier');
    assert.ok(iSt.timeIntoPhase <= 5 + 1e-9, `wrapped cycle restarted near minGreen, got ${iSt.timeIntoPhase}`);
  });

  await test('offset shifts the phase timing for coordination', () => {
    const base = new SignalController('B0', twoPhasePlan()); // offset 0
    const shifted = new SignalController('B1', { ...twoPhasePlan(), offset: 20 });

    const b0 = base.getState();
    const b1 = shifted.getState();

    assert.strictEqual(b0.phaseIndex, 0);
    assert.strictEqual(b0.cycleTimeElapsed, 0);
    assert.strictEqual(b1.phaseIndex, 1, 'offset 20 s lands inside phase 1');
    assert.ok(Math.abs(b1.cycleTimeElapsed - 20) < 1e-6, `expected ~20 s elapsed, got ${b1.cycleTimeElapsed}`);
    assert.notStrictEqual(b0.phaseId, b1.phaseId, 'controllers must be in different phases');

    // After a full cycle both realign.
    base.tick(40);
    shifted.tick(20);
    assert.strictEqual(base.getState().phaseId, shifted.getState().phaseId);
  });

  console.log(`\n--- test-signals summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
