# BRIEF-HOLO — Holographic City 磨き込み第1弾

worktree `exp/holo-polish` で作業。コミットを試み、失敗したら最終報告に明記。デプロイはしない。対象は AWAKENING 関連のみ。

## 背景

- ユーザーが勝ち案に **Holographic City** を選択（2026-11-07）。磨き込みはこの案を中心に行う。
- 残課題: 建物の面の粒子状ムラと平坦さ。調査 BRIEF-POLISH-INV（docs/architecture.md）の確定事項:
  - 雲の影は、現行設定（aerialPerspective irradiance 既定 false）では建物の面の減光に効いていない → 対象外。
  - 太陽 CSM の公開設定: shadowMapSize 既定 2048 / shadowNormalBias 既定 0 / shadowBias 既定 0.0001 / shadowRadius 既定 1。+1.5° の斜光では影サンプリング誤差が面のムラを作る機序が裏付けられた。
  - 定常発光は現行 `passed * (0.12 + min(h/240,1) * 0.18)`（0.12〜0.30、全案共通）。

## 実装

1. **太陽の影（シーン共通）**: `scene.sun.update` に影設定を追加する — shadowMapSize を 4096 に（既存の型形式に合わせる）、shadowNormalBias を 0.5 に。shadowBias・shadowRadius・cascade 数は変更しない。
   - 注意: これは描画品質設定であり Before の見た目にも影響しうる。Before のグレード値（時刻・ティント・環境光・露出・lit・大気・haze）は一切変更しない。テストでは影設定を新しい値で固定し、Before グレード値の固定は維持する。実験記録に「影品質はシーン共通で Before にも適用」と明記すること。
2. **Holographic の定常発光を 1.5 倍**: 発光式に案ごとの倍率を持たせ、Holographic のみ 1.5（→ 0.18〜0.45 相当）、Cyberpunk / Gold は 1.0 で現行と完全一致。波のピーク +4 は全案不変。
3. 維持: パレット（base・全 stop 色・地面ティント）、環境光 0.3、露出 1.1、lit 切替、transmittance、haze、Before の全グレード値。

## テスト・記録

- 影設定と Holographic 倍率をアサーションで固定し、変異で落ちる強度を維持。他2案の発光が現行と一致することも固定する。
- 全テスト＋ `npx vite build` 成功。
- docs/experiments/tokyo-awakening.md に「勝ち案決定と磨き込み第1弾」を追記。
- 「粒子が消えた／立体感が出た」と断言しない。判定はユーザー目視。
