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
| ユーザー目視確認 | 目視評価 #1 で After の地面・空の黒潰れを指摘。修正後は未確認 |

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


## 目視評価 #1 と修正内容

2026-11-05、ユーザーから都庁・Gold Apocalypse の After で航空写真と空がほぼ真っ黒になり、都市が闇に浮いた「島」に見えるとの指摘を受けた（BRIEF-FIX2）。暗い地面ティント・低い環境光・21:00 の組合せによる乗算的な黒潰れが原因と分析された。v14 夜レシピの地面 `0x51628c` を輝度の基準として、Gold の琥珀色と Holographic の青緑色を明るくした。

| 案 | 地面ティント（修正前 → 後） | 環境光（前 → 後） | 露出（前 → 後） |
| --- | --- | --- | --- |
| Cyberpunk | `0x51628c` → 同値 | 0.6 → 同値 | 1.7 → 同値 |
| Gold Apocalypse | `0x55432b` → `0x927349` | 0.35 → 0.6 | 1.4 → 1.6 |
| Holographic City | `0x455a60` → `0x586f77` | 0.45 → 0.6 | 1.5 → 1.6 |

全案の After 時刻は21:00 JSTを維持。建物の base と発光 stops（色・高さ）は変更していない。Before は17:40 JST / 地面 `0xd8a878` / 環境光0.15 / 露出1.05のまま。`main.ts` / `index.html` / `official.*` / `underwater.*` は変更していない。

`node scripts/test-awakening.cjs` は東京駅・都庁とも全通過。実際に適用した raster tint、環境光、露出、時刻をモックで取得し、全3案で線形化sRGBの相対輝度（Rec. 709重み）が `0x51628c` 以上、環境光0.6以上、露出1.6以上であることを固定した。各案の全発光stopを元の高さで評価して元の色との一致を確認し、base色も固定。初期化・比較からの復帰・再生開始・pageshow復帰の Before grade と、wave開始の After grade も確認。既存の挙動テストは維持。

`npx vite build` は成功（3入力、Draco/font WASMとcloud/noise/waterコピー成功）。既存のVite configLoader・大きいチャンクの警告、Nodeの実験的API警告は継続。`git diff --check` も通過。デプロイは実施していない。

**修正後の実ブラウザ起動・3D Tiles取得・描画完了・地面の可読性・空の見え方は未確認。暫定・目視未検証。** パラメータ下限の検証であり、見栄えの合格判定ではない。同一構図で両地点の Before / 全3案を再評価する必要がある。なお黒潰れが残る案は **要ディレクター判断** とし、建物パレットを変更せず20:00への時刻変更等を検討する。

## 目視評価 #2 と対応（BRIEF-FIX3、2026-11-05）

ユーザー評価「まだベースマップ見えないみたい。あと、少し離れると真っ暗になる」を受け、実装前にSDKの型・照明・合成・雲シェーダーを調査し、[architecture](../architecture.md#brief-fix3-ラスター照明調査2026-11-05実装前) にコードの位置と判断根拠を記録した。写真は法線付き地形でLambert照明を受け、公開 raster 設定にbrightness / emissive / lit はない。

After全3案を21:00→20:00 JSTへ変更。写真ティント・環境光・露出の既存下限、建物パレット、Before（17:40 / 0xd8a878 / 0.15 / 1.05）は維持。キャプチャの隣へ「ベースマップ確認」をTypeScriptで追加し、HTMLは変更しない。ONは写真を白ティント・opacity 1へ、OFFは現在のBefore/選択案のgradeへ戻す。確認中の案切替にも追従し、状態行に「ベースマップ確認中」を表示。カメラ・時刻・露出・環境光・建物・覚醒時計をトグルでは変更しない。写真限定の照明バイパスが公開APIにないため、照明・大気の減光は残る。

テストは適用値で20:00と全案下限を固定し、Before / 全案 / wave中のトグルON/OFFで写真以外の状態保持と完全復帰、確認中の案切替を検証する。既存の建物パレット・伝播・復帰テストも維持。

検証: `node scripts/test-awakening.cjs`（東京駅・都庁の2ケース）と `node scripts/test-underwater.cjs`（全9ケース）が全通過。`npx vite build` 成功、index / official / awakening / underwater の4ページ、Draco/font WASM・cloud/noise/water の配置を確認。既存のVite設定ロード・チャンクサイズ警告、Node実験的API警告あり。`git diff --check` 成功。新規パッケージなし、禁止ファイル変更なし、デプロイなし。

確認段階: ビルド・モック振る舞いは確認済み。実ブラウザのページ起動、3D Tiles取得、レンダリング完了、実画像確認、修正後のユーザー目視確認はすべて未検証。**暫定・目視未検証。可読性が改善したとは判定しない。** GitHub Issues / PR / Pages の読み取りはネットワークのサンドボックス制限で取得できず、外部状態は未確認。

次の目視確認: ローカル `/awakening.html?place=tokyo` と `?place=tocho` を実Chromeで開き、カメラを固定してBefore / 全3案の確認OFF→ON→OFFを比較する。期待する変化は写真へのティント減光の解除と、20:00の空。写真の取得・可読性、離れた際の地面、建物形状と空の明暗差はユーザー再評価が必要。独立再レビューも未実施。

## 目視評価 #5 と第2弾対応（BRIEF-DUSK、2026-11-05 / exp/dusk）

ユーザー目視では東京駅・Holographic・After・ベースマップ確認ONで航空写真は正常。一方、建物は淡色の板状で面と高さの差が読みにくく、過去には遠景の暗化・粒子状ノイズも指摘された。実装前に距離透過・雲haze・STBN・bloomを調査し、コード根拠と結論を `docs/architecture.md` の「BRIEF-DUSK 距離暗化・粒子調査」に記録した。

Afterを20:00→指定の19:10 JSTに変更。ただしSDKの太陽方向計算では当日の東京駅で太陽高度−30.362°（都庁−30.300°）。「日没間際で方向光と影が残る」というブリーフの仮説は成立しない。日時は指定どおり維持し、方向光の回復は成果として扱わない。

| 調整 | 第2弾適用値 | 根拠・狙い |
| --- | --- | --- |
| 定常emissiveIntensity | `0.12 + min(height / 240, 1) * 0.18`（0.12〜0.30） | 旧0.55〜1.2の約22〜25%。自己発光で面が均される寄与を減らす。前線加算+4は維持 |
| 環境光 | 全案0.45（旧0.6） | 一様な照明を減らす。暫定下限0.45 |
| 露出 | Cyberpunk 1.4、Gold/Holographic 1.35 | 低い発光を高露出で相殺しない。暫定下限1.35 |
| 地面ティント | 全案維持 | v14相対輝度下限を維持 |
| hazeDensityScale | After 1.5e-5、Before 3e-5 | 解析的hazeの光学的厚さを半減。雲・haze・lightShafts・bloomは保持 |

建物base・発光色stopの全3案、Beforeの17:40 / 白モデル / 地面0xd8a878 / 環境光0.15 / 露出1.05、カメラ、ベースマップ確認トグルの意味と復帰を維持。大気transmittance / inscatter / irradianceは既定のtrue / true / falseを維持。粒子の生成経路は雲STBNで確認できるが、観測された粒子の主因は画像の効果別比較なしには未確定。密度半減はノイズ除去を保証しない。

検証: `node scripts/test-awakening.cjs`（2地点）、`node scripts/test-underwater.cjs`（9ケース）、`node scripts/test-camera.cjs`（3ケース）すべて成功。AWAKENINGは19:10、各案の正確な露出・環境光・地面ティント、負の高さ/0/120/240/500m/高さ欠損での定常発光、前線+4、完了時0.30、Before/Afterのhaze適用、全効果保持と既存のトグル・伝播・復帰を検証。時刻・定常発光の最小/傾き・前線・環境光・露出・After haze・Before hazeの8変異すべてがAssertionErrorで失敗することを一時コピーで確認した（作業ソースは変更しない）。

`npx vite build` 成功。全5ページとDraco/font WASM、cloud/noise/waterの実ファイルを確認。既存のVite設定ロード・チャンクサイズ警告、Node実験的API警告あり。`git diff --check` 成功。package.jsonのnpm testは未設定のダミーであり、実在する上記全3スイートを直接実行した。main / UNDERWATER / cameraは変更なし。新規パッケージ、デプロイ、pushなし。GitHub Issues / PR / Pagesの読み取りはネットワークのサンドボックス制限により失敗し、外部状態は未確認。

判定は**暫定・目視未検証**。今回確認したのはビルドとモック上の適用値・挙動。ページ起動 / 3D Tiles取得 / レンダリング完了 / 実画像確認 / 修正後ユーザー目視確認はいずれも未検証。「見えるようになった」「立体感が出た」とは判定しない。次はローカル `/awakening.html?place=tokyo` と `?place=tocho` を実Chromeで同一カメラのBefore/全3案・確認ON/OFFで比較する。期待する差は定常発光の抑制とhazeの低減。面の識別・高さ別色・遠景の可読性・粒子・波のピークはユーザー評価が必要。19:10で本物の夕日方向光が必要なら日時または照明設計の別判断が必要。独立レビュー未実施。


## BRIEF-DUSK ディレクター改訂：低い太陽（2026-11-05 / exp/dusk）

上記19:10実装は旧状態。SDKの太陽高度検算（19:10は約−30°、16:30は約+1.7°）を根拠に、ディレクターがAfterを同日 **16:30 JST**（UTC 07:30）へ改訂した。日付は維持。低い実太陽の暖色方向光と長い影を狙い、夜の持ち上げを解除する。

| 適用値 | Cyberpunk | Gold | Holographic |
| --- | --- | --- | --- |
| After環境光 | 0.15 | 0.15 | 0.15 |
| After露出 | 1.05 | 1.0 | 1.0 |

環境光0.45→0.15はBeforeの補助光と同量とし、写真の影側を支えつつ一様な照明が面の差を埋めないようにする。露出1.4→1.05 / 1.35→1.0はBefore（1.05）〜既存16:30の露出（1.0）の範囲。暗い青系地面のCyberpunkだけ0.05を残し、暖色のGoldと明るい発光色のHolographicは1.0とする。方向光が存在するため夜用の高露出を残さず、定常発光の低減を露出で相殺しない。写真可読性を意図した初期値であり、実画像での成立は未確認。

建物base・全発光色stop、定常発光0.12〜0.30、波の加算+4、After haze 1.5e-5、地面ティント、Before全体、ベースマップ確認トグルは変更なし。日付・時刻の切替は既存と同じくAfterへの遷移時に適用する。

検証：全3スイート（AWAKENING 2地点 / UNDERWATER 9ケース / CAMERA 3ケース）とViteビルドが成功。AWAKENINGは16:30と各案の実際の適用環境光・露出を厳密一致で検証し、Before復帰・全案切替・波・haze・パレット・トグルの既存検証も維持。時刻、各案の環境光・露出、定常発光最小値・傾き、波ピーク、After/Before hazeの計12変異を一時コピーで実行し、すべてAssertionErrorで検出（12/12）。作業ソースの書換えなし。`git diff --check`成功。全5ページとDraco/font WASM、cloud/noise/waterのコピーをビルド出力で確認。既存のVite設定・チャンクサイズ・Node実験APIの警告あり。

判定：**暫定・目視未検証**。ビルドとモック値・挙動の検証を、ページ起動 / 3D Tiles取得成功 / レンダリング完了 / 実画像確認 / ユーザー目視確認とは区別する（後者はいずれも今回未実施）。独立レビュー未実施。デプロイ・pushなし。次の実Chrome比較はローカル `/awakening.html?place=tokyo` と `?place=tocho`、同一カメラでBefore / 3案、確認ON/OFF。期待する変化は低い太陽による面の陰影と抑えた発光。写真可読性・影の実描画・遠景・粒子・作品としての魅力は未判定。

## 目視評価 #6/#7 と構造修正（BRIEF-GROUND 改訂版、2026-11-07）

ユーザー目視ではGoldの覚醒中・完了時とも地面がほぼ真っ黒で、ベースマップ確認ON（白ティント・opacity 1）でも同じ。引くとさらに暗くなるとの評価。ティントの微調整を打ち切り、実装前にパッケージ実コードからQ1〜Q3を調査して `docs/architecture.md` に記録した。

**方式Aを採用**。公開terrain設定のlitが初期生成・更新双方で照明バイパスへ届くため、保持したterrainLayerのupdateでAfterのみlit=falseにする。Beforeはlit=trueで元の照明ありへ復帰。置換更新でsource・castShadow・receiveShadowを失わないよう全設定を渡す。view.litや建物の照明方式は変えない。

| After適用値 | Cyberpunk | Gold | Holographic |
| --- | --- | --- | --- |
| 地形lit | false | false | false |
| 写真ティント | 0xa5b6da | 0xe4c99f | 0xb1ced2 |
| 建物用環境光 | 0.3 | 0.3 | 0.3 |
| 露出 | 1.1 | 1.1 | 1.1 |

ティントはいずれも旧Goldより明るい色を選定した暫定値。Beforeは17:40 JST / 地面0xd8a878 / 環境光0.15・色0x93a7cc / 露出1.05 / haze 3e-5 / 白モデル / 影ありを維持。Afterの16:30、建物パレット、定常発光0.12〜0.30・前線+4、haze 1.5e-5、雲とbloomを維持。ベースマップ確認ONは白ティント・opacity 1のまま、トグル自体は照明・地形lit・時計を変更しない。

方式Bのtransmittanceとinscatterは返却されたscene.aerialPerspectiveのハンドルで個別に切替可能。方式CのhazeDensityScale=0も許容される。いずれも不可ではなく、優先するAが可能なので未採用。unlit後にも大気transmittance・雲hazeは作用するため、遠景の暗化が残る可能性がある。STBN jitterそのものを無効化する公開雲設定は確認できず、粒子の原因を実画像で切り分けていないため、雲を消す等の変更はしていない。

検証：全3スイート（AWAKENING 2地点 / UNDERWATER 9ケース / CAMERA 3ケース）成功。AWAKENINGでは全案とwave開始・完了・再生リセット・pageshow復帰を通して地形lit、source/影設定、環境光、露出、ティント、時刻、hazeを固定。Before初期時刻・補助光色・白モデル・既存効果も固定し、確認ON/OFFが地形を含む写真以外を変えないことを維持した。一時的なメモリ上のソース変異で25/25をAssertionErrorで検出（地形After/Before/更新削除/影、Before/After時刻、Beforeティント/環境光/露出/haze、After haze、定常発光最小/傾き/前線、写真確認白/opacity、3案各ティント/環境光/露出）。作業ソースを書き換える検証ではない。

`npx vite build` 成功。全5ページとDraco/font WASM・cloud/noise/water実ファイルの配置を確認。Vite設定ロード・大きいチャンク・Node実験APIの既存警告あり。package.jsonのnpm testは既存の未設定ダミーなので、実在する全3テストスイートを直接実行した。v14・UNDERWATER・CAMERA・Viteコピー処理・依存は変更なし。デプロイ・pushなし。

確認段階：ビルド成功、モック上の適用値・挙動確認済み。ページ起動 / 3D Tiles取得成功 / レンダリング完了 / 実画像確認 / 修正後のユーザー目視確認はすべて未検証。**暫定・目視未検証。『見えるようになった』とは断言しない。** 独立レビューは別セッションで未実施。GitHubのopen Issuesは取得できたが、PR/Pages状態はCLIのネットワーク制限で取得失敗。

次の比較はユーザーの実Chromeでローカル `/awakening.html?place=tokyo` と `?place=tocho` を開き、同一カメラのBefore / 全3案、確認OFF→ON→OFFと、引いた画角を確認する。期待する変化は地形の低い太陽・環境光への依存解除。写真可読性・遠景暗化・建物形状の陰影・粒子・作品の魅力はユーザー側の目視評価が必要。公開URLの更新は本タスクのデプロイ禁止により行わない。

コミットは `git add ... && git commit` を試みたが、共有git管理領域 `/home/hatch/workspace/navara-tocho-proto/.git/worktrees/navara-wt-ground/index.lock` が読み取り専用のためgit add段階で失敗。コミット未作成、変更は作業ツリーに保持。
