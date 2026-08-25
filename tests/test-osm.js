/**
 * Unit tests for the OpenStreetMap importer (sim-engine/imports/osm.js).
 * Node-safe: exercises the regex frontend; browser DOMParser path shares
 * the same assembler.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { parseOSM } = await import('../sim-engine/imports/osm.js');
  const fixturePath = path.join(__dirname, '..', 'assets', 'fixtures', 'mini.osm');
  const xml = fs.readFileSync(fixturePath, 'utf8');
  let net;

  net = parseOSM(xml);
  test('parses fixture without throwing', () => {
    assert(net && Array.isArray(net.nodes) && Array.isArray(net.edges));
  });

  test('extracts all five nodes (connected subset)', () => {
    assert.strictEqual(net.nodes.length, 5);
  });

  test('motorway way is oneway with 4 lanes and ~100 km/h', () => {
    const e = net.edges.find(e => e.name === 'Ring Road' && e.id.endsWith('_0'));
    assert(e, 'motorway edge missing');
    // motorway class forces oneway → single forward edge per segment
    const sameSegReverse = net.edges.filter(x => x.name === 'Ring Road'
      && x.from === e.to && x.to === e.from).length;
    assert.strictEqual(sameSegReverse, 0, 'oneway motorway must not gain reverse twin');
    assert.strictEqual(e.lanes, 4);
    assert(Math.abs(e.speedLimit - 27.78) < 0.1, `speed ${e.speedLimit}`);
  });

  test('primary way splits into bidirectional pair with halved lanes', () => {
    const fwd = net.edges.filter(e => e.name === 'Nasr St');
    assert.strictEqual(fwd.length, 2, `expected _f/_r pair, got ${fwd.length}`);
    assert(fwd.every(e => e.lanes === 1), '2-lane primary → 1 lane/dir');
  });

  test('residential oneway=yes yields single edge', () => {
    const side = net.edges.filter(e => e.name === 'Side St');
    assert.strictEqual(side.length, 1);
    assert.strictEqual(side[0].lanes, 1);
  });

  test('edge lengths are realistic metres (>50 m for fixture spans)', () => {
    net.edges.forEach(e =>
      assert(e.length > 50, `${e.id} length ${e.length} m too small`));
  });

  test('meta reports accepted/skipped and bounds box', () => {
    const m = net.meta;
    assert.strictEqual(m.waysAccepted, 3);
    assert.strictEqual(m.source, 'osm');
    assert(Array.isArray(m.bounds) && m.bounds.length === 4);
    const [minLng, minLat, maxLng, maxLat] = m.bounds;
    assert(minLng < maxLng && minLat < maxLat);
  });

  test('rejects garbage input with clear error', () => {
    assert.throws(() => parseOSM('<html><body>nope</body></html>'), /no usable/);
  });

  test('skips footway ways entirely', () => {
    const withFoot = xml.replace(
      '</osm>',
      `<way id="900" name="Walk"><nd ref="1"/><nd ref="5"/>
       <tag k="highway" v="footway"/></way></osm>`);
    const n2 = parseOSM(withFoot);
    assert.strictEqual(n2.meta.waysAccepted, 3);
  });

  return { total: passed + failed, passed, failed };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  [PASS] ${name}`); }
  catch (e) { failed++; console.error(`  [FAIL] ${name}\n    ${e.message}`); }
}

if (require.main === module) {
  main().then((r) => {
    console.log(`\n  osm: ${r.passed}/${r.total}`);
    if (r.failed > 0) process.exit(1);
  });
}

module.exports.__run = main;
module.exports.test = test;

