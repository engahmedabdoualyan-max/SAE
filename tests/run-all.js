'use strict';
// SAE AutoSim Hub — test suite aggregator.
// Run with: node tests/run-all.js
//
// Each tests/test-*.js file is standalone (node tests/test-xxx.js) and also
// exposes `__run()` so this runner can execute them in-process and aggregate
// results. Exit code is 0 only when every individual test passes.

const path = require('node:path');

const FILES = [
  'test-idm.js',
  'test-network.js',
  'test-vehicle.js',
  'test-signals.js',
  'test-demand.js',
  'test-kpi.js',
  'test-calibration.js',
  'test-imports.js',
  'test-scenario.js',
  'test-multimodal.js',
  'test-analysis.js',
];

async function main() {
  console.log('SAE AutoSim Hub — engine test suite');
  console.log('='.repeat(60));

  const totals = { files: 0, filesPassed: 0, tests: 0, passed: 0, failed: 0 };
  const perFile = [];

  for (const file of FILES) {
    totals.files += 1;
    let result;
    try {
      // eslint-disable-next-line import/no-dynamic-require
      const mod = require(path.join(__dirname, file));
      result = await mod.__run();
    } catch (err) {
      console.error(`!!! ${file} crashed before completing:`);
      console.error(err.stack ?? String(err));
      result = { total: 1, passed: 0, failed: 1 };
    }
    totals.tests += result.total ?? 0;
    totals.passed += result.passed ?? 0;
    totals.failed += result.failed ?? 0;
    if ((result.failed ?? 0) === 0 && (result.total ?? 0) > 0) totals.filesPassed += 1;
    perFile.push({ file, ...result });
  }

  console.log('\n' + '='.repeat(60));
  for (const { file, total, passed, failed } of perFile) {
    const status = failed === 0 ? 'PASS' : 'FAIL';
    console.log(` [${status}] ${file.padEnd(22)} ${passed}/${total} tests`);
  }
  console.log('='.repeat(60));
  console.log(` Files : ${totals.filesPassed}/${totals.files} passed`);
  console.log(` Tests : ${totals.passed}/${totals.tests} passed, ${totals.failed} failed`);

  process.exitCode = totals.failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
