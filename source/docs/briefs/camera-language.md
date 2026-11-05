# BRIEF — EXP CAMERA LANGUAGE（Issue #5）: 映画的カメラプリセットの比較基盤

目的: 構図は作品の一部である。AWAKENING / UNDERWATER / 今後の実験で使い回せる「実証済みの画角プリセット集」を作り、同一シーン・同一条件で横並び比較できるようにする。この worktree（exp/camera-language）で実装し、コミットしてください（サンドボックスで失敗したら最終報告に明記）。デプロイはしません。

## 成果物
1. 新規ページ `camera.html` + `src/camera.ts`（v14 のフォトリアルシーンを複製した中立シーン。建物スタイリングなし＝白モデル、夕景 17:40 固定、雲・bloom は v14 と同設定）
2. `vite.config.ts` の入力に camera を追加（既存入力・コピー処理は維持）
3. `docs/experiments/camera-language.md`（各プリセットの意図した印象・パラメータ表・検証記録。ビジュアルは「目視未検証」）
4. `scripts/test-camera.cjs`（モックによる振る舞いテスト）を通し、`npx vite build` 成功

## プリセット仕様（東京駅・都庁の両方、全プリセットで target はランドマーク座標）
| 名前 | distance | pitch | heading | 意図 |
|---|---|---|---|---|
| HERO（基準） | 場所既定（520/560） | 既定（-48/-46） | 既定（55/40） | 現行の標準構図 |
| LOW ANGLE | 300 | -18 | HERO と同じ | 見上げ気味。建物の高さと圧迫感 |
| DIORAMA | 900 | -62 | HERO + 30 | 斜めジオラマ。街の広がりと模型感 |
| TOP-DOWN | 1100 | -89 | HERO と同じ | 真俯瞰フラット。街区のパターン |
| HORIZON | 2600 | -24 | HERO と同じ | 地平線と空を入れた遠景 |
| STREET | 130 | -8 | HERO と同じ | 街レベル。建物に埋もれる一人称寄り |

- プリセットボタンで即時切替（アニメーション遷移は v1 では不要）。場所切替（東京駅/都庁）も用意し、切替時は HERO に戻す。
- **カメラ読み出しを常時表示**：`view.camera.positionGeographic` と `.orientation` の実測値をステータス付近に表示し、📸キャプチャのファイル名にもプリセット名を含める。ユーザーが「この画角がいい」と言ったときに数値で再現できることが、この実験の核。
- プリセット適用後、読み出し値がプリセットの意図（注視点＝ランドマーク、distance）と一致することをテストで検証する（モックで setCamera 引数を検証する方式でよいが、その旨を明記）。

## 禁止・注意
- src/main.ts / src/official.ts / src/awakening.ts / src/underwater.ts / index.html / official.html / awakening.html / underwater.html の変更禁止。新規パッケージ禁止。
- 共有状態は main() 冒頭で宣言（TDZ 事故防止）。pagehide/pageshow の扱いは既存ページの教訓に従う（このページにタイマー演出はないので、不要な仕組みは足さない）。
- 「美しい」と書かない。検証段階（ビルド/起動/取得/描画/目視）を区別して記録する。
