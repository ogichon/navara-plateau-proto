// Behavioral checks with a fake Navara/DOM/clock. Does not verify GPU rendering.
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = stripTypeScriptTypes(readFileSync('src/awakening.ts', 'utf8').replace(/^import .*;\n/gm, ''));
async function check(place) {
  let now = 0, timer, interval, cameraCalls = 0, captured = false;
  const layers = [];
  const windowListeners = {};
  const showPage = persisted => windowListeners.pageshow({ persisted });
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; this.listeners = {}; this.classList = { toggle() {} }; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute() {}
    click() { this.listeners.click?.(); }
    querySelector() { return { toDataURL: () => { captured = true; return 'data:image/png;base64,'; } }; }
  }
  const ids = Object.fromEntries(['app','status','place-label','awaken','capture'].map(id => [id, new Element()]));
  const looks = ['before','cyberpunk','gold','holographic'].map(look => new Element({ look }));
  const places = ['tokyo','tocho'].map(place => new Element({ place }));
  class Color { setHex(hex) { this.hex = hex; return this; } }
  class View {
    atmosphere = {}; attribution = { add() {} };
    addPlugin() {} async init() {} addLight() { return { update() {} }; } addEffect() {}
    addSource(value) { return value; }
    addLayer(value) { const layer = { ...value, update() {}, listeners: {}, on(name, fn) { this.listeners[name] = fn; } }; layers.push(layer); return layer; }
    setCamera() { cameraCalls++; } forceUpdate() {}
  }
  const context = vm.createContext({ Color, ThreeView: View,
    DefaultPlugin: class { addDefaultPhotorealScene() { return { sun: { update() {} } }; } },
    document: { getElementById: id => ids[id], querySelectorAll: selector => selector === '[data-look]' ? looks : selector === '[data-place]' ? places : [...looks,...places,ids.awaken,ids.capture], createElement: () => new Element() },
    window: { addEventListener(name, fn) { windowListeners[name] = fn; } }, location: { search: `?place=${place}` }, URLSearchParams,
    performance: { now: () => now }, setInterval: (fn, ms) => { timer = fn; interval = ms; return 1; }, clearInterval: () => { timer = undefined; }, console,
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.__ready, true);
  assert.match(ids.status.textContent, /Before/);
  const building = layers.find(l => l.type === '3d-tiles');
  let style;
  const origin = place === 'tocho' ? [139.6917,35.6896] : [139.7671,35.6812];
  const p = { _x: origin[0], _y: origin[1], 'bldg:measuredHeight': 240 };
  const ev = { evaluate: fn => { style = fn; } };
  building.listeners.featureUpdated({ featureSetId: 1n, evaluator: ev });
  assert.equal(style({ properties: p }).color.hex, 0xffffff);
  for (const button of looks.slice(1)) {
    button.click();
    assert.notEqual(style({ properties: p }).color.hex, 0xffffff);
    assert.ok(style({ properties: p }).emissiveIntensity > 0);
  }
  assert.equal(cameraCalls, 1, 'art comparisons preserve camera');
  ids.awaken.click();
  assert.equal(style({ properties: p }).emissiveIntensity, 0);
  assert.equal(interval, 1000 / 12);
  now = 500 + 240 / 900 * 1000; timer();
  assert.match(ids.status.textContent, /覚醒中/);
  assert.ok(style({ properties: p }).emissiveIntensity > 3.9, 'front flashes at landmark');
  assert.equal(style({ properties: { ...p, _y: origin[1]+0.05 } }).emissiveIntensity, 0, 'distant buildings wait');
  assert.equal(style({ properties: {} }).emissiveIntensity, 0);
  let late;
  let lateEvaluations = 0;
  building.listeners.featureUpdated({ featureSetId: 2n, evaluator: { evaluate: fn => { lateEvaluations++; late = fn({ properties: p }); } } });
  assert.ok(late.emissiveIntensity > 3.9, 'late tile uses shared wave state');
  building.listeners.featureRemoved({ featureSetId: 2n });
  const evaluationsAtRemoval = lateEvaluations;
  now = 20000; timer();
  assert.equal(lateEvaluations, evaluationsAtRemoval, 'removed evaluator is never refreshed');
  assert.match(ids.status.textContent, /完了/);
  assert.equal(timer, undefined);
  assert.ok(style({ properties: p }).emissiveIntensity < 2, 'front settles');
  showPage(true);
  assert.match(ids.status.textContent, /完了/, 'pageshow preserves completion');
  for (const persisted of [true, false]) {
    ids.awaken.click();
    now += 1000; timer();
    assert.match(ids.status.textContent, /覚醒中/);
    showPage(persisted);
    assert.match(ids.status.textContent, /Before/);
    assert.equal(timer, undefined, 'pageshow stops wave timer');
    assert.equal(style({ properties: p }).color.hex, 0xffffff);
    assert.equal(context.window.__view.toneMappingExposure, 1.05, 'pageshow restores Before grade');
  }
  looks[1].click(); showPage(false);
  assert.match(ids.status.textContent, /After/, 'pageshow preserves After');
  looks[0].click(); showPage(true);
  assert.match(ids.status.textContent, /Before/, 'pageshow preserves Before');
  ids.awaken.click();
  assert.match(ids.status.textContent, /Before/);
  assert.equal(style({ properties: p }).emissiveIntensity, 0);
  looks[0].click(); assert.equal(timer, undefined);
  ids.capture.click(); assert.equal(captured, true);
  console.log(`PASS ${place}: Before, three looks, fixed camera, distance wave, late tiles, completion, replay, cancellation, evaluator removal, pageshow reset, PNG capture path`);
}
(async () => { await check('tokyo'); await check('tocho'); })().catch(error => { console.error(error); process.exitCode = 1; });
