import ThreeView, { Color } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";

// Identical landmark targets and initial cameras to v14; independent page.
const PLACES: Record<
  string,
  { label: string; note: string; tilesets: string[]; camera: Record<string, number> }
> = {
  tokyo: {
    label: "東京駅",
    note: "PLATEAU 千代田区+中央区 LOD2（テクスチャなし・白モデル）",
    tilesets: [
      "https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json",
      "https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json",
    ],
    // Target: Tokyo Station itself. Camera ends up SW of it, ~360 m up.
    camera: { lng: 139.7671, lat: 35.6812, distance: 520, heading: 55, pitch: -48, roll: 0 },
  },
  tocho: {
    label: "都庁（新宿）",
    note: "PLATEAU 新宿区 LOD2（テクスチャなし・白モデル）",
    tilesets: [
      "https://assets.cms.plateau.reearth.io/assets/f0/840fc4-114c-41e4-9a65-67768efd3629/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod2_no_texture/tileset.json",
    ],
    // Target: Tocho itself. Camera ends up SW (Central Park side), ~400 m up.
    camera: { lng: 139.6917, lat: 35.6896, distance: 560, heading: 40, pitch: -46, roll: 0 },
  },
};

const INITIAL_WATER: Record<string, number> = { tokyo: 42, tocho: 72 };
const params = new URLSearchParams(location.search);
const placeKey = params.get("place") === "tocho" ? "tocho" : "tokyo";
const place = PLACES[placeKey];
const requestedWater = params.get("water");
const parsedWater = requestedWater?.trim() ? Number(requestedWater) : NaN;
const initialWater = Number.isFinite(parsedWater) ? parsedWater : INITIAL_WATER[placeKey];
const color = (hex: number) => new Color().setHex(hex);
const statusEl = document.getElementById("status")!;
function status(state: string, water: number, basemapCheck = false) {
  const text = `${state}${basemapCheck ? "／ベースマップ確認中" : ""}｜楕円体高 ${water.toFixed(1)}m｜地形交差・透過・描画は目視未検証`;
  statusEl.textContent = text;
  (window as any).__status = text;
}

async function main() {
  let basemapCheck = false;
  const reportStatus = (state: string, water: number) => status(state, water, basemapCheck);
  let water = initialWater;
  let timer: ReturnType<typeof setInterval> | null = null;
  let rainOn = false;
  let state = "準備中";
  const container = document.getElementById("app")!;
  const view = new ThreeView<DefaultDescriptions>({ container, shadow: true,
    atmosphere: { date: new Date("2026-11-05T18:20:00+09:00") } });
  (window as any).__view = view;
  const plugin = new DefaultPlugin();
  view.addPlugin(plugin);
  reportStatus("WASM初期化中", water);
  await view.init();
  const scene = plugin.addDefaultPhotorealScene();
  scene.sun.update({ sun: { castShadow: true } } as any);
  view.addLight({ ambient: { intensity: 0.6, color: color(0x93a7cc) } } as any);
  view.toneMappingExposure = 1.6;
  view.addEffect({ clouds: { coverage: 0.85, lightShafts: true, haze: true } } as any);
  view.addEffect({ id: "underwater-bloom", selectiveBloom: {
    strength: 0.85, radius: 0.6, threshold: 0.55, smoothing: 0.2,
  } } as any);
  const rain = view.addEffect({ visible: false, rainDrop: {
    opacity: 0.25, dropDensity: 0.5, refractionStrength: 0.01,
  } } as any);
  const terrain = view.addSource({ type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18, requestVertexNormals: true, requestWaterMask: true } as any);
  view.addLayer({ type: "terrain", source: terrain,
    terrain: { castShadow: true, receiveShadow: true } } as any);
  const photo = view.addSource({ type: "raster-tile",
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", maxZoom: 18 } as any);
  // Scale the original blue RGB ratios by ~1.6; keep hue above the night floor.
  const photoTint = 0x3e6696;
  const photoLayer = view.addLayer({ type: "raster", source: photo,
    raster: { color: color(photoTint), opacity: 1 } } as any);
  const photoButton = document.createElement("button");
  photoButton.id = "basemap-check";
  photoButton.textContent = "ベースマップ確認";
  photoButton.setAttribute("aria-pressed", "false");
  document.getElementById("capture")!.insertAdjacentElement("afterend", photoButton);
  photoButton.addEventListener("click", () => {
    basemapCheck = !basemapCheck;
    photoButton.setAttribute("aria-pressed", String(basemapCheck));
    photoLayer.update({ raster: { color: color(basemapCheck ? 0xffffff : photoTint), opacity: 1 } } as any);
    view.forceUpdate(); reportStatus(state, water);
  });

  // One callback owns every building style field, including explicit resets.
  const styleFeature = ({ properties }: any) => {
    let depth = 0;
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (key.endsWith("_浸水深") && typeof value === "number" && Number.isFinite(value))
        depth = Math.max(depth, value);
    }
    const hex = depth <= 0 ? 0x2e3a4a : depth < 0.5 ? 0x39c2d7 : depth < 1 ? 0x1e88e5
      : depth < 2 ? 0x3949ab : depth < 3.5 ? 0x8e24aa : 0xff1744;
    return { color: color(hex), emissive: color(hex), emissiveIntensity: depth >= 2 ? 0.8 : 0.15, opacity: 1 };
  };
  for (const url of place.tilesets) {
    const source = view.addSource({ type: "3d-tiles", url } as any);
    const layer = view.addLayer({ type: "3d-tiles", source,
      model: { effectIds: ["underwater-bloom"], color: color(0xffffff), metalness: 0, roughness: 1 } } as any);
    layer.on("featureUpdated", (event: any) => (event.evaluator ?? event).evaluate(styleFeature));
    layer.forceUpdate();
  }
  const plane = view.addMesh({
    geodetic: { lng: place.camera.lng, lat: place.camera.lat, height: water, heightReference: "ellipsoid" },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 },
    plane: { width: 8000, height: 8000, color: color(0x123d4a), transparent: true,
      opacity: 0.55, castShadow: false, receiveShadow: false },
  } as any);
  view.attribution?.add([
    { attribution: `3D City Model (Project PLATEAU) FY2023 — MLIT (${place.label})`, attributionUrl: "https://www.mlit.go.jp/plateau/" },
    { attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" },
    { attribution: "地理院タイル（全国最新写真）", attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html" },
  ] as any);
  view.setCamera(place.camera as any);
  document.getElementById("place-label")!.textContent = place.label;
  function updateWater(next: number) {
    water = next;
    plane.update({ geodetic: { height: water } });
    view.forceUpdate();
    reportStatus(state, water);
  }
  function stopRise() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  for (const [id, delta] of [["lower", -2], ["higher", 2]] as const) {
    document.getElementById(id)!.addEventListener("click", () => {
      stopRise(); state = "手動水位"; updateWater(water + delta);
    });
  }
  document.getElementById("rise")!.addEventListener("click", () => {
    stopRise();
    const start = performance.now();
    state = "水位上昇中";
    updateWater(initialWater - 12);
    timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / 20000);
      state = t === 1 ? "水位上昇完了" : "水位上昇中";
      updateWater(initialWater - 12 + 25 * (t * t * (3 - 2 * t)));
      if (t === 1) stopRise();
    }, 100);
  });
  document.getElementById("rain")!.addEventListener("click", () => {
    rainOn = !rainOn;
    rain.update({ visible: rainOn } as any);
    const button = document.getElementById("rain")!;
    button.setAttribute("aria-pressed", String(rainOn));
    button.textContent = rainOn ? "水滴 ON" : "水滴 OFF";
    view.forceUpdate(); reportStatus(`${state}／水滴${rainOn ? "ON" : "OFF"}`, water);
  });
  document.getElementById("capture")!.addEventListener("click", () => {
    try {
      const canvas = container.querySelector("canvas");
      if (!canvas) throw new Error("canvas未準備");
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `tokyo-underwater-${placeKey}-${water.toFixed(1)}m.png`;
      link.click(); reportStatus("キャプチャ保存", water);
    } catch (error) { reportStatus(`キャプチャ失敗: ${error}`, water); }
  });
  window.addEventListener("pagehide", stopRise);
  window.addEventListener("pageshow", () => {
    if (state !== "水位上昇中") return;
    stopRise();
    state = "水位上昇中断";
    reportStatus(state, water);
  });
  state = "準備完了・タイル順次読み込み";
  reportStatus(state, water);
  (window as any).__ready = true;
}
main().catch(error => {
  console.error(error);
  (window as any).__error = String(error?.stack ?? error);
  status(`エラー: ${error?.message ?? error}`, initialWater);
});
