// Behavioral checks with a fake Navara/DOM/clock. Does not verify GPU rendering.
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = stripTypeScriptTypes(readFileSync('src/awakening.ts', 'utf8').replace(/^import .*;\n/gm, ''));
const palettes = {
  cyberpunk: { base: 0x111127, stops: [[0, 0x32d8ed], [65, 0x7359ef], [150, 0xf044c0], [230, 0xffd578]] },
  gold: { base: 0x171719, stops: [[0, 0x9d510e], [100, 0xe5a72e], [240, 0xffe8a0]] },
  holographic: { base: 0x070d10, stops: [[0, 0xdde9e8], [120, 0x98ceca], [240, 0x72bdb8]] },
};
async function check(place, initiallyOff = false) {
  let cloudsEnabled = !initiallyOff;
  const cloudTextures = { overlay: {}, shadow: {}, shadowLength: {} };
  let now = 0, timer, interval, cameraCalls = 0, captured = false;
  const layers = [];
  const effects = [];
  let ambientIntensity, ambientConfig, sunConfig, sceneOptions;
  const aerialUpdates = [];
  const aerialState = { transmittance: true, inscatter: true, irradiance: false };
  let activeLook = 'cyberpunk';
  const windowListeners = {};
  const showPage = persisted => windowListeners.pageshow({ persisted });
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; this.listeners = {}; this.classList = { toggle() {} }; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    attrs = {};
    setAttribute(name, value) { this.attrs[name] = value; }
    insertAdjacentElement(position, element) { assert.equal(position, "afterend"); ids[element.id] = element; }
    click() { this.listeners.click?.(); }
    querySelector() { return { toDataURL: () => { captured = true; return 'data:image/png;base64,'; } }; }
  }
  const ids = Object.fromEntries(['app','status','place-label','awaken','capture'].map(id => [id, new Element()]));
  const looks = ['before','cyberpunk','gold','holographic'].map(look => new Element({ look }));
  const places = ['tokyo','tocho'].map(place => new Element({ place }));
  class Color { setHex(hex) { this.hex = hex; return this; } }
  let viewConfig;
  class View {
    constructor(config) { viewConfig = config; }
    atmosphere = { overlay: { value: cloudTextures.overlay }, shadow: { value: cloudTextures.shadow },
      shadowLength: { value: cloudTextures.shadowLength }, enableShadows: { value: true }, onUpdate() {} }; attribution = { add() {} };
    addPlugin() {} async init() {} addLight(config) { ambientConfig = config; return { update(value) { ambientIntensity = value.ambient.intensity; } }; } addEffect(value) { const effect = { config: value, visible: true, update(value) { this.lastUpdate = value; } }; effects.push(effect); return effect; }
    addSource(value) { return value; }
    addLayer(value) { const layer = { ...value, update(value) { this.lastUpdate = value; }, listeners: {}, on(name, fn) { this.listeners[name] = fn; } }; layers.push(layer); return layer; }
    setCamera() { cameraCalls++; } forceUpdate() {}
  }
  const context = vm.createContext({ Color, ThreeView: View,
    DefaultPlugin: class { addDefaultPhotorealScene(options) { sceneOptions = options; return { sun: { update(value) { sunConfig = value; } }, aerialPerspective: { update(value) { aerialUpdates.push(value); Object.assign(aerialState, value.aerialPerspective); } } }; } },
    document: { getElementById: id => ids[id], querySelectorAll: selector => selector === '[data-look]' ? looks : selector === '[data-place]' ? places : [...looks,...places,ids.awaken,ids.capture], createElement: () => new Element() },
    window: { addEventListener(name, fn) { windowListeners[name] = fn; } }, location: { search: `?place=${place}${initiallyOff ? "&clouds=off" : ""}` }, URLSearchParams,
    performance: { now: () => now }, setInterval: (fn, ms) => { timer = fn; interval = ms; return 1; }, clearInterval: () => { timer = undefined; }, console,
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.__ready, true);
  assert.equal(viewConfig.shadow, true);
  assert.equal(viewConfig.atmosphere.date.toISOString(), '2026-11-05T08:40:00.000Z', 'initial Before time unchanged');
  const assertClouds = () => {
    const atmosphere = context.window.__view.atmosphere;
    assert.equal(effects[0].visible, cloudsEnabled, 'cloud rendering pass enabled only when ON');
    for (const key of ['overlay', 'shadow', 'shadowLength']) {
      assert.equal(atmosphere[key].value, cloudsEnabled ? cloudTextures[key] : null, `${key}: detach OFF / restore exact reference ON`);
    }
    assert.equal(atmosphere.enableShadows.value, cloudsEnabled, 'atmosphere cloud shadow enable restored');
    assert.equal(ids['cloud-toggle'].attrs['aria-pressed'], String(cloudsEnabled));
    assert.equal(ids['cloud-toggle'].textContent, cloudsEnabled ? '雲 ON' : '雲 OFF');
  };
  const toggleClouds = () => {
    const unchanged = () => JSON.stringify({ layers, aerialState, aerialUpdates, cameraCalls,
      date: context.window.__view.atmosphere.date, exposure: context.window.__view.toneMappingExposure,
      ambientIntensity, timer: !!timer });
    const previous = unchanged();
    cloudsEnabled = !cloudsEnabled;
    ids['cloud-toggle'].click();
    assertClouds();
    assert.equal(unchanged(), previous, 'cloud diagnostic preserves camera, grade, materials and wave');
  };
  const assertGrade = before => {
    assertClouds();
    const view = context.window.__view;
    checkPhoto();
    assert.equal(view.atmosphere.date.toISOString(), before ? '2026-11-05T08:40:00.000Z' : '2026-11-05T07:30:00.000Z');
    assert.equal(effects.find(effect => effect.config.clouds).lastUpdate.clouds.hazeDensityScale, before ? 3e-5 : 0);
    assert.ok(aerialUpdates.length > 0, 'aerial perspective explicitly applied');
    assert.equal(JSON.stringify(aerialUpdates.at(-1)),
      JSON.stringify({ aerialPerspective: { transmittance: before } }), 'only transmittance is updated');
    assert.equal(aerialState.transmittance, before, 'Before restores / After disables extinction');
    assert.equal(aerialState.inscatter, true, 'inscatter default preserved');
    assert.equal(aerialState.irradiance, false, 'irradiance default preserved');
    const terrain = layers.find(layer => layer.type === 'terrain');
    assert.equal(JSON.stringify(terrain.lastUpdate), JSON.stringify({ type: 'terrain', source: terrain.source,
      terrain: { castShadow: true, receiveShadow: true, lit: before } }), 'exact terrain config; Before lit / After unlit');
    assert.equal(layers.find(layer => layer.type === 'raster').lastUpdate.raster.opacity, 1);
    if (before) {
      assert.equal(ambientIntensity, 0.15, 'Before ambient unchanged');
      assert.equal(view.toneMappingExposure, 1.05, 'Before exposure unchanged');
    } else {
      assert.equal(ambientIntensity, 0.3, 'After building ambient fill');
      assert.equal(view.toneMappingExposure, 1.1, 'exact applied unlit-ground exposure');
    }
  };
  const checkPhoto = () => {
    const photo = layers.find(layer => layer.type === 'raster');
    assert.equal(photo.lastUpdate.raster.color.hex, 0xffffff, 'photo always white');
    assert.equal(photo.lastUpdate.raster.opacity, 1, 'photo always opaque');
    assert.equal(ids['basemap-check'], undefined, 'photo diagnostic toggle removed');
    assert.doesNotMatch(ids.status.textContent ?? '', /ベースマップ確認/);
  };
  assert.equal(JSON.stringify(effects[0].config), JSON.stringify({ clouds: { coverage: 0.45, lightShafts: true, haze: true } }), 'cloud effects preserved');
  assert.equal(JSON.stringify(effects[1].config), JSON.stringify({ selectiveBloom: { strength: 0.85, radius: 0.6, threshold: 0.55, smoothing: 0.2 } }), 'bloom preserved');
  assert.equal(sceneOptions, undefined, 'default atmosphere/deferred lighting unchanged');
  assert.equal(JSON.stringify(sunConfig), JSON.stringify({ sun: { castShadow: true, shadowMapSize: 4096, shadowNormalBias: 0.5 } }));
  assert.equal(JSON.stringify(ambientConfig), JSON.stringify({ ambient: { intensity: 0.15, color: { hex: 0x93a7cc } } }));
  assert.equal(JSON.stringify(layers.find(layer => layer.type === 'terrain').terrain),
    JSON.stringify({ castShadow: true, receiveShadow: true }), 'initial terrain unchanged');
  assertGrade(true);
  assert.match(ids.status.textContent, /Before/);
  const building = layers.find(l => l.type === '3d-tiles');
  let style;
  const origin = place === 'tocho' ? [139.6917,35.6896] : [139.7671,35.6812];
  const p = { _x: origin[0], _y: origin[1], 'bldg:measuredHeight': 240 };
  const ev = { evaluate: fn => { style = fn; } };
  building.listeners.featureUpdated({ featureSetId: 1n, evaluator: ev });
  assert.equal(JSON.stringify(style({ properties: p })), JSON.stringify({ color: { hex: 0xffffff },
    emissive: { hex: 0 }, emissiveIntensity: 0, opacity: 1, show: true }), 'Before white material unchanged');
  checkPhoto();
  toggleClouds();
  for (const button of looks.slice(1)) {
    activeLook = button.dataset.look;
    button.click();
    assertGrade(false);
    toggleClouds(); toggleClouds();
    assert.equal(context.window.__view.toneMappingExposure, 1.1);
    checkPhoto();
    const palette = palettes[button.dataset.look];
    assert.equal(style({ properties: p }).color.hex, palette.base, 'building base unchanged');
    for (const [height, color] of palette.stops) {
      assert.equal(style({ properties: { ...p, 'bldg:measuredHeight': height } }).emissive.hex, color,
        `${button.dataset.look} emissive stop at ${height} m unchanged`);
    }
    const multiplier = button.dataset.look === 'holographic' ? 1.5 : 1.0;
    for (const [height, expected] of [[-20, 0.12], [0, 0.12], [120, 0.21], [240, 0.30], [500, 0.30]]) {
      assert.ok(Math.abs(style({ properties: { ...p, 'bldg:measuredHeight': height } }).emissiveIntensity - expected * multiplier) < 1e-12, `steady intensity at ${height} m`);
    }
    assert.equal(style({ properties: {} }).emissiveIntensity, 0.12 * multiplier, 'missing height uses scaled minimum');
    looks[0].click(); assertGrade(true);
    activeLook = button.dataset.look;
    button.click();
    assert.notEqual(style({ properties: p }).color.hex, 0xffffff);
    assert.ok(style({ properties: p }).emissiveIntensity > 0);
  }
  // Every look keeps the +4 front independent of its steady multiplier.
  for (const button of looks.slice(1)) {
    button.click();
    ids.awaken.click(); assertGrade(true);
    now += 500 + 240 / 900 * 1000; timer();
    assertGrade(false);
    assert.ok(Math.abs(style({ properties: p }).emissiveIntensity - 4) < 1e-10,
      `${button.dataset.look} front peak stays +4`);
    now += 120 / 900 * 1000; timer();
    const maximum = button.dataset.look === 'holographic' ? 0.45 : 0.30;
    assert.ok(Math.abs(style({ properties: p }).emissiveIntensity - (2 + maximum / 2)) < 1e-10,
      `${button.dataset.look} partially passed wave scales only steady light`);
    now += 20000; timer();
    assert.ok(Math.abs(style({ properties: p }).emissiveIntensity - maximum) < 1e-12,
      `${button.dataset.look} completion uses its steady multiplier`);
    assertGrade(false);
  }
  toggleClouds();
  now = 0;
  looks[1].click(); looks[2].click(); activeLook = 'gold'; looks[0].click();
  assert.equal(layers.find(layer => layer.type === 'raster').lastUpdate.raster.color.hex, 0xffffff);
  assertGrade(true);
  assert.equal(cameraCalls, 1, 'art comparisons preserve camera');
  ids.awaken.click();
  assert.equal(style({ properties: p }).emissiveIntensity, 0);
  assertGrade(true);
  assert.equal(interval, 1000 / 12);
  now = 500 + 240 / 900 * 1000; timer();
  assertGrade(false);
  assert.match(ids.status.textContent, /覚醒中/);
  checkPhoto();
  toggleClouds();
  assertGrade(false);
  assert.ok(Math.abs(style({ properties: p }).emissiveIntensity - 4) < 1e-10, 'front adds exactly 4 at landmark');
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
  assert.equal(style({ properties: p }).emissiveIntensity, 0.30, 'front settles to new steady maximum');
  assertGrade(false);
  showPage(true);
  assert.match(ids.status.textContent, /完了/, 'pageshow preserves completion');
  assertGrade(false);
  for (const persisted of [true, false]) {
    ids.awaken.click();
    now += 1000; timer();
    assert.match(ids.status.textContent, /覚醒中/);
    showPage(persisted);
    assert.match(ids.status.textContent, /Before/);
    assert.equal(timer, undefined, 'pageshow stops wave timer');
    assertGrade(true);
    assert.equal(style({ properties: p }).color.hex, 0xffffff);
    assert.equal(context.window.__view.toneMappingExposure, 1.05, 'pageshow restores Before grade');
  }
  looks[1].click(); showPage(false);
  assert.match(ids.status.textContent, /After/, 'pageshow preserves After');
  assertGrade(false);
  looks[0].click(); showPage(true);
  assert.match(ids.status.textContent, /Before/, 'pageshow preserves Before');
  assertGrade(true);
  ids.awaken.click();
  assert.match(ids.status.textContent, /Before/);
  assert.equal(style({ properties: p }).emissiveIntensity, 0);
  looks[0].click(); assert.equal(timer, undefined);
  ids.capture.click(); assert.equal(captured, true);
  for (const enabled of [false, true, false]) {
    if (cloudsEnabled !== enabled) toggleClouds();
    for (const button of places) {
      button.click();
      assert.equal(context.location.search, `?place=${button.dataset.place}${enabled ? '' : '&clouds=off'}`, 'location reload preserves cloud toggle');
    }
  }
  console.log(`PASS ${place}: fixed photos and exact Before/After grades, unchanged building palettes, three looks, fixed camera, distance wave, late tiles, completion, replay, cancellation, evaluator removal, pageshow reset, PNG capture path`);
}
(async () => { for (const place of ['tokyo', 'tocho']) { await check(place); await check(place, true); } })().catch(error => { console.error(error); process.exitCode = 1; });
