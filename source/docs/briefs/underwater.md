# BRIEF 2 — TOKYO UNDERWATER 最小実装（Codex D）

あなたは Navara × PLATEAU クリエイティブR&D の開発担当です。この worktree（branch: exp/underwater）で TOKYO UNDERWATER の最小実装を行い、コミットしてください。デプロイはしません。

## 必読
- `docs/experiments/tokyo-underwater-feasibility.md`（同じブランチにある技術検証結果。これが設計の正本）
- プロジェクトルートの `AGENTS.md` / `docs/creative-direction.md`（worktree に無ければ `/home/hatch/workspace/navara-tocho-proto/` のコピーを読む）
- `src/main.ts`（v14。**変更禁止**。浸水スタイリングは ③ 節にある）

## 成果物
1. **新規ページ `underwater.html` + `src/underwater.ts`**（v14 と独立。シーン構築は main.ts のレシピを複製可）
2. `vite.config.ts` の build 入力に underwater を追加（既存入力・コピー処理は壊さない）
3. `docs/experiments/tokyo-underwater.md`（仮説・実装・検証段階の区別・自己評価。ビジュアルは「目視未検証」）
4. 振る舞いテスト（scripts/test-underwater.cjs、AWAKENING の test-awakening.cjs と同方式のモック検証）を通し、`npx vite build` 成功後に git commit

## 仕様（検証ドキュメントの「推奨アプローチ」に厳密に従う）
- 場所: 東京駅（既定）/ 都庁。カメラ初期値は main.ts の PLACES と同一（同一構図で v14 や浸水モードと比較できること）
- **水面**: `plane` メッシュ＋ `geodetic` 配置の半透明面（色 0x123d4a 系、opacity 0.55 前後、検証ドキュメントの具体案A）。回転 -π/2 で水平化。サイズは画角を覆う最小限（4km 目安）
- **水位**: 楕円体高ベース。場所別の初期値定数（東京駅 42m / 都庁 72m を初期候補とし、定数として明示）＋ `?water=<m>` パラメータ対応 ＋ 画面の +/- ボタン（2m 刻み）。ステータスに現在水位を表示。※初期値は地形との交差が目視未確認の仮値であることをドキュメントに明記
- **▶ 水位上昇**: 水位を「地面付近（初期値-12m）→ 初期値+13m」まで約20秒で滑らかに上げる（更新は 10fps 程度に間引く。建物の全件再評価と結び付けない）。再押下でリセット→再生
- **建物**: 単一の FeatureEvaluator で完結させる。浸水深（キー末尾 `_浸水深` の最大値）で色＋発光（v13 の配色を踏襲するが **建物 opacity は 1** に統一し、透過は水面だけが担う）。検証ドキュメント §「v13 浸水スタイリングとの統合上の注意」に従い、復帰・切替時は emissive/opacity を明示的に戻す
- **空**: 体積雲 coverage 0.85、夕景〜薄暗いグレーディング（ランドマークの形が読める範囲で暗く）。selectiveBloom は main.ts と同設定
- **雨**: rainDrop エフェクトのトグルボタン（初期オフ、opacity 0.25 / dropDensity 0.5 / refractionStrength 0.01 を初期候補）。検証ドキュメントの候補値を使用
- 📸 キャプチャ、ステータス行（状態・水位・未確認点の表示）
- 画面内またはドキュメントに「概念表現であり実際の浸水シミュレーションではない」旨を明記

## 禁止・注意
- SSR、水材質 polygon（water:true）は v1 に入れない（検証結果で未実証のため）
- main.ts / index.html / official.* / awakening.* の変更禁止。新規パッケージ禁止
- node_modules が無ければ `ln -s ~/workspace/navara-tocho-proto/node_modules node_modules`
- 「美しい」と書かない。検証段階（ビルド/起動/取得/描画/目視）を区別して記録する
- git commit がサンドボックスで失敗した場合は、その旨を最終報告に明記する（ディレクターが代行する）
