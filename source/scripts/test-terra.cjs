// Pure Node behavior tests: no WebGL or real-network claims.
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = stripTypeScriptTypes(readFileSync('src/terra.ts', 'utf8').replace(/^import .*;\n/gm, ''));
async function check(mode = 'success') {
  const ids = {}, events = {}, winEvents = {}, docEvents = {}, frames = new Map();
  const sources = [], layers = [], lights = [], cameras = [];
  let counter = 0, download;
  class Element {
    listeners = {}; attrs = {}; textContent = '';
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute(k, v) { this.attrs[k] = v; }
    click() { this.listeners.click?.(); if (this.download) download = this.download; }
    querySelector() { return { toDataURL() { if (mode === 'capture') throw Error('tainted'); return 'data:image/png;base64,'; } }; }
  }
  for (const id of ['app', 'status', 'orbit', 'capture']) ids[id] = new Element();
  class Color { setHex(hex) { this.hex = hex; return this; } }
  class ColorMap { constructor(type, name, lut) { Object.assign(this, { type, name, lut }); } }
  class View {
    globe = {}; attribution = { add() {} };
    constructor(config) { this.config = config; }
    addPlugin() {} async init() { if (mode === 'init') throw Error('init failed'); }
    addSource(config) { sources.push(config); return config; }
    addLayer(config) { layers.push(config); }
    addLight(config) { lights.push(config); }
    setCamera(config) { cameras.push(config); }
    on(name, fn) { events[name] = fn; }
    forceUpdate() { this.forced = true; }
    async sampleTerrainMostDetailed(source, positions, options) {
      assert.equal(source, sources[0]); assert.equal(options.level, 12); assert.ok(options.signal);
      if (mode === 'network') throw Error('network failed');
      return positions.map((p, i) => ({ ...p, height: mode === 'missing' ? undefined : 50 - i * 25, level: 12 }));
    }
  }
  const document = { hidden: false, getElementById: id => ids[id], createElement: () => new Element(), addEventListener: (k, f) => docEvents[k] = f };
  const window = { addEventListener: (k, f) => winEvents[k] = f };
  const context = vm.createContext({ ThreeView: View, Color, ColorMap, DefaultPlugin: class {}, JAPAN_GSI_ELEVATION_DECODER: () => 'GSI',
    window, document, console, AbortController, setTimeout, clearTimeout,
    requestAnimationFrame: f => { frames.set(++counter, f); return counter; }, cancelAnimationFrame: id => frames.delete(id) });
  vm.runInContext(source, context); await new Promise(r => setImmediate(r));
  const diag = window.__terra;
  if (mode === 'init') { assert.match(window.__error, /init failed/); assert.equal(window.__ready, undefined); return; }
  assert.equal(window.__ready, true);
  assert.equal(sources.length, 1); assert.equal(sources[0].type, 'raster-dem'); assert.match(sources[0].url, /\/dem\//);
  assert.equal(sources[0].maxZoom, 14); assert.equal(sources[0].elevationDecoder, 'GSI');
  assert.equal(layers.length, 2); assert.equal(layers[0].type, 'terrain'); assert.equal(layers[0].terrain.lit, true);
  assert.equal(layers[1].source, sources[0]); assert.equal(layers[1].raster.show, false);
  assert.equal(layers[1].elevationHeatmap.minHeight, -5); assert.equal(layers[1].elevationHeatmap.maxHeight, 60);
  const lut = window.__view.globe.elevationColormap.lut;
  assert.equal(lut.length, 256); assert.equal(lut[0][0], 16 / 255); assert.equal(lut[255][2], 140 / 255);
  assert.equal(lights[1].sun.castShadow, true); assert.equal(lights[1].sun.shadowFar, 120000); assert.equal(window.__view.config.atmosphere.date.toISOString(), '2026-11-09T06:45:00.000Z');
  assert.equal(cameras[0].distance, 65000); assert.equal(cameras[0].pitch, -48);
  if (mode === 'network' || mode === 'missing') assert.equal(diag.errors.length, 1);
  else { assert.equal(diag.errors.length, 0); assert.match(diag.acquisition, /3地点取得/); }
  assert.equal(diag.frames, 0); events.postRender(); assert.equal(diag.frames, 1);
  events.idle(); assert.equal(diag.idleObserved, true); assert.match(ids.status.textContent, /全表示タイル.*未判定/);
  const advance = t => { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(t); };
  advance(0); advance(1000); assert.equal(cameras.at(-1).heading, 25.06, 'large frame gaps clamped');
  winEvents.pagehide(); assert.equal(frames.size, 0);
  winEvents.pageshow(); winEvents.pageshow(); assert.equal(frames.size, 1, 'no duplicate orbit loops');
  ids.orbit.click(); assert.equal(frames.size, 0); assert.equal(ids.orbit.attrs['aria-pressed'], 'false');
  winEvents.pagehide(); winEvents.pageshow(); assert.equal(frames.size, 0, 'OFF survives BFCache');
  ids.orbit.click(); assert.equal(frames.size, 1);
  document.hidden = true; docEvents.visibilitychange(); assert.equal(frames.size, 0);
  document.hidden = false; docEvents.visibilitychange(); assert.equal(frames.size, 1);
  ids.capture.click(); assert.equal(download, undefined, 'capture waits for render'); events.postRender();
  if (mode === 'capture') { assert.equal(diag.capture, 'failed'); assert.match(window.__error, /tainted/); }
  else { assert.equal(download, 'terra-naked-tokyo.png'); assert.equal(diag.capture, 'saved-unverified'); }
  winEvents.error({ message: 'runtime error' }); assert.match(window.__error, /runtime error/);
  winEvents.unhandledrejection({ reason: 'rejected' }); assert.match(window.__error, /rejected/);
  console.log(`PASS terra ${mode}: terrain-only configuration, acquisition state, orbit lifecycle, capture, errors`);
}
(async () => { for (const mode of ['success', 'network', 'missing', 'capture', 'init']) await check(mode); })().catch(e => { console.error(e); process.exitCode = 1; });
