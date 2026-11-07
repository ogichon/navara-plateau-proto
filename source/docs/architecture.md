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

## BRIEF-GROUND 改訂版 Q1〜Q3（2026-11-07、実装前調査）

インストール済みパッケージの実コードを再調査。以下のパスは `node_modules/` 相対。以前の調査記録の行番号・内部実装の説明より、今回の実コードを優先する。GPU描画や可読性の実測ではない。

### Q1: 地形lit切替 — 可、方式Aを採用

terrainは `three-default-descs` のエフェクトdescではなく、engine組込みのリソースレイヤー。`@navaramap/three/src/type/index.ts:141–153` が `TerrainSourceLayerDescription` を公開型へ正規化する。`@navaramap/engine/navara_wasm.d.ts:2800–2873` の全設定項目は次のとおり（free/disposeは管理メソッドで設定ではない）。

| 位置 | 全項目と公開入力型 |
| --- | --- |
| レイヤー | type: `"terrain"`、source?: `string \| Source`、terrain?: 下記オブジェクト、ellipsoid?: 同型（sourceなしの場合。sourceと排他） |
| terrain / ellipsoid | castShadow?: boolean、lit?: boolean、receiveShadow?: boolean、showBoundingBox?: boolean、show?: boolean、skirtExaggeration?: number、skirt?: boolean |

WASMのsetter自体はnull/undefinedも受理するが、TS公開型はNormalizeWASMClassでメソッドを除いたオプショナルプロパティ。`three/src/layer.ts:164–173` の `Layer.update()` → core.updateLayer。説明上は設定置換なので、更新にはtype/sourceと既存castShadow/receiveShadowも渡す。`three/src/mesh/tile/index.ts:475,1037` は初期生成と更新の両方でapplyLitOptionを呼ぶ。`three/src/material/overrideMaterialsForMRT.ts:27–57` はfalseでNVR_UNLITを立て、シェーダーの照明式をバイパスし、変更時にneedsUpdateを立てる。法線とshadow G-bufferは維持する。view全体のlitを変えずに地形だけ切替可能。Before=true（元のlit既定と同じ）、After=falseとする。これは地形の最終照明を外す処理であり、写真合成専用の設定ではない。

### Q2: 大気transmittance / inscatter — 個別切替可（方式Bは適用不要）

`three-default-plugin/src/index.ts:167–177,207–218,238–244` のaddDefaultPhotorealSceneはaerialPerspectiveのEffectHandleを返す。既存のscene.aerialPerspective.update({ aerialPerspective: { transmittance: false } })で更新可能。`three/src/index.ts:2518` 付近にはID指定のupdateEffectByIdもある。view.effectsという公開一覧APIは確認できず、内部layersManagerはprivateなので取得に使わない。返却ハンドルで十分。

`three-default-descs/src/effects/AerialPerspectiveEffectDesc.ts:99–116` がinscatter / transmittance / irradianceを独立に反映し、`effects/aerialPerspective/effect.ts:38–43,155–198` は既定true / true / false。距離透過はunlitの後にも掛かるため、方式Aだけで距離暗化全体の解消を保証しない。優先順に従ってAを採用し、Bは不可ではなく未採用。既定の大気を維持する。

### Q3: 雲hazeDensityScale=0 — 可（方式Cは適用不要）

`three-default-descs/src/effects/clouds/pass.ts:73,130,522–526` でnumberを公開し既定3e-5、setterはそのままrawEffectへ代入。`effects/CloudsEffectDesc.ts:108–109` は !== undefined で更新するので0も通る。`@takram/three-clouds/src/shaders/clouds.frag:665–668` はdensityに乗算し、density < 1e-7でゼロを返すため0は許容される。距離寄与は同:682–697の光学的厚さ・alpha計算。方式Aでは指示通りAfter 1.5e-5 / Before 3e-5を維持し、Cは未採用。

粒子については同パッケージのSTBN jitterと履歴合成の既調査が引き続き該当する。公開CloudsOptionsにSTBN jitter自体を切る項目はなく、観測ノイズの主因も未確定。雲削除・lightShafts削除や負荷増の品質変更は行わない。地形unlitが粒子を除去するとも主張しない。


## BRIEF-POLISH-INV — AWAKENING 磨き込み前調査（2026-11-07）

ブリーフ `docs/briefs/polish1-investigation.md` を全文読んで調査した。対象はこのworktreeから参照するインストール済み実コード。以下のパスは **node_modules/ 相対**、行番号は調査時点。Navara three / three-default-plugin / three-default-descs / three-csm は0.2.1、Takram three-cloudsは0.7.6、three-atmosphereは0.19.1、Three.jsは0.187.0。node_modulesは元repoへのシンボリックリンクであり、パッケージも変更していない。同一バージョン表記でもコード差があり得るため、過去記録より以下の実コードを優先する。

背景の「暗さは解決、ユーザー目視 #9」はブリーフからの引継ぎ情報。本調査は静的コード確認であり、粒子の実原因や作品の品質を目視判定していない。src変更・デプロイなし。GitHub Issues / PR / Pages の取得はCLIのネットワーク制限で失敗し、外部状態は未確認。

### Q1 雲の影 — ON/OFF公開あり、影だけの濃度倍率はなし

| 公開項目 | 既定値・根拠 |
| --- | --- |
| clouds.shadows | true。`@navaramap/three-default-descs/src/effects/clouds/pass.ts:64–69,124–127`。全体スイッチ |
| shadowCascadeCount / shadowMapSize / shadowFarScale | 3 / Vector2(512,512) / 0.05。同上。太陽CSMとは別の雲影マップ |
| cloudLayers[].shadow / densityScale | レイヤー別の影参加と密度。公開型 `three-default-descs/src/effects/clouds/layer.ts:14–30`。素のCloudLayer既定はfalse / 0.2（`@takram/three-clouds/src/CloudLayer.ts:48–55`）。既定レイヤー配列はr・gがshadow=true、densityScale=0.2、bはshadow=false、densityScale=0.003（`CloudLayers.ts:31–67`） |
| coverage / scatteringCoefficient / absorptionCoefficient | 0.25 / 1 / 0（`three-default-descs/src/effects/clouds/pass.ts:116,144–145`）。雲本体にも作用するため影だけの濃度調整ではない |

CloudsOptions全体（同pass.ts:45–100）にはshadowIntensity / shadowOpacity相当の独立倍率はない。密度・coverageを変えると雲の形や透過も変わる。初期化はmedium presetの後で明示shadowMapSizeを適用する（同:186–188,232–234）。Takram medium単体の256²（`three-clouds/src/qualityPresets.ts:102–107`）とNavaraラッパーの実効初期値512²を混同しない。後からqualityPresetだけを更新すると下流preset値が再適用され得る（`three-clouds/src/CloudsEffect.ts:509–515`）。

経路はCloudsEffectのatmosphereShadow → Navara Atmosphere.shadow（pass.ts:248–255）→ aerialPerspectiveのrawEffect.shadow（`effects/aerialPerspective/effect.ts:125–141`）→ 深度から再構成したworldPositionで雲影のopticalDepthをサンプリングしexp(-opticalDepth) → getSunSkyIrradianceの表面照明（`@takram/three-atmosphere/src/shaders/aerialPerspectiveEffect.frag:319–379`）。建物・地形というレイヤー種別を選ぶ投影ではない。**表面減光にはirradiance=trueが必要**（Navara effect.ts:179–195、既定falseは:38–48）。標準シーンはオプション未指定ならforward照明を維持する（`three-default-plugin/src/index.ts:198–215`）。現行AWAKENINGもirradianceを有効化していないので、雲影による直接の面のムラを現時点で主因とはしない。

shadows setterはAtmosphere.enableShadowsを更新（pass.ts:474–479）、一方shadowLengthの転送は独立（:257–259、aerialPerspective/effect.ts:132–140）。shadowLengthは大気散乱へ渡る（Takram frag:381–382）。したがってshadows=falseは雲・光芒・hazeの全停止ではなく、最終画像への雲の影響をすべて消す診断でもない。

### Q2 太陽の影 — 解像度・bias・範囲すべて公開あり

標準シーン返却のscene.sunに `update({ sun: { ... } })` で設定できる。公開型は `@navaramap/three-default-descs/src/lights/SunLightDesc.ts:13–23`、更新適用は:84–123。標準生成はsun:{}（`three-default-plugin/src/index.ts:202–204`）。以下は `lights/sunLight.ts:110–127` の実際の既定値であり、three-csm単体のfar既定5000を使わない。

| 項目 | 既定値 |
| --- | --- |
| castShadow / shadowIntensity | true / 1 |
| shadowMapSize / shadowCascadeCount | 2048（各cascade、正方形）/ 4 |
| shadowFar / shadowMode / shadowLambda | 50000 m / practical / 0.8 |
| shadowMargin / shadowFade | 5000 m / true |
| shadowBias / shadowNormalBias / shadowRadius | 0.0001 / 0 / 1 |
| debugCSMHelper | false |

SunLightがCSMへ全設定を渡す（sunLight.ts:207–232）。CSMはカメラfarとの小さい側まで分割し、各cascadeの投影幅・奥行を設定、texel幅で位置をスナップする（`@navaramap/three-csm/src/CascadedShadowMaps.ts:214–222,238–272,304–329`）。bias / normalBias / radiusは全cascadeのThree.LightShadowへ反映（同:471–508）。作用範囲はその太陽が照らすlit受光面全体。建物だけへの限定スイッチではない。地形unlitでは通常の拡散照明の効果は変わり、影用バッファ保持とも区別する。

**+1.5°でのムラは機序として裏付け可能、観測原因の確定は不可。** 通常のbiasは比較深度への加減算（`three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js:150–184`）、normalBiasは受光点を法線方向へ移す（`shadowmap_vertex.glsl.js:35`、Navara view-space補正も同じ意味で適用：`three-csm/src/viewSpaceShadowReceive.ts:106–122`）。斜入射の面ではshadow texel内の深度変化とサンプル誤差が自己遮蔽判定を作り得る。+1.5°は水平面に対して浅い角度であり、全ての壁面が同じ入射角という意味ではない。biasを大きくすれば必ず改善するとは言えず、誤遮蔽を外す代わりに本来の接触影まで失う／影が離れる可能性がある。biasの符号と量は同一画角で比較する。

**STBN以外の粒子候補もある。** Navara rendererはPCFShadowMapを選択（`@navaramap/three/src/index.ts:1011`）。上記Three.js PCFは画素座標のinterleavedGradientNoiseでVogel diskの5サンプルを回転させる（shadowmap_pars_fragment.glsl.js:171–185）。これはframeを引数に取らない空間ノイズで、雲の履歴蓄積の対象でもない。shadowRadiusを広げると軟化するが粒状模様が見える可能性があり、SunLightOptionsの「3x3 kernel」というコメント（sunLight.ts:98–100）より実シェーダーを優先する。既存ECEF精度対策もviewSpaceShadowReceive.ts:4–20に実装済みなので、過去の絶対座標ジッタだけを原因と断定しない。

### Q3 STBN収束 — 時間再利用はあるが、既定は単純な平均蓄積ではない

STBNは画素とframe % texture depthで変化する（`@takram/three-clouds/src/shaders/clouds.glsl:1–5`）。レイマーチ／shadowLengthのjitterに使う（`shaders/clouds.frag:489–490,861–892,951–961`）。実際のeffect updateごとにframeを増加し、ShadowPassとCloudsPassを実行する（`CloudsEffect.ts:478–484`）。CloudsPassは再投影行列を保持して履歴バッファをswapする（`CloudsPass.ts:185–200`）。

- **既定のtemporalUpscale=true** は `CloudsMaterial.ts:137–138` と `CloudsResolveMaterial.ts:103–104`。低解像度は幅・高さをそれぞれ1/4にしたもの（CloudsPass.ts:203–223）。4×4 Bayer配置を16frameで更新する（`shaders/cloudsResolve.frag:161–165`）。更新対象画素は**蓄積せず現在値で置換**（:75–81）。他の画素は再投影した履歴をvariance clippingして利用（:84–116）。16frame経過は全配置の巡回であり、「16枚を平均してノイズゼロ」の意味ではない。resolutionScale=1でもこの内部1/4処理は残る。
- 非upscale分岐に限って `mix(clippedHistory,current,temporalAlpha)`、alpha既定0.1（同frag:120–150、CloudsResolveMaterial.ts:77–78）。これは指数移動平均であり、サンプル数を無限に増やす平均ではない。安定した履歴なら揺らぎを減らすが、新規ノイズ・クリッピングで残差は残り得る。**過去の「alpha=0.1で収束」という記録だけでは既定経路の説明として不十分**。
- 雲影マップは別の時間フィルタ。temporalPass=true / temporalJitter=true（`ShadowMaterial.ts:128–132`）、alpha=0.01（`ShadowResolveMaterial.ts:59–60`）。再投影・画面外拒否・variance clipping後にEMA（`shaders/shadowResolve.frag:51–65`）。雲カラーのBayer更新と混同しない。

粒子が静止画に残る条件は、(1) 描画frame不足・単発キャプチャ、(2) カメラ移動などで再投影先が画面外となり履歴を拒否、(3) 雲・太陽・照明・深度の変化や境界で履歴がclipされる、(4) リサイズで履歴ターゲットが再確保／変更、(5) 既定upscaleの現在値置換と有限解像度・レイマーチ、(6) そもそも太陽PCF等の別経路。コード根拠は上記frag:75–100,129–140、CloudsPass.ts:135–156,203–223。localWeatherVelocityのNavara既定はVector2(0,0)（pass.ts:115）だが、アプリが動かせば静止カメラでも被写体は静止しない（CloudsEffect.ts:349–352）。

待つだけではなく**実際に複数frameを描く必要がある**。view.animationの既定false（`@navaramap/three/src/index.ts:543`）、公開setterは連続描画の切替（:3149–3159）。アプリ側の更新でも描画されるため、現行ページが静止後に止まるかは実測が必要。

Navara公開CloudsOptions（pass.ts:45–100）と更新処理（CloudsEffectDesc.ts:61以降）にtemporalUpscale / temporalAlpha / varianceGamma / temporalJitter / temporalPassの操作項目はない。下流TakramにはtemporalUpscale等のAPIがある（CloudsEffect.ts:602–607等）が、Navaraの公開設定として渡せるとは扱わない。stbnUrlはテクスチャのURLでありジッタ停止や平均回数の設定ではない。公開の間接調整はqualityPreset=medium、resolutionScale=1、maxIterationCount / minStepSize / maxStepSize=null（presetに委任）。mediumの一次レイマーチ実効値は500 / 50 / 1000（qualityPresets.ts:19–22,90–100）。品質増加は空間誤差の軽減候補に留まり、完全収束の保証なし。

### Q4 立体感の公開手段 — 法線依存の照明と一様な持上げを分ける

| 手段・可否 | 既定値と実コード根拠 | 面差・作用範囲・制約 |
| --- | --- | --- |
| ambient色/強さ：可 | 白 / 1。`three-default-descs/src/lights/ambientLight.ts:8–15` | 一様な拡散底上げ。面方向の差を新たに作らず、強すぎると差を埋める。forwardのlit面全体。AWAKENINGの補助光0.3はアプリ値でSDK既定ではない |
| 露出：可 | 1。`three/src/renderers/WebGLRenderer.js:286`、Navara委譲`three/src/index.ts:1276–1283` | 最終画面全体。法線差を作らず、トーン圧縮で差を弱める場合あり |
| 建物色・発光の勾配：可 | バッチ公開属性はcolor/show/opacity/emissive/emissiveIntensity（`three/src/mesh/model.ts:47–51`）。Three標準材質のemissiveIntensity既定1（下記補足） | FeatureEvaluatorで選択した建物のみ。高さは建物ごとの属性であり、同じ建物の壁面法線ごとの勾配ではない。発光低下は既存照明差を見せる手段 |
| 太陽の方向・強さ・影：可 | SunLight intensity=1、applyColor=false、色=白、影設定はQ2（sunLight.ts:110–127）。方向はAtmosphereの日付に追従（SunLightDesc.ts:149–159） | 法線と入射方向の内積による面差と遮蔽。forwardのlit面全体。標準材質の拡散照明の例は`three/src/renderers/shaders/ShaderChunk/lights_lambert_pars_fragment.glsl.js:13–14` |
| 既存SkyLightProbe強さ：可 | intensity=1。Navara `lights/skyLightProbe.ts:12–25` → Takram SkyLightProbe.ts:67–71 → `three/src/lights/LightProbe.js:31` | 大気irradiance textureから球面調和係数を生成（Takram SkyLightProbe.ts:115–128）。上向き・横向きの法線差を作るが、同じ傾きの東西南北の垂直壁をこれだけで強く分離する設計ではない。forwardのlit面全体。標準シーンに既設（plugin/src/index.ts:199–201） |
| 任意LightProbe：可 | intensity=1、係数未指定ならゼロSH。`lights/LightProbeDesc.ts:10–15,34–48`、Three LightProbe.js:31 | 任意のSH係数で方向性ある拡散フィルを作れる。面法線による壁面差が可能。forwardのlit面全体、建物限定の公開マスクはない |
| 大気irradiance：可 | false、albedoScale=2/π、useNormalBuffer=true（`effects/aerialPerspective/effect.ts:21–48,179–195`） | worldNormalから太陽＋天空照明を計算（Takram frag:333–379）。後段の不透明ジオメトリ全体で、terrain.lit=falseだけでは地面を除外できない。forwardと二重照明しないようview.lit=falseとの対が必要（plugin/src/index.ts:158–165,207–215）。透過未対応。既存の地面改善・発光との整合は別途検証必須 |
| 後段の太陽影・specular：可 | shadow=false / shadowIntensity=1 / shadowSoftness=1.5px / shadowSamples=12 / specular=false / specularIntensity=1（`effects/aerialPerspective/lightingTerms.ts:10–33`） | irradiance・法線バッファが条件（:62–75）。影で遮蔽差、specularで方向依存ハイライト。全体の照明方式変更に付随するため初手にはしない |
| 雲の光：限定的に可 | skyLightScale=1 / groundBounceScale=1 / powderScale=0.8（clouds/pass.ts:89–97,149–152） | 雲自体の散乱・天空光・地面反射の調整。建物を照らす追加ライトではない。雲影による面の減光はQ1のirradiance経路に限る |
| SSAO：可 | effect追加時enabled=true、intensity=1、color=黒、quality=Low、halfRes=false、samples/radius=null（`effects/ssao.ts:13–30`） | 深度周辺の遮蔽で接地・窪み・隣棟間を強める。平らな孤立壁の向き差は作らない。画面全体、建物限定マスクなし。nullはn8ao既定委任（:60–70,109–129）。標準シーンへ自動追加はされない |
| 任意の追加ライト：拡張APIで可 | `three/src/index.ts:2274–2308,2600–2606` のaddLight/registerLight。標準登録はsun/ambient/skyLightProbe/lightProbeのみ（plugin/src/index.ts:131–135） | Point/Spot/任意方向Directionalの標準設定キーはない。独自LightDesc登録で追加可能だが、方向・強さの共通既定値はなく実装で定義する。既存sunの追加は大気方向へ追従するので独立したキーライトの代用にはならない。対象制御も独自実装が必要 |

補足：発光強度のThree材質既定は `three/src/materials/MeshStandardMaterial.js:170` のemissiveIntensity代入を参照。PLATEAUの読込値やアプリのFeatureEvaluatorが上書きするため、建物の実効既定強度を一律1とは扱わない。roughness/metalnessはモデル材質に存在しても、上記バッチ属性の一覧にはなく、現在の建物FeatureEvaluatorで面ごとに自由に指定できるとは主張しない。

### 磨き込み実装への技術的推奨順（今回は実装しない）

1. **原因の分離を先行**。同一カメラ・同一時刻・同一伝播状態で、太陽castShadowまたはshadowIntensityの単独比較、雲shadowsの単独比較、描画frameを進めた比較を用意する。irradiance=falseなので雲の直接表面影は優先度が低い。変更後の対照も同じ条件で作り、従来Beforeの時刻・白モデルとの比較だけで原因を判定しない。
2. **太陽CSMを局所調整**。PCF/アクネが疑われたらshadowRadiusの拡大を避けて比較し、normalBiasとbiasを少量ずつ調整。対象建物が入るshadowFar・分割を優先し、足りなければ解像度を上げる。接触影の浮き・欠落・遠景の打切り・GPU負荷を確認。数値の最適値は画像未確認のため指定しない。
3. **既存forward照明内で面差を回復**。建物の定常発光を抑え、ambientと既存SkyLightProbeの比率を調整し、露出で一様に戻しすぎない。壁方向の差が不足なら任意LightProbeの方向性ある係数を比較する。地形unlitとtransmittance=false/haze=0の改善を保つ。
4. **SSAOを弱く追加して接地を補う**。平面の陰影とは目的を分け、新たな粒子・ハロー・負荷が増えないか確認する。STBN寄与が確認できた場合のみ雲の公開品質・step・解像度を調整し、待機だけで消えると約束しない。
5. **照明方式の変更は別案として後段**。irradiance＋必要なshadow/specular、または独自追加ライト。面差を増やせるが、地面の再照明・発光・透過・既存ライトとの関係を広く検証する必要がある。

確認済みは公開型・更新コード・シェーダー経路・既定値のみ。ビルド / ページ起動 / 3D Tiles取得 / レンダリング完了 / 実画像確認 / 本調査に対するユーザー目視確認は今回すべて未実施。ドキュメントのみの追記なのでビルドや描画テストは行わず、差分・根拠パス・空白を検査する。判定は**暫定・目視未検証**。

コミット試行結果：`git add docs/architecture.md && git commit -m ...` はgit add段階で失敗。共有管理領域 `/home/hatch/workspace/navara-tocho-proto/.git/worktrees/navara-wt-polish/index.lock` を作成できず、エラーは `Read-only file system`。コミット未作成、追記は作業ツリーに保持。制限回避は行わない。

## CLOUD-DIAG — 目視評価 #10 の経路再調査（2026-11-07）

対象は AWAKENING、After の terrain.lit=false / aerialPerspective.transmittance=false / irradiance=false。inscatter は既定 true、clouds は coverage=0.45 / lightShafts=true / haze=true、After の hazeDensityScale=0。以下はインストール済み SDK の実コードの判定であり、まだらの観測原因の確定ではない。

### Q1 現行設定で地面ピクセルまで届く経路

根拠パスの接頭辞は `node_modules/`。

| 経路 | 現行 After の判定と根拠 |
| --- | --- |
| 雲本体のレイマーチと合成 | **効きうる**。地形メッシュへのラスタライズではなく、深度付きフルスクリーンのレイマーチ。`@takram/three-clouds/src/shaders/clouds.frag:812–855` は地面までのレイ距離で雲区間の終端を制限する。カメラと地面の間に雲があれば遮蔽される。`@navaramap/three-default-descs/src/effects/clouds/pass.ts:244–259` は atmosphereOverlay を大気へ渡し、`@takram/three-atmosphere/src/shaders/aerialPerspectiveEffect.frag:387–389` は最終色を `rgb*(1-overlay.a)+overlay.rgb` にする。irradiance・transmittance・地形unlitとは独立。暗い雲による覆いは可能だが、実画角での寄与は未確認 |
| aerialPerspective の雲影 opticalDepth / sunTransmittance | **直接の表面減光には効かない**。同 frag:354–379 は shadow map を exp(-opticalDepth) にし、SUN_LIGHT / SKY_LIGHT 分岐の getSunSkyIrradiance にのみ渡す。irradiance=false は両方の照明分岐を無効にする（Navara `effects/aerialPerspective/effect.ts:179–195`）。その場合 radiance=inputColor.rgb。shadow map 値を最終色へ無条件に乗算するコードはない。unlit にしてもこの結論は変わらない |
| 雲影の shadowLength / light shafts → inscatter | **効きうる**。Navara pass.ts:257–259 の shadowLength 転送は shadows と独立。Takram frag:278–280,381–382,133–150 は shadowLength を GetSkyRadianceToPoint へ渡し、INSCATTER で radiance に散乱を加える。`@takram/three-atmosphere/src/shaders/bruneton/runtime.glsl:318–335` は影区間の散乱を除く。transmittance=false でも加算量の空間差は残り、周囲より暗く見える可能性がある。元の地面色への直接乗算とは区別する。前回の「表面減光にはirradiance=true」という結論だけでは、この大気経路を除外できない |
| 大気の距離透過による地面減光 | **効かない**。frag:142–144 の radiance*=transmittance は TRANSMITTANCE 分岐内。After は無効。inscatter や overlay が消える意味ではない |
| 雲 haze | After は **密度0で寄与なし**。Navara pass.ts の hazeDensityScale setter は clouds.hazeDensityScale に伝達。Before は3e-5へ復帰するので診断OFFでは本体と一緒に止める。haze 0だけでは雲本体・shadowLength・shadow mapを停止できない |
| 太陽 CSM → 地形の forward 色 | **After の地形色には効かない**。`@navaramap/three/src/mesh/tile/index.ts:475` → `material/overrideMaterialsForMRT.ts:41–59` の NVR_UNLIT、同:182–186 は outgoingLight を diffuseColor.rgb で上書きする。receiveShadow=true でも照明・影込みの outgoingLight は最終地形色に残らない。ただし影バッファ・法線は引き続き書く（同:26–30,190以降）。地形が影を落とすこと、lit建物へのCSM、Beforeの受影は残る |
| 太陽 CSM の shadow buffer → 大気の後段照明 | **現行では効かない**。Navara `effects/aerialPerspective/lightingTerms.ts:62–75` は irradiance と normal buffer を条件にする。現行はirradiance=false。影バッファが存在するだけで unlit 地形を再減光しない |

雲の時間再投影・低解像度 resolve は上記本体／shadowLength／影マップの品質に関わる経路であり、新たな無条件乗算ではない。bloom・露出・色調は結果の見え方へ影響するが、今回変更しない。海上でも深度を持つ地形ピクセルなら同じ式となる。背景ピクセルは同frag:281–315のsky/overlay分岐になるため、スクショの海がどちらかは深度未確認。

### Q2 雲高度と広域カメラの位置関係

Navara pass.ts:294以降は Takram CloudLayers.DEFAULT を4層にコピーし、アプリの cloudLayers 上書きはない。`@takram/three-clouds/src/CloudLayers.ts:36–81` のプリセットは以下。qualityPreset=medium は解像度・反復等の品質設定で、層高度のプリセットとは別。

| 層 | altitude / height | 高度範囲 | 備考 |
| --- | --- | --- | --- |
| r | 750 / 650 m | 750–1400 m | densityScale=.2、shadow=true |
| g | 1000 / 1200 m | 1000–2200 m | densityScale=.2、shadow=true |
| b | 7500 / 500 m | 7500–8000 m | densityScale=.003 |
| a | 0 / 0 m | 厚さ0 | CloudLayer.ts:46–48 の既定値、実体積なし |

高度はSDKの惑星シェル／altitudeCorrection基準であり、各建物屋上からの高さではない。東京駅の既定 distance=520m、pitch=-48° の平面近似では注視点からのカメラ高さは約386m（520 sin48°）。既定の下向き中心レイは低層雲の下面750mより下なので、中心の地面までの雲本体交差はない。画面上端・水平線方向のレイまで含む断言ではない。

同じpitchで引くと distance 約1.01kmで高さ750m、約1.35kmで1000m、約2.96kmで2200mに達する。数kmの距離ならカメラが低層雲の中または上に位置し、地面への下向きレイが雲の体積を通る条件が成立する。広域で本体が街を覆う位置関係は**可能**。実際の密度はcoverage、weather、レイの方向にも依存する。pitchや注視点高度を変えた場合は再計算が必要で、曲率も含めこれは概算。ユーザー画像の正確なカメラ座標・pitch・深度は取得していないため、その画像で雲が間にあると確定はできない。

### 診断OFFの公開手段と復帰

`EffectHandle.visible=false` → `BaseDesc.onUpdateConfig` → `Pass.visible/enabled`（`@navaramap/three/src/effects/effect.ts:54–77`）で雲パスの本体・ShadowPass更新を止める。ただし既存の atmosphere overlay / shadow / shadowLength は残るため、これだけでは不十分。

`view.atmosphere` の公開Observed値（`@navaramap/three/src/atmosphere.ts:168–172`）3参照とenableShadowsを保存し、OFFで3参照をnull、enableShadows=falseにする。`effects/aerialPerspective/effect.ts:112–140` の購読で大気側にも即時反映。ONでは同じ参照・enableShadowsを戻し、visible=trueへ戻す。テクスチャや履歴を再生成せず、既存coverage・lightShafts・haze等を維持する。`CloudsEffectDesc.update()` は太陽方向コピーのみで、出力の生成は有効なパスの描画時に行われる。gradeのhazeDensityScale更新はプロパティ変更とneedsUpdate通知のみで、切り離した参照を戻さない。

削除案も調べたが採用しない。BaseHandle.delete → EffectDesc.onDestroy → RenderPassOrchestrator.removePass はパスの登録を外すだけで、Clouds.dispose（3参照のnull化）を呼ばない。visibleだけ、shadowsだけ、coverage=0だけも完全停止にならない。SDKや複数雲エフェクト構成が変わる際はこの前提を再検証する。
