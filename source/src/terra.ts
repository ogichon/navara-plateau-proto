import ThreeView, { Color, ColorMap, JAPAN_GSI_ELEVATION_DECODER } from "@navaramap/three";
import { DefaultPlugin, type DefaultDescriptions } from "@navaramap/three-default-plugin";

const status = document.getElementById("status")!;
const diagnostics = {
  initialized: false, frames: 0, idleObserved: false,
  terrain: { type: "raster-dem", url: "https://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.png", maxZoom: 14, tileSize: 256 },
  tint: { minHeight: -5, maxHeight: 60, low: "#103b43", high: "#c9b58c" },
  samples: [] as { lng: number; lat: number; height?: number; level?: number }[],
  acquisition: "pending", errors: [] as string[], capture: "idle",
};
(window as any).__terra = diagnostics;
function report() {
  status.textContent = `DEM取得検査: ${diagnostics.acquisition} ／ 描画イベント ${diagnostics.frames > 0 ? "受信" : "待機"} ／ エラー ${diagnostics.errors.length}。全表示タイルの取得完了・見た目は未判定。`;
}
function recordError(error: unknown) {
  diagnostics.errors.push(String(error));
  (window as any).__error = String(error);
  report();
}
window.addEventListener("error", event => recordError(event.message));
window.addEventListener("unhandledrejection", event => recordError(event.reason));

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
    backgroundColor: new Color().setHex(0x070d12),
    atmosphere: { date: new Date("2026-11-09T15:45:00+09:00") } });
  view.addPlugin(new DefaultPlugin());
  (window as any).__view = view;
  await view.init();
  // No photoreal helper: no sky, imagery, buildings or artificial geometry.
  view.addLight({ ambient: { intensity: 0.3, color: new Color().setHex(0xb3c8cf) } });
  view.addLight({ sun: { intensity: 2.2, applyColor: true, castShadow: true, shadowFar: 120000 } });
  view.toneMappingExposure = 1.1;
  // Normalized sRGB LUT, interpolated explicitly for a smooth two-color ramp.
  const low = [16, 59, 67], high = [201, 181, 140];
  const lut: [number, number, number][] = Array.from({ length: 256 }, (_, i) =>
    low.map((v, c) => (v + (high[c] - v) * i / 255) / 255) as [number, number, number]);
  view.globe.elevationColormap = new ColorMap("sequential", "terra-lowland-rock", lut);
  const dem = view.addSource({ ...diagnostics.terrain, type: "raster-dem",
    elevationDecoder: JAPAN_GSI_ELEVATION_DECODER() });
  view.addLayer({ type: "terrain", source: dem,
    terrain: { lit: true, castShadow: true, receiveShadow: true } });
  // Hide encoded RGB imagery; only the SDK's decoded elevation heatmap is draped.
  view.addLayer({ type: "raster", source: dem, raster: { show: false },
    elevationHeatmap: { minHeight: -5, maxHeight: 60, logarithmic: false } });
  view.attribution?.add([{ attribution: "国土地理院 標高タイル（DEM）を加工",
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
      status.textContent = "PNG保存（画像内容・描画完了は未判定）";
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
  // SDK fetch + decode check at three fixed locations, not global tile completion.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    diagnostics.samples = await view.sampleTerrainMostDetailed(dem, [
      { lng: 139.60, lat: 35.70 }, { lng: 139.70, lat: 35.70 }, { lng: 139.85, lat: 35.70 },
    ], { level: 12, signal: controller.signal });
    const complete = diagnostics.samples.length === 3 && diagnostics.samples.every(p => Number.isFinite(p.height));
    diagnostics.acquisition = complete ? "3地点取得・デコード完了" : "一部または全地点の標高なし";
    if (!complete) recordError("DEM取得検査: 有効な標高が不足");
  } catch (error) { diagnostics.acquisition = "failed"; recordError(error); }
  finally { clearTimeout(timeout); report(); }
}
main().catch(recordError);
