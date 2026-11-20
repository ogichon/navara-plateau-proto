import ThreeView, { Color } from "@navaramap/three";
import { DefaultPlugin } from "@navaramap/three-default-plugin";

// GHOST LINES 3D spike: year-tagged railway polylines floating at +60 m over
// the real PLATEAU city (Chiyoda + Chuo, LOD2 no texture), buildings dropped
// to a near-black mass. Questions, in order:
//   1. Can geodetic polylines be drawn at an arbitrary height with a glow?
//      -> PolylineMeshDesc via view.addMesh (one mesh per OSM way: the SDK
//         throws on multi-line input), clampToGround:false + height:60,
//         lit:false + emissive + selective bloom.
//   2. Do the lines stay readable over near-invisible buildings?
//      -> night scene, model color 0x39404a, dim blue ambient. (Visual
//         balance is NOT verifiable from the agent browser; diagnostics only.)
//   3. Year switching (1900 / 1925 / 2025) from an oblique camera.
//      -> one mesh per way, toggled with handle.update({ visible }).

const tilesets = [
  { name: "千代田区", url: "https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json" },
  { name: "中央区", url: "https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json" },
];
const LINE_HEIGHT = 60;
const STATES = [1900, 1925, 2025] as const;

type Way = { y: number; l: string; g: [number, number][] };
type LineEntry = { year: number; lid: string; visible: boolean; handle: { update(u: unknown): void } };

const diagnostics = {
  initialized: false, stopped: false, frames: 0, idleObserved: false,
  state: 1925,
  lines: { total: 0, created: 0, failed: 0, firstFailure: "", creationMs: 0, visible: 0, perState: {} as Record<number, number> },
  tiles: tilesets.map(t => ({ ...t, resourcesCompleted: 0, httpErrors: 0, featureSets: 0 })),
  errors: [] as string[], visualAssessment: "未判定",
};
(window as any).__ghost = diagnostics;
const status = document.getElementById("status")!;
const yearLabel = document.getElementById("year")!;
function report() {
  status.textContent = `${diagnostics.tiles.map(t => `${t.name}: 取得応答${t.resourcesCompleted} / feature更新${t.featureSets} / HTTPエラー${t.httpErrors}`).join("、")}\n線メッシュ 生成 ${diagnostics.lines.created} / 失敗 ${diagnostics.lines.failed} / 全 ${diagnostics.lines.total}（生成 ${diagnostics.lines.creationMs} ms）${diagnostics.lines.firstFailure ? ` / 初回失敗 ${diagnostics.lines.firstFailure}` : ""}\n表示中 ${diagnostics.lines.visible} 本（状態 ${diagnostics.state} 年）/ 状態別 ${STATES.map(y => `${y}:${diagnostics.lines.perState[y] ?? 0}`).join(" ")}\n描画イベント ${diagnostics.frames} / ${diagnostics.stopped ? "停止" : "稼働"} / エラー ${diagnostics.errors.length}${diagnostics.errors.length ? `: ${diagnostics.errors[0]}` : ""}\n取得応答はwindowで観測できた分のみ（Worker内取得は観測外）。生成数はGPU描画成功数ではありません。見た目は未判定。`;
}
function recordError(error: unknown) {
  const message = String(error);
  if (!diagnostics.errors.includes(message)) diagnostics.errors.push(message);
  diagnostics.stopped = true;
  report();
}
window.addEventListener("error", event => recordError(event.message));
window.addEventListener("unhandledrejection", event => recordError(event.reason));

// Line styling echoes the 2D animation: warm amber network, the Yamanote ring
// a step brighter, and the 1925 closure segments (the ring's last link,
// Ueno-Tokyo) near-white so the 1925 state carries its event in the data.
function lineStyle(way: Way) {
  if (way.l === "yamanote" && way.y === 1925)
    return { color: 0xfff1cf, intensity: 2.4, width: 4 };
  if (way.l === "yamanote")
    return { color: 0xffc06a, intensity: 1.8, width: 3 };
  return { color: 0xff9a3c, intensity: 1.35, width: 3 };
}

async function main() {
  const view = new ThreeView({
    container: document.getElementById("app")!, shadow: false,
    backgroundColor: new Color().setHex(0x05070a),
    atmosphere: { date: new Date("2026-11-09T21:00:00+09:00") },
  } as any);
  view.addPlugin(new DefaultPlugin());
  (window as any).__view = view;
  await view.init();
  view.globe.color = new Color().setHex(0x0a0c0f);
  // Night recipe (v14 lineage): dim blue ambient lifts the city out of pure
  // black; a weak sun keeps a hint of facade direction. Buildings use a dark
  // blue-grey albedo so they read as mass/silhouette, never as the subject.
  view.addLight({ ambient: { intensity: 0.5, color: new Color().setHex(0x8fa3c7) } });
  view.addLight({ sun: { intensity: 0.6, applyColor: true, castShadow: false } } as any);
  view.toneMappingExposure = 1.15;
  try {
    view.addEffect({ id: "ghost-bloom", selectiveBloom: { strength: 0.9, radius: 0.55, threshold: 0.5, smoothing: 0.2 } } as any);
  } catch (error) { recordError(`bloom追加失敗: ${error}`); }
  const terrain = view.addSource({ type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18, requestVertexNormals: true, requestWaterMask: true });
  view.addLayer({ type: "terrain", source: terrain,
    terrain: { lit: true, castShadow: false, receiveShadow: false } });
  for (const [index, tile] of tilesets.entries()) {
    const source = view.addSource({ type: "3d-tiles", url: tile.url } as any);
    const layer = view.addLayer({ type: "3d-tiles", source,
      model: { color: new Color().setHex(0x39404a), metalness: 0, roughness: 1,
        lit: true, castShadow: false, receiveShadow: false } } as any);
    // No styling to apply; the listener only proves tile features stream in.
    layer.on("featureUpdated", () => { diagnostics.tiles[index].featureSets++; report(); });
  }

  // --- Lines -------------------------------------------------------------
  const entries: LineEntry[] = [];
  const response = await fetch("./ghost-lines.json");
  if (!response.ok) throw new Error(`ghost-lines.json取得失敗: HTTP ${response.status}`);
  const ways = (await response.json()) as Way[];
  diagnostics.lines.total = ways.length;
  for (const y of STATES) diagnostics.lines.perState[y] = ways.filter(w => w.y <= y).length;
  const started = performance.now();
  for (const way of ways) {
    const style = lineStyle(way);
    const color = new Color().setHex(style.color);
    try {
      const handle = view.addMesh({
        lit: false,
        visible: way.y <= diagnostics.state,
        effectIds: ["ghost-bloom"],
        polyline: {
          positions: way.g.map(([lng, lat]) => ({ lng, lat, height: 0 })),
          clampToGround: false,
          height: LINE_HEIGHT,
          color, emissiveColor: color, emissiveIntensity: style.intensity,
          width: style.width, maxWidth: 7,
          castShadow: false, receiveShadow: false,
        },
      } as any) as LineEntry["handle"];
      entries.push({ year: way.y, lid: way.l, visible: way.y <= diagnostics.state, handle });
      diagnostics.lines.created++;
    } catch (error) {
      // A single bad way is data for the spike, not a halt: count and continue.
      diagnostics.lines.failed++;
      if (!diagnostics.lines.firstFailure)
        diagnostics.lines.firstFailure = `lid=${way.l} year=${way.y}: ${error}`;
    }
  }
  diagnostics.lines.creationMs = Math.round(performance.now() - started);
  diagnostics.lines.visible = entries.filter(e => e.visible).length;
  (window as any).__ghostEntries = entries;

  function setYear(year: number) {
    diagnostics.state = year;
    yearLabel.textContent = String(year);
    for (const button of document.querySelectorAll("nav button"))
      button.setAttribute("aria-pressed", String(button.id === `y${year}`));
    let visible = 0;
    for (const entry of entries) {
      const next = entry.year <= year;
      if (next !== entry.visible) {
        entry.handle.update({ visible: next });
        entry.visible = next;
      }
      if (next) visible++;
    }
    diagnostics.lines.visible = visible;
    view.forceUpdate();
    report();
  }
  for (const year of STATES)
    document.getElementById(`y${year}`)!.addEventListener("click", () => setYear(year));

  // Resource Timing observes SDK/worker fetch completions without replacing fetch.
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      const tile = diagnostics.tiles.find(t => entry.name.startsWith(t.url.slice(0, t.url.lastIndexOf("/") + 1)));
      if (!tile) continue;
      tile.resourcesCompleted++;
      if (entry.responseStatus >= 400) { tile.httpErrors++; recordError(`HTTP ${entry.responseStatus}: ${entry.name}`); }
    }
    report();
  });
  observer.observe({ type: "resource", buffered: true });
  view.on("postRender", () => { diagnostics.frames++; if (diagnostics.frames % 60 === 1) report(); });
  view.on("idle", () => { diagnostics.idleObserved = true; report(); });
  view.attribution?.add([
    { attribution: "Project PLATEAU 千代田区 (2023) — MLIT", attributionUrl: "https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2023" },
    { attribution: "Project PLATEAU 中央区 (2023) — MLIT", attributionUrl: "https://www.geospatial.jp/ckan/dataset/plateau-13102-chuo-ku-2023" },
    { attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" },
    { attribution: "Railway data © OpenStreetMap contributors (ODbL)", attributionUrl: "https://www.openstreetmap.org/copyright" },
  ]);
  view.setCamera({ lng: 139.7671, lat: 35.6812, distance: 3200, heading: 25, pitch: -48, roll: 0 });
  diagnostics.initialized = true;
  report();
}
main().catch(recordError);
