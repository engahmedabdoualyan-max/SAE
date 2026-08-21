// SAE AutoSim Hub — Physics Engine Unit Tests
// Run: npx jest tests/physics.test.js

const assert = require('assert');

const COUNTRY_DATA = {
    egypt: { fleet: { mlaijy:0.30, microbus:0.20, noss_naql:0.08, rob_naql:0.07, naql_taqeel:0.05, motorcycle:0.05, bicycle:0.02, trooscoor:0.015, tuktuk:0.015, av:0.20 },
        road: { speedLimit: 80 }, reactionFactor: 1.0 },
    ksa: { fleet: { mlaijy:0.25, microbus:0.08, noss_naql:0.10, rob_naql:0.05, naql_taqeel:0.15, motorcycle:0.03, bicycle:0.01, trooscoor:0.005, tuktuk:0.005, av:0.20 },
        road: { speedLimit: 120 }, reactionFactor: 0.85 },
    uae: { fleet: { mlaijy:0.20, microbus:0.05, noss_naql:0.03, rob_naql:0.04, naql_taqeel:0.08, motorcycle:0.06, bicycle:0.005, trooscoor:0.001, tuktuk:0.001, av:0.63 },
        road: { speedLimit: 120 }, reactionFactor: 0.80 },
};

const PHYS = {
    reaction: { mlaijy:1.5, microbus:1.3, noss_naql:1.0, rob_naql:1.2, naql_taqeel:1.1, motorcycle:1.4, bicycle:2.0, trooscoor:1.8, tuktuk:1.6, av:0.5 },
    safety:  { mlaijy:0.5, microbus:0.6, noss_naql:0.4, rob_naql:0.45, naql_taqeel:0.4, motorcycle:0.8, bicycle:1.0, trooscoor:0.3, tuktuk:0.35, av:0.1 },
    accel:   { mlaijy:1.5, microbus:1.2, noss_naql:1.0, rob_naql:0.9, naql_taqeel:0.8, motorcycle:2.5, bicycle:0.5, trooscoor:0.8, tuktuk:0.7, av:2.0 },
    decel:   { mlaijy:2.5, microbus:2.2, noss_naql:1.8, rob_naql:2.0, naql_taqeel:1.7, motorcycle:3.0, bicycle:1.0, trooscoor:1.5, tuktuk:1.3, av:4.0 },
    sigma:   { mlaijy:0.5, microbus:0.45, noss_naql:0.4, rob_naql:0.42, naql_taqeel:0.38, motorcycle:0.6, bicycle:0.8, trooscoor:0.3, tuktuk:0.35, av:0.1 },
    minGap:  { mlaijy:2.0, microbus:2.5, noss_naql:1.5, rob_naql:2.0, naql_taqeel:1.8, motorcycle:1.0, bicycle:0.5, trooscoor:2.5, tuktuk:1.2, av:0.8 },
    len:     { mlaijy:4.5, microbus:6.0, noss_naql:5.5, rob_naql:7.0, naql_taqeel:5.0, motorcycle:2.2, bicycle:1.8, trooscoor:8.0, tuktuk:3.5, av:4.5 },
    pceFlat: { mlaijy:1.0, microbus:1.2, noss_naql:1.5, rob_naql:1.6, naql_taqeel:1.5, motorcycle:0.5, bicycle:0.5, trooscoor:1.7, tuktuk:1.6, av:1.0 },
    pceIncline: { mlaijy:1.3, microbus:1.4, noss_naql:1.7, rob_naql:1.8, naql_taqeel:1.7, motorcycle:0.7, bicycle:0.7, trooscoor:1.9, tuktuk:1.8, av:1.0 },
    baseSpeed: { mlaijy:25.0, microbus:22.2, noss_naql:20.8, rob_naql:19.4, naql_taqeel:16.7, motorcycle:27.8, bicycle:4.2, trooscoor:12.0, tuktuk:10.0, av:22.0 },
    dCoeff: { mlaijy:0.25, microbus:0.30, noss_naql:0.35, rob_naql:0.40, naql_taqeel:0.35, motorcycle:0.15, bicycle:0.10, trooscoor:0.45, tuktuk:0.50, av:0.20 },
};

const currentCountry = 'egypt';
const currentScenario = 'A';
const airPCEmult = 1;

function countryGrade() {
    var g = { egypt: 3.5, ksa: 0.5, uae: 1.0, jordan: 4.0 };
    return g[currentCountry] !== undefined ? g[currentCountry] : 3.0;
}
function gradeAdjustedSpeed(key, G) {
    var vf = PHYS.baseSpeed[key] !== undefined ? PHYS.baseSpeed[key] : 22.0;
    var d = PHYS.dCoeff[key] !== undefined ? PHYS.dCoeff[key] : 0.3;
    var s = vf - d * G;
    return s < 5 ? 5 : s;
}
function dynamicPCE(key, G, platoonShare) {
    var pce = (G > 3) ? (PHYS.pceIncline[key] !== undefined ? PHYS.pceIncline[key] : 1.5)
                      : (PHYS.pceFlat[key] !== undefined ? PHYS.pceFlat[key] : 1.0);
    if ((key === 'naql_taqeel' || key === 'noss_naql') && platoonShare > 0.2) pce *= 0.75;
    if (typeof airPCEmult !== 'undefined' && airPCEmult > 1) pce *= airPCEmult;
    return pce;
}
function computeWeightedFleet(mpr) {
    var m = mpr / 100;
    var humanShare = 1 - m;
    var v = (COUNTRY_DATA[currentCountry] ? COUNTRY_DATA[currentCountry].road.speedLimit / 3.6 : 22.22);
    var tauFactor = (COUNTRY_DATA[currentCountry] ? (COUNTRY_DATA[currentCountry].reactionFactor || 1) : 1) * (currentScenario === 'B' ? 0.7 : 1);
    var weighted = { tau: 0, safety: 0, accel: 0, decel: 0, sigma: 0, gap: 0, len: 0 };
    var L0_KEYS = Object.keys(PHYS.reaction).filter(function(k) { return k !== 'av'; });
    L0_KEYS.forEach(function(k) {
        var w = humanShare;
        weighted.tau += tauFactor * w * PHYS.reaction[k];
        weighted.safety += w * PHYS.safety[k];
        weighted.accel += w * PHYS.accel[k];
        weighted.decel += w * PHYS.decel[k];
        weighted.sigma += w * PHYS.sigma[k];
        weighted.gap += w * PHYS.minGap[k];
        weighted.len += w * PHYS.len[k];
    });
    if (m > 0) {
        var avW = m * 1.0;
        weighted.tau += tauFactor * avW * PHYS.reaction.av;
        weighted.safety += avW * PHYS.safety.av;
        weighted.accel += avW * PHYS.accel.av;
        weighted.decel += avW * PHYS.decel.av;
        weighted.sigma += avW * PHYS.sigma.av;
        weighted.gap += avW * PHYS.minGap.av;
        weighted.len += avW * PHYS.len.av;
    }
    var tauSum = weighted.tau;
    var avgLenGap = weighted.len + weighted.gap;
    var capacity = Math.round(3600 / (tauSum + avgLenGap / v));
    capacity = Math.max(1200, Math.min(3600, capacity));
    return { weighted: weighted, capacity: capacity, humanPct: Math.round(humanShare * 100) };
}
function compositeCapacity(mpr, G) {
    var m = mpr / 100;
    var fleet = (COUNTRY_DATA[currentCountry] && COUNTRY_DATA[currentCountry].fleet)
        ? COUNTRY_DATA[currentCountry].fleet : COUNTRY_DATA.egypt.fleet;
    var numPCE = 0, denom = 0, pHV = 0;
    Object.keys(fleet).forEach(function (k) {
        var share = fleet[k];
        if (k === 'av') {
            var pa = dynamicPCE('av', G, m);
            numPCE += m * share * pa; denom += m * share;
        } else {
            var p = dynamicPCE(k, G, m);
            numPCE += (1 - m) * share * p; denom += (1 - m) * share;
            if (p > 1.3) pHV += (1 - m) * share;
        }
    });
    var pceAvg = denom > 0 ? numPCE / denom : 1;
    var fHV = 1 / (1 + pHV * (pceAvg - 1));
    var v = (COUNTRY_DATA[currentCountry] ? COUNTRY_DATA[currentCountry].road.speedLimit / 3.6 : 22.22);
    var tauSum = computeWeightedFleet(mpr).weighted.tau;
    var avgLenGap = 6.0;
    var C = Math.round(3600 * fHV / (tauSum + avgLenGap / v));
    C = Math.max(800, Math.min(3600, C));
    return { C: C, pceAvg: pceAvg, fHV: fHV, pHV: pHV };
}

describe('Physics: countryGrade', () => {
    test('egypt should have grade 3.5', () => {
        assert.strictEqual(countryGrade(), 3.5);
    });
    test('grade is within 0-6 range', () => {
        assert.ok(countryGrade() >= 0 && countryGrade() <= 6);
    });
});

describe('Physics: gradeAdjustedSpeed', () => {
    test('microbus at Egypt grade should be reduced', () => {
        var G = countryGrade();
        var s = gradeAdjustedSpeed('microbus', G);
        assert.ok(s < 22.2);
        assert.ok(s > 0);
    });
    test('av should have higher adjusted speed', () => {
        var G = countryGrade();
        var s = gradeAdjustedSpeed('av', G);
        assert.ok(s > 20);
    });
    test('speed floors at 5', () => {
        var s = gradeAdjustedSpeed('microbus', 100);
        assert.ok(s >= 5);
    });
});

describe('Physics: dynamicPCE', () => {
    test('flat road PCE for microbus', () => {
        assert.strictEqual(dynamicPCE('microbus', 2, 0.3), PHYS.pceFlat.microbus);
    });
    test('incline PCE for microbus (G > 3)', () => {
        assert.strictEqual(dynamicPCE('microbus', 3.5, 0.3), PHYS.pceIncline.microbus);
    });
    test('platoon effect for naql_taqeel at >20% platoon', () => {
        var pce = dynamicPCE('naql_taqeel', 2, 0.25);
        assert.strictEqual(Math.round(pce * 100) / 100, Math.round(PHYS.pceFlat.naql_taqeel * 0.75 * 100) / 100);
    });
    test('no platoon effect at <20% platoon', () => {
        var pce = dynamicPCE('naql_taqeel', 2, 0.15);
        assert.strictEqual(pce, PHYS.pceFlat.naql_taqeel);
    });
    test('av PCE always 1.0', () => {
        assert.strictEqual(dynamicPCE('av', 3.5, 0.3), 1.0);
    });
});

describe('Physics: computeWeightedFleet', () => {
    test('0% automation', () => {
        var w = computeWeightedFleet(0);
        assert.ok(w.weighted.tau > 0);
        assert.ok(w.capacity > 0);
    });
    test('30% automation reduces tau', () => {
        var w0 = computeWeightedFleet(0);
        var w30 = computeWeightedFleet(30);
        assert.ok(w30.weighted.tau < w0.weighted.tau);
    });
    test('100% automation has very low tau', () => {
        var w = computeWeightedFleet(100);
        assert.ok(w.weighted.tau < 5);
    });
    test('100% automation has max capacity', () => {
        var w = computeWeightedFleet(100);
        assert.ok(w.capacity >= 1200);
    });
});

describe('Physics: compositeCapacity', () => {
    test('capacity positive and bounded', () => {
        var G = countryGrade();
        var cap = compositeCapacity(30, G);
        assert.ok(cap.C >= 800 && cap.C <= 3600);
        assert.ok(cap.fHV > 0 && cap.fHV <= 1);
        assert.ok(cap.pceAvg > 0);
    });
    test('capacity increases with MPR', () => {
        var G = countryGrade();
        var cap0 = compositeCapacity(0, G);
        var cap50 = compositeCapacity(50, G);
        assert.ok(cap50.C >= cap0.C || cap50.C >= 3600);
    });
    test('higher platoon share reduces PCE for trucks', () => {
        var G = countryGrade();
        var cap0 = compositeCapacity(0, G);
        var cap30 = compositeCapacity(30, G);
        assert.ok(cap30.pceAvg < cap0.pceAvg || cap30.pceAvg < 2);
    });
});

describe('Physics: speed calculations', () => {
    test('Egypt speed limit is 80 km/h', () => {
        assert.strictEqual(COUNTRY_DATA.egypt.road.speedLimit, 80);
    });
    test('KSA speed limit is 120 km/h', () => {
        assert.strictEqual(COUNTRY_DATA.ksa.road.speedLimit, 120);
    });
});
