# BRIEF-FIX1 — AWAKENING 独立レビュー指摘の修正（Codex A 続き）

独立レビュー（別セッション）の判定は FAIL、要修正は MEDIUM 2件＋LOW 1件です。この worktree（exp/awakening）で修正し、テスト・ビルドを通してコミットしてください（コミットがサンドボックスで失敗したら最終報告に明記）。

## 修正1（MEDIUM）: stale evaluator の蓄積
- 現状: `src/awakening.ts` は evaluator を例外時のみ Set から除去している。SDK はフィーチャー破棄時に `featureRemoved` イベント（`{ featureSetId }`）を出す。
- 対応: evaluator を featureSetId をキーとする Map で管理する。`featureUpdated` で `(featureSetId → evaluator)` を登録し、`layer.on("featureRemoved", ...)` で該当エントリを削除する。refresh は Map の値に対して行う。

## 修正2（MEDIUM）: bfcache 復帰で「覚醒中」のまま凍結
- 現状: `pagehide` でタイマーを止めるが `pageshow` の復帰処理がない。
- 対応: `pageshow`（persisted かどうかを問わず）で、phase が "wave" の場合はアニメーションをクリーンにリセットする（タイマー停止、phase を "before" に戻し grade/refresh/report を実行）。完了済み・After・Before 状態では何もしない。

## 修正3（LOW）: テストのライフサイクルカバレッジ
- `scripts/test-awakening.cjs` のモックを拡張する: レイヤーは featureUpdated と featureRemoved の両方のリスナーを保持できるようにし、window リスナー（pageshow）も保持・発火可能にする。
- 追加アサーション: (a) featureRemoved 後にその evaluator へ再評価が走らない（Map から消えている）。(b) wave 途中で pageshow を発火すると Before にリセットされ、タイマーが止まる。

## 完了条件
- `node scripts/test-awakening.cjs` 全通過、`npx vite build` 成功
- `docs/experiments/tokyo-awakening.md` に「独立レビュー結果と修正内容」を追記
- git commit（メッセージ例: "AWAKENING fix: evaluator removal on featureRemoved + bfcache reset"）
- main.ts / index.html / official.* は引き続き変更禁止
