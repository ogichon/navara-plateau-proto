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

## 診断改修・白い空白の調査（2026-11-09）

変更は `src/terra.ts` と本記録のみ。デプロイなし。

- DEM取得検査を三鷹（139.570, 35.700 / 56.3 m）、新宿（139.670, 35.695 / 36.5 m）、日本橋（139.770, 35.680 / 2.5 m）へ変更。参照標高はユーザー提供の地理院標高API実測値で、この環境で再取得した値ではない。zoom 12・30秒abortは維持。
- 有限値3地点を取得成功の主条件として維持。各地点の取得標高・実測差・緩い許容±30 mとの照合を状態テキストへ表示し、`__terra.sampleChecks` と `heightTolerance` に保存する。差が大きい場合は参考警告に留め、取得失敗とは扱わない。欠測は照合不能（consistent: null）。
- 状態テキストに最初のエラーの先頭120文字を表示。`__terra.errors` の全件・全文と `__error` の最新エラー記録は維持。PNG保存後も診断テキストを維持する。

### 背景・クリア色の確認

インストール済みSDKの `@navaramap/three/src/index.ts` のThreeViewオプションに `backgroundColor?: CoreColor` があり、コンストラクタ（1075行付近）で `options.backgroundColor.toHex()` を `this._renderer.setClearColor(bgColor)` に渡す。未指定時は黒。`src/passes/CustomRenderPass.ts`（418行付近）でも描画時の現在のクリア色・アルファを使ってレンダーターゲットをクリアする。

TERRAは既にこの公開オプションで `#070d12` を明示済み。`terra.html` のhtml/body/app背景も同じ暗色である。したがって設定の追加・推測による色変更は行わず、SDK経路をコメントで明記した。白い空白の原因は未特定であり、修復済みとは判定しない。

未検証の候補は、配信されたJS/HTMLの版やキャッシュの相違、初期化例外またはWebGLコンテキストの問題、SDKの合成パスや描画対象が白を出力する問題。DEM欠測だけでは白背景の説明にならない。次は実行環境で `__terra` / `__error`、配信アセット、WebGLコンテキスト、実際のフレームを確認して切り分ける必要がある。実DEM通信・ページ起動・レンダリング完了・実際のビジュアル・ユーザー目視は今回未確認。

### 検証

既存 `test-terra`（初期化失敗を含む5ケース）、`test-awakening`、`test-camera`、`test-cloud-mutations`（24/24）、`test-underwater` がすべてexit 0。変更範囲を維持するため既存テストファイルは変更せず、`/tmp` の追加テストで指定座標、背景オプション、実測から大きく外れた有限標高の参考警告と取得成功の両立、最初のエラー表示・全文記録を検証し通過。`npx vite build` 成功、Draco/font WASMとcloud/noise/waterコピー成功。既存Vite警告は残る。

今回も `git add src/terra.ts docs/experiments/terra-proto.md` と `git commit -m 'fix: improve terra terrain and error diagnostics'` を試行したが、共有Git管理領域の `index.lock` を作成できず `Read-only file system`（exit 128）で失敗。コミット未作成。変更はworktreeに保持した。

## 根本原因の特定と修正（2026-11-09、ディレクター実測）

クラウドブラウザで全サンプル欠測・白空白だった原因は、**DEMタイルのURLのプロダクト名誤り**だった。`xyz/dem/` は全ズームで404（地理院の現行プロダクトではない）。正しくは `xyz/dem_png/` で、実測: z10–z14で200、新宿のピクセルを復号すると 35.6–35.7m（標高API実測36.5mと整合）、z15は404のため maxZoom 14 は正しい。テスト側も誤URLを正として固定していたため併せて修正した。修正は src/terra.ts の1行＋テスト正規表現。環境要因ではなくコードのバグであり、実Chromeでも発生していたはずのもの。

## 第2バグ: DEM復旧後の全面白表示（2026-11-09）

### 採用経路と配線の判定

**SDKの標高ヒートマップ経路を継続。事前生成ラスターへのフォールバックは不採用。** 現行の同一DEMを terrain と raster で共用し、`raster.show:false` と `elevationHeatmap` を併記する構成は、インストール済み `@navaramap/three` 0.2.1の公開仕様と一致する。heatmapをterrain自身へ移す根拠はなく、その変更は行わない。

根拠（以下は `node_modules/@navaramap/` からの相対パス・今回の配布版の行番号）:

| 確認対象 | ファイル・行 | 判定 |
| --- | --- | --- |
| ヒートマップの所属 | `three/dist/index.d.ts:9046–9068` | raster-demをrasterで描け、`elevationHeatmap` / `hillshade` / `raster` は並列。`raster.show` は符号化画像の表示だけに作用すると明記 |
| terrain側の公開設定 | `three/dist/index.d.ts:10318–10361,10383–10404` | terrainは地表メッシュと照明・影などを設定。elevationHeatmapプロパティなし |
| カラーマップの配線 | `core/src/globe/Globe.ts:158–165` → `three/src/index.ts:814–833` | setterからWASM LUTとGPUテクスチャを更新。現行の正規化sRGB LUTは `core/src/color/ColorMap.ts:17–30,69–80` の期待と一致 |
| 可視面への合成 | `three/src/mesh/tile/index.ts:343–379,397–408` | 表示中かつテクスチャありのスロットをheatmapとして採用し、colormapと標高パラメータを渡す |
| DEMから色への変換 | `three/src/material/enhancer/tileComposite/tileElevationHeatmapEnhancer/shader.ts:19–31` | DEMを復号・正規化してcolormapを参照。欠測は透明。符号化RGBの直接表示ではない |
| enhancerの有効化 | `three/src/material/enhancer/tileComposite/compose.ts:27,45`、`tileElevationHeatmapEnhancer/mutates.ts:51–68`（同ディレクトリ） | heatmap種別から機能を有効化、LUTとデコード用uniformを供給 |

配布パッケージにこの構成を示すexample/sample本体は見つからなかった。型だけでなく上記の実装と、実際に配信される `three/dist/index.js` の同等処理を確認した。

### 修正した問題

1. **線形モードでも対数経路にNaNが入る余地**: `three/src/mesh/tile/index.ts:1283–1285` は `Math.log(mat.logBoundary)` を無条件で計算する。配布GLSLは `three/dist/index.js:28714` の `normalizeElevationHeight` / `pseudoLog` / `nvr_branchFreeTernary`。線形モードの選択も `a * useA + b * (1 - useA)` であるため、未指定境界によるNaNを0倍しても除去できず、色参照座標へ伝播する。TERRAでは `logBoundary:10` を明示し、有限かつ非ゼロの `Math.log(10)` を渡す。`logarithmic:false` と−5〜60 mの線形範囲は維持。
2. **DEM陰影用の法線経路がない**: 同じDEMを使う別rasterレイヤーに `raster:{show:false}, hillshade:{exaggeration:1}` を追加。`three/src/event/hillshade.ts:139–142,177–212` が共有DEMから法線マップを生成し、`three/src/material/enhancer/tileComposite/tileHillshadeEnhancer/shader.ts:7–33` が色を追加せず法線を合成する。`three/src/mesh/tile/index.ts:1287–1295` でhillshade機能を有効化する。heatmapとhillshadeを同一スロットに混在させない（同ファイル `351–369` でhillshadeが優先されるため）。照明強度や露出の推測調整は行っていない。

補足の一次資料: [Navara利用ガイド](https://github.com/maplibre/navara/blob/main/skills/navara-usage/SKILL.md)の検索取得本文にも、logBoundary省略によるソフトウェアGLの単色化が記載されている。ただしページ本体のopenは404だったため、根拠の中心はインストール済みSDKと数値再現に置く。[上流Issue #826](https://github.com/maplibre/navara/issues/826)にはDEM地形の陰影にhillshadeが必要という開発者回答がある。Issueのサンプルは旧版0.1.1の構文なので転記せず、今回の0.2.1の型に従った。

**数値的不具合経路と法線供給の欠落は確認したが、ユーザー環境の全白フレームの原因を実描画で確定したわけではない。** 実WASMからGPUに渡った未修正時のlogBoundary値やNaN、合成スロットの状態は今回読み戻していない。

### 検証と未確認点

- `node scripts/test-terra.cjs`: 既存5ケース通過。3レイヤーの同一DEM参照、符号化RGB非表示、線形heatmapの安全な境界値、独立hillshadeを回帰検証へ追加。既存の取得・ライフサイクル・キャプチャ・エラー検査を維持。
- `node scripts/test-terra-sdk.cjs`: **インストール済みの配布GLSLから3つのスカラー関数を取り出し、演算をJSで実行**。未指定境界でNaN、境界10で−5/0/3.8/35.7/56.3/60 mが期待する線形値になることを確認。境界0の海面標高もNaNになる。GPU・ドライバ挙動の検証ではない。
- awakening / camera / cloud-mutations（24/24）/ underwater の既存テストすべてexit 0。
- `npx vite build` 成功、6ページ出力、Draco/font WASMとcloud/noise/waterコピー成功。既存のVite警告は残る。
- ページ起動・実DEM通信・全タイル取得・レンダリング完了・修正後PNG・実際のビジュアル・ユーザー目視は未検証。採点・見た目の自己判定なし。次は許可されたChromeで同一カメラのPNGと標高色・陰影を確認する。
- GitHub Issue/PR/Pages読取りと地理院タイルのcurlを試したが、設定済みproxyへの接続不可で取得できなかった。制限回避なし、外部書込みなし。
- 変更対象は `src/terra.ts`、TERRA用の2テスト、本記録のみ。追加タイル資産は0 byte。生成スクリプト不要。デプロイなし。

### 独立レビュー・コミット

別Codexセッションの読取りレビューで具体的な欠陥指摘なし。型・NaN経路・別hillshadeスロットの整合性を確認し、TERRAの2テストも通過。実WASMの未指定値と修正後描画は未検証という留保を維持した。

`git add src/terra.ts scripts/test-terra.cjs scripts/test-terra-sdk.cjs docs/experiments/terra-proto.md` と `git commit -m 'fix: stabilize terra elevation heatmap and supply hillshade normals'` を順に試行した。両方exit 128、共有Git管理領域 `/home/hatch/workspace/navara-tocho-proto/.git/worktrees/navara-wt-terra/index.lock` が `Read-only file system` のため失敗。コミット未作成。変更はこのworktreeに保持。未追跡node_modulesは追加していない。

## 事前生成テクスチャ drape への切替（2026-11-09）

ディレクター指示により、上記「ヒートマップ継続／フォールバック不採用」の判断を撤回。内蔵経路の色分離を実描画で確認できなかったため、mainから取り込み済みの `public/terrain/{z}/{x}/{y}.png`（z11–13、東京域139.55–139.95 / 35.52–35.86、158枚）を通常の raster-tile / raster として重ねる。事前生成の標高ティント＋陰影＋崖線強調であり、航空写真ではない。真俯瞰プレビューはディレクターが目視済みとの入力情報で、このセッションの目視確認ではない。

- 地表はAWAKENINGと同じRe:Earth quantized-mesh（ellipsoid、maxZoom18、vertex normals / water mask要求）へ戻した。出典を併記。
- URLは `new URL("terrain/", location.href).href` にプレースホルダーを連結。localhost直下とPagesのサブパスに追従し、クエリは引き継がない。raster sourceはminZoom11 / maxZoom13。既存Vite設定・タイルファイルは変更しない。
- DEM heatmap / hillshadeレイヤー、ColorMap、elevationColormap設定、SDK sampleTerrain経路をTERRAページから撤去。`test-terra-sdk.cjs` は旧SDK数値問題の履歴的回帰テストとして変更せず、引き続き通過。
- 地表素地の `view.globe.color` は背景と同じ #070d12。SDKの `three/src/material/macro/tileShader.ts` はatlasをalpha合成するため、タイルのない素地を暗くし、タイル自体への暗色乗算は行わない。境界の実際の馴染み方・領域外404時の挙動は未確認。
- 低太陽（15:45 JST）、照明、露出1.1、暗背景、低速周回、最小UI、postRenderでの📸を維持。AWAKENINGで用いている低太陽の地面暗化対策を地形の `lit:false` に限って採用。事前生成色・陰影を保持し、太陽光による二重の暗化を避ける意図。ライトは維持するが、地表に動的な太陽陰影を保証するものではない。露出・トーンマッピングは引き続き作用する。実際の明るさ・写真ベースマップ相当の合成結果は未検証。
- 診断はページから地理院 `dem_png` z12を直接fetch、createImageBitmapと2D canvasで該当ピクセルを取得し、符号付き24bit cmを復号（0x800000は欠測、負標高対応）。画像はfinallyでclose。30秒abort、従来3地点・参照標高・±30mの参考照合・例外表示を維持。これはRe:Earth地形やdrapeの取得検査ではない。
- SDK 0.2.1の公開型 `TerrainMaterial`、quantized-mesh source、Globeとthreeソースを確認したが、地表標高全体の垂直誇張オプションは見つからない。hillshade.exaggerationは法線、skirtExaggerationは境界の裾のみで代用不可。従って `?exagg=` は未実装（指定しても作用なし）、既定6も適用しない。`__terra.verticalExaggeration.supported=false` に記録。将来公開APIが追加された時に再検討。

### 検証と残る課題

- `test-terra.cjs` の旧構成期待を新構成へ更新。従来5ケース（正常・通信例外・欠測・キャプチャ例外・初期化失敗）の検査を維持し、drapeのサブパスURL、素地色、直接fetch・ピクセル位置範囲・標高照合、負標高・海面0・欠測復号を確認。WebGLや実ネットワークのテストではない。
- `node scripts/test-terra.cjs` / `test-terra-sdk.cjs` / `test-awakening.cjs` / `test-camera.cjs` / `test-cloud-mutations.cjs`（24/24）/ `test-underwater.cjs` はすべてexit0。
- `npx vite build` 成功（6ページ）。158枚すべてのpublicとdistのPNGをbyte単位で照合、一致。Draco/font WASM・cloud/noise/waterのコピー成功。既存Vite設定・チャンクサイズ警告は残る。
- ビルド成功と資産配置のみ確認。ページ起動、実DEM通信、Re:Earth地形取得、drape取得、全表示タイル完了、レンダリング完了、実ビジュアル確認、今回のユーザー目視確認は未検証。作品の採点・見た目の自己判定なし。
- 次は許可されたChromeで同一カメラの地形・色・境界・低太陽時の明るさ・PNGを確認。デプロイは実施しない。GitHub Issue/PR/Pagesの読取りはproxy接続制限で失敗し、外部状態は取得できなかった。

### 今回のコミット結果

`git add src/terra.ts scripts/test-terra.cjs docs/experiments/terra-proto.md` および `git commit -m 'feat: switch TERRA to precomputed terrain texture drape'` を試行。いずれもexit128、共有Git管理領域の `index.lock` が `Read-only file system` のため失敗。コミット未作成。制限を回避せず、変更をworktreeに保持。未追跡node_modulesは追加していない。
