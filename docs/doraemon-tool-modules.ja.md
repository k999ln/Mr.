# ドラえもんのツール分割設計

## 結論

共同開発の単位は「外部サービス」ではなく「利用者が選ぶ仕事」にする。

- ツール: 教材作成、出典確認、投稿作成、決済確認など
- コネクタ: Telegram、X、Stripe、メール、LMSなど

ツールは `apps/rockstar_ibot/doraemon-tools/<tool-id>/` ごとに分ける。コネクタは既存の adapter と `config/commerce-connectors.json` で管理する。これにより、同じツールが複数の接続先を使っても、商品上の機能と認証情報を混ぜずに済む。

各`tool.json`は、ID・権限・接続先だけでなく、サイトの表示名、Telegramの説明、入力例、最初の成果、AI下書き要件の正本でもある。`apps/rockstar_ibot/lib/doraemon-feature-catalog.js`が読み込み、`scripts/export-doraemon-site-catalog.js`がサイト用JSONを生成する。サイトのbuildは生成物が正本と違う場合に失敗する。

## 現在の10ツール

| 順番 | ID | 表示名 | 主な接続先 |
|---:|---|---|---|
| 1 | `request-intake` | 依頼受付 | Telegram |
| 2 | `course-builder` | 教材作成 | Brain取込、LMS |
| 3 | `fact-checker` | 出典確認 | なし |
| 4 | `storefront-builder` | LP・オファー作成 | LP |
| 5 | `social-publisher` | 投稿作成・予約 | X、Telegram |
| 6 | `audience-messenger` | 顧客別配信 | Telegram、メール |
| 7 | `payment-assurance` | 決済・失敗回収 | Telegram Stars、Stripe |
| 8 | `entitlement-delivery` | 納品・権限付与 | LMS、ライセンス、コミュニティ |
| 9 | `outcome-analytics` | 施策・売上分析 | Telegram、X、メール、決済 |
| 10 | `revenue-split` | 報酬分配 | Stripe、Telegram Stars |

## 道具定義を変更する／11個目を追加する方法

1. 既存道具の文言・要件変更は、そのフォルダの`tool.json`だけを直す。
2. 11個目は`doraemon-tools`直下へ新しい`kebab-case`フォルダと`tool.json`を作る。
3. 11個目の場合は、公開順の正本`lib/doraemon-feature-catalog.js`、schemaの`feature_key`、データベースの許可値も同じ変更で追加する。
4. `node scripts/export-doraemon-site-catalog.js`を実行する。
5. `npm run test:doraemon-tools`と`npm run test:doraemon-runtime`を実行する。

レジストリは各フォルダを自動発見し、販売画面も同じレジストリから表示名と件数を生成する。ただし、公開機能の追加はTelegram payloadとデータベース制約にも影響するため、11個目だけは上記3箇所の明示更新を必須とする。既存10個の表示文言を変更する場合は中央一覧を編集しない。

## 共同作業

- 友達ごとに担当するツールフォルダを決める。
- ブランチ名は `codex/tool-<tool-id>-<変更名>` を使う。
- 個別PRでは原則として担当フォルダと、そのツール固有テストだけを変更する。
- 共通レジストリ、料金、権限DB、共通UIの変更は別PRにする。
- `maintainers`にはGitHubユーザー名を`@name`形式で記録できる。

## 現在の実働境界

- 公開導線の選択は`lm_doraemon_feature_selections.feature_key`を正本とし、1〜3種類を保存する。
- 10種類すべてと総合司令室が、自然文から隔離された読み取り専用Jobを作り、下書きまたは確認結果をTelegramへ返す共通経路を持つ。
- 旧`/tools`の`connector_key`選択は、既存Commerce機能との互換用に残す。公開導線の「10個の道具」とは混ぜない。
- 公開、配信、決済、返金、権限変更、送金の実行adapterは別段階である。`implementation_state`と`config/commerce-connectors.json`が`runtime_ready`でなく、provider receiptを実機確認していない機能を外部実行済みとは表示しない。
