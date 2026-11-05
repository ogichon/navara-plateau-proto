# BRIEF — TOKYO // AWAKENING 実装（Codex A）

あなたは Navara × PLATEAU クリエイティブR&D の開発担当です。この worktree（branch: exp/awakening）で以下を実装し、コミットしてください。デプロイ（Pages 反映）はしません（ディレクターがレビュー後に行います）。

## 必読
- `AGENTS.md`（運用方針・承認境界・検証の区別・既知の落とし穴）
- `docs/creative-direction.md`、`docs/roadmap.md`、`docs/architecture.md`
- `src/main.ts`（v14 の実績あるシーン構築コード。**このファイルと index.html は変更禁止**）

## 成果物
1. **新規ページ `awakening.html` + `src/awakening.ts`**（v14 とは独立。シーン構築は main.ts のレシピを複製してよい）
2. `vite.config.ts` の build 入力に awakening を追加（既存入力は壊さない）
3. `docs/experiments/tokyo-awakening.md`（仮説・実装・結果・自己評価。ビジュアルは「目視未検証」と明記）
4. `npx vite build` が通ること。完了後に git commit（メッセージ: "AWAKENING: ..."）

## シーン仕様
- 場所切替: 東京駅 / 都庁（タイルURL・カメラ初期値は main.ts の PLACES と同じ）
- フォトリアルシーン＋体積雲＋selectiveBloom（main.ts と同じ設定）
- 初期状態 = **Before**: 夕景グレーディング＋白モデル（現実の東京）
- アートディレクション3案（ボタン切替、同一構図で比較可能に）:
  - **Cyberpunk**: 夜寄りグレーディング。建物ベースは暗い青紫、発光は高さ帯でシアン→マゼンタ、最上位帯は金
  - **Gold Apocalypse**: 暗い空＋建物ベースは炭色、発光は琥珀〜金（高さで明度）
  - **Holographic City**: 建物ベースはほぼ黒、発光は白〜ターコイズ単色系、低彩度
- **▶ 覚醒ボタン**: ランドマーク（都庁 or 東京駅の座標）を発生源として、光の波が距離に応じて建物へ伝播する。波面付近は強く発光し、通過後は各アート案の定常発光に落ち着く。波が都市全体を覆ったら完了。もう一度押すとリセット→再生。
- 📸 キャプチャボタン（main.ts と同方式）
- ステータス行に現在の状態（Before/案名/覚醒中/完了）を表示

## 検証済みの技術事実（再調査不要）
- 属性スタイリング: `layer.on("featureUpdated", (params) => { const ev = params?.evaluator ?? params; evaluators.add(ev); ev.evaluate(styleFn); })`。`styleFn({properties})` は `{ color, emissive, emissiveIntensity, opacity, show }` を返す。`properties["bldg:measuredHeight"]` = 高さ(m)、`properties["_x"]` / `["_y"]` = 建物重心の経度/緯度。
- アニメーション: featureUpdated で捕まえた evaluator を保持し、JS 側の時計で共有状態（wave の経過時刻）を更新しながら **毎フレームではなく 10–15fps に間引いて** 各 evaluator.evaluate(styleFn) を呼び直すのが現実的。styleFn は共有状態を読む純関数にする。
- 距離計算: 経度差×111320×cos(緯度)、緯度差×110540 でメートル換算してよい。
- 夜・夕のグレーディング値（地面ティント/環境光/露出）は main.ts の TIMES と applyGrading を参考にする。
- 雲・Draco 等のランタイムアセットは vite.config.ts のコピープラグインが処理する（変更禁止部分）。build 出力に assets/cloud と draco wasm が含まれることを確認する。
- node_modules は無いので、最初に `ln -s ~/workspace/navara-tocho-proto/node_modules node_modules` すること（npm install はしない）。

## 禁止・注意
- main.ts / index.html / official.* の変更禁止。vite.config.ts は入力追加のみ。
- 新しい npm パッケージの追加禁止。秘密情報の混入禁止。
- 完了報告に「美しい」と書かない。事実（何を実装し、build が通ったか、未確認点は何か）だけを実験ドキュメントと最終メッセージに残す。
