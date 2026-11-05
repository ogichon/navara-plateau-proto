# TOKYO UNDERWATER — 技術実現性調査

調査日: 2026-11-05 / 対象ブランチ: `exp/underwater-research`。
結論: **半透明平面＋浸水属性による建物発光＋厚い雲で、概念表現の静止画を組むことは条件付き可**。水の材質は実在するが、半透明水面への都市の鏡面反射まで標準設定だけで成立するとは判断できない。実装・ビルド・ブラウザ起動・タイル取得・描画・実画像評価は本調査では行っていない。

## 調査範囲と証拠の読み方

この worktree には必読の `AGENTS.md`、`docs/architecture.md`、`docs/creative-direction.md` がなかったため、同一プロジェクトの `/home/hatch/workspace/navara-tocho-proto/` にある各ファイルを読んだ。v13 浸水スタイルはこの worktree の `src/main.ts:318–397` を読み、変更していない。必読ファイルを欠落したまま読了扱いにしていない。

以下の略号は、すべて `/home/hatch/workspace/navara-tocho-proto/node_modules/` 以下の**実ファイル**を指す。行番号は今回の配布物に対するもので、更新時にはシンボル名で再確認する。

- **T**: `@navaramap/three/dist/index.d.ts`
- **J**: `@navaramap/three/dist/index.js`
- **D**: `@navaramap/three-default-descs/dist/index.d.ts`
- **K**: `@navaramap/three-default-descs/dist/index.js`
- 対象 `@navaramap/three` の package.json は **0.2.1**。型と実装の両方を調査し、Web 上の最新版を根拠に混ぜていない。

「可」は API/コード上の操作が確認できた意味で、見栄え・フレームレート保証ではない。「条件付き可」は追加処理や目視確認が必要。「不可」は指定 API だけでは該当機能が提供されないという範囲に限る。例の数値は画作りの初期候補であり、動作実証済みプリセットではない。

## 項目別判定

| 項目 | 判定 | 根拠となる型・コード | 設定例 / 制約 |
|---|---|---|---|
| 1a 水材質の存在 | **可** | T `Polygon` の `water` / `waterScaleNormal` / `waterSpeed`（8013–8035、8213–8235）、`WaterOnlyProps`（12726付近）。D `PolygonMeshStyle`（2272）、`Description_22`（1083）。K `PolygonMeshDesc.createMaterial/waterProps`（5047–5090） | 独立した `water` Desc キーではなく、`polygon: {water:true, waterScaleNormal:0.01, waterSpeed:1}` 等の材質指定。model にも water がある（T 6803–6825）。波浪で頂点を変形する海面や洪水シミュレーションとは別。 |
| 1b 任意標高の半透明面 | **可** | D `Description_9`（1346付近）、`PlaneMeshConfig`（2175）、K `PlaneMeshDesc`（2489–2530）。T `MeshConfig`（6158–6205）、`GeodeticPlacement`（4467） | `plane` キーで寸法・Color・opacity・transparent を指定し、`geodetic:{lng,lat,height,heightReference:'ellipsoid'}` で置く。`position:{x,y,z}` に経緯度を直接渡さない。下記の平面例。 |
| 1c 水 normal アセットの用途 | **可**（用途特定）/ 独立 polygon の波模様は**条件付き可** | J 17095 `WATER_NORMAL_URL`、35503–35510 ロード、23106–23130 water enhancer。`assets/water/README.md`。K 5057–5079 と J 27940–27943 を比較 | `waternormals.jpg`（約243 KiB）＋出典 README。水面法線を時間・スケールで変化させる入力であり、水面モデルや反射画像ではない。初期化に `waterTexture:{enabled:true}` が必要（T 7243–7251）。ただし独立 polygon は shared normal の明示接続を確認できず、後述。 |
| 2 水位変更 | **可**（平面更新）/ 毎フレームは**条件付き可** | T `MeshUpdate`（6560–6569）、`MeshHandle`（6543）、`MeshDesc.onUpdateConfig/applyTransform`。K plane 更新末尾で super 呼出（2530付近） | `waterPlane.update({geodetic:{height:nextHeight}})`。部分更新は lng/lat を保持。寸法変更を伴わなければ平面ジオメトリ再生成を避けられる。FPS は未計測。 |
| 3 SSR | **条件付き可**（半透明平面への単純追加は未成立） | D `SSROptions`（3435–3523）、K `SSREffectDesc`（12445–12474） | `ssr:{resolutionScale:0.5,iterations:32,useConeTracing:true}`。normal G-buffer 必須、`insertBefore=['transparent']`。透明面の位置・法線が標準 SSR 入力に自動でそろう保証はない。 |
| 3b 反射の代替 | 空環境反射は**条件付き可**、疑似反射は**条件付き可** | K polygon createMaterial の `skyEnvMap`（5059）、J water enhancer の envMap 設定（23106–23108）、skyEnvMap scene から cubemap 作成（33489–33492）。D `Description_9` | 水 polygon の環境反射経路は実在。ただし空用 scene の内容と生成順の確認が必要。建物の鏡像はこの環境マップだけでは保証されない。疑似反射は plane の emissiveColor/opacity を使った細い光の面等を別途配置する演出案で、標準「都市鏡像」機能ではない。 |
| 4a rainDrop | **可**（画面の水滴） | D `RainDropEffectOptions`（2423–2454）、K `RainDropEffectDesc`（12097付近） | `rainDrop:{opacity:0.25,dropDensity:0.5,refractionStrength:0.01}`。雨量 mm/h や単一の intensity 指定ではない。空間の雨粒と区別する。 |
| 4b 嵐の雲 | **条件付き可** | D `CloudsOptions`（683–726）、K coverage setter（8585–8589、8936–8940）、shader（7844） | `clouds:{coverage:1,shadows:true,skyLightScale:0.3,absorptionCoefficient:0.1}` が調整候補。上限 clamp は setter に存在しない。0–1 を運用範囲として採用し、1超を「さらに厚い雲」と解釈しない。暗さは露出・太陽・照明と併せて実画像判断。 |
| 5a fogLight | **可**（局所の光の霧）/ 一様な水没霧は**条件付き可** | D `FogLightDefinition`（1424）、`FogLightEffectOptions`（1518–1560）、`FogLightOptions`（1563）、K 12043–12072 | `fogLight:{lights:[...],fogDensity:5,downsample:4,useSurfaceLighting:false}`。lights は ECEF。光源の周囲に広がる霧であり、全域に水中減衰を適用する API とは異なる。 |
| 5b aerialPerspective の haze | **不可**（そのキーには未提供）/ clouds haze は**条件付き可** | D `AerialPerspectiveOptions`（222–231）と `CloudsOptions`（703–707）、K aerial 更新（11959付近）・clouds 更新（11991） | `aerialPerspective:{hazeDensityScale:...}` は誤り。`clouds:{haze:true,hazeDensityScale:1,hazeExponent:1}` が調整候補。水中散乱モデルや標高で切る霧の代用にはならない。 |
| 6 建物の浸水発光 | **可**（属性単位）/ 水面との合成は**条件付き可** | T `FeatureEvaluator.evaluate`（4175）、`EvaluatedValue`（3820）、この worktree `src/main.ts:326–397` | 既存 callback に `color/emissive/emissiveIntensity/opacity` を統合する。既存は浸水深 >=2m で強度0.8、その他0.15、深さなし/0 は opacity 0.5。水面と重なる透明描画を要確認。 |

## 水面を置く具体案

### A. 最小構成は通常の平面

以下は**将来実装用の例**であり、本調査では src に追加していない。既存の DefaultPlugin で `plane` Desc が登録された `view` を前提とする。型は D の `PlaneMeshDesc`、色は `@navaramap/three` の Color を使う（Three.js の Color と混同しない）。

```ts
import { Color } from '@navaramap/three';
import type { PlaneMeshDesc } from '@navaramap/three-default-descs';

const waterPlane = view.addMesh<PlaneMeshDesc>({
  geodetic: {
    lng: 139.767, lat: 35.681, height: 15,
    heightReference: 'ellipsoid',
  },
  rotation: { x: -Math.PI / 2, y: 0, z: 0 },
  plane: {
    width: 4000, height: 4000,
    color: new Color().setHex(0x123d4a),
    transparent: true, opacity: 0.55,
    castShadow: false, receiveShadow: false,
  },
});
waterPlane.update({ geodetic: { height: 18 } });
```

T `MeshConfig.geodetic` は **West-Up-North（Y up）**。K plane は標準 PlaneGeometry を回転せず作るので、XY 面を XZ 面にする -π/2 のローカル回転を加える。表面側・背面からの可視性は実ブラウザで確認する。`matrix` / `matrixWorld` / `geodetic` は排他。`position` はそのフレーム内のローカル移動で、メートルと度を混ぜない。

height は楕円体高であり、東京湾平均海面や標高 TP と同一ではない。`terrain` は一点の地形高への相対値で、地形ロードで位置が変わり得る。広域共通水面には楕円体基準を明示し、作品の水位と実浸水深の数値を同一視しない。4km の接平面も等楕円体高面ではなく曲率誤差を持つ。必要な範囲だけ覆い、遠景の端を画角外に置く。

この plane は MeshLambertMaterial。`water`、roughness、任意 envMap、depthWrite を `plane` の公開フィールドとして指定することはできない。opacity だけでなく transparent を指定する。透明面の depthWrite、ソート、建物の透過との相互作用は実画像で確認し、問題が出れば追加の材質制御を別途検討する。今回の証拠から未公開の設定を通ると仮定しない。

### B. 水材質を使う polygon（追加検証候補）

D `PositionSource`（2345）、`GeodeticRings`（1594）で経緯度＋高さの頂点を渡せる。polygon の既定は地面への drape なので、浮かせる場合は **clampToGround:false** が必要。例えば:

```ts
view.addMesh({
  polygon: {
    positions: [
      {lng:139.75, lat:35.67, height:15},
      {lng:139.79, lat:35.67, height:15},
      {lng:139.79, lat:35.70, height:15},
      {lng:139.75, lat:35.70, height:15},
    ],
    clampToGround:false, perPositionHeight:true,
    water:true, waterScaleNormal:0.01, waterSpeed:1,
    color:new Color().setHex(0x123d4a),
    transparent:true, opacity:0.55,
  },
});
```

位置ソースは positions / points / geojson の一つにそろえる。上例は球面上の範囲を扱う polygon であり、A の単一接平面とは幾何が異なる。

**重要な未確認点:** K polygon は water enhancer に timeUniform と skyEnvMap を渡すが、`waterProps` は waterNormalMap を渡していない。J 27940–27943 のレイヤー側 polygon には shared texture を後から取り込む処理がある一方、K の standalone polygon には同等の処理を確認できなかった。従って `waterTexture.enabled=true` と `polygon.water=true` だけで独立 polygon に正常な波の法線が出るとは断言しない。空環境マップも `.value` を createMaterial 時に渡すため、後で空 scene が成立した際に追従するかを確認する。波模様が必要ならまずレイヤーの polygon 経路と比較し、独立 polygon の未接続を解決してから採用する。

assets/water は平面 A には不要。水材質経路で使う場合は既存 Vite コピー処理を維持し、ビルド後の `assets/water/waternormals.jpg` と実配信の取得を確認する。README は Three.js の元画像への固定コミットリンクを持つ。画像の再利用時はその出典・ライセンス確認を維持する。

## 水位アニメーションの実装判断

plane の `handle.update({geodetic:{height}})` はフレームと transform の更新であり、`plane.width/height` の変更時のような geometry 再生成ではない。ゆっくり沈む演出なら少数の面を requestAnimationFrame で更新する設計は合理的だが、地形・PLATEAU・雲・SSR を含めた CPU/GPU の実測なしに「毎秒60回でも問題ない」とは言えない。render loop の継続が必要で、T `Options.animation`（7175）を含む既存 view の運用を確認する。最初は固定水位、次に低頻度の更新、最後に RAF で評価する。

polygon は別扱い。K 5109–5152 は transform の変更や positions / height / perPositionHeight 等の変更で geometry を build / dispose / replace する。polygon の水位を毎フレーム変えても plane と同じ軽さとは判断できない。大きい polygon を再生成し続ける案は最小構成に入れない。建物の `forceUpdate()` も全件の属性再評価につながるので、水位の RAF と無条件に結び付けない。

## 反射の前提と採用順

SSR の geometryBuffer は画面と整合した `.xy=octahedral packed view-space normal / .z=F0 / .w=roughness`。`.z<0.01`、roughness=1 は反射対象外。水の F0 例は0.02。normal attachment は effect が要求し、geometryBuffer 未指定なら engine の normal texture が毎フレーム渡される。custom texture の内容更新は自動反映し、texture オブジェクトの差替えは update が必要。

公開設定は geometryBuffer、resolutionScale、iterations、binarySearchIterations、pixelZSize、pixelStride、pixelStrideZCutoff、maxRayDistance、screenEdgeFadeStart、eyeFadeStart/End、jitter、blendMode、useConeTracing、coneTracingFadeStart/End/MaxDistance/Iteration、resolveKernelSize（奇数）。SSR は深度から位置を復元し画面内を ray march するため、画面外・背後の建物を補う完全な鏡ではない（K SSR shader、11900付近）。

特に SSR は transparent pass の前に走る。ただし「transparent:true の全メッシュが必ずその pass に入る」という意味ではない。J `MeshDescWithSelectiveEffect.getPassKey`（24914–24916）は buffer または selective effect があると plane / 非clamp polygon を MRT に振り分け、MRT は transparent 材質に NVR_BLENDED を付ける（33424–33434）。したがって pass 順だけから半透明水面の SSR を不可能とは断定できない。水面が実際に書く normal/F0/roughness/depth と blend の整合を確認する必要があり、custom normal テクスチャだけ作っても解決したことにはならない。まず不透明水材質で normal/depth が出るか確認し、透明化は別検証にする。MVP に SSR は入れない。

代替の優先順は (1) 深い青緑の面と建物発光のコントラスト、(2) 水材質に接続される空 cubemap の反射、(3) 静止画の構図に限った光の細い面による疑似反射、(4) SSR / カスタム反射。空環境反射は都市の反射ではなく、疑似反射は実在建物との対応を自動生成する既存 API ではない。カスタム planar reflection の実装工数は別枠とする。

## 雨・雲・霧の設定範囲

rainDrop は postprocess の UV 歪みと水滴。強度に相当する調整は opacity / dropDensity / dropLayers / refractionStrength。その他に dropGridSize、dropSizeFactor、noiseScale、minDropStrength、dropFadeStart/End、dropThresholdFactor、gridDensityLow/High、jitterStrengthLow/High が公開される。雨粒がビルの間を落下する表現が必要なら別の `rain` mesh がある（D 2345–2368、2589、K export の RainMeshDesc）。両者を混同しない。水滴を強めるとランドマークや発光が読めなくなるため後から追加する。

雲 coverage の型は number のみ。実装 setter は値をそのまま uniform に書き込み、ハード上限の検査はない。shader は `1.0 - coverage * heightScale` で weather density を remap し、地面への日射にも `(1.0 - coverage)` を使う（K 7844）。**安全な表現範囲の目安は0–1、型/コードで強制された最大値はない**という結論。coverage=1 でも黒い全面曇天を保証しない。cloudLayers の altitude/height/densityScale/shapeAmount/shapeDetailAmount/weatherExponent/shapeAlteringBias/coverageFilterWidth/shadow 等と、scatteringCoefficient/absorptionCoefficient/skyLightScale/groundBounceScale、太陽時刻・環境光・露出を合わせる。低い雲の地形干渉、影の暗さは目視確認事項。

fogLight の light は `position:{x,y,z}`（ECEF）、color（数値または Navara Color）、intensity、radius（既定500m）。地理座標からは T `geodeticToVector3`（4506付近）を使える。fogDensity（既定5）、maxLights（初期容量100、固定上限ではない）、useSurfaceLighting、tileSize、maxLightsPerTile（既定64）、extentScale、haloFalloff（既定0.1）、debugShowGrid、maxFar、downsample（既定4）が公開される。light の影響球と maxFar で対象が絞られる。地形で光の霧が遮蔽されない制限が型コメントにあり、隠れた光の halo が漏れ得る。Desc は normalBuffer を engine 側で接続し、transparent より前に描くので、透明水面まで一様に霧が掛かると仮定しない。少数のランドマーク付近だけに使う。

haze / hazeDensityScale / hazeExponent / hazeScatteringCoefficient / hazeAbsorptionCoefficient は **clouds** にある。aerialPerspective は inscatter/transmittance/irradiance/sky/sun/moon/albedoScale/useNormalBuffer と追加の shadow/specular 項であり haze 密度の公開設定を持たない。clouds haze は空気の演出候補として採用し、建物の水面下だけを青く減衰する機能とは見なさない。

## v13 浸水スタイリングとの統合上の注意

- 既存 `floodDepthOf` は `_浸水深` で終わる複数シナリオの最大値を使い、未取得・属性なし・0 を区別せず0にする。単一災害の予測や、作品の絶対水位の値として流用しない。「概念表現」と表示する。
- 既存 flood callback は `d<=0` を opacity 0.5、正の浸水深は1にする。追加 evaluator / モード切替が同じ opacity を書けば最終状態が競合し得る。発光と透過を**一つの callback の一つの返値**で決める。最初の underwater モードでは建物 opacity=1 を候補にし、水面だけ透過させる（既存 flood の凡例も必要なら別モードとして整理）。
- FeatureEvaluator は feature 単位の色・発光・透過であり、建物の水面下の部分だけを切り出す API ではない。高さ属性は建物全高で、地盤の絶対高や各頂点の水没判定にはならない。
- `layer.on('featureUpdated', ...)` で新規タイルにも同じ評価を掛け、設定変更で layer.forceUpdate()。既存 listener を残したまま別系統の制御を追加しない。復帰時は emissiveIntensity / opacity も明示的に戻す。
- emissive 値の設定と画面の bloom は別。既存 selectiveBloom と対象 layer の effectIds の接続を維持し、水面まで bloom に入れて全面が白くならないよう比較する。透明建物と透明水面の順序、ブルームの遮蔽、SSR の対象外になる領域は実Chromeで確認する。

## 推奨アプローチ — 最小構成で「沈みゆく東京」の1枚

1. 既存 v14 を壊さない別ページ / モードを設計し、東京駅など認識できる建物と地面を含む固定カメラを選ぶ。浸水属性と演出水位の関係は「概念表現」とする。
2. 固定水位の plane A だけを足し、画角を覆う最小サイズで地形・建物との交差を確認する。水位15m等は仮値で、実景との関係を見て決める。
3. 建物スタイルを一つの evaluator にまとめ、青緑の低彩度面と少数の強い発光を作る。opacity=1 の建物から始め、タイル追加時にも同じ見え方になるか確認する。
4. 既存の物理空・aerialPerspective を維持し、clouds の coverage を1以下で増やす。薄暗い夕景、環境光、露出を合わせ、ランドマークの形が読める範囲で暗くする。雲 haze は一項ずつ比較する。
5. 雨なし / 控えめ rainDrop の比較画像を用意する。必要なら少数の fogLight を置く。SSR・水位アニメーション・独立 water polygon はこの段階の必須条件にしない。
6. ユーザーの実Chromeで静止画を確認する。確認対象は水面の交差・透過順・都市らしさ・発光の読みやすさ・低空の霧。見え方が成立してから plane の高さ更新を加える。
7. 波や反射が画作りに不可欠と判明した場合のみ、レイヤー水 polygon と standalone polygon の normal/envMap 接続を比較し、最後に SSR を別検証する。

## 残リスク・未確認事項と実装時の検証

| 未確認事項 | 影響 / 次の検証 |
|---|---|
| 配布物とブラウザの実描画 | 型とコード上の経路確認のみ。ビルド成功も未検証。実装時にビルド → 起動 → タイル取得 → 描画 → 実画像 → ユーザー確認を別々に記録する。 |
| 独立 polygon の normal texture / envMap 接続 | 波の欠落、初期化順の影響。レイヤー版との比較、実際の uniform と shader compile を確認する。 |
| 透明面の depth / sort / 発光合成 | 水面の下の建物が不自然に前面化する可能性。建物 opacity=1 と既存0.5を比較。plane 公開 API にない depthWrite 制御が必要なら工数を見直す。 |
| 高さ基準・接平面の曲率・建物との交差 | 楕円体高と地盤高の違い、広域の浮き・埋まり。地形と代表ランドマークで確認。正確な洪水解析として提供しない。 |
| SSR の深度・normal・pass 順 | 透明面への単純追加は未実証。opaque 水材質で attachment を検証し、画面端・低い視線角・画面外の欠落を確認する。 |
| clouds / fogLight / rainDrop の合成 | 空の暗さ、霧の漏れ、透明水面への掛かり方は未確認。個別 ON/OFF で比較する。 |
| 性能・精度 | 大きい plane の ECEF 精度、polygon 再生成、体積雲・SSR・雨・bloom の負荷を実機計測。FPS・GPUメモリの保証なし。 |
| アセット | water/cloud/noise/wasm のコピーと配信を実装時に検証。現調査はファイル存在のみ確認、HTTP取得は未実施。 |

アーキテクチャ文書に従い、エージェントブラウザだけで建物不在や美観の成否を断定しない。現時点のビジュアル評価は **目視未検証**、採点なし。

## 本実装の工数感

- **最小静止画: 中**。plane と既存 evaluator の変更自体は小さいが、標高合わせ、透明合成、雲と光の調整、ユーザー実Chromeでの見え方の確認が主要作業になる。
- **平面の水位アニメーション追加: 小**（最小静止画成立後）。高さ更新の API はある。継続レンダリングと実機負荷の確認が必要。毎フレームの建物全件再評価は含めない。
- **水材質の波・空の反射: 中**。既存 enhancer を使える一方、standalone polygon の texture/envMap 接続とアセット検証が必要。
- **透明水面への正しい都市反射・部分水没の散乱: 大**。標準 SSR の順序と深度前提を越える描画処理、場合によっては独自 shader / render pass が必要。調査時点で動く解法として確定していない。

時間の確約は実機検証前には置かない。最初の到達点は「半透明面・発光建物・嵐の空が読み取れる1枚」であり、物理的な浸水・水中光学・完全反射は別の達成条件とする。
