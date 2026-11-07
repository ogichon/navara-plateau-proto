import ThreeView, { Color } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";

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

type Direction = "cyberpunk" | "gold" | "holographic";
type Phase = "before" | "after" | "wave" | "complete";
// After terrain bypasses lighting; bright tints retain each ground hue.
// Ambient fill and exposure support building faces independently of ground lighting.
const LOOKS = {
  cyberpunk: { label: "Cyberpunk", base: 0x111127, tint: 0xa5b6da, ambient: 0.3, exposure: 1.1, steadyMultiplier: 1.0,
    stops: [[0, 0x32d8ed], [65, 0x7359ef], [150, 0xf044c0], [230, 0xffd578]] },
  gold: { label: "Gold Apocalypse", base: 0x171719, tint: 0xe4c99f, ambient: 0.3, exposure: 1.1, steadyMultiplier: 1.0,
    stops: [[0, 0x9d510e], [100, 0xe5a72e], [240, 0xffe8a0]] },
  holographic: { label: "Holographic City", base: 0x070d10, tint: 0xb1ced2, ambient: 0.3, exposure: 1.1, steadyMultiplier: 1.5,
    stops: [[0, 0xdde9e8], [120, 0x98ceca], [240, 0x72bdb8]] },
} satisfies Record<Direction, { label: string; base: number; tint: number; ambient: number; exposure: number; steadyMultiplier: number; stops: number[][] }>;
const initialPlace = new URLSearchParams(location.search).get("place");
const placeKey = initialPlace === "tocho" ? "tocho" : "tokyo";
const place = PLACES[placeKey];
const statusEl = document.getElementById("status")!;
const controls = document.querySelectorAll<HTMLButtonElement>("button");
const setStatus = (text: string) => { statusEl.textContent = text; (window as any).__status = text; };
const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const gradient = (stops: number[][], h: number) => {
  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i][0]) return mix(stops[i-1][1], stops[i][1], Math.max(0, (h-stops[i-1][0])/(stops[i][0]-stops[i-1][0])));
  }
  return stops[stops.length-1][1];
};
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);

async function main() {
  let basemapCheck = false;
  let direction: Direction = "cyberpunk";
  let phase: Phase = "before";
  let radius = -240;
  let startedAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const evaluators = new Map<bigint, any>();
  // 15 km covers the selected ward datasets, including buildings outside the camera.
  const CITY_RADIUS = 15000;
  const FRONT_WIDTH = 240;
  const SPEED = 900; // metres / second; ~17 s for the entire ward coverage.
  const container = document.getElementById("app")!;
  const view = new ThreeView<DefaultDescriptions>({ container, shadow: true,
    atmosphere: { date: new Date("2026-11-05T17:40:00+09:00") } });
  (window as any).__view = view;
  const plugin = new DefaultPlugin();
  view.addPlugin(plugin);
  setStatus("WASM初期化中…");
  await view.init();
  const scene = plugin.addDefaultPhotorealScene();
  scene.sun.update({ sun: { castShadow: true, shadowMapSize: 4096, shadowNormalBias: 0.5 } } as any);
  const ambient = view.addLight({ ambient: { intensity: 0.15, color: new Color().setHex(0x93a7cc) } } as any);
  const clouds = view.addEffect({ clouds: { coverage: 0.45, lightShafts: true, haze: true } } as any);
  view.addEffect({ selectiveBloom: { strength: 0.85, radius: 0.6, threshold: 0.55, smoothing: 0.2 } } as any);
  const terrainSource = view.addSource({
    type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18,
    requestVertexNormals: true, requestWaterMask: true,
  } as any);
  const terrainLayer = view.addLayer({
    type: "terrain",
    source: terrainSource,
    terrain: { castShadow: true, receiveShadow: true },
  } as any);

  // Basemap: GSI seamless aerial photo.
  const photoSource = view.addSource({
    type: "raster-tile",
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    maxZoom: 18,
  } as any);
  const photoLayer = view.addLayer({ type: "raster", source: photoSource } as any);


  const white = () => ({ color: new Color().setHex(0xffffff), emissive: new Color().setHex(0), emissiveIntensity: 0, opacity: 1, show: true });
  // Reads shared animation state only; late arriving tiles receive the same wave position.
  const styleFeature = ({ properties: p }: { properties?: Record<string, unknown> }) => {
    if (phase === "before") return white();
    const look = LOOKS[direction];
    const h = finite(p?.["bldg:measuredHeight"]) ? Math.max(0, p!["bldg:measuredHeight"] as number) : 0;
    let passed = 1;
    let front = 0;
    if (phase === "wave") {
      // Missing centroids stay white until completion rather than inventing a location.
      if (!finite(p?.["_x"]) || !finite(p?.["_y"])) return white();
      const dx = ((p!._x as number) - place.camera.lng) * 111320 * Math.cos(place.camera.lat * Math.PI / 180);
      const dy = ((p!._y as number) - place.camera.lat) * 110540;
      const distance = Math.hypot(dx, dy);
      passed = Math.max(0, Math.min(1, (radius - distance) / FRONT_WIDTH));
      front = Math.max(0, 1 - Math.abs(radius - distance) / FRONT_WIDTH);
      if (passed === 0 && front === 0) return white();
    }
    return { color: new Color().setHex(mix(0xffffff, look.base, Math.max(passed, front))),
      emissive: new Color().setHex(gradient(look.stops, h)),
      emissiveIntensity: passed * (0.12 + Math.min(h / 240, 1) * 0.18) * look.steadyMultiplier + front * 4,
      opacity: 1, show: true };
  };
  const refresh = () => {
    for (const [featureSetId, ev] of evaluators) {
      try { ev.evaluate(styleFeature); }
      catch (error) { evaluators.delete(featureSetId); console.warn("Discarding unavailable feature evaluator", error); }
    }
    view.forceUpdate();
  };
  for (const url of place.tilesets) {
    const source = view.addSource({ type: "3d-tiles", url } as any);
    const layer = view.addLayer({ type: "3d-tiles", source,
      model: { color: new Color().setHex(0xffffff), metalness: 0, roughness: 1 } } as any);
    layer.on("featureUpdated", (params: any) => {
      const { featureSetId, evaluator: ev } = params;
      evaluators.set(featureSetId, ev);
      ev.evaluate(styleFeature);
    });
    layer.on("featureRemoved", ({ featureSetId }: any) => { evaluators.delete(featureSetId); });
  }
  view.attribution?.add([
    { attribution: `3D City Model (Project PLATEAU) ${placeKey === "tocho" ? "Shinjuku" : "Chiyoda / Chuo"} (FY2023) — MLIT`,
      attributionUrl: `https://www.geospatial.jp/ckan/dataset/plateau-${placeKey === "tocho" ? "13104-shinjuku-ku" : "13101-chiyoda-ku"}-2023` },
    { attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" },
    { attribution: "地理院タイル（全国最新写真）", attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html" },
  ] as any);
  view.setCamera(place.camera as any);
  document.getElementById("place-label")!.textContent = place.label;
  document.title = `TOKYO // AWAKENING — ${place.label}`;
  const report = () => {
    const state = phase === "before" ? "Before — 夕景 / 白モデル" : `${LOOKS[direction].label} — ${phase === "wave" ? `覚醒中 ${Math.max(0, Math.min(100, Math.round(radius / CITY_RADIUS * 100)))}%` : phase === "complete" ? "完了" : "After"}`;
    setStatus(`${place.label} / ${state}${basemapCheck ? " / ベースマップ確認中" : ""}`);
    document.querySelectorAll<HTMLButtonElement>("[data-look]").forEach(b => {
      const active = b.dataset.look === (phase === "before" ? "before" : direction);
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  };
  // Raster-only diagnostic: never change scene lighting or building evaluation.
  const applyPhoto = () => photoLayer.update({ raster: {
    color: new Color().setHex(basemapCheck ? 0xffffff : phase === "before" ? 0xd8a878 : LOOKS[direction].tint),
    opacity: 1,
  } } as any);
  const photoButton = document.createElement("button");
  photoButton.id = "basemap-check";
  photoButton.textContent = "ベースマップ確認";
  photoButton.setAttribute("aria-pressed", "false");
  document.getElementById("capture")!.insertAdjacentElement("afterend", photoButton);
  photoButton.addEventListener("click", () => {
    basemapCheck = !basemapCheck;
    photoButton.setAttribute("aria-pressed", String(basemapCheck));
    applyPhoto(); view.forceUpdate(); report();
  });
  const grade = (before: boolean) => {
    const look = LOOKS[direction];
    view.atmosphere.date = new Date(before ? "2026-11-05T17:40:00+09:00" : "2026-11-05T16:30:00+09:00");
    // Remove distance extinction in After; restore defaults in Before.
    // Leave inscatter unchanged to preserve the sky coloration.
    scene.aerialPerspective.update({ aerialPerspective: { transmittance: before } } as any);
    clouds.update({ clouds: { hazeDensityScale: before ? 3e-5 : 0 } } as any);
    // Layer.update replaces config: retain the source and shadow settings.
    terrainLayer.update({ type: "terrain", source: terrainSource,
      terrain: { castShadow: true, receiveShadow: true, lit: before } } as any);
    applyPhoto();
    ambient.update({ ambient: { intensity: before ? 0.15 : look.ambient } } as any);
    view.toneMappingExposure = before ? 1.05 : look.exposure;
  };
  const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  document.querySelectorAll<HTMLButtonElement>("[data-look]").forEach(b => b.addEventListener("click", () => {
    stop();
    const key = b.dataset.look!;
    phase = key === "before" ? "before" : "after";
    if (key !== "before") direction = key as Direction;
    grade(phase === "before"); refresh(); report();
  }));
  document.getElementById("awaken")!.addEventListener("click", () => {
    stop();
    phase = "before"; radius = -FRONT_WIDTH; grade(true); refresh(); report();
    startedAt = performance.now();
    // A brief Before hold makes replay's reset observable, even after an After preview.
    timer = setInterval(() => {
      const elapsed = performance.now() - startedAt - 500;
      if (elapsed < 0) return;
      if (phase === "before") { phase = "wave"; grade(false); }
      radius = elapsed / 1000 * SPEED - FRONT_WIDTH;
      if (radius >= CITY_RADIUS + FRONT_WIDTH) { phase = "complete"; stop(); }
      refresh(); report();
    }, 1000 / 12);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-place]").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.place === placeKey));
    b.addEventListener("click", () => { location.search = `?place=${b.dataset.place}`; });
  });
  document.getElementById("capture")!.addEventListener("click", () => {
    try {
      const canvas = container.querySelector("canvas");
      if (!canvas) throw new Error("canvas unavailable");
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `awakening-${placeKey}-${phase === "before" ? "before" : direction}-${phase}.png`;
      a.click();
      report(); statusEl.textContent += " / キャプチャをダウンロードしました";
    } catch (error) { report(); statusEl.textContent += ` / キャプチャ失敗: ${error}`; }
  });
  window.addEventListener("pagehide", stop, { once: true });
  window.addEventListener("pageshow", () => {
    if (phase !== "wave") return;
    stop(); phase = "before";
    grade(true); refresh(); report();
  });
  grade(true); refresh(); report();
  controls.forEach(b => b.disabled = false);
  (window as any).__ready = true;
}
main().catch(error => {
  console.error(error); setStatus(`エラー: ${error?.message ?? error}`);
  (window as any).__error = String(error?.stack ?? error);
});
