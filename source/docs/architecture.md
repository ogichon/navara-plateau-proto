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
