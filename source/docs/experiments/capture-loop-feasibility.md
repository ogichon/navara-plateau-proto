# WebGL 自動キャプチャ実現性検証

2026-11-09 / exp/capture-loop / BRIEF-CAPTURE 全文に基づく実測。

## 判定

**この VM の現在の許可条件では成立せず（実行環境でブロック）。**
Navara/SwiftShader 自体の描画可否は未検証。PNGが取得できていないため、建物・航空写真・空の存在、構図・明暗・色調を Muse が評価できる水準かは判定できない。黒画像やタイル未着を観察したという意味ではない。作品評価・採点は行わない。

## 環境棚卸し・導入試行

- Ubuntu 24.04.5 LTS、Linux x86_64、Node v24.22.1、npm 10.9.4。
- playwright-core 1.62.1 / puppeteer-core 25.16.0 が既存依存。playwright / puppeteer 本体は無し。node_modules は元repoへの既存symlinkで変更していない。
- chromium / chromium-browser / google-chrome はPATH上に無し。標準Playwrightキャッシュは4 KiBでブラウザ実体無し。
- /opt/meta-chromium/chrome を発見。--version は `Muse Browser 157.0.8103.41`、実行ファイル307,768,552 bytes。
- Python 3 / Pillow 10.2.0 を確認。pngjs は無し。
- 作業領域の空き容量135 GiB、/tmp空き約503 MiB。容量不足による失敗ではない。
- `PLAYWRIGHT_BROWSERS_PATH=$PWD/tools/capture/.browsers node node_modules/playwright-core/cli.js install chromium` を試行。Chromium v1234 / Chrome for Testing 151.0.7922.34 の取得は全5試行がEPERMで失敗。設定済みproxyの接続先 port 3128へのsocket接続が拒否された。
- 計時付き再試行は **3.640秒、終了コード1**。実体の導入容量0 bytes（生成された管理ディレクトリ全体4 KiB）。ダウンロードサイズ・正常導入時間は測れない。samples/install.log と install-time.txt を保存。最初の試行は計時していない。

## 実装・実行結果

追加した tools/capture/capture.cjs は既存playwright-coreを使用する最小試作。ANGLE/SwiftShaderフラグ、dist限定のloopback静的サーバ、awakening.html?place=tokyo、1280×720、__ready後30秒待機、10秒間隔で3枚のPNG、HTTP応答・失敗・段階別時間のJSON記録を備える。自動の描画成功判定は行わない。既存HTML/TS、Vite設定、依存ファイルは変更していない。

| 段階 | 実測結果 |
| --- | --- |
| ビルド | `npx vite build` 成功、Vite報告2.73秒。全5ページを出力 |
| ランタイム資産 | Draco/font WASM、cloud/noise/waterコピー成功 |
| Chromium起動 | **失敗**。`Hatch WebGL domain policy is required for browser startup`、process exitCode=13 |
| スクリプト全体 | **0.253秒**でblocked。samples/run.jsonに起動ログ保存 |
| ローカル配信 | 独立したNode http.createServer.listen(0, '127.0.0.1')も **listen EPERM**。配信不可。capture本体はブラウザ起動前失敗のため配信段階に未到達 |
| ページ起動 | 未到達 |
| 3D Tiles取得 | 未到達、HTTP応答0件 |
| レンダリング完了 | 未確認 |
| 実画像確認 | PNG **0枚**、未確認 |
| ユーザー目視確認 | 未実施 |
| ページ読込→成立時間 | ページ読込自体が未実行のため測定不能（0秒ではない） |

この起動エラーは必須の環境ポリシーである。偽のポリシー注入、proxy迂回、セキュリティ機構の無効化、別経路によるブラウザ取得等は行っていない。制限回避に当たる追試はせず停止した。

samples/run.json のstartedAtはVMのDate出力で2026-11-08T15:29:17.218Z、ブラウザstderrは1109/002917と時計表記に差がある。所要時間はmonotonic performance.nowで計測し、壁時計差から計算していない。

## 画像統計・限界

PNGが無いためファイル容量、色数、分散、領域別輝度、フレーム差分は全て **N/A**。UIだけの画像や代替画像を証拠として作成していない。tools/capture/stats.py は将来のPNGに対し容量・RGB色数・輝度平均/分散・黒白比率・上下中央の帯・隣接フレーム平均絶対差を出力する。上帯は空、下帯は写真と自動認定しない。統計は一様画像の検出補助であり、建物や写真の存在証明には実画像の目視とネットワーク証拠が必要。

- SwiftShaderと本番GPUの色・影・性能差：この実測ではWebGLコンテキスト未生成なので比較不能。ピクセル品質の同等性を主張しない。
- ネットワーク依存：PLATEAU、GSI航空写真、Re:Earth地形を必要とする。今回proxy接続拒否を確認したが、ブラウザでの各タイル応答は未測定。ネットワークを許可しただけで描画成功とはならない。
- 待機：__readyはアプリ初期化だけでタイル完了ではない。固定30秒＋3枚は初期案。雲の連続変化により差分がゼロにならない場合もある。実行可能になった後に待機時間を調整する。
- 動画：フレーム取得に未到達なので拡張可否、fps、エンコード容量は未検証。連番静止画による実fps・時間刻み・タイル安定性の測定を先行し、リアルタイム動画を約束しない。

## 検証・残る課題・次の行動

実在する全4テストスイートを直接実行し成功：awakening、camera、cloud-mutations（24/24）、underwater。npm test は既存の未設定ダミーのため使用していない。追加JSとPythonの構文チェック、git diff --check成功。既存のVite設定ロード・大チャンク・Node実験API警告は残る。独立Codexレビューは未実施。

推奨運用：管理者が許可したブラウザポリシー、loopback待受け、タイル外部アクセスのある実行環境でREADMEの手順を再実行する。代表PNGを1〜2枚残し、統計＋目視で建物・航空写真・空を確認して初めて制作ループ成立と判定する。その後に同一構図のBefore/After比較と動画検証へ進む。現環境では自律画像評価の人間待ち解消を達成していない。

GitHub Issue/PR/Pages状態取得も試行したがremote無し、APIはproxy接続のoperation not permittedで取得不可。外部書込み・デプロイ・pushはしていない。

コミット準備としてgit addを試みたが、共有Git管理領域 `/home/hatch/workspace/navara-tocho-proto/.git/worktrees/navara-wt-capture/index.lock` の作成が `Read-only file system` で失敗。コミット未作成。制限を回避せず、追加ファイルをこのworktreeに保持する。人間側で必要なのは実行環境の許可設定とコミット可能なGit管理領域の準備であり、作品採用判断に出せる画像はまだ無い。

## 追記（2026-11-09、ディレクター側の追加実測）

Codex サンドボックス外での追加検証結果:

- **メイン環境の素の Chrome 起動も同じポリシーで不可**: `/opt/meta-chromium/chrome --headless` は `Hatch WebGL domain policy is required for browser startup` で停止（メインエージェントの exec でも同一）。loopback 配信自体はメイン環境では可能だった。ポリシー迂回（別ブラウザ導入・ポリシー注入等）は行わない。
- **正規ブラウザ経路（クラウドブラウザ）の実測**: 公開中の awakening.html を開き、ページ内📸キャプチャで PNG を取得できたが、**ほぼ真っ黒**（ディレクターが実画像を確認。建物の輪郭が極暗く残るのみ）。続いてブラウザ自身のビューポート撮影では明るく建物ブロックが見えたとの撮影側報告（画像ファイル自体は未着のため未目視）。すなわち「真っ黒」はキャンバス書き出し側の問題である可能性が高い。
- **ただし描画の忠実度に問題が残る**: クラウドブラウザでは 3.5 分待っても Before は濃紺の無地のまま、After でも航空写真の地面が出ず平坦な薄灰色だった。ユーザーの実 Chrome では同じページで写真が全面に読める。**この環境の画像は実視聴環境の姿を再現していない**ため、色・質感・グレードの作品判定には使えない。

**最終判定**: 自動キャプチャの「取得」は正規経路で可能だが、「Muse が作品を視覚評価できる忠実度」では現時点の許可環境では未成立。当面の運用: 構図・読込状態の粗い確認はクラウドブラウザ撮影、色・質感・最終判定は実環境の目視が正。コンセプトの最小検証は描画忠実度に依存しない部分（データ変換の成立・形状の読み）から先行させる。
