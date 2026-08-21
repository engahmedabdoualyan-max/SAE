// SAE AutoSim Hub — Physics Engine Unit Tests
// Run: node --test tests/physics.test.js (Node 18+) or npx jest tests/physics.test.js

const assert = require('assert');

// Mock DOM
global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({style:{}}), body: { appendChild: () => {}, removeChild: () => {} } };
global.window = { addEventListener: () => {}, localStorage: { getItem: () => null }, requestAnimationFrame: () => {} };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.Blob = function(){};
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
global google = { maps: { Map: function(){}, Polyline: function(){}, Marker: function(){}, InfoWindow: function(){}, OverlayView: function(){}, LatLng: function(){}, TrafficLayer: function{} } };

const fs = require('fs');
const html = fs.readFileSync('./index.html', 'utf8');
const scriptMatch = html.match(/<script>\s*\n([\s\S]*?)\n\s*<\/script>/);
if (!scriptMatch) { console.error('No script found'); process.exit(1); }
eval(scriptMatch[1]);

const tests = [];
function describe(name, fn) { console.log('\n  ' + name); fn(); }
function test(name, fn) {
  try { fn(); console.log('    \x1b[32m✓\x1b[0m ' + name); tests.push({ name, pass: true }); }
  catch(e) { console.log('    \x1b[31m✗\x1b[0m ' + name + ' — ' + e.message); tests.push({ name, pass: false, error: e.message }); }
}

// ═══════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════

describe('PHYS Module', () => {
  test('PHYS object has all required properties', () => {
    assert(PHYS.dCoeff, 'dCoeff missing');
    assert(PHYS.pceFlat, 'pceFlat missing');
    assert(PHYS.pceIncline, 'pceIncline missing');
    assert(PHYS.baseSpeed, 'baseSpeed missing');
  });

  test('PHYS.baseSpeed has all 10 vehicle types', () => {
    const keys = Object.keys(PHYS.baseSpeed);
    assert.strictEqual(keys.length, 10);
    assert(keys.includes('mlaijy'));
    assert(keys.includes('microbus'));
    assert(keys.includes('naql_taqeel'));
    assert(keys.includes('av'));
  });

  test('gradeAdjustedSpeed returns positive for positive grade', () => {
    const s = gradeAdjustedSpeed('mlaijy', 3.5);
    assert(s > 0, 'speed must be positive');
    assert(s < PHYS.baseSpeed['mlaijy'], 'speed must be less than base');
  });

  test('gradeAdjustedSpeed returns min 5 for extreme grade', () => {
    const s = gradeAdjustedSpeed('naql_taqeel', 50);
    assert(s >= 5, 'minimum speed is 5');
  });

  test('dynamicPCE returns higher PCE for incline > 3%', () => {
    const flat = dynamicPCE('microbus', 1, 0);
    const inc = dynamicPCE('microbus', 5, 0);
    assert(inc > flat, 'incline PCE must be higher');
  });

  test('dynamicPCE applies platoon discount', () => {
    const noP = dynamicPCE('naql_taqeel', 5, 0.1);
    const withP = dynamicPCE('naql_taqeel', 5, 0.5);
    assert(withP < noP, 'platoon must reduce PCE');
  });

  test('emissionsIndex increases with grade', () => {
    assert(emissionsIndex(50, 6) > emissionsIndex(50, 1));
  });

  test('emissionsIndex decreases with higher MPR', () => {
    assert(emissionsIndex(90, 3) < emissionsIndex(10, 3));
  });
});

describe('Composite Capacity', () => {
  test('returns valid range', () => {
    const r = compositeCapacity(50, 3.5);
    assert(r.C >= 800 && r.C <= 3600, 'capacity out of range: ' + r.C);
    assert(r.pceAvg > 0);
    assert(r.fHV > 0 && r.fHV <= 1);
  });

  test('capacity increases with MPR', () => {
    const low = compositeCapacity(10, 3.5);
    const high = compositeCapacity(90, 3.5);
    assert(high.C >= low.C);
  });
});

describe('Weather Impact', () => {
  test('has all conditions', () => {
    assert(WEATHER_IMPACT.clear);
    assert(WEATHER_IMPACT.rain);
    assert(WEATHER_IMPACT.fog);
    assert(WEATHER_IMPACT.ice);
  });

  test('getWeatherFactor returns 1.0 for clear', () => {
    currentWeatherCondition = 'clear';
    assert.strictEqual(getWeatherFactor(), 1.0);
  });

  test('weatherAdjustedSpeed reduces in rain', () => {
    currentWeatherCondition = 'rain';
    assert.strictEqual(weatherAdjustedSpeed(100), 80);
  });
});

describe('Conflict Analysis', () => {
  test('severe conflicts decrease with MPR', () => {
    computeConflictAnalysis(10);
    const s10 = conflictData.severe;
    computeConflictAnalysis(90);
    const s90 = conflictData.severe;
    assert(s90 < s10);
  });
});

describe('Carbon Credits', () => {
  test('CARBON_ECON has valid parameters', () => {
    assert(CARBON_ECON.co2PerVehKm > 0);
    assert(CARBON_ECON.carbonPricePerTon > 0);
    assert(CARBON_ECON.crashCostPerCrash > 0);
  });
});

describe('Bass Diffusion', () => {
  test('returns 0 at t=0', () => {
    assert.strictEqual(bassDiffusion(0, 0.03, 0.38, 1.0), 0);
  });

  test('approaches M asymptotically', () => {
    const v = bassDiffusion(100, 0.03, 0.38, 1.0);
    assert(v > 0.9 && v <= 1.0);
  });

  test('monotonically increasing', () => {
    let prev = 0;
    for (let t = 1; t <= 50; t++) {
      const curr = bassDiffusion(t, 0.03, 0.38, 1.0);
      assert(curr >= prev, 'not monotonic at t=' + t);
      prev = curr;
    }
  });
});

describe('File Generators', () => {
  test('generateVISSIM returns valid XML', () => {
    const xml = generateVISSIM(50);
    assert(xml.includes('<?xml version'));
    assert(xml.includes('<VISSIMConfig'));
    assert(xml.includes('<VehicleTypes>'));
  });

  test('generateSUMO returns valid XML', () => {
    const xml = generateSUMO(50);
    assert(xml.includes('<?xml version'));
    assert(xml.includes('<routes'));
    assert(xml.includes('<vType'));
  });

  test('generateScript returns Python', () => {
    const s = generateScript(50, 'VISSIM');
    assert(s.includes('import'));
    assert(s.includes('PROFILES'));
  });
});

describe('Safe Distance', () => {
  test('returns positive value', () => {
    assert(safeDistance(25, { desiredSpeed: 25 }) > 0);
  });

  test('increases with speed', () => {
    assert(safeDistance(30, { desiredSpeed: 30 }) > safeDistance(15, { desiredSpeed: 15 }));
  });
});

describe('Route Point', () => {
  test('interpolates correctly', () => {
    const path = [{ lat: 30, lng: 31 }, { lat: 30.1, lng: 31.1 }, { lat: 30.2, lng: 31.2 }];
    const pt = routePoint(path, 0.5);
    assert(pt.lat > 30 && pt.lat < 30.2);
  });

  test('returns first point at frac=0', () => {
    const path = [{ lat: 30, lng: 31 }, { lat: 31, lng: 32 }];
    const pt = routePoint(path, 0);
    assert.strictEqual(pt.lat, 30);
  });
});

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════
const passed = tests.filter(t => t.pass).length;
const failed = tests.filter(t => !t.pass).length;
console.log('\n  ────────────────────────────────');
console.log('  \x1b[32m' + passed + ' passed\x1b[0m, \x1b[31m' + failed + ' failed\x1b[0m, ' + tests.length + ' total');
console.log('  ────────────────────────────────\n');
if (failed > 0) process.exit(1);
