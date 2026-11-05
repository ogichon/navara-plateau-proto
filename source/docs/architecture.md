# Architecture / 技術知見（要約）

全経緯は `HANDOVER.md` と `README.md`（バージョン別検証記録）が正本。本書は要点のみ。

## 構成
- `@navaramap/three@0.2.1`（ThreeView）+ `@navaramap/three-default-plugin@0.2.1`（DefaultPlugin.addDefaultPhotorealScene: 物理空・太陽・大気・SMAA・影）
- 地形: Re:Earth quantized-mesh / ベースマップ: 地理院 seamlessphoto（ラスター、時刻グレーディングはティントで表現）
- 建物: PLATEAU 2023年度 LOD2（テクスチャなし）3D Tiles — 千代田区・中央区・新宿区（URLは HANDOVER.md §5）
- 追加エフェクト: 体積雲（@takram/three-clouds、キー "clouds"）、選択的ブルーム（キー "selectiveBloom"）。他に利用可能なキー: aerialPerspective, colorGradingLUT, depthOfField, fogLight, fxaa, lensFlare, rainDrop, selectiveOutline, smaa, ssao, ssr, toneMapping

## ランタイムアセット（最重要）
ランタイムは wasm・テクスチャをモジュールURL相対で解決する。Vite は同梱しないため、`vite.config.ts` の closeBundle プラグインで以下を dist/assets へコピーしている:
- `draco_decoder-*.wasm`（欠けると PLATEAU 建物が全滅する。根本原因だった）
- `navara_wasm_font_worker_bg-*.wasm`
- ディレクトリ: `cloud/`（雲テクスチャ）、`noise/`、`water/`
新しいエフェクトを足すときは、そのアセットが dist に入るか必ず確認すること。atmosphere/（34MB）は空が動作するため未コピー。

## カメラ
- `view.setCamera({lng, lat, distance, heading, pitch, roll})` — lng/lat は注視点、distance は注視点からの距離
- 読み出し: `view.camera.positionGeographic` / `.orientation`

## 属性スタイリング（FeatureEvaluator）
```ts
layer.on("featureUpdated", (params) => {
  (params.evaluator ?? params).evaluate(({ properties }) => ({ color, emissive, emissiveIntensity, opacity, show }));
});
layer.forceUpdate(); // 再評価
```
バッチテーブル実測キー（data622.b3dm 等で検証）:
- `bldg:measuredHeight` 数値（バイナリ DOUBLE）
- 浸水深: 末尾 `_浸水深` のキー群（流域・高潮シナリオ別、数値）。属性なしは undefined
- `_x` / `_y`: 建物重心の経度/緯度（距離ベース演出に利用可能）
- `attributes` キーに CityGML 由来の全属性 JSON が入る（用途・階数等）

## 時刻・グレーディング
- 太陽: `view.atmosphere.date`（絶対時刻）
- 地面写真は昼焼き付けのため、時刻表現は写真ティント＋環境光＋露出の組み合わせで行う（夜: ティント 0x51628c、環境光 0.6 青系、露出 1.7）

## ビルド・公開
- `npx vite build`（入力: index.html / official.html。新ページ追加時は vite.config.ts の input に追加）
- 公開: dist を `deploy/`（Pages repo）へコピーして push。Pages のビルド状態と主要アセットの HTTP 200 を確認する
- 検証制約: エージェントブラウザは描画判定不可。DOM状態とユーザーの実Chromeが確認手段

## BRIEF-FIX3 ラスター照明調査（2026-11-05、実装前）

インストール済み 0.2.1 のコードを調査。以下のパスは `node_modules/` 相対。GPU描画の実測とは区別する。

- **この両ページの写真は最終的に lit**。`@navaramap/three/src/mesh/tile/index.ts:780–810` の `shouldUseNormal` は quantized-mesh の法線があれば `MeshLambertMaterial` を選択。写真自体の焼込みは Basic でも、それは中間処理（`src/tileTexture/TileTextureCompositor.ts:185`）。`src/mesh/tile/index.ts:382–389` で色・opacityを合成に渡した後、地形上で照明される。`@navaramap/three-default-plugin/src/index.ts:155–218` は deferredLighting 未指定時には view.lit を false にしない。したがって「color × textureだけ」の出力ではなく、太陽・環境光で明暗が変わる。`three/src/renderers/shaders/ShaderChunk/lights_lambert_pars_fragment.glsl.js` と `lights_fragment_begin.glsl.js` の indirectDiffuse / ambientLightColor が環境光の経路。
- **公開 raster 設定の明るさ関連は color と opacity のみ**。`@navaramap/three/src/type/index.ts:134–139` が engine の RasterLayerDescription を公開し、`@navaramap/engine/navara_wasm.d.ts:2503–2515` の RasterMaterial は color / opacity / showBoundingBox / show のみ。brightness / gamma / contrast / emissive / lit はない。opacity は透過合成量で、1超を明るさ増幅として使う設定ではない。`RasterTileInternalMaterial.lit` は内部値、`TerrainMaterial.lit` は地形全体用なので写真限定トグルには使わない。写真限定で使える最大のレバーは白ティント＋opacity 1。全体露出・環境光をトグルで変えると建物にも影響するため変更しない。
- **環境光は上記Lambert経路で効く。露出も写真を含む最終画面に効く**。`@navaramap/three/src/index.ts:1276–1283` は renderer.toneMappingExposure に委譲。標準シーンの `ToneMappingEffectDesc` → `effects/toneMapping.ts` は postprocessing の AGX。`three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js` の AgXToneMapping は color に toneMappingExposure を乗算する。写真限定の制御ではない。
- **雲 shadows の地面への直接減光は irradiance 有効時**。`@navaramap/three-default-descs/src/effects/clouds/pass.ts:64–66,124,175,249–258` は既定 shadows=true、Atmosphereへ影とshadowLengthを供給。`effects/aerialPerspective/effect.ts:42,179–198` は既定 irradiance=false で sunLight / skyLight を切替。`@takram/three-atmosphere/src/shaders/aerialPerspectiveEffect.frag:354–382` は exp(-opticalDepth) を SUN_LIGHT / SKY_LIGHT 分岐だけで表面照明に適用する。両ページの標準シーンでは irradiance 未指定=false のため、雲 shadows が地面照明を直接潰しているという根拠はない。shadowLength は大気散乱に使われるため最終画像への影響ゼロとは断言しない。UNDERWATER の shadows は変更せず coverage=0.85 を維持する。

写真確認は照明・大気・水面の遮蔽を残したままティント減光を除く診断であり、写真取得や可読性の保証ではない。地形litや全体露出の切替はブリーフの「写真系のみ変更」制約に反するため採用しない。
