# FLOATING CITY 最小試作 — 2026-11-09

## 目的と変更

東京駅周辺の千代田区・中央区 LOD2 テクスチャなし建物を、実高さに比例して浮かせる試作。`float.html` / `src/float.ts` を新設し、Vite の入力に追加した。既存ページ・テストのソースは変更していない。デプロイなし。

- 浮き量は `clamp(bldg:measuredHeight × 0.5, 0, 120)` m。24秒周期の共有 uniform `1 + 0.15*sin(time)` を乗算する。
- `readFeatureProperties` の **batchId** を Map のキーにする。第2引数 batchIndex や GLTF の `_batchid` はキーに使わない。ModelMesh が既にグローバルIDに変換した `batchId` 属性を走査し、頂点ごとの `floatLift` 属性を作る。
- SDK 0.2.1 の非公開 `evaluator.obj` → `ModelMesh.traverseMesh` を使用。通常材質・既存 `customDepthMaterial` の各 onBeforeCompile を先に実行し、その結果へ begin_vertex で同じ変位を追加。キャッシュキーも合成する。共有材質は WeakSet で重複注入を防ぐ。
- 東京駅の測地上向きベクトルを使用し、`inverse(mat3(modelMatrix))` でモデル空間へ変換。モデルの回転・拡縮を考慮し世界座標でのメートル量を維持する。広域に対する建物ごとの法線差は扱わない。
- Re:Earth quantized-mesh 地形、暗い globe 素地、写真・ラスタなし。地形を lit / receiveShadow にし、15:45 JST の低い太陽で長い影を狙う。東京駅を距離2600 m・pitch −42°で見る。
- pagehide / 非表示で RAF 停止、pageshow / 再表示で再開。致命的な対応不一致・shader注入失敗では診断を記録して呼吸を停止し、代替オフセットへは切り替えない。
- `window.__float` に初期化、描画イベント、通常／影shaderコンパイルフック回数、変位設定済み建物数、欠測数、エラー等を公開。建物数は生存feature setのIDを重複除去した「正の変位を設定した数」であり、画面上の描画成功数ではない。
- 取得応答数はwindowのResource Timingで観測できた応答のみ。Worker内取得は観測できず、クロスオリジンでHTTP statusが0の場合もあり、成功判定には使わない。feature更新回数もタイル数ではない。feature到着はデコード済みモデル到着の根拠になるが全タイル完了ではない。

## 検証結果（状態を区別）

- ビルド成功: `npx vite build`。全7ページを出力。Draco decoder / font worker WASM、cloud / noise / water のコピーを確認。
- 既存テスト: `scripts/test-*.cjs`（FLOAT追加前の全6本）成功。既存の npm test は未設定のため個別実行。
- FLOAT動作テスト: `node scripts/test-float.cjs` 成功。実Threeのgeometry/materialを使い、非連番ID 901/42/8 と batchIndex 0/1/2 の対応、clamp、欠測、enhancerと影の合成、共有材質、uniform共有、呼吸範囲、pagehide/pageshow、feature除去、未知ID時の停止を検証。GPU描画・実通信の検証ではない。
- 独立Codexレビュー実施。共有材質の重複注入を修正し回帰チェックを追加。取得診断の観測範囲と更新イベントの表示名も修正。
- ページ起動: **未確認**。dev server は node_modules/.vite の EROFS、preview server は `listen EPERM 127.0.0.1:4173` で起動不可。この実行環境の制約。
- 3D Tiles取得成功 / GPUレンダリング完了 / 実ビジュアル確認 / ユーザー目視確認: **すべて未確認**。見た目の自己判定・採点なし。
- GitHub Issue/PR/Pages取得: remote未設定、API通信はネットワーク制約で失敗。公開URLなし。

## 制約・次の確認

高さ欠測・非数値は0 mとして欠測数に明示。推定高さや一律浮上には置き換えない。初回パッチ後の同一geometryの高さ変更には追従しない（静的な対象タイルを想定）。SDKはGPUアップロード後にCPU属性配列を解放するため、初回feature更新がアップロード後に届いた場合は明示エラーで停止する。非公開APIとshader markerに依存するためSDK更新時は再調査が必要。

メッシュfrustum cullingは変位前boundsによる消失を避けるため無効化したが、SDKのタイル選択boundsは変位前のまま。画面端・LOD切替での欠落、影の範囲・ちらつき・描画コスト、地面の暗さと隙間の読みやすさは実Chromeで確認する。shaderフック回数もGPUリンク成功を保証しない。コンソールのWebGLエラーも確認する。

許可された通常環境で `npx vite build` → `npx vite preview` → `/float.html` を開き、両区のfeature更新・正の変位設定数・通常/影shader・エラーを確認する。その後、建物ごとの高さ比例浮上、24秒の呼吸、地面に落ちる影が同じ変位に追従することを確認する。技術的詰まりはこの環境では確定していない。別案実装なし。

## コミット

`git add` と `git commit` を試行したが、共通git管理領域 `/home/hatch/workspace/navara-tocho-proto/.git/worktrees/navara-wt-float/index.lock` が読み取り専用のため両方失敗。変更は作業ツリーに保存済み、未ステージ・未コミット。デプロイなし。

## 実機破断への修正 — 2026-11-09

### 確認した対応と再現根拠

オーナー実Chromeでは巨大な三角形・棘状の破断、設定6255件・エラー0を確認との報告。以下は **SDK実ソースと合成geometryでの検証**。実PLATEAUタイルのCPU属性はこの環境では取得できておらず、オーナー実機での根本原因確定とは区別する。

インストール済み `@navaramap/three` 0.2.1 の `src/evaluations/FeatureEvaluator.ts:294–331` を確認。`readFeatureProperties` の第2引数は feature set 内の `batchIndex`、公開 `batchId` は handler が返すID。`src/mesh/model.ts:124–130,255–292` は `geometry.batch_ids` のテーブルを読み、元の `_batchid` をテーブルの添字として公開 `batchId` 属性を作る。したがって対応は **(layer, featureSetId, batchIndex) → 公開batchId**、頂点の `_batchid.getX(i)` はその局所 batchIndex。公開IDを局所IDと見なす修正は行っていない。

SDKの変換部には `for (const internalBatchId of attrs._batchid.array)` があり、InterleavedBufferAttribute の stride / offset を考慮しない。実コードをファイルから抽出・実行し、実Threeのinterleaved属性と突合せた結果:

| 項目 | 値 |
| --- | --- |
| 属性の実体 | Float32Array `[1,0, 1,0, 1,0, 0,1, 0,1, 0,1]`、stride=2 / offset=1 |
| 頂点の局所ID (`getX`) | `[0,0,0,1,1,1]` |
| 公開IDテーブル | `[42,901]` |
| 正しい頂点の公開ID | `[42,42,42,901,901,901]` |
| SDKが生成した `batchId` | `[901,42,901,42,901,42]` |
| 高さ | 局所0=20m、局所1=80m |
| 旧実装の `floatLift` | `[40,10,40,10,40,10]`（各建物内で不一致） |
| 修正後の `floatLift` | `[10,10,10,40,40,40]` |

全てが存在するIDなので旧実装の未知IDエラーは発生しない。今回の「件数正常・エラー0でも破断する」症状を再現できた。ただし当該タイルが実際にinterleavedかは未確認。初期記録の「公開batchId属性を走査すれば安全」という前提は撤回する。

### 変更

- FLOATだけで `_batchid.getX(i)` と同じ evaluator の第2引数 batchIndex を対応させ、局所Mapから浮き量を作る。SDK依存や他ページの実装は変更しない。欠落・非整数ID・属性長不一致は明示エラーにする。
- 集計キーを `layer index:featureSetId` にし、建物はその中の局所IDで識別。別タイルや別レイヤーの局所ID再利用による件数衝突も防ぐ。
- ページ診断に「自己検証 建物 / floatLift不一致 / 公開ID不一致頂点」を追加。サンプリングより広く、初回パッチ時に各対象建物の **全頂点** のfloatLift min/maxを走査し、同じfeature set内の複数meshも合算。max > min の建物数が不一致件数（正常0）。検証建物0は未検証であり成功を意味しない。
- CPU配列がGPUアップロード後に解放されるため、初回検証のrangeを保持し、生存feature set分だけ診断集計する。後からのGPU属性変化を監視する機能ではない。公開ID不一致は旧SDK変換との比較指標であり、修正後のfloatLift不一致とは別物。
- `window.__float.idSamples` に feature set複合キー、局所ID、callback公開ID、geometry公開ID、元属性stride/offsetを保存。正常例・不一致例それぞれ最大16件、同一建物・一致状態の重複を除外し、実機で両ID空間を突合せ可能にした。

### 検証と限界

- `node scripts/test-float.cjs`: 成功。実SDK変換コード＋実Three interleaved属性、同一レイヤーの2 feature setで局所0/1が衝突するケース、別レイヤーでfeatureSetIdまで衝突するケース、各建物の浮き量と正確な件数、除去、通常/影shader等を確認。独立validatorに意図的な不一致属性を渡して検出も確認。
- 旧ソースを `git show HEAD:src/float.ts > /tmp/float-before.ts` で保存し、`FLOAT_SOURCE=/tmp/float-before.ts node scripts/test-float.cjs` を実行: 上記 interleaved fixture のfloatLift比較で期待どおり失敗（exit 1）。修正後はexit 0。
- `scripts/test-*.cjs` 全7本成功。`npx vite build` 成功（全7ページ、Draco/font worker WASM・cloud/noise/waterコピーを確認）。`git diff --check` 成功。
- 別Codexセッションで独立レビュー実施。重大な実装問題なし。実タイル未確認という限界とIDログが1棟で埋まる問題の指摘を受け、ログを建物ごとの重複排除＋不一致枠確保に改善した。
- ページ起動: previewが `listen EPERM 127.0.0.1:4173` で失敗。実タイル取得: tilesetへのcurlがegress proxyへの接続失敗（exit 7）。GPUレンダリング完了・修正後の実ビジュアル確認・ユーザー目視確認は未実施。見た目の自己判定・採点なし。
- Git remote未設定のためIssue/PR/Pages状態取得不可。デプロイ・pushなし。

次の確認は、許可された実Chromeで `float.html` を開き、検証建物>0 / floatLift不一致0を確認し、`window.__float.idSamples` のstride/offsetと2種の公開IDを保存すること。公開ID不一致が出れば旧SDK変換の破損を実データ上でも裏付けられる。不一致0でもGPU・影・実機の破断解消までは保証しない。

コミット結果: 今回も `git add` と `git commit` を実際に試みたが、共通git管理領域の `index.lock` を作成できず両方失敗（Read-only file system）。変更は作業ツリーに保存済み、未ステージ・未コミット。権限制約を回避する操作は行っていない。

## 浮きの視認性強化 — 2026-11-10

オーナー実機スクショでは箱形状の破断は解消した一方、浮上がほぼ読み取れず通常の灰色都市に見えたとの報告を受けた改修。低中層の浮き量、暗い地面、初期カメラの角度を原因候補として扱い、以下を変更した。

- 基準浮き量を `clamp(bldg:measuredHeight × 1.2, 0, 240)` m に変更。24秒周期・倍率 `1 + 0.15*sin(time)` の呼吸は維持（上限240mは呼吸適用前、最大呼吸時276m）。欠測・非数値・負の高さの扱いは維持。
- 地形が参照する `view.globe.color` を `#23262a` に設定。環境光の強度を0.45から0.55へ微増し、建物底面の補助照明を意図した。環境光色、太陽の15:45 JST・強度2.5、露出1.1、地形のlit / receiveShadow設定は維持。影と地面のコントラストが実スクショで読めるかは未検証。
- 東京駅の注視点（139.7671, 35.6812）とheading 25°を維持し、初期カメラを距離3400m・pitch −52°に変更。
- 既存の建物単位floatLift自己検証、公開ID比較、診断ログ、通常／影shaderへの変位合成、異常時停止を維持。既存FLOATテストの浮き量期待値のみ新式へ更新。

検証: `node scripts/test-float.cjs` 成功（局所ID対応、interleaved再現、建物単位不一致検出、上限clamp、欠測、影shader合成、呼吸範囲、ライフサイクル等）。`npx vite build` 成功（全7ページ、Draco/font worker WASM・cloud/noise/waterコピー確認）。`git diff --check` 成功。これらはGPU描画の証明ではない。

ページ起動 / 今回の3D Tiles取得 / GPUレンダリング完了 / 実ビジュアル確認 / 今回のユーザー目視確認は未実施。見た目の自己判定・採点なし。次の実機確認では、検証建物>0・floatLift不一致0を確認した上で、浮いた底面と地面の隙間、影の視認性、暗さの維持、画面端やLOD切替での欠落を確認する。Git remote未設定につきIssue/PR/Pages状態取得不可。デプロイ・pushなし。

コミット結果: `git add` と `git commit` を試行したが、共通git管理領域の `index.lock` を作成できず両方失敗（Read-only file system）。変更は未ステージ・未コミットで作業ツリーに保存済み。
