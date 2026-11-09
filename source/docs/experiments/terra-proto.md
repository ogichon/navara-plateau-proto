# TERRA NAKED — 地形のみ試作

2026-11-09 / `exp/terra` / `docs/briefs/terra-proto.md` 全文に基づく実装。デプロイなし。見た目の自己判定・採点なし。

## 実現したこと

新規 `terra.html` + `src/terra.ts`。既存 index / awakening / underwater / camera / official のHTML・TSは変更していない。`vite.config.ts` は新規ビルド入口1行のみ追加し、ランタイム資産コピープラグインを維持。

建物・航空写真・地図画像ソースは登録しない。地理院DEM（RGBに標高値を格納したPNGで、写真ではない）1ソースを `terrain` と `raster` の2レイヤーで共用する。後者は `raster.show: false` で標高の符号化RGBそのものを隠し、`elevationHeatmap` のみ使用する。

UIはタイトル・周回ON/OFF・PNGキャプチャ・最小状態表示。東京23区と西側の台地を狙う注視点139.73 / 35.70、距離65 km、pitch −48°、heading 25°。周回は0.6°/秒。pagehide/pageshow・visibilitychangeでタイマーを停止・再開し、二重周回と復帰時の大ジャンプを防止。周回OFFは復帰後も維持。PNGはpostRender内で書き出す（保存された画像の内容は保証・判定しない）。

## SDK調査と写真なし地形の実現経路

調査対象はインストール済み `@navaramap/three` / `three-default-plugin` 0.2.1。ローカル配布SDKの型だけでなくソースを確認した。

- `three-default-plugin/dist/index.js`: `addDefaultPhotorealScene()` は sky / stars / lights / effects を追加するヘルパー。**ヘルパー自体は地形も航空写真も追加しない**。既存ページ側が写真を別途追加している。ブリーフの前提はこの点を訂正する。
- `three/dist/index.d.ts` の `TerrainSourceLayer`: `raster-dem` または `quantized-mesh` を地表として描画できる。写真レイヤーは必須ではない。
- `RasterLayerDescription` / `ElevationHeatmapMaterial`: `raster-dem` をデコードして標高ヒートマップを描画可能。minHeight / maxHeight / logarithmic が公開されている。
- `three/src/index.ts` の `setElevationColormap`: `view.globe.elevationColormap` の更新でWASM側カラーマップとGPUテクスチャの両方を設定する。
- `three/src/material/enhancer/tileComposite/tileElevationHeatmapEnhancer/shader.ts`: DEMの標高値をデコードし、正規化標高で `uColorMapTexture` を参照する。欠測値は透明になる。
- `three/src/mesh/tile/index.ts`: elevationHeatmapレイヤーを地形合成用スロットとして扱う。
- `@navaramap/core/src/color/ColorMap.ts`: LUTは0〜1のsRGB RGBタプル。256段の線形補間LUTをコードで生成した。

地形自体の `TerrainMaterial` に直接の標高色設定はないが、**同一DEMを標高ヒートマップとして地形へ重ねる公開API経路があるため、標高ティントは実装可能と判断**。非公開シェーダー差し替えや航空写真への色乗算は使わない。ブラウザで実際にこの合成が描画されたことは未検証。

データは `https://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.png`、256 px、maxZoom 14、SDKの `JAPAN_GSI_ELEVATION_DECODER()` を使用。出典をページ内に表示。[国土地理院・標高タイル仕様](https://maps.gsi.go.jp/development/demtile.html)でPNGのRGB符号化・負標高・欠測値の仕様を確認した。独自に欠測を0 mへ埋める処理は入れない。

## 設定した表現（効果は目視未検証）

- −5 m以下を暗い青緑 `#103b43`、60 m以上を明るい土・岩色 `#c9b58c`、その間を線形補間。対数スケールなし。
- 2026-11-09 15:45 JST固定。既存依存astronomy-engineで注視点に対する太陽高度9.223°・方位241.475°を計算確認した。
- sun intensity 2.2 / applyColor true / castShadow true / shadowFar 120 km、ambient intensity 0.3、terrain lit / castShadow / receiveShadow true、exposure 1.1。
- 空メッシュ・星・雲・ブルームは追加せず暗い背景にする。標高の誇張は加えない。

## 検証結果と限界

| 段階 | 結果 |
| --- | --- |
| ビルド | `npx vite build` 成功、6ページ（terra含む）出力 |
| ランタイム資産 | Draco/font WASM、cloud/noise/water のdist配置確認 |
| 純Node動作テスト | `node scripts/test-terra.cjs` 成功。正常取得、取得例外、欠測、キャプチャ例外、初期化失敗の5ケース |
| 既存テスト | awakening / camera / cloud-mutations（24/24）/ underwater 全通過 |
| 設定値・ライフサイクル | Nodeモックでソース/レイヤー構成、標高色、固定日時、照明、カメラ、周回の停止復帰、PNGのpostRender待ち、エラー記録を検証 |
| 実DEM通信 | curlによる取得を試行、設定済みproxy port 3128へ接続できず失敗。HTTPステータス未取得 |
| ページ起動 | 未検証（既知のブラウザ環境制約を再迂回しない） |
| 全表示タイル取得完了 | 未確認。idleだけで完了としない |
| レンダリング完了 | 未確認。postRender受信と完成描画を区別 |
| 実際のビジュアル確認 / ユーザー目視 | 未実施。作品評価なし |

Nodeテストは実DEM通信・GPU描画の証明ではない。`npm test` は既存の未設定ダミーのため使わず、各スクリプトを直接実行した。既存のVite設定ロード・大チャンク・Node実験APIの警告は残る。

ブラウザ実行時は `window.__terra` に設定値・初期化・描画イベント数・idle観測・標高サンプル・例外・キャプチャ状態を保存する。`window.__ready` は初期化のみ。SDK `sampleTerrainMostDetailed` で西/中/東3地点をzoom 12固定で取得・デコードし、全地点に有限の標高が得られた時だけ「3地点取得・デコード完了」とする。30秒でabortする。これは表示中全タイルの取得完了を意味しない。実行時エラーと未処理Promise拒否も記録する。今回の環境で「エラーなし・実取得完了」を実測できたとは主張しない。

## 未達事項・次の行動

- 崖線の読みやすさ、東京23区の収まり、色と暗さ、PNGの忠実度は未確認。環境で不可能と確定しているため、見た目を自己判定しない。
- 水系の専用ポリゴン・水面は追加していない。DEMだけでは河道・海・欠測地を一意に水として分類できないため、水面の存在を保証しない。
- 全表示タイルの完了を保証する公開イベントは確認できていない。idleは取得成功の根拠に使わず、3地点のSDK取得検査を明示した。
- 許可された実Chromeで `terra.html` を開き、`__terra` の取得・エラー状態を確認する。その後に人間が崖線・広域構図・標高ティントを目視評価する。デプロイは今回の対象外。
- GitHub Issue/PR/Pagesの読取りもghで試行したがproxy socket operation not permitted。外部状態は取得できず、外部書込みは行っていない。

## 独立レビュー

別CodexセッションでSDKと実装を読取りレビュー。太陽のshadowFar既定値50 kmではカメラ距離65 kmの注視点が影範囲外となる指摘を受け、120 kmを明示しテストを追加。他の具体的な不具合指摘なし。実描画や見た目の承認ではない。

## コミット結果

`git add` と `git commit -m 'feat: add terrain-only TERRA prototype with elevation tint'` を試行したが、どちらも共有Git管理領域 `/home/hatch/workspace/navara-tocho-proto/.git/worktrees/navara-wt-terra/index.lock` を作成できず `Read-only file system`（exit 128）で失敗。コミット未作成。制限を回避せず変更をworktreeに保持。既存の未追跡ブリーフとnode_modulesは変更していない。
