// Node behavior checks with real Three geometry/materials; no GPU/network claim.
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const THREE = require('three');
const code = stripTypeScriptTypes(readFileSync(process.env.FLOAT_SOURCE || 'src/float.ts', 'utf8').replace(/^import .*;\n/gm, ''));
const events = {}, winEvents = {}, docEvents = {}, frames = new Map(), layers = [], sources = [];
let seq = 0;
class View {
  globe = {}; attribution = { add() {} };
  addPlugin() {} async init() {} addLight() {} setCamera() {} forceUpdate() {}
  addSource(s) { sources.push(s); return s; }
  addLayer(s) { const layer = { config: s, events: {}, on(k, f) { this.events[k] = f; } }; layers.push(layer); return layer; }
  on(k, f) { events[k] = f; }
}
const document = { hidden: false, getElementById: () => ({ textContent: '' }), addEventListener: (k, f) => docEvents[k] = f };
const window = { addEventListener: (k, f) => winEvents[k] = f };
const context = vm.createContext({ ...THREE, ThreeView: View, DefaultPlugin: class {}, window, document, console,
  PerformanceObserver: class { observe() {} },
  requestAnimationFrame: fn => { frames.set(++seq, fn); return seq; }, cancelAnimationFrame: id => frames.delete(id) });
(async () => {
  vm.runInContext(code, context); await new Promise(r => setImmediate(r));
  assert.equal(window.__float.initialized, true);
  assert.equal(sources.filter(s => s.type === '3d-tiles').length, 2);
  assert.equal(sources.some(s => s.type === 'raster-tile'), false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,1, 1,0,0, 1,1,0], 3));
  geo.setAttribute('_batchid', new THREE.Float32BufferAttribute([1, 0, 1, 2], 1));
  geo.setAttribute('batchId', new THREE.Float32BufferAttribute([901, 42, 901, 8], 1));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.customDepthMaterial = new THREE.MeshStandardMaterial();
  let surfaceOriginal = 0, depthOriginal = 0;
  mesh.material.onBeforeCompile = s => { surfaceOriginal++; s.vertexShader += '\n// surface enhancer'; };
  mesh.customDepthMaterial.onBeforeCompile = s => { depthOriginal++; s.vertexShader += '\n// depth enhancer'; s.defines = { USE_SHADOWMAP_DEPTH: 1 }; };
  const model = { traverseMesh: f => f(mesh) };
  const evaluator = { obj: model, readFeatureProperties(f) {
    f({ batchId: 42, properties: { 'bldg:measuredHeight': 500 } }, 0);
    f({ batchId: 901, properties: { 'bldg:measuredHeight': 80 } }, 1);
    f({ batchId: 8, properties: {} }, 2);
  } };
  layers[1].events.featureUpdated({ featureSetId: 1n, evaluator });
  assert.deepEqual([...geo.getAttribute('floatLift').array], [96,240,96,0]);
  assert.equal(window.__float.appliedBuildings, 2);
  assert.equal(window.__float.missingHeights, 1);
  const shaders = [mesh.material, mesh.customDepthMaterial].map(m => {
    const shader = { vertexShader: 'void main() {\n#include <begin_vertex>\n}', uniforms: {} };
    m.onBeforeCompile(shader, {}); return shader;
  });
  assert.equal(surfaceOriginal, 1); assert.equal(depthOriginal, 1);
  assert.equal(shaders[1].defines.USE_SHADOWMAP_DEPTH, 1);
  assert.equal(shaders[0].uniforms.uFloatBreath, shaders[1].uniforms.uFloatBreath);
  for (const s of shaders) assert.match(s.vertexShader, /inverse\(mat3\(modelMatrix\)\) \* uFloatUp \* \(floatLift \* uFloatBreath\)/);
  // GLTF siblings can share a material: patching twice must remain idempotent.
  const wrapped = mesh.material.onBeforeCompile;
  context.sharedMaterial = mesh.material;
  context.sharedBreath = shaders[0].uniforms.uFloatBreath;
  context.sharedUp = shaders[0].uniforms.uFloatUp.value;
  vm.runInContext('patchMaterial(sharedMaterial, sharedBreath, sharedUp, "surface")', context);
  assert.equal(mesh.material.onBeforeCompile, wrapped);
  // Repeated feature updates must not wrap the shaders or double-count buildings.
  layers[1].events.featureUpdated({ featureSetId: 1n, evaluator });
  assert.equal(window.__float.appliedBuildings, 2);
  let time = 0;
  for (let i = 0; i < 250; i++) {
    const [id, fn] = frames.entries().next().value; frames.delete(id); fn(time); time += 100;
    assert.ok(window.__float.breath >= 0.85 && window.__float.breath <= 1.15);
  }
  winEvents.pagehide(); assert.equal(frames.size, 0);
  winEvents.pageshow(); assert.equal(frames.size, 1);
  document.hidden = true; docEvents.visibilitychange(); assert.equal(frames.size, 0);
  document.hidden = false; docEvents.visibilitychange(); assert.equal(frames.size, 1);
  layers[1].events.featureRemoved({ featureSetId: 1n }); assert.equal(window.__float.appliedBuildings, 0);
  // Execute the installed SDK's actual conversion block, rather than mocking
  // its output. This exposes its raw-array traversal on interleaved attributes.
  const sdk = readFileSync('node_modules/@navaramap/three/src/mesh/model.ts', 'utf8');
  const conversion = sdk.slice(sdk.indexOf('    const vertCnt ='), sdk.indexOf('    mesh.castShadow ='));
  assert.ok(conversion.includes('for (const internalBatchId of internalBatchIds)'));
  const convert = new Function('mesh', 'batchIds', 'dataSize', 'BufferAttribute', stripTypeScriptTypes(conversion));
  function fixture(publicIds, heights, featureSetId, layer) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    // Logical local IDs: 0,0,0,1,1,1. Neighbour fields deliberately contain
    // valid IDs, so the old mapping silently succeeds and tears buildings.
    const data = new THREE.InterleavedBuffer(new Float32Array([1,0, 1,0, 1,0, 0,1, 0,1, 0,1]), 2);
    geometry.setAttribute('_batchid', new THREE.InterleavedBufferAttribute(data, 1, 1));
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    m.customDepthMaterial = new THREE.MeshStandardMaterial();
    convert(m, new Uint32Array(publicIds), 1, THREE.BufferAttribute);
    const evaluator = { obj: { traverseMesh: f => f(m) }, readFeatureProperties(f) {
      heights.forEach((h, i) => f({ batchId: publicIds[i], properties: { 'bldg:measuredHeight': h } }, i));
    } };
    layer.events.featureUpdated({ featureSetId, evaluator });
    return m;
  }
  const first = fixture([42,901], [20,80], 10n, layers[1]);
  const second = fixture([42,901], [100,200], 10n, layers[2]);
  assert.deepEqual([...first.geometry.getAttribute('batchId').array], [901,42,901,42,901,42]);
  assert.deepEqual([...first.geometry.getAttribute('floatLift').array], [24,24,24,96,96,96]);
  assert.deepEqual([...second.geometry.getAttribute('floatLift').array], [120,120,120,240,240,240]);
  assert.equal(window.__float.appliedBuildings, 4); // layer + set + local ID
  assert.equal(window.__float.checkedBuildings, 4);
  assert.equal(window.__float.inconsistentBuildings, 0);
  assert.equal(window.__float.publicIdMismatches, 8);
  assert.ok(window.__float.idSamples.some(s => s.batchId !== s.geometryBatchId));
  layers[1].events.featureRemoved({ featureSetId: 10n });
  assert.equal(window.__float.appliedBuildings, 2);
  layers[2].events.featureRemoved({ featureSetId: 10n });
  assert.equal(window.__float.checkedBuildings, 0);
  // Same layer, two genuinely distinct feature sets reuse local IDs 0/1.
  const third = fixture([8,9], [30,60], 11n, layers[1]);
  const fourth = fixture([11,12], [70,90], 12n, layers[1]);
  assert.deepEqual([...third.geometry.getAttribute('floatLift').array], [36,36,36,72,72,72]);
  assert.deepEqual([...fourth.geometry.getAttribute('floatLift').array], [84,84,84,108,108,108]);
  assert.equal(window.__float.appliedBuildings, 4);
  assert.equal(window.__float.inconsistentBuildings, 0);
  layers[1].events.featureRemoved({ featureSetId: 11n });
  layers[1].events.featureRemoved({ featureSetId: 12n });
  // Independent validator must detect variation (including across primitives).
  context.testIds = new THREE.Float32BufferAttribute([0,0,1], 1);
  context.testLift = new THREE.Float32BufferAttribute([10,11,40], 1);
  const checked = vm.runInContext('(() => { const r = new Map(); inspectLift(testIds, testLift, r); return [...r.values()]; })()', context);
  assert.equal(checked.filter(r => r.max > r.min).length, 1);
  // An unmapped global ID must stop the experiment instead of an offset fallback.
  const bad = { obj: model, readFeatureProperties: f => f({ batchId: 99, properties: { 'bldg:measuredHeight': 10 } }, 0) };
  const badMesh = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial());
  bad.obj = { traverseMesh: f => f(badMesh) };
  layers[1].events.featureUpdated({ featureSetId: 2n, evaluator: bad });
  assert.equal(window.__float.stopped, true); assert.match(window.__float.errors[0], /batchIndex=1/);
  assert.equal(frames.size, 0);
  console.log('PASS FLOAT: local batchIndex mapping, installed SDK interleaving reproduction, two-set collision, per-building validation, clamp, missing heights, enhancer/depth composition, shared breathing uniform, lifecycle, removal, fail-closed mapping');
})().catch(error => { console.error(error); process.exitCode = 1; });
