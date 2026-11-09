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
