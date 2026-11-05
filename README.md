# Navara × PLATEAU prototype

Goal: test whether MapLibre **Navara** (0.2.1) can replace the Blender stage of
the PLATEAU → still → AI-video pipeline (see `~/workspace/plateau-tokyo-station/`).

## Run

```bash
npm install
npx vite --host 127.0.0.1 --port 5173
# open http://127.0.0.1:5173/
```

UI: buttons switch the sun via `view.atmosphere.date` — 昼 12:00 / 夕 17:40 /
夜 21:00 JST (2026-11-05). 📸 downloads a canvas PNG.

## Scene (src/main.ts)

- Engine: `@navaramap/three` + `@navaramap/three-default-plugin`,
  `DefaultPlugin.addDefaultPhotorealScene()` (sky, sun, sky light probe,
  aerial perspective, tone mapping, SMAA).
- Terrain: quantized-mesh, Re:Earth Terrain
  `https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain` (maxZoom 18).
- Basemap: GSI seamless aerial photo raster tiles
  `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg` (maxZoom 18).
- Buildings: PLATEAU FY2023 3D Tiles, LOD2 **no texture**, white model
  (color 0xffffff, metalness 0, roughness 1 — same as the official Navara example):
  - Chiyoda: `https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json`
  - Chuo: `https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json`
- Camera: Tokyo Station — lng 139.7671, lat 35.6812, distance 1100,
  heading 55, pitch -32 (official example: distance 1000, heading 50, pitch -35).

## Verified (2026-11-05)

- Vite dev server serves the app; `src/main.ts` transforms/compiles (HTTP 200).
- Chiyoda tileset.json is live and valid 3D Tiles 1.0; region
  lng 139.730–139.783, lat 35.669–35.705 (covers Tokyo Station).
  Batch attributes include `bldg:measuredHeight` (max 209.5 m),
  `bldg:usage`, storeys, address, and flood-risk fields
  (浸水深 for 神田川/隅田川 L1/L2, 高潮) → usable later with FeatureEvaluator
  for attribute-driven coloring/emissive.
- Terrain tile and GSI photo tile endpoints return HTTP 200.

## Not yet verified

- **Actual WebGL rendering / screenshots.** The agent browser is refused
  navigation to 127.0.0.1 (invalid_request), the managed Chromium binary
  cannot be launched standalone ("Hatch WebGL domain policy is required"),
  and Playwright's own Chromium download failed. Rendering check needs the
  user to open the page once in the live browser (or on any machine) and
  report / hand back.

## Places

- `?place=tokyo` (default): Tokyo Station, Chiyoda + Chuo tilesets above.
- `?place=tocho`: Tokyo Metropolitan Government Building (Tocho), Shinjuku-ku
  tileset (FY2023, LOD2 no texture), verified 2026-11-05 via the PLATEAU
  streaming catalog (GraphQL) and by opening the tileset itself:
  `https://assets.cms.plateau.reearth.io/assets/f0/840fc4-114c-41e4-9a65-67768efd3629/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod2_no_texture/tileset.json`
  Region lng 139.673–139.744, lat 35.674–35.730 — covers the Tocho
  (139.6917, 35.6896). Note the `_2_op_` segment: a naive copy of the
  Chiyoda `_1_op_` URL does not resolve. Camera: target Tocho,
  distance 1200, heading 40, pitch -28 (from the south-west, mirroring
  the Blender shot).

## Next

1. Rendering check + day/sunset/night screenshots; compare with
   `~/workspace/plateau-tokyo-station/output/tokyo_station_still.png`
   (Blender: ~7.5 min end-to-end, 46k objects, Cycles CPU).
2. Then: timelapse (sun/weather), attribute styling, PersonView walk.

## v3/v4 (2026-11-05 afternoon)
- v3 tried lookAt(ENU offset) for framing + night ambient/exposure: REGRESSION.
  Agent-browser verification (120 s waits) showed a uniform blank canvas at
  Tocho and ground-texture streaks at Tokyo — camera ended up wrong. Reverted.
- v2 user screenshots: Tokyo framing was good; Tocho framed Yoyogi Park
  (~1.5 km SSW of the Tocho) twice. Working hypothesis: setCamera's lng/lat
  acts as the camera anchor and the frame center lands ~800–1000 m along the
  heading. v4 therefore places anchors behind the targets and shows a live
  getCamera() readout on screen (turns screenshots into diagnostics), plus an
  idle-event "読み込み完了" status and a place-aware data note.
- Night grading kept from v3 (ambient light + exposure + ground tint): in the
  agent browser the whole frame did shift color at night, so the mechanism
  responds; judgment with tiles loaded is still pending.
- Agent-browser tile streaming is very slow (60–120 s may not finish); the
  user's real Chrome renders far faster and is the reliable visual check.

## v5–v7 camera verification (2026-11-05)
- CameraPosition doc (dist types): lng/lat/height = TARGET, distance = camera
  distance along the forward ray. Verified numerically via the on-screen
  readout (view.camera.positionGeographic / .orientation — the earlier
  getCamera() and Core getters do not exist on ThreeView):
  - Tokyo: cam 139.76395, 35.67940, h 386 m, hd 55, pitch -48 (predicted
    139.7639 / 35.6794 / 386 m — exact match).
  - Tocho: cam 139.68894, 35.68691, h 403 m, hd 40, pitch -46 (predicted
    139.6890 / 35.6869 / 403 m — exact match).
  => Framing is provably correct in the current build.
- v6: 3D Tiles layer color changed from raw hex to `new Color().setHex(...)`
  (official buildings-example parity) — prime suspect for invisible
  buildings; verification pending in the user's real Chrome (the agent
  browser's tile streaming has degraded to the point that even raster photo
  tiles no longer arrive within 150 s; only DOM readouts are reliable there).

## ROOT CAUSE FOUND + FIXED (v11, 2026-11-05)
The PLATEAU B3DM tiles require KHR_draco_mesh_compression (extensionsRequired
in the embedded glTF). Navara's runtime fetches its Draco decoder wasm
(`draco_decoder-DsQ12WqX.wasm`, shipped in @navaramap/three/dist/assets/)
relative to the worker/module URL — but Vite does not copy that file when
bundling the package, so the fetch 404'd, Draco decoding never started, and
every building tile failed SILENTLY (terrain/raster don't use Draco, which
is why only the buildings were missing — in the prototype, in plain mode,
and in the verbatim official example alike). Data reachability from the
user's browser was separately proven (tileset/root/leaf all HTTP 200), and
camera math was proven exact via the readout. Fix: vite.config.ts now has a
closeBundle plugin copying the package's runtime wasm assets
(draco_decoder + navara_wasm_font_worker_bg) into dist/assets/. Verified
live: the decoder URL now returns HTTP 200 application/wasm.
