import ThreeView, { Color } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";

const status = document.getElementById("status")!;
const sampleSites = [
  { name: "三鷹", lng: 139.570, lat: 35.700, referenceHeight: 56.3 },
  { name: "新宿", lng: 139.670, lat: 35.695, referenceHeight: 36.5 },
  { name: "日本橋", lng: 139.770, lat: 35.680, referenceHeight: 2.5 },
];
// Reference heights supplied from GSI elevation API measurements. At zoom 12,
// use a loose 30 m tolerance as an advisory, never as the acquisition criterion.
const heightTolerance = 30;
const terrainTileUrl = new URL("terrain/", location.href).href + "{z}/{x}/{y}.png";
const diagnostics = {
  initialized: false, frames: 0, idleObserved: false,
  terrain: { type: "quantized-mesh", url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain", maxZoom: 18 },
  drape: { url: terrainTileUrl, minZoom: 11, maxZoom: 13 },
  verticalExaggeration: { supported: false },
  samples: [] as { lng: number; lat: number; height?: number; level?: number }[],
  sampleChecks: [] as { name: string; referenceHeight: number; height?: number; delta?: number; finite: boolean; consistent: boolean | null }[],
  heightTolerance,
  acquisition: "pending", errors: [] as string[], capture: "idle",
};
(window as any).__terra = diagnostics;
function report() {
  status.textContent = `DEM取得検査: ${diagnostics.acquisition} ／ 描画イベント ${diagnostics.frames > 0 ? "受信" : "待機"} ／ エラー ${diagnostics.errors.length}${diagnostics.errors.length ? `（最初: ${diagnostics.errors[0].slice(0, 120)}）` : ""}。全表示タイルの取得完了・見た目は未判定。`;
}
function recordError(error: unknown) {
  diagnostics.errors.push(String(error));
  (window as any).__error = String(error);
  report();
}
window.addEventListener("error", event => recordError(event.message));
window.addEventListener("unhandledrejection", event => recordError(event.reason));

// GSI DEM PNG: signed 24-bit centimetres; 0x800000 is no-data.
function decodeDemPixel(r: number, g: number, b: number): number | undefined {
  const value = r * 65536 + g * 256 + b;
  if (value === 0x800000) return undefined;
  return (value < 0x800000 ? value : value - 0x1000000) * 0.01;
}
async function sampleDemPixel(lng: number, lat: number, signal: AbortSignal) {
  const level = 12, scale = 2 ** level;
  const x = (lng + 180) / 360 * scale;
  const radians = lat * Math.PI / 180;
  const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * scale;
  const response = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/${level}/${Math.floor(x)}/${Math.floor(y)}.png`, { signal });
  if (!response.ok) throw new Error(`DEM HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("DEM pixel canvas unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b] = ctx.getImageData(Math.floor((x % 1) * 256), Math.floor((y % 1) * 256), 1, 1).data;
    return { lng, lat, level, height: decodeDemPixel(r, g, b) };
  } finally { bitmap.close(); }
}

async function main() {
  let orbitOn = true;
  let hidden = false;
  let frame: number | undefined;
  let previous: number | undefined;
  let heading = 25;
  let capturePending = false;
  const container = document.getElementById("app")!;
  const camera = { lng: 139.73, lat: 35.70, distance: 65000, heading, pitch: -48, roll: 0 };
  const view = new ThreeView<DefaultDescriptions>({ container, shadow: true,
    // SDK constructor forwards backgroundColor to renderer.setClearColor().
    backgroundColor: new Color().setHex(0x070d12),
    atmosphere: { date: new Date("2026-11-09T15:45:00+09:00") } });
  view.addPlugin(new DefaultPlugin());
  (window as any).__view = view;
  await view.init();
  // No photoreal helper: no sky, photographic imagery, buildings or artificial geometry.
  view.addLight({ ambient: { intensity: 0.3, color: new Color().setHex(0xb3c8cf) } });
  view.addLight({ sun: { intensity: 2.2, applyColor: true, castShadow: true, shadowFar: 120000 } });
  view.toneMappingExposure = 1.1;
  // Base color fills imagery gaps; imagery itself retains its baked shading.
  view.globe.color = new Color().setHex(0x070d12);
  const terrain = view.addSource({ ...diagnostics.terrain, type: "quantized-mesh",
    requestVertexNormals: true, requestWaterMask: true });
  // Same low-sun ground treatment as AWAKENING: bypass terrain lighting only.
  view.addLayer({ type: "terrain", source: terrain,
    terrain: { lit: false, castShadow: true, receiveShadow: true } });
  const drape = view.addSource({ type: "raster-tile", ...diagnostics.drape, tileSize: 256 });
  view.addLayer({ type: "raster", source: drape });
  view.attribution?.add([{ attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" }, { attribution: "国土地理院 標高タイル（DEM）を加工",
    attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html#dem" }]);
  view.setCamera(camera);
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined; previous = undefined;
  }
  function tick(time: number) {
    frame = undefined;
    if (!orbitOn || hidden || document.hidden) { previous = undefined; return; }
    if (previous !== undefined) heading = (heading + Math.min(time - previous, 100) * 0.0006) % 360;
    previous = time;
    view.setCamera({ ...camera, heading });
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (orbitOn && !hidden && !document.hidden && frame === undefined) frame = requestAnimationFrame(tick);
  }
  document.getElementById("orbit")!.addEventListener("click", () => {
    orbitOn = !orbitOn;
    const button = document.getElementById("orbit")!;
    button.setAttribute("aria-pressed", String(orbitOn));
    button.textContent = `周回 ${orbitOn ? "ON" : "OFF"}`;
    stop(); start();
  });
  // Sample inside postRender, before the default WebGL drawing buffer is cleared.
  view.on("postRender", () => {
    diagnostics.frames++;
    if (!capturePending) return;
    capturePending = false;
    try {
      const canvas = container.querySelector("canvas");
      if (!canvas) throw new Error("canvas未準備");
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "terra-naked-tokyo.png";
      link.click(); diagnostics.capture = "saved-unverified";
      report();
      status.textContent += " PNG保存（画像内容・描画完了は未判定）";
    } catch (error) { diagnostics.capture = "failed"; recordError(error); }
  });
  view.on("idle", () => { diagnostics.idleObserved = true; report(); });
  document.getElementById("capture")!.addEventListener("click", () => {
    capturePending = true; diagnostics.capture = "pending"; view.forceUpdate();
  });
  window.addEventListener("pagehide", () => { hidden = true; stop(); });
  window.addEventListener("pageshow", () => { hidden = false; stop(); start(); view.forceUpdate(); });
  document.addEventListener("visibilitychange", () => { stop(); start(); });
  diagnostics.initialized = true;
  (window as any).__ready = true; // Initialization only, never tile completion.
  report(); start();
  // Direct DEM pixel checks, independent of terrain geometry and drape loading.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    diagnostics.samples = await Promise.all(sampleSites.map(site => sampleDemPixel(site.lng, site.lat, controller.signal)));
    const complete = diagnostics.samples.length === 3 && diagnostics.samples.every(p => Number.isFinite(p.height));
    diagnostics.sampleChecks = sampleSites.map(site => {
      const height = diagnostics.samples.find(p => p.lng === site.lng && p.lat === site.lat)?.height;
      const finite = Number.isFinite(height);
      const delta = finite ? height! - site.referenceHeight : undefined;
      return { name: site.name, referenceHeight: site.referenceHeight, height, delta, finite,
        consistent: finite ? Math.abs(delta!) <= heightTolerance : null };
    });
    const comparison = diagnostics.sampleChecks.map(p =>
      `${p.name}: ${p.finite ? `${p.height!.toFixed(1)}m / 実測差 ${p.delta!.toFixed(1)}m（${p.consistent ? "許容内" : "差大・参考警告"}）` : "欠測"}`).join("、");
    diagnostics.acquisition = complete ? "3地点取得・デコード完了" : "一部または全地点の標高なし";
    diagnostics.acquisition += ` ／ 標高照合 ±${heightTolerance}m: ${comparison}`;
    if (!complete) recordError("DEM取得検査: 有効な標高が不足");
  } catch (error) { diagnostics.acquisition = "failed"; recordError(error); }
  finally { clearTimeout(timeout); report(); }
}
main().catch(recordError);
