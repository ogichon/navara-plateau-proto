// Fake Navara/DOM/clock behavioral checks, following test-awakening.cjs.
// No GPU rendering or network success is implied.
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = stripTypeScriptTypes(readFileSync('src/underwater.ts', 'utf8').replace(/^import .*;\n/gm, ''));
async function check(query, expectedPlace, initial) {
  let now = 0, timer, interval, captures = 0, camera, forces = 0;
  const layers = [], effects = [], meshes = [], listeners = {};
  class Element {
    listeners = {}; textContent = ''; attrs = {};
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute(name, value) { this.attrs[name] = value; }
    click() { this.listeners.click?.(); }
    querySelector() { return { toDataURL: () => { captures++; return 'data:image/png;base64,'; } }; }
  }
  const ids = Object.fromEntries(['app','status','place-label','lower','higher','rise','rain','capture'].map(id => [id,new Element()]));
  const handle = config => ({ config, updates: [], update(value) { this.updates.push(value); } });
  class Color { setHex(hex) { this.hex = hex; return this; } }
  class View {
    atmosphere = {}; attribution = { add() {} };
    addPlugin() {} async init() {} forceUpdate() {} setCamera(value) { camera = value; }
    addLight(value) { return handle(value); }
    addEffect(value) { const h = handle(value); effects.push(h); return h; }
    addMesh(value) { const h = handle(value); meshes.push(h); return h; }
    addSource(value) { return value; }
    addLayer(value) { const h = { ...handle(value), on(name, fn) { assert.equal(name,'featureUpdated'); this.listener = fn; }, forceUpdate() { forces++; } }; layers.push(h); return h; }
  }
  const context = vm.createContext({ ThreeView: View, Color,
    DefaultPlugin: class { addDefaultPhotorealScene() { return { sun: handle({}) }; } },
    document: { getElementById: id => ids[id], createElement: () => new Element() },
    window: { addEventListener(name, fn) { listeners[name] = fn; } }, location: { search: query }, URLSearchParams,
    performance: { now: () => now }, setInterval(fn, ms) { timer = fn; interval = ms; return 1; }, clearInterval() { timer = undefined; }, console,
  });
  vm.runInContext(source, context); await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.__error, undefined); assert.equal(context.window.__ready, true);
  const main = readFileSync('src/main.ts','utf8');
  const cameraLiteral = expectedPlace === 'tocho' ? 'lng: 139.6917, lat: 35.6896, distance: 560, heading: 40, pitch: -46, roll: 0' : 'lng: 139.7671, lat: 35.6812, distance: 520, heading: 55, pitch: -48, roll: 0';
  assert.ok(main.includes(cameraLiteral)); assert.ok(readFileSync('src/underwater.ts','utf8').includes(cameraLiteral));
  assert.equal(camera.lng, expectedPlace === 'tocho' ? 139.6917 : 139.7671);
  const plane = meshes[0]; assert.equal(meshes.length,1);
  assert.equal(plane.config.geodetic.height,initial); assert.equal(plane.config.geodetic.heightReference,'ellipsoid');
  assert.equal(plane.config.rotation.x,-Math.PI/2); assert.equal(plane.config.plane.opacity,0.55);
  assert.equal(plane.config.plane.width,4000); assert.equal(plane.config.plane.transparent,true); assert.equal(plane.config.effectIds,undefined);
  assert.equal(effects.find(h => h.config.clouds).config.clouds.coverage,0.85);
  assert.ok(!effects.some(h => h.config.ssr));
  const buildings = layers.filter(h => h.config.type === '3d-tiles');
  assert.equal(buildings.length,expectedPlace === 'tocho' ? 1 : 2);
  for (const building of buildings) {
    assert.equal(building.config.model.effectIds[0],'underwater-bloom');
    let style; building.listener({ evaluator: { evaluate(fn) { style = fn; } } });
    const deep = style({ properties: { a_浸水深: 0.1, b_浸水深: 4, irrelevant: 100 } });
    assert.equal(deep.color.hex,0xff1744); assert.equal(deep.emissiveIntensity,0.8); assert.equal(deep.opacity,1);
    for (const [depth,hex] of [[0.2,0x39c2d7],[0.5,0x1e88e5],[1,0x3949ab],[2,0x8e24aa]]) assert.equal(style({properties:{a_浸水深:depth}}).color.hex,hex);
    const reset = style({properties:{a_浸水深:Infinity,b_浸水深:'4'}});
    assert.equal(reset.color.hex,0x2e3a4a); assert.equal(reset.emissive.hex,0x2e3a4a); assert.equal(reset.emissiveIntensity,0.15); assert.equal(reset.opacity,1);
    assert.equal(style({}).opacity,1);
  }
  const lastHeight = () => plane.updates.at(-1).geodetic.height;
  ids.higher.click(); assert.equal(lastHeight(),initial+2); ids.lower.click(); assert.equal(lastHeight(),initial);
  const initialForces = forces;
  ids.rise.click(); assert.equal(lastHeight(),initial-12); assert.equal(interval,100);
  now=10000; timer(); assert.equal(lastHeight(),initial+0.5);
  ids.rise.click(); assert.equal(lastHeight(),initial-12);
  now=30000; timer(); assert.equal(lastHeight(),initial+13); assert.equal(timer,undefined);
  assert.match(ids.status.textContent,/完了/); assert.equal(forces,initialForces,'water never reevaluates buildings');
  let late; buildings[0].listener({evaluate(fn) { late=fn({properties:{a_浸水深:4}}); }}); assert.equal(late.emissiveIntensity,0.8);
  ids.rise.click(); ids.higher.click(); assert.equal(timer,undefined); assert.equal(lastHeight(),initial-10);
  const rain=effects.find(h=>h.config.rainDrop); assert.equal(rain.config.visible,false);
  assert.equal(rain.config.rainDrop.refractionStrength,0.01); assert.equal(rain.config.rainDrop.opacity,0.25); assert.equal(rain.config.rainDrop.dropDensity,0.5);
  ids.rain.click(); assert.equal(rain.updates.at(-1).visible,true); assert.equal(ids.rain.attrs['aria-pressed'],'true');
  ids.rain.click(); assert.equal(rain.updates.at(-1).visible,false);
  ids.capture.click(); assert.equal(captures,1);
  const idleStatus = ids.status.textContent;
  listeners.pagehide(); listeners.pageshow();
  assert.equal(ids.status.textContent,idleStatus,'idle pageshow leaves status unchanged');
  ids.rise.click(); now += 10000; timer();
  const interruptedHeight = lastHeight();
  const updatesBeforeRestore = plane.updates.length;
  listeners.pagehide(); assert.equal(timer,undefined,'pagehide stops rise timer');
  now += 60000; listeners.pageshow();
  assert.equal(timer,undefined,'pageshow never resumes rise timer');
  assert.match(ids.status.textContent,/水位上昇中断/);
  assert.ok(ids.status.textContent.includes(`楕円体高 ${interruptedHeight.toFixed(1)}m`));
  assert.equal(plane.updates.length,updatesBeforeRestore,'restore preserves current water');
  ids.rain.click(); assert.match(ids.status.textContent,/水位上昇中断／水滴ON/,'interrupted state persists');
  ids.rise.click(); assert.equal(lastHeight(),initial-12); assert.equal(typeof timer,'function');
  assert.match(ids.status.textContent,/水位上昇中｜/);
  now += 10000; timer(); assert.equal(lastHeight(),initial+0.5,'replay restarts clock');
  now += 10000; timer(); assert.equal(lastHeight(),initial+13); assert.equal(timer,undefined);
  const completedStatus = ids.status.textContent;
  listeners.pagehide(); listeners.pageshow(); assert.equal(ids.status.textContent,completedStatus);
  console.log(`PASS ${query || 'default'}: camera, plane, evaluator, late tiles, water controls, replay, cancellation, rain, capture, pagehide/pageshow interruption`);
}
(async()=>{
  await check('', 'tokyo',42); await check('?place=tocho','tocho',72);
  await check('?place=tocho&water=81.5','tocho',81.5);
  for (const water of ['bad','Infinity','','%20']) await check(`?place=unknown&water=${water}`,'tokyo',42);
  await check('?water=0','tokyo',0); await check('?water=-3','tokyo',-3);
})().catch(error=>{console.error(error);process.exitCode=1;});
