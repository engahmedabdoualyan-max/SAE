'use strict';
// SAE AutoSim Hub — Network import/export tests (GeoJSON, OpenDRIVE, SUMO).
// Run with: node tests/test-imports.js
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

function sampleNetwork() {
  const net = new Network('sample');
  net.addNode('A', 30.05, 31.23);
  net.addNode('B', 30.06, 31.23);
  net.addNode('C', 30.06, 31.24);
  net.addEdge({ id: 'e1', from: 'A', to: 'B', length: 1105, lanes: 2, speedLimit: 15 });
  net.addEdge({ id: 'e2', from: 'B', to: 'C', length: 950, lanes: 1, speedLimit: 10 });
  return net;
}

async function run() {
  console.log('\n=== tests/test-imports.js — network I/O ===');

  ({ Network } = await import('../sim-engine/network/graph.js'));
  const {
    exportGeoJSON, importGeoJSON,
    exportOpenDRIVE, parseOpenDRIVE,
    exportSUMO, parseSUMONetwork,
    parseXML, sniffFormat,
  } = await import('../sim-engine/io/networkIO.js');

  await test('minimal OpenDRIVE document parses into a routed network', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road id="7" name="R1" length="100" junction="-1">
    <planView>
      <geometry s="0" x="0" y="0" hdg="0" length="100">
        <line/>
      </geometry>
    </planView>
    <lanes><laneSection s="0"><lane id="-1" type="driving"/></laneSection></lanes>
  </road>
</OpenDRIVE>`;
    const net = parseOpenDRIVE(xml);
    assert.ok(net instanceof Network);
    assert.strictEqual(net.stats().nodes, 2);   // start + end of the road
    assert.strictEqual(net.stats().edges, 1);
    const edge = [...net.edges.values()][0];
    assert.strictEqual(edge.id, '7-0');         // "<roadId>-<geometryIndex>"
    assert.strictEqual(edge.name, 'R1');
    assert.ok(Math.abs(edge.length - 100) < 1e-6);

    // Wrong root element is rejected.
    assert.throws(() => parseOpenDRIVE('<net version="1"></net>'), /expected <OpenDRIVE>/);
  });

  await test('SUMO .net.xml parses with lanes and skips internal edges', () => {
    const xml = `<net version="1.16">
  <location netOffset="0,0" projParameter="!"/>
  <junction id="n1" type="priority" x="0" y="0"/>
  <junction id="n2" type="priority" x="100" y="0"/>
  <edge id=":n2_0" function="internal" from="n1" to="n2">
    <lane id=":n2_0_0" index="0" speed="5" length="10"/>
  </edge>
  <edge id="e1" from="n1" to="n2" priority="1">
    <lane id="e1_0" index="0" speed="13.9" length="100"/>
    <lane id="e1_1" index="1" speed="13.9" length="100"/>
  </edge>
</net>`;
    const net = parseSUMONetwork(xml);
    assert.ok(net instanceof Network);
    assert.strictEqual(net.stats().nodes, 2);
    assert.strictEqual(net.stats().edges, 1, 'internal edge must be skipped');
    const e = net.getEdge('e1');
    assert.strictEqual(e.from, 'n1');
    assert.strictEqual(e.to, 'n2');
    assert.strictEqual(e.laneCount, 2);
    assert.ok(Math.abs(e.length - 100) < 1e-6);
    assert.ok(Math.abs(e.speedLimit - 13.9) < 1e-9);

    assert.throws(() => parseSUMONetwork('<OpenDRIVE/>'), /expected <net>/);
  });

  await test('GeoJSON FeatureCollection imports nodes and edges', () => {
    const gj = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [31.0, 30.0] },
          properties: { element: 'node', id: 'a' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [31.01, 30.0] },
          properties: { element: 'node', id: 'b' } },
        { type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[31.0, 30.0], [31.01, 30.0]] },
          properties: { element: 'edge', id: 'L1', from: 'a', to: 'b', lanes: 2, speedLimit: 15, length: 500 } },
      ],
    };
    const net = importGeoJSON(gj);
    assert.ok(net.getNode('a'));
    assert.ok(net.getNode('b'));
    const edge = net.getEdge('L1');
    assert.strictEqual(edge.from, 'a');
    assert.strictEqual(edge.to, 'b');
    assert.strictEqual(edge.laneCount, 2);
    assert.strictEqual(edge.length, 500);
    // String input works too.
    assert.ok(importGeoJSON(JSON.stringify(gj)) instanceof Network);
    assert.throws(() => importGeoJSON({ type: 'nope' }), TypeError);
  });

  await test('GeoJSON export produces a valid FeatureCollection', () => {
    const gj = exportGeoJSON(sampleNetwork());
    assert.strictEqual(gj.type, 'FeatureCollection');
    assert.strictEqual(gj.name, 'sample');
    const points = gj.features.filter((f) => f.geometry.type === 'Point');
    const lines = gj.features.filter((f) => f.geometry.type === 'LineString');
    assert.strictEqual(points.length, 3);
    assert.strictEqual(lines.length, 2);
    // [lng, lat] axis order!
    const nodeA = points.find((f) => f.properties.id === 'A');
    assert.deepEqual(nodeA.geometry.coordinates, [31.23, 30.05]);
    const lineE1 = lines.find((f) => f.properties.id === 'e1');
    assert.strictEqual(lineE1.properties.lanes, 2);
    assert.strictEqual(lineE1.properties.speedLimit, 15);
    assert.strictEqual(lineE1.properties.length, 1105);
    // Malformed inputs are rejected up front.
    assert.throws(() => exportGeoJSON(null), TypeError);
    assert.throws(() => exportGeoJSON({ foo: 1 }), TypeError);
  });

  await test('round-trip GeoJSON → import preserves the network', () => {
    const original = sampleNetwork();
    const restored = importGeoJSON(exportGeoJSON(original));
    assert.strictEqual(restored.stats().nodes, original.stats().nodes);
    assert.strictEqual(restored.stats().edges, original.stats().edges);
    for (const e of original.edges.values()) {
      const r = restored.getEdge(e.id);
      assert.ok(r, `edge ${e.id} missing after round-trip`);
      assert.strictEqual(r.from, e.from);
      assert.strictEqual(r.to, e.to);
      assert.ok(Math.abs(r.length - e.length) < 1e-6);
      assert.strictEqual(r.laneCount, e.laneCount);
    }
    // Routing survives the trip.
    assert.deepEqual(restored.findRoute('A', 'C'), ['e1', 'e2']);
  });

  await test('round-trip OpenDRIVE and SUMO preserve ids and geometry', () => {
    for (const [exporter, parser] of [[exportOpenDRIVE, parseOpenDRIVE], [exportSUMO, parseSUMONetwork]]) {
      const doc = exporter(sampleNetwork());
      const restored = parser(doc);
      assert.strictEqual(restored.stats().nodes, 3);
      assert.strictEqual(restored.stats().edges, 2);
      const r1 = restored.getEdge('e1');
      assert.ok(r1, `${parser.name}: edge e1 missing`);
      assert.strictEqual(r1.from, 'A');
      assert.strictEqual(r1.to, 'B');
      assert.strictEqual(r1.laneCount, 2);
      assert.ok(r1.length >= 1104 && r1.length <= 1106, `${parser.name}: length drifted to ${r1.length}`);
    }
  });

  await test('parseXML handles attributes, nesting and entities', () => {
    const doc = parseXML(`<?xml version="1.0"?>
<root a="1" b='two'>
  <child name="x"/>
  <child>text &amp; &lt;more&gt;</child>
</root>`);
    assert.strictEqual(doc.tag, 'root');
    assert.strictEqual(doc.attrs.a, '1');
    assert.strictEqual(doc.attrs.b, 'two');
    assert.strictEqual(doc.children.length, 2);
    assert.strictEqual(doc.children[0].attrs.name, 'x');
    assert.strictEqual(doc.children[0].children.length, 0); // self-closing
    assert.strictEqual(doc.children[1].children[0], 'text & <more>');
    // Structural errors are caught.
    assert.throws(() => parseXML('<a><b></a></b>'), Error);
    assert.throws(() => parseXML('<a>'), /unclosed/);
    assert.throws(() => parseXML('   '), /empty/);
  });

  await test('sniffFormat detects json/geojson/opendrive/sumo', () => {
    assert.strictEqual(sniffFormat('{"nodes":[],"edges":[]}'), 'json');
    assert.strictEqual(sniffFormat('{"type":"FeatureCollection","features":[]}'), 'geojson');
    assert.strictEqual(sniffFormat('<?xml?><OpenDRIVE></OpenDRIVE>'), 'opendrive');
    assert.strictEqual(sniffFormat('<?xml?><net version="1.16"></net>'), 'sumo');
    assert.throws(() => sniffFormat('plain text nonsense'), /unable to detect/);
  });

  console.log(`\n--- test-imports summary: ${results.passed}/${results.total} passed, ${results.failed} failed`);
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
