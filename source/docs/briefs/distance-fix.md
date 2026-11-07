# BRIEF-DIST — AWAKENING: 距離減光の除去（方式B 適用）

worktree `exp/distance-fix` で作業。コミットを試み、失敗したら最終報告に明記。デプロイはしない。対象は AWAKENING 関連のみ。

## 背景

BRIEF-GROUND（方式A: After のみ地形 unlit）公開後、ユーザー目視評価 #8（2026-11-07）: 「ほんとになおった？なおってない」。配信側は実測で新バンドルを確認済み。方式A 公開時に留保した通り、unlit 後も aerialPerspective は後段で掛かり、距離減光（transmittance の消光）が残るのが既知の残存原因。ユーザー報告「引くと真っ黒」と一致する。今回はこの方式B を適用する。

## 実装（`src/awakening.ts` の applyGrade 周辺）

- After / wave / complete のとき: `scene.aerialPerspective.update({ aerialPerspective: { transmittance: false } } as any)` を適用する。ハンドルの所在と更新形式は BRIEF-GROUND の Q2 調査（docs/architecture.md）で確認済み。
- Before のとき: `transmittance: true`（既定）に必ず戻す。
- 併せて After の雲 haze を現行 1.5e-5 → **0** にする（Q3 で 0 が許容値と確認済み）。Before の 3e-5 は不変。理由: haze も距離方向の減光・霞として効くため、距離減光の除去を徹底する。
- inscatter は変更しない（夕景の空の色味を保つ）。
- 維持: 時刻、lit 切替、ティント、環境光、露出、発光、パレット、Before の全パラメータ。

## テスト・記録

- 適用値（transmittance の Before/After、haze 0）をアサーションで固定し、変異で落ちる強度を維持。Before 不変の固定も維持する。
- 全テスト＋ `npx vite build` 成功。
- docs/experiments/tokyo-awakening.md に「目視評価 #8 と方式B 適用」を追記。
- 「直った」と断言しない。可読性・距離減光の最終判定はユーザー目視。
