import ThreeView, { Color } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";

const statusEl = document.getElementById("status")!;
const setStatus = (text: string) => { statusEl.textContent = text; };
const initialPlace = new URLSearchParams(location.search).get("place");
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

const PRESETS = {
  hero: { label: "HERO", note: "現行の標準構図", distance: 0, pitch: 0, heading: 0 },
  low: { label: "LOW ANGLE", note: "建物の高さと圧迫感", distance: 300, pitch: -18, heading: 0 },
  diorama: { label: "DIORAMA", note: "街の広がりと模型感", distance: 900, pitch: -62, heading: 30 },
  top: { label: "TOP-DOWN", note: "街区のパターン", distance: 1100, pitch: -89, heading: 0 },
  horizon: { label: "HORIZON", note: "地平線と空を入れた遠景", distance: 2600, pitch: -24, heading: 0 },
  street: { label: "STREET", note: "街レベル・一人称寄り", distance: 130, pitch: -8, heading: 0 },
};
type PresetKey = keyof typeof PRESETS;
async function main() {
  let placeKey = initialPlace && PLACES[initialPlace] ? initialPlace : "tokyo";
  let presetKey: PresetKey = "hero";
  const container = document.getElementById("app")!;
  const view = new ThreeView<DefaultDescriptions>({ container, shadow: true,
    atmosphere: { date: new Date("2026-11-05T17:40:00+09:00") } });
  const plugin = new DefaultPlugin();
  view.addPlugin(plugin);
  (window as any).__view = view;
  await view.init();
  const scene = plugin.addDefaultPhotorealScene();
  scene.sun.update({ sun: { castShadow: true } } as any);
  view.addLight({ ambient: { intensity: 0.15, color: new Color().setHex(0x93a7cc) } } as any);
  view.addEffect({ clouds: { coverage: 0.45, lightShafts: true, haze: true } } as any);
  view.addEffect({ selectiveBloom: { strength: 0.85, radius: 0.6, threshold: 0.55, smoothing: 0.2 } } as any);
  const terrain = view.addSource({ type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18, requestVertexNormals: true, requestWaterMask: true } as any);
  view.addLayer({ type: "terrain", source: terrain, terrain: { castShadow: true, receiveShadow: true } } as any);
  const photo = view.addSource({ type: "raster-tile", maxZoom: 18,
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg" } as any);
  const photoLayer = view.addLayer({ type: "raster", source: photo } as any);
  photoLayer.update({ raster: { color: new Color().setHex(0xd8a878) } } as any);
  view.toneMappingExposure = 1.05;
  // Both locations are loaded once; switching never accumulates duplicate layers.
  for (const place of Object.values(PLACES)) for (const url of place.tilesets) {
    const source = view.addSource({ type: "3d-tiles", url } as any);
    view.addLayer({ type: "3d-tiles", source,
      model: { color: new Color().setHex(0xffffff), metalness: 0, roughness: 1 } } as any);
  }
  view.attribution?.add([
    { attribution: "3D City Model (Project PLATEAU), MLIT — 千代田区・中央区・新宿区 FY2023", attributionUrl: "https://www.mlit.go.jp/plateau/" },
    { attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" },
    { attribution: "地理院タイル（全国最新写真）", attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html" },
  ] as any);
  function readCamera() {
    const p = view.camera.positionGeographic;
    const o = view.camera.orientation;
    document.getElementById("cam")!.textContent = `実測 camera: lng ${p.lng.toFixed(6)} / lat ${p.lat.toFixed(6)} / height ${p.height.toFixed(1)}m ｜ heading ${o.heading.toFixed(2)}° / pitch ${o.pitch.toFixed(2)}° / roll ${o.roll.toFixed(2)}°`;
  }
  function applyPreset(key: PresetKey) {
    presetKey = key;
    const base = PLACES[placeKey].camera;
    const p = PRESETS[key];
    const camera = key === "hero" ? { ...base } : { ...base, distance: p.distance, pitch: p.pitch, heading: base.heading + p.heading };
    view.setCamera(camera as any);
    document.getElementById("target")!.textContent = `設定 target: ${camera.lng}, ${camera.lat} ｜ distance ${camera.distance}m ｜ heading ${camera.heading}° / pitch ${camera.pitch}° / roll ${camera.roll}°`;
    document.getElementById("place-label")!.textContent = PLACES[placeKey].label;
    document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.preset === key)));
    document.querySelectorAll<HTMLButtonElement>("[data-place]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.place === placeKey)));
    setStatus(`${p.label} — ${p.note}。操作可能／タイル取得・描画完了は未確認。`);
    readCamera();
  }
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(b => b.addEventListener("click", () => applyPreset(b.dataset.preset as PresetKey)));
  document.querySelectorAll<HTMLButtonElement>("[data-place]").forEach(b => b.addEventListener("click", () => { placeKey = b.dataset.place!; applyPreset("hero"); }));
  document.getElementById("capture")!.addEventListener("click", () => {
    try {
      const canvas = container.querySelector("canvas");
      if (!canvas) throw new Error("canvas がありません");
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `navara-camera-${placeKey}-${PRESETS[presetKey].label.toLowerCase().replaceAll(" ", "-")}-1740.png`;
      a.click();
      setStatus("キャプチャを保存しました（手動操作後は現在の画角を保存）。");
    } catch (error) { setStatus(`キャプチャ失敗: ${error}`); }
  });
  // No animation timer: refresh measurements after frames, including manual navigation.
  view.on("postRender", readCamera);
  applyPreset("hero");
  (window as any).__ready = true;
}
main().catch(error => { (window as any).__error = String(error); setStatus(`初期化エラー: ${error}`); });
