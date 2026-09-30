# 家計簿アプリ（支出専用）

静的な HTML/CSS/JS のアプリ。`index.html` をそのまま開くとブラウザ内（localStorage）に保存し、
claude.ai で公開した版では `db` 機能でデータを保存して PC とスマホで同期する。

- 公開版: https://claude.ai/artifact/B4pmhFbBc5ABW7MFobwSZt
- 公開用ファイルの作成: `python3 tools/build-artifact.py`（`dist/` に出力。`dist/index.html` を
  Artifact として、`style.css` `parser.js` `script.js` を `files` として公開する。
  capabilities は `{"db": {}, "sample": {}, "downloads": true}`）

## チャットで支出やレシートを受け取ったとき

ユーザーがチャットに支出（例:「昨日スタバで650円」）やレシートの写真を送ってきたら、
公開版の db に ArtifactData ツールで書き込む。ページは db を購読しているので、開いている端末にすぐ反映される。

- コレクション: `entries`、ドキュメント id: `claude-<日時の数字>` など一意な文字列
- 形式:
  ```json
  {"type": "expense", "date": "YYYY-MM-DD", "category": "食費", "amount": 650, "memo": "スタバ", "createdAt": 1790662700000}
  ```
- `category` は次のいずれか: 食費 / 日用品 / 交通費 / 住居費 / 水道光熱費 / 通信費 / 交際費 / 趣味・娯楽 / 医療費 / その他
- `amount` は税込・値引き後に実際に払った金額（円の整数）。レシートは 1 枚 1 件で合計金額を記録し、
  `memo` に店名、`"source": "receipt"` を付ける。
- `date` が分からなければ今日。`createdAt` はミリ秒の現在時刻。
- 割り勘や人の分も払ったとき: `amount` は自分が払った合計、`myAmount` はそのうち自分のための金額
  （0 以上 `amount` 未満の整数）、`forWhom` は 友人 / 家族 / パートナー / 職場・仕事 / その他 のいずれか、
  `shareType` はあとで返してもらう割り勘・立て替えなら `"split"`、奢り・プレゼントなど返してもらわないなら `"treat"`。
  全額が自分の分なら `myAmount`・`forWhom`・`shareType` は付けない。
- 予算・カテゴリ別・1日平均は「自分のための支出」（`myAmount`、なければ `amount`）で計算される。
- 収入は記録しない。複数件はまとめて `batch` で書き込む。書き込んだ内容（日付・カテゴリ・金額）をユーザーに伝える。

設定（予算・固定費・「支出なし」の日など）は `meta/settings` ドキュメントにある。
