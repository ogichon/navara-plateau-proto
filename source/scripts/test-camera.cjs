// Executes the page with DOM/Navara mocks; verifies setCamera inputs, not GPU geometry.
const {readFileSync}=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=stripTypeScriptTypes(readFileSync('src/camera.ts','utf8').replace(/^import .*;\n/gm,''));
async function check(query, start, failInit=false) {
  let camera, download, captureError=false, missingCanvas=false;
  const cameras=[], sources=[], layers=[], effects=[], events={};
  class Element {
    textContent=''; attrs={}; listeners={}; dataset={};
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(k,fn){this.listeners[k]=fn;}
    click(){this.listeners.click?.(); if(this.download) download=this.download;}
    querySelector(){return missingCanvas ? null : {toDataURL(){if(captureError) throw Error('tainted'); return 'data:image/png;base64,';}};}
  }
  const ids=Object.fromEntries(['app','status','cam','target','place-label','capture'].map(id=>[id,new Element()]));
  const presets=['hero','low','diorama','top','horizon','street'].map(preset=>Object.assign(new Element(),{dataset:{preset}}));
  const places=['tokyo','tocho'].map(place=>Object.assign(new Element(),{dataset:{place}}));
  const handle=config=>({config,update(v){this.updated=v;}});
  class Color {setHex(hex){this.hex=hex;return this;}}
  class View {
    camera={positionGeographic:{lng:140,lat:36,height:123},orientation:{heading:12,pitch:-34,roll:0}};
    attribution={add(){}};
    constructor(config){this.config=config;}
    addPlugin(){} async init(){if(failInit) throw Error('init failed');}
    addSource(v){sources.push(v);return v;} addLayer(v){const h=handle(v);layers.push(h);return h;}
    addLight(v){this.light=v;return handle(v);} addEffect(v){effects.push(v);return handle(v);}
    setCamera(v){camera=v;cameras.push(v);} on(name,fn){assert.equal(name,'postRender');events[name]=fn;}
  }
  const context=vm.createContext({ThreeView:View,Color,DefaultPlugin:class {addDefaultPhotorealScene(){return {sun:handle({})};}},
    document:{getElementById:id=>ids[id],querySelectorAll:s=>s==='[data-preset]'?presets:places,createElement:()=>new Element()},window:{},location:{search:query},URLSearchParams,console});
  vm.runInContext(source,context);await new Promise(r=>setImmediate(r));
  if(failInit){assert.match(ids.status.textContent,/初期化エラー/);assert.equal(context.window.__ready,undefined);return;}
  assert.equal(context.window.__error,undefined);assert.equal(context.window.__ready,true);
  const view=context.window.__view;
  assert.equal(view.config.atmosphere.date.toISOString(),'2026-11-05T08:40:00.000Z');
  assert.equal(view.toneMappingExposure,1.05);assert.equal(view.light.ambient.intensity,0.15);
  assert.equal(effects[0].clouds.coverage,0.45);assert.equal(effects[0].clouds.haze,true);
  assert.equal(effects[1].selectiveBloom.strength,0.85);
  assert.equal(layers.find(h=>h.config.type==='raster').updated.raster.color.hex,0xd8a878);
  assert.equal(sources.filter(s=>s.type==='3d-tiles').length,3);
  for(const h of layers.filter(h=>h.config.type==='3d-tiles')){assert.equal(h.config.model.color.hex,0xffffff);assert.equal(h.config.model.effectIds,undefined);}
  const bases={tokyo:[139.7671,35.6812,520,-48,55],tocho:[139.6917,35.6896,560,-46,40]};
  function verify(place,key){
    const [lng,lat,d,p,h]=bases[place];
    const expected={hero:[d,p,h],low:[300,-18,h],diorama:[900,-62,h+30],top:[1100,-89,h],horizon:[2600,-24,h],street:[130,-8,h]}[key];
    assert.deepEqual([camera.lng,camera.lat,camera.distance,camera.pitch,camera.heading,camera.roll],[lng,lat,...expected,0]);
    assert.equal(presets.filter(b=>b.attrs['aria-pressed']==='true').length,1);
    assert.equal(presets.find(b=>b.dataset.preset===key).attrs['aria-pressed'],'true');
    assert.match(ids.target.textContent,new RegExp(`${camera.distance}m`));
  }
  verify(start,'hero');
  // Deliberately distinct camera position proves the readout does not echo target arguments.
  assert.match(ids.cam.textContent,/140.000000.*36.000000.*123.0m/);
  view.camera.positionGeographic.height=456;view.camera.orientation.pitch=-7;events.postRender();
  assert.match(ids.cam.textContent,/456.0m.*-7.00/);
  for(const place of ['tokyo','tocho','tokyo']){
    places.find(b=>b.dataset.place===place).click();verify(place,'hero');
    for(const b of presets){const count=cameras.length;b.click();assert.equal(cameras.length,count+1);verify(place,b.dataset.preset);
      ids.capture.click();assert.equal(download,`navara-camera-${place}-${{hero:'hero',low:'low-angle',diorama:'diorama',top:'top-down',horizon:'horizon',street:'street'}[b.dataset.preset]}-1740.png`);}
  }
  assert.equal(layers.length,5,'place switching does not duplicate layers');
  captureError=true;ids.capture.click();assert.match(ids.status.textContent,/キャプチャ失敗/);
  captureError=false;missingCanvas=true;ids.capture.click();assert.match(ids.status.textContent,/canvas/);
  console.log(`PASS ${query || 'default'}: both places, six presets, reset, scene, live readout, capture/errors`);
}
(async()=>{await check('','tokyo');await check('?place=tocho','tocho');await check('?place=unknown','tokyo');await check('','tokyo',true);})().catch(e=>{console.error(e);process.exitCode=1;});
