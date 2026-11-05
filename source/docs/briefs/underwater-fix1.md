# BRIEF-FIX1 — UNDERWATER 独立レビュー指摘の修正

独立レビュー判定は FAIL、要修正は MEDIUM 1件です。この worktree（exp/underwater）で修正し、テスト・ビルドを通してコミットしてください（コミットがサンドボックスで失敗したら最終報告に明記）。デプロイはしません。

## 修正（MEDIUM）: bfcache 復帰で「水位上昇中」のまま凍結
- 現状: `src/underwater.ts` は `pagehide` で水位上昇タイマーを止めるが、状態とステータス表示が「水位上昇中」のまま残る。`pageshow` の処理がない。
- 対応（明示的な中断状態への遷移を採用）: `pageshow` で、上昇中だった場合はアニメーションを再開せず「中断」状態に遷移させる。ステータスに中断した旨と現在水位を表示し、▶水位上昇ボタンで最初から再生できる状態に戻す。上昇中でなかった場合は何もしない。
- テスト追加: scripts/test-underwater.cjs に pagehide → pageshow の回帰テストを追加（上昇中に pagehide するとタイマーが止まり、pageshow で中断状態＋ステータス表示になり、タイマーが再開していないこと／▶で再生できること）。

## 完了条件
- `node scripts/test-underwater.cjs` 全通過、`npx vite build` 成功
- docs/experiments/tokyo-underwater.md に「独立レビュー結果と修正内容」を追記
- git commit（メッセージ例: "UNDERWATER fix: explicit stopped state on pageshow (bfcache)"）
- main.ts / index.html / official.* / awakening.* は変更禁止。SSR・water:true polygon は引き続き入れない
