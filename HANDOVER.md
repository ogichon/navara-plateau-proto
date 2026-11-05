# 引き継ぎ書 — Navara × PLATEAU 試作（サイドチャット「NavaraとBlender AI活用案」）

作成: 2026-11-05 / 現行バージョン: v14（公開中）

## 1. 目的と背景
- 起点: Zimo氏の X 投稿（Muse＋Blender＋PLATEAU で都市の静止画→AI動画化）の模倣プロジェクト。東京駅・都庁・スカイツリーの静止画＋動画は Blender 工程で完成済み（`~/workspace/plateau-tokyo-station/`、静止画は `output/tokyo_station_still.png`、`output/shinjuku_tocho_still.png`）。
- Blender 工程の課題: FBX 読込が重い（約46kオブジェクト）、Cycles CPU で約7.5分/枚、カメラ決めが盲目作業、地面が灰色プレーン。
- そこで地図エンジン Navara（https://github.com/maplibre/navara 、実体は takram 系の @navaramap/three）を使った案を優先順に4つ提示し、ユーザーが「筋の良さそうなものから一つずつ」で承認:
  ① Blender置き換え検証（Navaraで画角決め＋スクショ→AI動画化）→ **完了・採用**
  ② 時間・天気タイムラプス → **太陽スイープ実装済み（v12）**、天気は未完
  ③ 属性スタイリング（データアート）→ **実装済み（v13）**
  ④ PersonView 一人称散歩 → 未着手

## 2. 成果物
- 公開ページ: https://yuki-ogihara.github.io/navara-plateau-proto/ （`?place=tokyo` 既定 / `?place=tocho`、`?time=day|sunset|night`、`?mode=plain` は公式構成の診断モード、`/official.html` は公式サンプルの原文コピー＋自己診断つき）
- GitHub: 公開リポジトリ `yuki-ogihara/navara-plateau-proto`（無料プランのため公開。秘密情報なし。GitHub Pro にはしない方針は既定）
- ローカル: `~/workspace/navara-tocho-proto/`（`src/main.ts` が本体、`src/official.ts`、`index.html`、`official.html`、`vite.config.ts`、`README.md` に全経緯・全バージョンの検証記録、`deploy/` が Pages 用 git リポジトリ、`pkg/` に npm tarball 展開物）
- スタック: `@navaramap/three@0.2.1`、`@navaramap/three-default-plugin@0.2.1`、`@navaramap/three-plugins@0.2.1`、three 0.187.0、Vite 8.3.5、Node 24

## 3. 現在の機能（v14）
- 場所: 東京駅（千代田区+中央区タイル）/ 都庁・新宿（新宿区タイル）
- シーン: DefaultPlugin のフォトリアルシーン（物理空・太陽・大気・影）、地形=Re:Earth quantized-mesh、ベースマップ=地理院 seamlessphoto、建物=PLATEAU 2023年度 LOD2 白モデル
- 時刻: 昼12:00 / 夕17:40（**初期表示**）/ 夜21:00 JST のボタン＋ 📸 PNGキャプチャ ＋ 左下 cam 読み出し（lng/lat/高度/heading/pitch）
- ▶ タイムラプス: 太陽を 04:30→21:00 JST に約34秒でスイープ、地面ティント・環境光・露出を8キーフレームで補間
- 🎥 シネマ: ターゲット周りをゆっくり周回（heading +0.12°/50ms）。画面タッチ/時刻変更で停止
- ☁️ 立体雲: takram 体積雲（coverage 0.45、ライトシャフト、霞）。トグル可
- 選択的ブルーム: 発光部だけが滲むポストプロセス（v13 の発光スタイリング用）
- 🌈 カラフル: 建物を実測高さで虹色グラデーション＋発光（紫=低層→赤=超高層）
- 🌊 浸水: 建物ごとの浸水深（河川・高潮の想定最大値）で色分け。想定なし=半透明の暗色、≥3.5m=赤＋強発光。画面グレーディングも夕闇の深青に切替
- ⬜ 通常: 白モデル＋現在の時刻グレーディングに復帰

## 4. 確定した技術知見（重要）
1. **建物が全く出なかった根本原因（v11で解決）**: PLATEAU の B3DM は `KHR_draco_mesh_compression` 必須。Navara ランタイムは Draco デコーダ wasm（`draco_decoder-*.wasm`、パッケージの `dist/assets/` 同梱）をモジュールURL相対で fetch するが、Vite はバンドル時にコピーしないため本番で 404 → 建物タイルだけ無言で全滅（地形・写真は Draco 不使用で正常だった）。公式サンプル原文・plain構成でも再現した。対策: `vite.config.ts` の closeBundle プラグインで wasm 2点（draco decoder、font worker）を `dist/assets/` へ明示コピー。
2. **同じ罠はテクスチャにも**: 雲の `assets/cloud/`（local_weather.png、shape.bin 等）、`noise/`、`water/` もモジュール相対解決。v14 でコピー対象に追加済み。`atmosphere/`（34MB）は空が現行でも動作するため未コピー。
3. **カメラ意味論**（型ドキュメントで確定）: setCamera の lng/lat/height = 注視点、distance = 注視点からの距離。「アンカーを後ろにずらす」仮説（v4）は誤り。正しい読み出しAPIは `view.camera.positionGeographic / .orientation`（`view.getCamera()` は存在しない）。
4. **標準フォトリアルシーンには雲とブルームは含まれない**。どちらも別エフェクトとして `view.addEffect({ clouds: {...} })` / `view.addEffect({ selectiveBloom: {...} })` で追加する。雲の実装は @takram/three-clouds。
5. **属性スタイリング**: レイヤーの `on("featureUpdated", params => (params.evaluator ?? params).evaluate(fn))` で batch ごとに `{color, emissive, emissiveIntensity, opacity, show}` を返す。再評価は `layer.forceUpdate()`。B3DM バッチテーブルを直接パースして実測したキー: 高さ = `bldg:measuredHeight`（バイナリ DOUBLE）、浸水深 = キー末尾が `_浸水深` の数値群（流域・シナリオ別。高潮想定も同形式）。浸水モードは全キーの最大値を採用。
6. 夜の真っ黒対策: 環境光（青系 0.6）＋露出 1.7 ＋地面ティント 0x51628c で濃紺の夜景になる。
7. 潜在バグ対策済み: タイマー等の共有状態は main() 冒頭で宣言する（巻き上げられる stop 系ヘルパーが参照し、applyTime が先に走るため TDZ 事故の温床だった）。

## 5. 使用タイル（すべて実在確認済み）
- 千代田区: https://assets.cms.plateau.reearth.io/assets/db/070026-aa27-431b-8d53-7cc6b03244f8/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod2_no_texture/tileset.json
- 中央区: https://assets.cms.plateau.reearth.io/assets/4c/f2436a-e2be-40e2-83da-f1781f36e30b/13102_chuo-ku_pref_2023_citygml_1_op_bldg_3dtiles_13102_chuo-ku_lod2_no_texture/tileset.json
- 新宿区: https://assets.cms.plateau.reearth.io/assets/f0/840fc4-114c-41e4-9a65-67768efd3629/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod2_no_texture/tileset.json （配信カタログ GraphQL で特定。新宿は `_2_op_`）

## 6. 検証チャンネルの制約（引き継ぎ先が必ず知るべきこと）
- エージェント用ブラウザはタイルのストリーミングが極端に遅く、**描画の目視判定には使えない**。DOM テキスト（ステータス行・cam読み出し・診断行）の読み取りだけ信頼できる。
- **ユーザーの実 Chrome（Mac）が唯一の高速・確実な描画確認手段**。新機能は「公開→ユーザーが目視→スクショで報告」の流れが前提。
- デプロイ手順: `npx vite build` → `dist/*` を `deploy/` にコピー（assets は入れ替え）→ ソースも `deploy/source/` にコピー → commit/push → Pages の status が built になるまで確認。

## 7. ユーザーの評価と方針（このスレッドでの発言より）
- ①の判定: Navara は画角決め・太陽位置・AI動画参照 still 用途で **Blender の代替として採用**（テクスチャ付きフォトリアル静止画そのものは Blender が上）。
- ページ単体への評価: 「公式デモの再実装で付加価値がない」— 検証の証拠＋内部ツールと位置づけるのが妥当。**「ただやれ」ではなく「価値のあるものをやれ」** がユーザーの明確な指示。
- 方向性: 「ゾットするような、インパクトのあるやつ、もしくはカラフルなやつ」。地味な実用機能（録画など）より、見た瞬間に来る表現を優先。
- 「まだ弱い、Navaraの良さを活かせてない」→ Navara の良さ = takram 系フォトリアル描画（物理大気・体積雲・ブルーム・映画的カメラ）。v14 はその方向の第一歩で、**雲の映りはユーザーの目視確認待ち**。
- ユーザーは短い指示で方向修正する。長い説明より実物（公開URL）を早く出すこと。

## 8. バージョン履歴（要約）
- v1–v2: 初版〜カメラ寄せ・時刻ティント。都庁の画角ずれ・夜真っ黒の問題
- v3: lookAt 方式 → 悪化のため撤回。夜グレーディングの仕組みはここで確立
- v4–v7: カメラ意味論を確定、読み出しAPI修正で画角の正しさを証明
- v8–v10: plain モード/公式原文でも建物が出ないことを確認し、自己診断でデータ到達とカメラ正常を証明 → 描画側の問題に絞り込み
- v11: **Draco wasm 404 が根本原因と判明・修正。ユーザーが建物表示を確認**
- v12: ② タイムラプス（太陽スイープ）
- v13: ③ 🌈カラフル（高さ）/ 🌊浸水（浸水深）
- v14: 体積雲・選択的ブルーム・🎥シネマ・夕景デフォルト

## 9. 残タスク・次の候補
- [ ] v13/v14 の見た目（色の出方・雲・ブルーム）のユーザー目視確認
- [ ] ②の残り「天気」: rainDrop エフェクト（レンズの雨滴）、fogLight、雲量アニメーション
- [ ] 浸水モードの強化案: 水位そのものが上がっていくアニメーション（半透明の水面メッシュ追加）
- [ ] ④ PersonView 一人称散歩（glTF キャラ＋街歩き。YUMI/凪との連携が本命）
- [ ] シネマ＋タイムラプスの組み合わせ（回りながら日が沈むカット）→ AI動画の参照素材化
- [ ] 投稿ネタ: Draco 格闘記の X 文案は作成済み（このスレッドで提示。投稿はユーザーの手動。Muse のブラウザは X ログイン不可、API ワーカーは YUMI 専用固定のため Muse からは投稿できない）
