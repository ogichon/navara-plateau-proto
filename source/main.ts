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
const initialTime = params.get("time") ?? "sunset";
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
  // Shared mutable state, declared up front: several helpers below are
  // function declarations (hoisted) that close over these, and applyTime()
  // runs before the sections that assign them.
  let tlTimer: ReturnType<typeof setInterval> | null = null;
  let cinemaTimer: ReturnType<typeof setInterval> | null = null;
  let cloudsHandle: any = null;
  let cloudsOn = true;

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
    // Navara's signature look (takram): volumetric clouds with light shafts
    // and haze, plus selective bloom so emissive features actually glow.
    // The base photoreal scene includes neither — both are separate effects.
    try {
      cloudsHandle = view.addEffect({
        clouds: { coverage: 0.45, lightShafts: true, haze: true },
      } as any);
    } catch (e) {
      console.warn("clouds unavailable", e);
    }
    try {
      view.addEffect({
        selectiveBloom: { strength: 0.85, radius: 0.6, threshold: 0.55, smoothing: 0.2 },
      } as any);
    } catch (e) {
      console.warn("selective bloom unavailable", e);
    }
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

  const buildingLayers: any[] = [];
  for (const url of place.tilesets) {
    const src = view.addSource({ type: "3d-tiles", url } as any);
    // NOTE: layer colors must be Color instances (official example parity).
    // (The actual cause of the invisible buildings in v1–v10 was the missing
    // Draco decoder wasm in the build output — see README/vite.config.ts.)
    const layer = view.addLayer({
      type: "3d-tiles",
      source: src,
      model: { color: new Color().setHex(0xffffff), metalness: 0, roughness: 1 },
    } as any);
    buildingLayers.push(layer);
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

  const applyGrading = (
    date: Date,
    tintHex: number,
    ambientIntensity: number,
    exposure: number,
  ) => {
    view.atmosphere.date = date;
    photoLayer.update({ raster: { color: new Color().setHex(tintHex) } } as any);
    ambient.update({ ambient: { intensity: ambientIntensity } } as any);
    view.toneMappingExposure = exposure;
    view.forceUpdate();
  };

  const applyTime = (key: string) => {
    const t = TIMES[key];
    if (!t) return;
    stopTimelapse();
    stopCinema();
    applyGrading(new Date(t.iso), t.groundTint, t.ambient, t.exposure);
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

  // ---- ② Time-lapse: sweep the sun 04:30 → 21:00 JST with graded keyframes.
  type Key = { h: number; tint: number; ambient: number; exposure: number };
  const KEYS: Key[] = [
    { h: 4.5, tint: 0x51628c, ambient: 0.6, exposure: 1.7 },
    { h: 6.0, tint: 0xc7a184, ambient: 0.3, exposure: 1.25 },
    { h: 7.5, tint: 0xe8ddcb, ambient: 0.1, exposure: 1.05 },
    { h: 12.0, tint: 0xffffff, ambient: 0, exposure: 1.0 },
    { h: 16.5, tint: 0xf5e3c2, ambient: 0.05, exposure: 1.0 },
    { h: 17.67, tint: 0xd8a878, ambient: 0.15, exposure: 1.05 },
    { h: 19.0, tint: 0x5d6c96, ambient: 0.45, exposure: 1.45 },
    { h: 21.0, tint: 0x51628c, ambient: 0.6, exposure: 1.7 },
  ];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerpHex = (a: number, b: number, t: number) => {
    const ch = (shift: number) =>
      Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t));
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };
  const gradingAt = (h: number): Key => {
    for (let i = 0; i < KEYS.length - 1; i++) {
      const k0 = KEYS[i];
      const k1 = KEYS[i + 1];
      if (h >= k0.h && h <= k1.h) {
        const t = (h - k0.h) / (k1.h - k0.h || 1);
        return {
          h,
          tint: lerpHex(k0.tint, k1.tint, t),
          ambient: lerp(k0.ambient, k1.ambient, t),
          exposure: lerp(k0.exposure, k1.exposure, t),
        };
      }
    }
    return KEYS[KEYS.length - 1];
  };
  const dateAt = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const p = (n: number) => String(n).padStart(2, "0");
    return new Date(`2026-11-05T${p(hh)}:${p(mm)}:00+09:00`);
  };
  const tlButton = document.getElementById("timelapse");
  function stopTimelapse() {
    if (tlTimer) {
      clearInterval(tlTimer);
      tlTimer = null;
      if (tlButton) tlButton.textContent = "▶ タイムラプス";
    }
  }
  tlButton?.addEventListener("click", () => {
    if (tlTimer) {
      stopTimelapse();
      setStatus("タイムラプスを停止しました");
      return;
    }
    let h = KEYS[0].h;
    const STEP_H = 0.25; // 15 min of scene time per tick
    const TICK_MS = 450; // ≈34 s for the full sweep
    if (tlButton) tlButton.textContent = "⏸ 停止";
    const tick = () => {
      const g = gradingAt(h);
      applyGrading(dateAt(h), g.tint, g.ambient, g.exposure);
      const hh = Math.floor(h);
      const mm = Math.floor((h - hh) * 60);
      const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} JST`;
      setStatus(`タイムラプス再生中… ${label}`);
      (window as any).__timeLabel = label;
      h += STEP_H;
      if (h > KEYS[KEYS.length - 1].h) {
        stopTimelapse();
        setStatus("タイムラプス完了（夜 21:00 JST）");
      }
    };
    tick();
    tlTimer = setInterval(tick, TICK_MS);
  });

  // ---- ③ Impact styling: per-feature colors driven by PLATEAU batch
  // attributes (verified in the B3DM batch table: "bldg:measuredHeight" is a
  // binary DOUBLE; flood depths are plain numbers under keys ending in
  // "_浸水深", one per river basin / storm-surge scenario).
  type StyleMode = "normal" | "rainbow" | "flood";
  let styleMode: StyleMode = "normal";
  const heightOf = (p: Record<string, unknown> | undefined): number => {
    const v = (p?.["bldg:measuredHeight"] ?? p?.["height"]) as number;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const floodDepthOf = (p: Record<string, unknown> | undefined): number => {
    if (!p) return 0;
    let max = 0;
    for (const [k, v] of Object.entries(p)) {
      if (k.endsWith("_浸水深") && typeof v === "number" && v > max) max = v;
    }
    return max;
  };
  const RAINBOW: [number, number][] = [
    [0, 0x7b2ff7],
    [15, 0x2f6bff],
    [30, 0x00c2ff],
    [50, 0x00e676],
    [80, 0xf9e04b],
    [120, 0xff9100],
    [170, 0xff2d78],
    [240, 0xff1744],
  ];
  const grad = (stops: [number, number][], v: number): number => {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [v0, c0] = stops[i];
      const [v1, c1] = stops[i + 1];
      if (v <= v1) return lerpHex(c0, c1, (v - v0) / (v1 - v0 || 1));
    }
    return stops[stops.length - 1][1];
  };
  const styleFeature = ({ properties }: any) => {
    if (styleMode === "rainbow") {
      const c = new Color().setHex(grad(RAINBOW, heightOf(properties)));
      return { color: c, emissive: c, emissiveIntensity: 0.35, opacity: 1 };
    }
    if (styleMode === "flood") {
      const d = floodDepthOf(properties);
      const hex =
        d <= 0 ? 0x2e3a4a : d < 0.5 ? 0x39c2d7 : d < 1 ? 0x1e88e5 : d < 2 ? 0x3949ab : d < 3.5 ? 0x8e24aa : 0xff1744;
      const c = new Color().setHex(hex);
      return {
        color: c,
        emissive: c,
        emissiveIntensity: d >= 2 ? 0.8 : 0.15,
        opacity: d <= 0 ? 0.5 : 1,
      };
    }
    return {
      color: new Color().setHex(0xffffff),
      emissive: new Color().setHex(0x000000),
      emissiveIntensity: 0,
      opacity: 1,
    };
  };
  const refreshStyles = () => {
    for (const l of buildingLayers) {
      try {
        l.forceUpdate();
      } catch {
        /* best effort */
      }
    }
  };
  for (const l of buildingLayers) {
    try {
      l.on("featureUpdated", (params: any) => {
        const ev = params?.evaluator ?? params;
        ev.evaluate(styleFeature);
      });
    } catch (e) {
      console.warn("featureUpdated hook failed", e);
    }
  }
  const setStyleMode = (mode: StyleMode) => {
    styleMode = mode;
    document
      .querySelectorAll("button[data-style]")
      .forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.style === mode));
    if (mode === "flood") {
      // Drowning-city mood: dusk sun + deep-blue ground.
      stopTimelapse();
      applyGrading(new Date("2026-11-05T18:20:00+09:00"), 0x27405e, 0.35, 1.25);
      setStatus("🌊 浸水モード：浸水深（河川・高潮の想定最大値）で色分け。半透明=想定なし、赤=3.5m以上");
    } else {
      applyTime((window as any).__timeKey ?? "day");
      setStatus(
        mode === "rainbow"
          ? "🌈 カラフルモード：建物の高さ（実測）で色分け。紫=低層 → 赤=超高層"
          : "通常モード（白モデル）",
      );
    }
    refreshStyles();
  };
  document.querySelectorAll("button[data-style]").forEach((b) => {
    b.addEventListener("click", () => setStyleMode((b as HTMLElement).dataset.style as StyleMode));
  });

  // ---- Cinematic camera: slow orbit around the target, plus cloud toggle.
  const orbit = {
    lng: place.camera.lng,
    lat: place.camera.lat,
    distance: place.camera.distance,
    heading: place.camera.heading,
    pitch: place.camera.pitch,
    roll: 0,
  };
  function stopCinema() {
    if (cinemaTimer) {
      clearInterval(cinemaTimer);
      cinemaTimer = null;
      const b = document.getElementById("cinema");
      if (b) b.textContent = "🎥 シネマ";
    }
  }
  document.getElementById("cinema")?.addEventListener("click", () => {
    if (cinemaTimer) {
      stopCinema();
      setStatus("シネマモードを停止しました");
      return;
    }
    const b = document.getElementById("cinema");
    if (b) b.textContent = "⏸ シネマ停止";
    setStatus("🎥 シネマモード：ゆっくり周回中（画面を触ると止まります）");
    cinemaTimer = setInterval(() => {
      orbit.heading = (orbit.heading + 0.12) % 360;
      view.setCamera({ ...orbit } as any);
    }, 50);
  });
  container.addEventListener("pointerdown", () => stopCinema());
  document.getElementById("clouds")?.addEventListener("click", (e) => {
    if (!cloudsHandle) {
      setStatus("雲はフォトリアルモードでのみ利用できます");
      return;
    }
    cloudsOn = !cloudsOn;
    try {
      cloudsHandle.update({ visible: cloudsOn } as any);
    } catch {
      /* best effort */
    }
    view.forceUpdate();
    (e.currentTarget as HTMLElement).classList.toggle("active", cloudsOn);
    setStatus(cloudsOn ? "☁️ 立体雲オン" : "雲オフ");
  });

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
