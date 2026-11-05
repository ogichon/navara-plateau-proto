import ThreeView from "@navaramap/three";
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
const TIMES: Record<string, { label: string; iso: string }> = {
  day: { label: "昼 12:00 JST", iso: "2026-11-05T12:00:00+09:00" },
  sunset: { label: "夕 17:40 JST", iso: "2026-11-05T17:40:00+09:00" },
  night: { label: "夜 21:00 JST", iso: "2026-11-05T21:00:00+09:00" },
};

const params = new URLSearchParams(location.search);
const initialTime = params.get("time") ?? "day";
const initialPlace = params.get("place") ?? "tokyo";

// PLATEAU 3D Tiles (FY2023, LOD2 no texture) — URLs verified by opening them.
// Tokyo tilesets are verbatim from the official Navara example; the Shinjuku
// tileset was located via the PLATEAU streaming catalog (GraphQL) and its
// region (lng 139.673–139.744, lat 35.674–35.730) covers the Tocho.
const PLACES: Record<
  string,
  { label: string; tilesets: string[]; camera: Record<string, number> }
> = {
  tokyo: {
    label: "東京駅",
    tilesets: [
      "https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json",
      "https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json",
    ],
    // Official example: lng 139.7671 / lat 35.6812 / distance 1000 / heading 50 / pitch -35.
    camera: { lng: 139.7671, lat: 35.6812, distance: 1100, heading: 55, pitch: -32, roll: 0 },
  },
  tocho: {
    label: "都庁（新宿）",
    tilesets: [
      "https://assets.cms.plateau.reearth.io/assets/f0/840fc4-114c-41e4-9a65-67768efd3629/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod2_no_texture/tileset.json",
    ],
    // Tocho at lng 139.6917 / lat 35.6896, viewed from the south-west
    // (Central Park side), mirroring the Blender shot.
    camera: { lng: 139.6917, lat: 35.6896, distance: 1200, heading: 40, pitch: -28, roll: 0 },
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
  defaultPlugin.addDefaultPhotorealScene();
  setStatus("シーン構築中…");

  // Terrain: Re:Earth quantized-mesh (ellipsoid) — same dataset as the official Navara example.
  const terrainSource = view.addSource({
    type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18,
  } as any);
  view.addLayer({ type: "terrain", source: terrainSource } as any);

  // Basemap: GSI seamless aerial photo.
  const photoSource = view.addSource({
    type: "raster-tile",
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    maxZoom: 18,
  } as any);
  view.addLayer({ type: "raster", source: photoSource } as any);

  for (const url of place.tilesets) {
    const src = view.addSource({ type: "3d-tiles", url } as any);
    view.addLayer({
      type: "3d-tiles",
      source: src,
      model: { color: 0xffffff, metalness: 0, roughness: 1 },
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
  const h1 = document.querySelector("#ui h1");
  if (h1) h1.textContent = `Navara × PLATEAU — ${place.label}`;

  const applyTime = (key: string) => {
    const t = TIMES[key];
    if (!t) return;
    view.atmosphere.date = new Date(t.iso);
    view.forceUpdate();
    document
      .querySelectorAll("button[data-time]")
      .forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.time === key));
    setStatus(`時刻: ${t.label} に設定。タイル読み込み待ち…`);
    (window as any).__timeKey = key;
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
