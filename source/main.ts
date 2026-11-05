import ThreeView, { Color } from "@navaramap/three";
import {
  DefaultPlugin,
  type DefaultDescriptions,
} from "@navaramap/three-default-plugin";

const statusEl = document.getElementById("status")!;
const setStatus = (s: string) => {
  statusEl.textContent = s;
  (window as any).__status = s;
};

// JST times on 2026-11-05. atmosphere.date is an absolute Date (UTC internally).
// groundTint multiplies the aerial-photo basemap: the photo itself is baked
// daylight and unlit, so day/sunset/night grading is done here explicitly.
const TIMES: Record<
  string,
  { label: string; iso: string; groundTint: number; ambient: number; exposure: number }
> = {
  day: { label: "昼 12:00 JST", iso: "2026-11-05T12:00:00+09:00", groundTint: 0xffffff, ambient: 0, exposure: 1.0 },
  sunset: { label: "夕 17:40 JST", iso: "2026-11-05T17:40:00+09:00", groundTint: 0xd8a878, ambient: 0.15, exposure: 1.05 },
  // Night: the photoreal sun/sky alone crushes to pure black, so lift the
  // scene with a blue ambient light + exposure and a brighter ground tint.
  night: { label: "夜 21:00 JST", iso: "2026-11-05T21:00:00+09:00", groundTint: 0x51628c, ambient: 0.6, exposure: 1.7 },
};

const params = new URLSearchParams(location.search);
const initialTime = params.get("time") ?? "day";
const initialPlace = params.get("place") ?? "tokyo";
// A/B diagnostic: "plain" mode replicates the official 3D Tiles buildings
// example exactly (no photoreal scene, simple ambient+sun lights). If
// buildings render in plain mode but not in photoreal mode, the photoreal
// scene (deferred lighting / aerial perspective) is the culprit.
const plainMode = params.get("mode") === "plain";

// PLATEAU 3D Tiles (FY2023, LOD2 no texture) — URLs verified by opening them.
// Tokyo tilesets are verbatim from the official Navara example; the Shinjuku
// tileset was located via the PLATEAU streaming catalog (GraphQL) and its
// region (lng 139.673–139.744, lat 35.674–35.730) covers the Tocho.
// Camera semantics (from the CameraPosition type doc in @navaramap/three
// 0.2.1): lng/lat/height is the TARGET point; `distance` places the camera
// that far from the target along its forward ray. So anchors below are the
// landmarks themselves. (A v4 attempt with "behind-target" anchors was
// wrong; v5 reverts to true targets and fixes the camera readout, which in
// v4 called a non-existent getCamera() — the real APIs are
// getCameraPositionLLE() / getCameraOrientation().)
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
const place = PLACES[initialPlace] ?? PLACES.tokyo;

async function main() {
  const container = document.getElementById("app")!;
  const view = new ThreeView<DefaultDescriptions>({
    container,
    shadow: true,
    atmosphere: { date: new Date(TIMES[initialTime]?.iso ?? TIMES.day.iso) },
  });
  (window as any).__view = view;

  const defaultPlugin = new DefaultPlugin();
  view.addPlugin(defaultPlugin);
  setStatus("WASM初期化中…");
  await view.init();
  let ambient: any;
  if (plainMode) {
    // Official buildings example: plain ambient + sun, no photoreal scene.
    view.addLight({ ambient: { intensity: 0.5 } } as any);
    view.addLight({ sun: { intensity: 2, applyColor: true } } as any);
    ambient = { update: () => {} };
  } else {
    const scene = defaultPlugin.addDefaultPhotorealScene();
    scene.sun.update({ sun: { castShadow: true } } as any);
    ambient = view.addLight({
      ambient: { intensity: 0, color: new Color().setHex(0x93a7cc) },
    } as any);
  }
  setStatus("シーン構築中…");

  // Terrain: Re:Earth quantized-mesh (ellipsoid) — photoreal recipe options
  // (skipped in plain mode to match the official example exactly).
  const terrainSource = view.addSource({
    type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18,
    ...(plainMode ? {} : { requestVertexNormals: true, requestWaterMask: true }),
  } as any);
  view.addLayer({
    type: "terrain",
    source: terrainSource,
    ...(plainMode ? {} : { terrain: { castShadow: true, receiveShadow: true } }),
  } as any);

  // Basemap: GSI seamless aerial photo.
  const photoSource = view.addSource({
    type: "raster-tile",
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    maxZoom: 18,
  } as any);
  const photoLayer = view.addLayer({ type: "raster", source: photoSource } as any);

  for (const url of place.tilesets) {
    const src = view.addSource({ type: "3d-tiles", url } as any);
    // NOTE: layer colors must be Color instances (per the official buildings
    // example). Passing a raw hex number here is the prime suspect for the
    // 3D Tiles layer silently rendering nothing in v1–v5.
    view.addLayer({
      type: "3d-tiles",
      source: src,
      model: { color: new Color().setHex(0xffffff), metalness: 0, roughness: 1 },
    } as any);
  }

  view.attribution?.add([
    {
      attribution: "3D City Model (Project PLATEAU) Chiyoda/Chuo Ward (FY2023) - MLIT",
      attributionUrl: "https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023",
    },
    { attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" },
    {
      attribution: "地理院タイル（全国最新写真）",
      attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html",
    },
  ] as any);

  view.setCamera(place.camera as any);
  document.title = `Navara × PLATEAU — ${place.label}`;
  const noteEl = document.getElementById("note");
  if (noteEl) {
    noteEl.textContent = `${place.note}／地形 Re:Earth Terrain／衛星写真 GSI seamlessphoto。太陽は atmosphere.date で制御。${plainMode ? "【plainモード：公式サンプル構成】" : "【photorealモード】"}`;
  }
  // Live camera readout: turns any screenshot into a camera diagnostic.
  const camEl = document.getElementById("cam");
  const showCam = () => {
    try {
      // Correct access path (v7): view.camera.positionGeographic / .orientation.
      // (v4–v6 tried a non-existent view.getCamera() and Core-internal getters.)
      const cam: any = (view as any).camera;
      const pos = cam?.positionGeographic;
      const ori = cam?.orientation;
      if (!pos || !ori) return;
      const txt = `cam lng ${(+pos.lng).toFixed(5)} / lat ${(+pos.lat).toFixed(5)} / h ${Math.round(+pos.height)}m / hd ${Math.round(+ori.heading)}° / pitch ${Math.round(+ori.pitch)}°`;
      if (camEl) camEl.textContent = txt;
      (window as any).__camera = { pos, heading: ori.heading, pitch: ori.pitch };
    } catch {
      /* readout is best-effort */
    }
  };
  showCam();
  setInterval(showCam, 2000);
  try {
    (view as any).on("idle", () => {
      showCam();
      setStatus(`読み込み完了（${(window as any).__timeLabel ?? ""}）`);
    });
  } catch {
    /* idle event optional */
  }
  const h1 = document.querySelector("#ui h1");
  if (h1) h1.textContent = `Navara × PLATEAU — ${place.label}`;

  const applyTime = (key: string) => {
    const t = TIMES[key];
    if (!t) return;
    view.atmosphere.date = new Date(t.iso);
    photoLayer.update({ raster: { color: new Color().setHex(t.groundTint) } } as any);
    ambient.update({ ambient: { intensity: t.ambient } } as any);
    view.toneMappingExposure = t.exposure;
    view.forceUpdate();
    document
      .querySelectorAll("button[data-time]")
      .forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.time === key));
    setStatus(`時刻: ${t.label} に設定。タイル読み込み待ち…`);
    (window as any).__timeKey = key;
    (window as any).__timeLabel = t.label;
  };
  document.querySelectorAll("button[data-time]").forEach((b) => {
    b.addEventListener("click", () => applyTime((b as HTMLElement).dataset.time!));
  });
  applyTime(initialTime);

  document.getElementById("capture")!.addEventListener("click", () => {
    const canvas = container.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = (canvas as HTMLCanvasElement).toDataURL("image/png");
    a.download = `navara-${initialPlace}-${(window as any).__timeKey ?? "day"}.png`;
    a.click();
    setStatus("キャプチャをダウンロードしました");
  });

  (window as any).__ready = true;
  setStatus(`準備完了（${TIMES[initialTime]?.label ?? ""}）。タイルは順次読み込まれます。`);
}

main().catch((e) => {
  console.error(e);
  setStatus(`エラー: ${e?.message ?? e}`);
  (window as any).__error = String(e?.stack ?? e);
});
