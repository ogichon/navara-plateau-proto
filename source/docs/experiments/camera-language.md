# CAMERA LANGUAGE — 画角比較基盤

2026-11-05 / Issue #5 / branch `exp/camera-language`。デプロイなし。ビジュアルは **目視未検証**。

## 目的・仮説・成功条件

同じ白モデル、夕景、大気条件のまま画角を切り替えることで、ランドマーク形状と都市の印象に対する構図の効果を比較する。AWAKENING / UNDERWATER の次回構図選定に再利用する。技術的成功条件は、両地点の全プリセットがランドマークを注視し、指定距離・角度を即時適用し、実測位置を常時表示し、場所変更で HERO に戻ること。作品としての成立は実 Chrome での比較後に判断する。

## パラメータ・意図

| プリセット | distance 東京駅/都庁 (m) | pitch 東京駅/都庁 (°) | heading 東京駅/都庁 (°) | 意図した印象 |
|---|---|---|---|---|
| HERO | 520 / 560 | -48 / -46 | 55 / 40 | 現行の標準構図、比較基準 |
| LOW ANGLE | 300 / 300 | -18 / -18 | 55 / 40 | 建物の高さ・圧迫感 |
| DIORAMA | 900 / 900 | -62 / -62 | 85 / 70 | 街の広がり・模型感 |
| TOP-DOWN | 1100 / 1100 | -89 / -89 | 55 / 40 | 街区のパターン |
| HORIZON | 2600 / 2600 | -24 / -24 | 55 / 40 | 地平線・空を含む遠景 |
| STREET | 130 / 130 | -8 / -8 | 55 / 40 | 街レベルの一人称寄り |

全プリセットの target は東京駅 lng=139.7671, lat=35.6812 / 都庁 lng=139.6917, lat=35.6896。roll=0。高さ・高度基準の指定は v14 と同じく省略。setCamera の lng/lat は注視点で、表示する positionGeographic はカメラ自身の位置。この二つは一致する値ではない。

## 実装

`camera.html` / `src/camera.ts` を追加。v14 の地形、地理院写真、白モデル、標準フォトリアルシーンを複製。時刻2026-11-05 17:40 JST、地面0xd8a878、環境光0.15・0x93a7cc、露出1.05。雲coverage=0.45・lightShafts/haze有効、bloom strength=0.85 / radius=0.6 / threshold=0.55 / smoothing=0.2。建物属性スタイリングなし。

両地点の3 tilesetを一度だけ登録し、場所切替でレイヤーを重複生成しない。初期URLは `?place=tokyo|tocho`、不正値は東京駅に戻す。プリセットはボタンで即時適用。場所切替は同じ場所の再選択も含め HERO に戻す。ボタンの aria-pressed を更新する。

設定 target・distance・姿勢と、実測 positionGeographic / orientation を別表示。Navara の `postRender` イベントで手動操作後も実測を更新する。タイマー演出・追加の pagehide/pageshow 処理なし。PNG名は場所とプリセットを含む（例 `navara-camera-tocho-low-angle-1740.png`）。手動操作後のPNGは現在の画角であり、プリセット再選択で既定値を再現する。キャプチャ失敗・初期化失敗は画面表示。

Vite は camera 入力のみ追加。既存入力と runtime asset コピー処理を維持。禁止された既存ページ・実装は変更なし。新規パッケージなし。

## 検証記録

| 段階 | 結果 |
|---|---|
| 振る舞い | `node scripts/test-camera.cjs` 成功。標準・都庁・不正URLの3起動ケースと初期化失敗ケース。両地点6画角、場所切替リセット、即時setCamera、設定表示、実測更新、白モデル・夕景、重複レイヤー防止、PNG名・失敗を確認。 |
| カメラ再現 | **Navara/DOMモックでsetCamera引数を検証**。ランドマーク座標・distance・pitch・heading・rollを全画角で照合。実測は意図的にtargetと異なる値をモックに与え、表示更新を確認。実エンジンでの注視点・距離の逆算一致や遮蔽は未検証。 |
| 回帰 | `node scripts/test-awakening.cjs`、`node scripts/test-underwater.cjs` 成功。`git diff --check` 成功。 |
| ビルド | `npx vite build` 成功。cameraを含む全5ページを出力。既存の設定ロード・大きいチャンクの警告あり。 |
| アセット配置 | dist/assets のDraco・font worker wasmおよびcloud/noise/waterを確認。HTTP取得確認とは別。 |
| ページ起動 | 実ブラウザ未検証。`npx vite preview --host 127.0.0.1` がサンドボックスの `listen EPERM` で起動不可。モックの__readyのみ確認。 |
| 3D Tiles取得 | 未検証。v14のURLをそのまま使用。 |
| レンダリング完了 | 未検証。 |
| 実画像確認 / ユーザー目視確認 | ともに未検証。採点・合格判定なし。 |
| GitHub状態取得 | Issue/PR/Pagesの読取を試行したがネットワークのsocket制限で失敗。Issue更新なし。 |
| 公開 | デプロイ・pushなし。公開URLなし。 |

## 次の判断・比較手順

ローカルで `npx vite --host 127.0.0.1` を起動し、実 Chrome で `/camera.html?place=tokyo` と `/camera.html?place=tocho` を開く。同じ画面サイズ、各地点の同じ夕景条件でHEROを基準に6画角を順番にキャプチャする。v14比較は `/index.html?place=tokyo&time=sunset`（都庁はplace=tocho）。各画角の都市らしさ、建物形状、遮蔽、地面との交差、空の占有率を確認する。LOW ANGLE / STREET は近接建物への埋没、TOP-DOWN は高さの読み取りに特に注意する。

実画像の比較後、採用候補と棄却理由を記録し、必要な距離・pitchのみ反復調整する。現時点は技術検証まで、全5評価軸は暫定・目視未検証。独立レビューは未実施であり、このブランチからのmain統合は本作業の対象外。

## コミット結果

実装セッションではサンドボックス制限（共有Git管理領域が読み取り専用）でコミットできなかったが、Muse が代行してコミット済み（a12f43a）。独立レビュー PASS（2026-11-05、Low指摘＝本節の陳腐化のみで本更新により解消）。
