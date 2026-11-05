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

## BRIEF-DUSK 距離暗化・粒子調査（2026-11-05、実装前）

調査対象はインストール済みSDK 0.2.1。以下は `node_modules/` 相対のコード根拠で、GPU画像からの原因特定ではない。

- 標準シーン `@navaramap/three-default-plugin/src/index.ts:209–218` は deferredLighting 未指定。`@navaramap/three-default-descs/src/effects/aerialPerspective/effect.ts:38–43,179–198` の既定は inscatter=true / transmittance=true / irradiance=false。irradiance=false は散乱・透過を無効にしない。`@takram/three-atmosphere/src/shaders/aerialPerspectiveEffect.frag:131–149,379–396` は入力色に距離透過率を乗算し散乱を加算する。暗い散乱光の条件では遠景が暗くなる経路がある。ただし観測画像の暗化全量をこの効果に帰属させる実測はない。公開設定には連続的な透過減衰倍率はなく、transmittanceをfalseにする二値切替がある。今回は物理大気の透過を削除せず維持する。
- 別の距離減光経路は雲haze。`@takram/three-clouds/src/shaders/clouds.frag:653–697,987–995` は coverage 0.45 で modulation が飽和し、density = hazeDensityScale × exp(-cameraHeight × hazeExponent)、距離に依存する光学的厚さからalphaを計算して画面をhaze色へ混合する。暗い夜間hazeも遠景を覆える。`@navaramap/three-default-descs/src/effects/clouds/pass.ts:72–76,129–133,522–526` は hazeDensityScale を公開（既定3e-5）。密度を下げればこの光学的厚さを連続的に緩和でき、効果の削除は不要。Afterのみ1.5e-5、Beforeは3e-5を選ぶ。
- 粒子の生成経路として確認できるのはSTBNを使う体積雲サンプリング。`@takram/three-clouds/src/shaders/clouds.glsl:1–5` が画素・frame依存ノイズを読み、`clouds.frag:489–490,861–892,951–961` でレイマーチとshadow lengthのjitterに使う。`CloudsResolveMaterial.ts:78` の temporalAlpha=0.1 と `shaders/cloudsResolve.frag` の履歴合成で収束させる設計。haze自体の上記解析式には乱数がなく、lightShaftsのshadowLengthを経由する揺らぎは残り得る。大気側にも `aerialPerspectiveEffect.frag:354–382` にSTBN雲影サンプルがあるが、直接表面照明への乗算はirradiance側の分岐。`@navaramap/three-default-descs/src/effects/SelectiveBloomEffectDesc.ts` は発光抽出→MipmapBlurPass→合成で乱数生成を持たず、既存ノイズの拡大はあり得ても粒子生成の主経路とは言えない。
- **観測された粒子の主因はコードだけでは確定できない**。STBNはノイズの生成源、hazeは距離混合、bloomは発光のぼかしで役割が異なる。実Chromeで同一条件の効果別比較が必要。公開CloudsOptionsはqualityPreset / iteration / step / resolutionScaleを持つが、STBN jitterの直接無効化は公開しない。品質増加は負荷を増し、ノイズ消失の保証もないため今回は変更しない。密度半減はhazeの寄与を減らす変更であり、STBN自体の除去ではない。雲・haze・lightShafts・bloomはいずれも削除しない。

時刻前提もSDKで検算した。`@navaramap/three/src/atmosphere.ts:408` と同じ `getSunDirectionECEF(date, new Vector3())` を呼び、地点の単位法線との内積のasinで太陽高度を算出（Node、GPU不要）。東京駅 / 都庁で17:40は−12.169° / −12.110°、19:10は−30.362° / −30.300°、20:00は−40.460° / −40.398°。`@takram/three-atmosphere/src/getSunLightColor.ts` は太陽方向が地球と交差するとtransmittance=0。したがって指定日の19:10は日没直前ではなく夜であり、実際の太陽方向光・影の回復や明るい空を約束できない。時刻だけで距離暗化・STBNが自然消滅する根拠もない。この太陽高度の証拠を受け、ディレクターがAfterを同日16:30 JSTへ改訂した（東京の太陽高度は東京駅+1.512°／都庁+1.566°。独立レビューの再計算で確定）。実装も16:30へ変更し、実在する低い太陽方向光と長い影を狙う。人工キーライトや日付変更は追加しない。環境光は全案0.15、露出はCyberpunk 1.05 / Gold・Holographic 1.0へ下げ、夜用の持ち上げを解除する。描画上の影・写真可読性は目視未検証。

調整方針（19:10 実装時点の旧方針。16:30 改訂で環境光・露出は上記の低太陽前提の値に置換済み。発光レンジのみ現行）: 定常発光0.55–1.2を0.12–0.30へ下げ（前線+4維持）、自己発光による面の均しを減らす。環境光の一様な持上げも0.6→0.45、露出はCyberpunk 1.7→1.4、他1.6→1.35とし、低下した発光を高露出で打ち消さない。地面ティントのv14相対輝度下限は維持。環境光0.45 / 露出1.35を今回の暫定下限とする。これは視覚最適値の実測ではなく、形状の読み取りを再評価するための設計値。太陽が地下のため立体感・写真可読性・空の改善はすべて目視未検証。
