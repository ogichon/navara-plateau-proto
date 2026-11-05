# BRIEF — TOKYO UNDERWATER 技術検証（Codex B）

あなたは Navara × PLATEAU クリエイティブR&D の技術検証担当です。この worktree（branch: exp/underwater-research）で**調査のみ**を行い、成果物ドキュメントをコミットしてください。ソースコード（src/）は変更しません。

## 必読
- `AGENTS.md`、`docs/architecture.md`、`docs/creative-direction.md`
- 調査対象の実物: `~/workspace/navara-tocho-proto/node_modules/@navaramap/three/dist/index.d.ts`、`~/workspace/navara-tocho-proto/node_modules/@navaramap/three-default-descs/dist/index.d.ts` と各 `dist/index.js`、`~/workspace/navara-tocho-proto/node_modules/@navaramap/three/dist/assets/water/` の中身

## 調査項目（各々に 可 / 条件付き可 / 不可 の判定と根拠）
1. **水面**: Navara に水（water）のメッシュ/エフェクト/マテリアルは存在するか（Desc キー、設定項目）。assets/water/ は何に使われるか。存在しない場合、半透明の大きな平面を任意の標高に置く方法（addMesh の図形 Desc、座標指定方式=経緯度+高さか、材質の opacity/色の指定方法）を型定義から特定する。
2. **水位アニメーション**: その平面の高さを実行時に変える方法（handle.update の可否、毎フレーム更新の現実性）。
3. **反射**: ssr エフェクトの設定項目と前提（Gバッファ等）。水面への反射の現実的な代替（環境マップ、疑似反射）があるか。
4. **雨**: rainDrop エフェクトの設定項目（強度等）と、雲（clouds の coverage 上限・暗さ）で嵐の空が作れるか。
5. **霧**: fogLight の設定項目と効果範囲。aerialPerspective の haze 系パラメータで代替できるか。
6. **浸水建物の発光**: v13 の浸水スタイリング（FeatureEvaluator）との組み合わせ上の注意（opacity の競合等）。

## 成果物
- `docs/experiments/tokyo-underwater-feasibility.md`:
  - 項目別判定表（判定・根拠となった型定義/コードの場所・設定例）
  - 推奨アプローチ（最小構成で「沈みゆく東京」の1枚を作る手順）
  - 残リスクと未確認事項（実ブラウザでしか分からない点は明記）
  - 本実装の工数感（小/中/大と理由）
- git commit（メッセージ: "UNDERWATER: feasibility research"）

## 注意
- 推測で「できる」と書かない。型定義・実コードで裏が取れたものだけを根拠にする。
- node_modules への書き込み禁止。新規パッケージ追加禁止。
