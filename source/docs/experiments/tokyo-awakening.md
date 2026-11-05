# TOKYO // AWAKENING

実装日: 2026-11-05 / branch: exp/awakening
判定: 改良・ビジュアルレビュー待ち。**暫定・目視未検証**。

## 仮説・成功条件

実在する都市の白モデルをランドマークから距離順に発光させると、都市が覚醒するという変化を読み取れる。PLATEAU の高さを配色・定常発光強度に、重心を伝播時刻に利用する。同じ構図の Before / After と3案を比較し、ランドマークの認識、立体感、光のメリハリを維持できることを成功条件とする。照明・伝播は概念表現であり、実際の照明・災害データではない。

## 実装

- 独立ページ `awakening.html` / `src/awakening.ts`。東京駅 / 都庁のURL・初期カメラは v14 `main.ts` と一致。場所切替はページ再読込で Before に戻る。
- v14 のフォトリアルシーン、影、Re:Earth 地形、GSI 航空写真、体積雲（coverage 0.45 / lightShafts / haze）、selectiveBloom（0.85 / 0.6 / 0.55 / 0.2）を複製。出典表示を追加。
- 初期状態は夕景（17:40 JST、地面 0xd8a878、環境光 0.15、露出 1.05）＋白モデル。
- Cyberpunk: 青紫の暗いベース、高さでシアン→紫→マゼンタ→金。Gold Apocalypse: 炭色ベース、琥珀→金。Holographic City: ほぼ黒のベース、白→低彩度ターコイズ。全案21時の空と個別の地面ティント・環境光・露出。
- 比較ボタンは完成状態を表示し、カメラを変更しない。Before を挟んでも選択案を保持。初回の覚醒先は Cyberpunk。
- 覚醒は0.5秒の Before ホールド後、ランドマーク座標を発生源に900 m/sで伝播。前線幅240 m、前線発光は最大4を加算し、通過後は高さに応じた0.55〜1.2へ落ち着く。15 kmを覆い前線が通過した約17.7秒で完了。範囲は対象区を覆う保守的な演出上限であり、タイル全件のロード完了判定ではない。
- 経度差×111320×cos(緯度)、緯度差×110540で距離計算。`featureUpdated` の evaluator を保持し、12 fps の共有時計で再評価。後から届くタイルも現在の進行を適用。無効化済み evaluator の例外は記録して除外。重心欠損は伝播中は白、完了時に定常発光。高さ欠損は0 m扱い。
- 再押下でタイマーを破棄しリセット→再生。比較操作・ページ離脱でも停止。状態行に Before / 案名 / 覚醒中 / 完了を表示。
- PNGキャプチャは v14 同様に canvas.toDataURL を使用。失敗は状態行に表示。実際の画像内容は未確認。
- `vite.config.ts` は入力追加のみ。`main.ts` / `index.html` / `official.*` とコピー処理は変更なし。新規パッケージ・デプロイなし。

## 検証結果

| 段階 | 結果 |
| --- | --- |
| ビルド成功 | `npx vite build` 成功。index / official / awakening の3入力を出力 |
| ランタイムアセット | `dist/assets/cloud/` のshape・weather等、Draco/font WASM、noise/waterを確認 |
| ロジック検証 | `node scripts/test-awakening.cjs` 成功（Node 24）。両地点、Before、3案、カメラ保持、距離による発光順、前線の強発光と減衰、遅延タイル、完了、再生リセット、比較時キャンセル、PNG呼出しを検証 |
| ページ起動 | 実ブラウザ未検証。テストは Navara / DOM / 時計をモックしたもの |
| 3D Tiles 取得成功 | 今回は未検証 |
| レンダリング完了 | 未検証 |
| 実際のビジュアル確認 | **目視未検証** |
| ユーザー目視確認 | 未実施 |

既存の大きなチャンク警告と Vite configLoader の将来互換性警告が出るが、ビルドは成功。テストで使う Node の stripTypeScriptTypes は実験的APIの警告あり。ビルド成功やモックテスト成功を描画成功と同一視しない。

必読ファイルはこのworktreeに存在しなかったため、同じソースリポジトリの `/home/hatch/workspace/navara-tocho-proto/AGENTS.md`、`docs/creative-direction.md`、`docs/roadmap.md`、`docs/architecture.md` を参照した。

## 自己評価・次アクション

採点は保留（暫定・目視未検証）。高さと重心によるPLATEAU属性利用、比較・再生のロジックは実装済み。第一印象35点、都市らしさ20点、属性活用20点、独自性15点、安定性10点という評価軸に対し、描画・見た目・実行時性能の根拠が不足しているため総合点は付けない。

レビューではローカルの `/awakening.html?place=tokyo` と `/awakening.html?place=tocho` を実Chromeで開き、同一構図で Before→3案を比較し、各案で覚醒を再生する。期待する変化はランドマークから外側へ移る強い光の前線と、通過後の高さ別の定常発光。PNG内容、雲・bloom、地面との明暗差、ランドマークの認識、カメラ操作中の遅延タイル、12 fps再評価の負荷、欠損属性・ネットワークエラー時の挙動が未確認。実データを見て強度・前線幅・速度・配色を調整し、採用案を決める。公開・デプロイはディレクターのレビュー後に別途行う。

## 独立レビュー結果と修正内容

2026-11-05 の独立レビューは FAIL（MEDIUM 2件、LOW 1件）。BRIEF-FIX1 に従い以下を修正した。

- MEDIUM: evaluator の保持を `featureSetId`（SDK の bigint ID）をキーとする Map に変更。`featureUpdated` で登録・置換し、`featureRemoved` で削除する。共有時計の refresh は保持中の evaluator を再評価し、例外時の削除も ID 単位で行う。
- MEDIUM: `pageshow` は `persisted` の値に関係なく、wave 中のみタイマーを停止し Before に戻す。grade / refresh / report により夕景・白モデル・状態表示も復元する。Before / After / 完了状態は維持する。
- LOW: レイヤーのイベント別リスナーと window のイベントリスナーをモックで保持。削除済み evaluator が再評価されないこと、`pageshow` の両 persisted 値で wave が Before に戻りタイマーが停止すること、白モデル・露出の復元、他の状態の維持を両地点で検証した。

再検証: `node scripts/test-awakening.cjs` は東京駅・都庁とも全通過。`npx vite build` は成功し、3入力とランタイムアセットのコピーを確認。既存の Vite configLoader・チャンクサイズ警告と Node の実験的 API 警告は継続。`git diff --check` も通過。`main.ts` / `index.html` / `official.*` は変更していない。デプロイは実施していない。実ブラウザ・bfcache 実機動作・描画・目視評価は今回も未検証であり、独立再レビューの合格判定は未取得。
