import ThreeView, { Color } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";
import { BufferAttribute, Vector3, type Material, type Mesh } from "three";

const tilesets = [
  { name: "千代田区", url: "https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json" },
  { name: "中央区", url: "https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json" },
];
const diagnostics = {
  initialized: false, stopped: false, frames: 0, idleObserved: false,
  appliedBuildings: 0, patchedMeshes: 0, missingHeights: 0,
  checkedBuildings: 0, inconsistentBuildings: 0, publicIdMismatches: 0,
  idSamples: [] as { featureSet: string; batchIndex: number; batchId: number; geometryBatchId: number; stride: number; offset: number }[],
  compiled: { surface: 0, depth: 0 }, breath: 1,
  tiles: tilesets.map(t => ({ ...t, resourcesCompleted: 0, httpErrors: 0, featureSets: 0 })),
  errors: [] as string[], visualAssessment: "未判定",
};
(window as any).__float = diagnostics;
const status = document.getElementById("status")!;
function report() {
  status.textContent = `${diagnostics.tiles.map(t => `${t.name}: 取得応答${t.resourcesCompleted} / feature更新${t.featureSets} / HTTPエラー${t.httpErrors}`).join("、")}\n変位設定済み建物 ${diagnostics.appliedBuildings} / メッシュ ${diagnostics.patchedMeshes} / 高さ欠測 ${diagnostics.missingHeights}\n自己検証 建物 ${diagnostics.checkedBuildings} / floatLift不一致 ${diagnostics.inconsistentBuildings} / 公開ID不一致頂点 ${diagnostics.publicIdMismatches}\n描画イベント ${diagnostics.frames} / shader通常${diagnostics.compiled.surface}・影${diagnostics.compiled.depth} / ${diagnostics.stopped ? "停止" : "稼働"} / エラー ${diagnostics.errors.length}${diagnostics.errors.length ? `: ${diagnostics.errors[0]}` : ""}\n取得応答はwindowで観測できた分のみ（Worker内取得は観測外）。全タイル取得完了を意味しません。変位設定数はGPU描画成功数ではありません。見た目は未判定。`;
}
let halt = () => {};
function recordError(error: unknown) {
  const message = String(error);
  if (!diagnostics.errors.includes(message)) diagnostics.errors.push(message);
  diagnostics.stopped = true;
  halt(); report();
}
window.addEventListener("error", event => recordError(event.message));
window.addEventListener("unhandledrejection", event => recordError(event.reason));

// ModelMesh 0.2.1 iterates _batchid.array directly: unsafe for interleaved
// attributes. Read local batchIndex with getX(), scoped to this feature set.
type ScalarIds = { count: number; itemSize: number; array: unknown; getX(i: number): number };
function buildLiftAttribute(ids: ScalarIds, heights: Map<number, number>) {
  if (ids.itemSize !== 1 || !ids.array) throw new Error("_batchid CPU配列なし、または非scalar属性。変位を中断");
  const values = new Float32Array(ids.count);
  const applied = new Set<number>();
  for (let i = 0; i < ids.count; i++) {
    const id = ids.getX(i);
    if (!Number.isInteger(id) || !heights.has(id)) throw new Error(`頂点batchIndex=${id}に対応するfeatureがありません`);
    values[i] = Math.min(120, Math.max(0, heights.get(id)! * 0.5));
    if (values[i] > 0) applied.add(id);
  }
  return { attribute: new BufferAttribute(values, 1), applied };
}
// Aggregate every vertex, including across mesh primitives of the same building.
// Retain numeric ranges because the SDK releases CPU arrays after GPU upload.
function inspectLift(ids: ScalarIds, lift: ScalarIds, ranges: Map<number, { min: number; max: number }>) {
  if (!ids.array || !lift.array || ids.count !== lift.count) throw new Error("floatLift自己検証の属性長/CPU配列不正");
  for (let i = 0; i < ids.count; i++) {
    const id = ids.getX(i), value = lift.getX(i);
    if (!Number.isFinite(value)) throw new Error("floatLiftが非有限値です");
    const range = ranges.get(id) ?? { min: value, max: value };
    range.min = Math.min(range.min, value); range.max = Math.max(range.max, value);
    ranges.set(id, range);
  }
}

const patchedMaterials = new WeakSet<Material>();

// Chain the installed enhancer (including CSM/depth defines) before injection.
function patchMaterial(material: Material, breath: { value: number }, up: Vector3, kind: "surface" | "depth") {
  if (patchedMaterials.has(material)) return;
  patchedMaterials.add(material);
  const originalCompile = material.onBeforeCompile;
  const originalKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function(shader, renderer) {
    originalCompile.call(this, shader, renderer);
    const marker = "#include <begin_vertex>";
    if (!shader.vertexShader.includes(marker)) {
      recordError(`${kind}: begin_vertexがありません。SDK shader経路の再調査が必要`);
      throw new Error("FLOAT shader injection blocked");
    }
    shader.uniforms.uFloatBreath = breath;
    shader.uniforms.uFloatUp = { value: up };
    shader.vertexShader = `attribute float floatLift;\nuniform float uFloatBreath;\nuniform vec3 uFloatUp;\n${shader.vertexShader}`.replace(marker,
      `${marker}\ntransformed += inverse(mat3(modelMatrix)) * uFloatUp * (floatLift * uFloatBreath);`);
    diagnostics.compiled[kind]++;
    report();
  };
  material.customProgramCacheKey = () => `${originalKey()}|float-v1`;
  material.needsUpdate = true;
}

async function main() {
  let frame: number | undefined;
  let hidden = false;
  let previous: number | undefined;
  let elapsed = 0;
  const breath = { value: 1 };
  const patched = new WeakMap<Mesh, { applied: Set<number>; ranges: Map<number, { min: number; max: number }>; mismatches: number }>();
  const active = new Map<string, { ids: Set<number>; missing: number; meshes: number; checked: number; inconsistent: number; mismatches: number }>();
  const view = new ThreeView<DefaultDescriptions>({
    container: document.getElementById("app")!, shadow: true,
    backgroundColor: new Color().setHex(0x10151b),
    atmosphere: { date: new Date("2026-11-09T15:45:00+09:00") },
  });
  view.addPlugin(new DefaultPlugin());
  (window as any).__view = view;
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined; previous = undefined;
  }
  halt = stop;
  function tick(time: number) {
    frame = undefined;
    if (hidden || document.hidden || diagnostics.stopped) { previous = undefined; return; }
    if (previous !== undefined) elapsed += Math.min(time - previous, 100);
    previous = time;
    breath.value = 1 + 0.15 * Math.sin(elapsed * Math.PI * 2 / 24000);
    diagnostics.breath = breath.value;
    view.forceUpdate();
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!hidden && !document.hidden && !diagnostics.stopped && frame === undefined) frame = requestAnimationFrame(tick);
  }
  window.addEventListener("pagehide", () => { hidden = true; stop(); });
  window.addEventListener("pageshow", () => { hidden = false; start(); });
  document.addEventListener("visibilitychange", () => { stop(); start(); });
  await view.init();
  view.globe.color = new Color().setHex(0x242a31);
  view.addLight({ ambient: { intensity: 0.45, color: new Color().setHex(0xbdcbdc) } });
  view.addLight({ sun: { intensity: 2.5, applyColor: true, castShadow: true,
    shadowFar: 12000, shadowMapSize: 4096, shadowNormalBias: 0.5 } } as any);
  view.toneMappingExposure = 1.1;
  const terrain = view.addSource({ type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18, requestVertexNormals: true, requestWaterMask: true });
  view.addLayer({ type: "terrain", source: terrain,
    terrain: { lit: true, castShadow: true, receiveShadow: true } });
  // Constant geodetic up over this small Tokyo study area; inverse model linear
  // transform preserves a metre of world displacement even with rotated/scaled GLTFs.
  const lng = 139.7671 * Math.PI / 180, lat = 35.6812 * Math.PI / 180;
  const up = new Vector3(Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat));
  function recount() {
    let buildings = 0;
    diagnostics.checkedBuildings = 0; diagnostics.inconsistentBuildings = 0; diagnostics.publicIdMismatches = 0;
    diagnostics.missingHeights = 0; diagnostics.patchedMeshes = 0;
    for (const set of active.values()) {
      buildings += set.ids.size;
      diagnostics.checkedBuildings += set.checked; diagnostics.inconsistentBuildings += set.inconsistent;
      diagnostics.publicIdMismatches += set.mismatches;
      diagnostics.missingHeights += set.missing; diagnostics.patchedMeshes += set.meshes;
    }
    diagnostics.appliedBuildings = buildings;
    report();
  }
  for (const [index, tile] of tilesets.entries()) {
    const source = view.addSource({ type: "3d-tiles", url: tile.url } as any);
    const layer = view.addLayer({ type: "3d-tiles", source,
      model: { color: new Color().setHex(0xd5d0c6), metalness: 0, roughness: 1,
        lit: true, castShadow: true, receiveShadow: true } } as any);
    layer.on("featureUpdated", ({ featureSetId, evaluator }: any) => {
      if (diagnostics.stopped) return;
      try {
        const key = `${index}:${featureSetId}`;
        const heights = new Map<number, number>();
        const publicIds = new Map<number, number>();
        let missing = 0;
        evaluator.readFeatureProperties(({ batchId, properties }: any, batchIndex: number) => {
          const raw = properties?.["bldg:measuredHeight"];
          const height = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
          if (!Number.isFinite(height)) missing++;
          if (heights.has(batchIndex)) throw new Error(`重複batchIndex=${batchIndex}`);
          heights.set(batchIndex, Number.isFinite(height) ? height : 0);
          publicIds.set(batchIndex, batchId);
        });
        // Private SDK accessor: intentionally confined to this prototype page.
        const model = evaluator.obj;
        if (typeof model?.traverseMesh !== "function") throw new Error("evaluator.objはModelMeshではありません");
        const ids = new Set<number>();
        let meshes = 0, mismatches = 0;
        const ranges = new Map<number, { min: number; max: number }>();
        model.traverseMesh((mesh: Mesh) => {
          let cached = patched.get(mesh);
          if (!cached) {
            const batchIds = mesh.geometry.getAttribute("batchId");
            if (!batchIds) throw new Error("ModelMeshのbatchId属性がありません");
            const localIds = mesh.geometry.getAttribute("_batchid");
            if (!localIds || localIds.count !== mesh.geometry.getAttribute("position").count) throw new Error("頂点_batchidがない、または頂点数不一致");
            const lift = buildLiftAttribute(localIds, heights);
            const meshRanges = new Map<number, { min: number; max: number }>();
            inspectLift(localIds, lift.attribute, meshRanges);
            let meshMismatches = 0;
            for (let i = 0; i < localIds.count; i++) {
              const local = localIds.getX(i), expected = publicIds.get(local)!;
              const actual = batchIds.array && i < batchIds.count ? batchIds.getX(i) : NaN;
              if (actual !== Math.fround(expected)) meshMismatches++;
              const mismatch = actual !== Math.fround(expected);
              const samples = diagnostics.idSamples;
              // Keep distinct buildings and reserve half the bounded log for
              // mismatches; one large early building must not consume it all.
              if (!samples.some(s => s.featureSet === key && s.batchIndex === local && (s.geometryBatchId !== Math.fround(s.batchId)) === mismatch)
                && samples.filter(s => (s.geometryBatchId !== Math.fround(s.batchId)) === mismatch).length < 16) {
                samples.push({ featureSet: key, batchIndex: local, batchId: expected, geometryBatchId: actual,
                  stride: "data" in localIds ? (localIds as any).data.stride : localIds.itemSize,
                  offset: "offset" in localIds ? (localIds as any).offset : 0 });
              }
            }
            if (Array.isArray(mesh.material) || !mesh.customDepthMaterial) throw new Error("想定外の材質、または影用depth materialなし");
            mesh.geometry.setAttribute("floatLift", lift.attribute);
            patchMaterial(mesh.material, breath, up, "surface");
            patchMaterial(mesh.customDepthMaterial, breath, up, "depth");
            // GPU displacement is absent from the original geometry bounds.
            mesh.frustumCulled = false;
            cached = { applied: lift.applied, ranges: meshRanges, mismatches: meshMismatches };
            patched.set(mesh, cached);
          }
          cached.applied.forEach(id => ids.add(id)); meshes++; mismatches += cached.mismatches;
          for (const [id, range] of cached.ranges) {
            const old = ranges.get(id);
            ranges.set(id, { min: Math.min(old?.min ?? range.min, range.min), max: Math.max(old?.max ?? range.max, range.max) });
          }
        });
        if (!meshes) throw new Error("ModelMesh内に対象メッシュがありません");
        const inconsistent = [...ranges.values()].filter(r => r.max > r.min).length;
        active.set(key, { ids, missing, meshes, checked: ranges.size, inconsistent, mismatches });
        diagnostics.tiles[index].featureSets++;
        recount(); view.forceUpdate();
      } catch (error) { recordError(error); }
    });
    layer.on("featureRemoved", ({ featureSetId }: any) => { active.delete(`${index}:${featureSetId}`); recount(); });
  }
  // Resource Timing observes SDK/worker fetch completions without replacing fetch.
  // HTTP status 0 is unknown (cross-origin Timing-Allow-Origin), never success.
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
  ]);
  view.setCamera({ lng: 139.7671, lat: 35.6812, distance: 2600, heading: 25, pitch: -42, roll: 0 });
  diagnostics.initialized = true;
  report(); start();
}
main().catch(recordError);
