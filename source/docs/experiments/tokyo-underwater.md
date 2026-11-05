# TOKYO UNDERWATER — 最小実装

実装日: 2026-11-05。branch: `exp/underwater`。設計の正本は [技術実現性調査](tokyo-underwater-feasibility.md)。デプロイなし。

## 仮説・期待する変化

v14 と同一の東京駅 / 都庁カメラで、青緑の半透明面、浸水属性による建物発光、厚い雲、薄暗い夕景を重ねると、実在のランドマークを保ちながら沈みゆく都市の概念表現になる、という仮説。実画像による成立確認はしていない。ビジュアルは **目視未検証**。

## 実装

独立ページ `underwater.html` / `src/underwater.ts` を追加。v14 の PLACES の tileset URL とカメラ値を複製し、main.ts / index.html / official.* を変更していない。Vite の既存入力・アセットコピーを維持して underwater 入力だけを追加した。新規パッケージなし。依存関係は指定の既存 node_modules へのシンボリックリンクを利用。

- 水面は具体案 A の plane。4000 × 4000m、geodetic 配置、楕円体高、回転 -π/2、色 0x123d4a、transparent=true、opacity=0.55。SSR・water polygon・疑似反射は使用しない。水面を selectiveBloom 対象にしない。
- 初期候補を `INITIAL_WATER` に東京駅 42m / 都庁 72m と明記。**地形との交差を目視確認していない仮値**。TP 標高や海面高ではない。4km 接平面の曲率誤差と画角の被覆は未確認。
- `?place=tokyo|tocho&water=<m>` で指定。有限数のみ採用し、不正値・空文字は場所の既定値に戻す。0・負値も楕円体高として受け付ける。場所リンクは新ページとして初期化する。
- +/- は2m刻み。水位上昇は初期値（URL 指定時はその値）-12m → +13m、20秒、100ms間隔、smoothstep 補間。再押下はタイマーを破棄して最初から再生。手動変更と pagehide で停止。高さだけを plane.update し、描画更新を要求する。建物の全件再評価とは結び付けない。
- 建物は一つの callback で色・emissive・emissiveIntensity・opacity を全て返す。有限数の `_浸水深` 最大値を使用。v13 配色と >=2m の強度0.8、それ以外0.15を維持し、opacity は常に1。深い値の後に属性なしを評価しても低発光・不透明へ明示的に戻る。各建物レイヤーの featureUpdated に同一 callback を登録し、新規タイルも評価。model.effectIds を明示した selectiveBloom は v14 と同じ strength=0.85 / radius=0.6 / threshold=0.55 / smoothing=0.2。
- 物理空・aerialPerspective は DefaultPlugin の標準シーンを使用。18:20 JST、写真ティント0x27405e、青系環境光0.35、露出1.25。雲 coverage=0.85、lightShafts / haze 有効。ランドマーク可読性は目視未検証。
- rainDrop は初期オフ。opacity=0.25、dropDensity=0.5、refractionStrength=0.01。空間の雨粒ではなく画面上の水滴。トグルの aria-pressed を更新。
- PNG キャプチャと状態・現在水位・未確認点のステータスを追加。初期化例外とキャプチャ失敗も表示。

概念表現であり実際の浸水シミュレーションではない。複数の河川・高潮シナリオの浸水深最大値は建物全体の色の入力で、演出水位とは独立。部分水没判定、水中散乱、都市鏡像、波浪は実装しない。画面にもこの区別を表示した。

## 検証段階

| 段階 | 結果 |
|---|---|
| 振る舞い | `node scripts/test-underwater.cjs` 成功（9ケース）。AWAKENING のテストを読み、同方式の Node VM + TypeScript除去 + Navara/DOM/時計モックで検証。両地点、カメラ、平面、属性閾値・最大値・復帰、新規タイル、水位URL、手動変更、20秒補間・完了・再生・停止、水面更新が建物再評価をしないこと、水滴切替、PNG経路を確認。 |
| ビルド | `npx vite build` 成功。既存2ページと underwater を出力。Vite の設定ロード・チャンクサイズ警告あり。 |
| アセット配置 | dist に Draco / font worker wasm、cloud / noise / water のコピーを確認。実配信のHTTP取得とは区別。 |
| 実ブラウザ起動 | 未検証。モックでの __ready は実ブラウザ起動成功を意味しない。 |
| 3D Tiles取得 | 未検証。URL は v14 の既存値を使用。 |
| レンダリング完了 | 未検証。WebGL、shader、透過順、描画負荷の保証なし。 |
| 実画像・ユーザー目視 | **目視未検証**。合格判定・採点なし。 |
| デプロイ | 実施しない。 |

## 比較手順・次の判断

ローカルで `npx vite --host 127.0.0.1` を起動し、`/underwater.html?place=tokyo` と `/index.html?place=tokyo`、都庁は両方 `?place=tocho` を実 Chrome の同一画面サイズで比較する。v14 浸水モードとの比較も初期カメラを動かさず行う。キャプチャで雨なし / 水滴ありを比較。必要なら `?water=40` 等と2mボタンで交差を探索する。水位上昇の実装は brief 指定に従い含めたが、静止画確認前なので演出として採用確定していない。

確認対象: ランドマーク形状、地面と水面の交差、平面の端・表裏・透明ソート、発光の白飛びと遮蔽、空の暗さ、水滴の可読性、実機性能。成立しない場合は初期水位・平面範囲・露出を先に調整し、波・反射は別実験とする。

## 自己評価

技術実装とモック動作・ビルドまで到達。仮説の視覚的成立は未判定。第一印象35 / 都市らしさ20 / データ活用20 / 独自性15 / 安定性10の全軸について、実画像・実ブラウザの証拠が不足するため点数を付けない。暫定・目視未検証。独立レビューでは MEDIUM 1件により FAIL。指摘への修正内容と再検証結果は以下。


## 独立レビュー結果と修正内容

2026-11-05、独立レビュー判定は FAIL（MEDIUM 1件）。上昇中の pagehide でタイマーだけが停止し、bfcache 復帰後も「水位上昇中」の表示が残る問題が指摘された。

`pageshow` で状態が「水位上昇中」の場合だけ「水位上昇中断」へ遷移し、現在の楕円体高とともにステータスへ表示する。タイマーは再開せず、水位を保持する。▶水位上昇ボタンで初期値-12mから20秒の演出を再生できる。上昇中でない場合の pageshow は何も変更しない。

`scripts/test-underwater.cjs` に pagehide → pageshow の回帰検証を追加。タイマー停止、復帰後の中断表示と現在水位、タイマー非再開、水位保持、中断状態の保持、▶による先頭からの再生と完了、待機・完了時の復帰が表示を変更しないことを確認した。`node scripts/test-underwater.cjs` は全9ケース成功、`npx vite build` も成功（既存の設定ロード・チャンクサイズ警告あり）。実ブラウザの bfcache と描画は未検証。main.ts / index.html / official.* / awakening.* は変更せず、SSR・water:true polygon は追加していない。デプロイなし。修正後の独立再レビューは未実施。
