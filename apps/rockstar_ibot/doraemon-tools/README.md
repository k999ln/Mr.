# avocadomini ツールモジュール

ここが「10個以上の道具」の正本です。1ツールを1フォルダに分離しているため、担当者は自分のフォルダだけを編集できます。

```text
doraemon-tools/
├── request-intake/tool.json
├── course-builder/tool.json
├── fact-checker/tool.json
├── storefront-builder/tool.json
├── social-publisher/tool.json
├── audience-messenger/tool.json
├── payment-assurance/tool.json
├── entitlement-delivery/tool.json
├── outcome-analytics/tool.json
├── revenue-split/tool.json
├── registry.js
└── tool.schema.json
```

## 新しいツールを追加する

1. このディレクトリ直下に、重複しない`kebab-case`名のフォルダを作る。
2. 既存ツールの`tool.json`を複製し、全項目を自分のツール用に変更する。
3. `implementation_state`は、実行コードと外部接続が検証されるまで`catalog_only`にする。
4. `connector_keys`には既存の接続先だけを書く。秘密値やAPIキーは書かない。
5. `npm run test:doraemon-tools`を実行する。

中央の配列へ追記する必要はありません。`registry.js`がフォルダを自動発見します。

## 共同開発ルール

- 1人につき1ツールフォルダを担当し、別ツールの同時編集を避ける。
- `tool.json`は商品上の契約であり、実装済みでない機能を`runtime_ready`にしない。
- 外部送信、公開、決済は`owner_approval: per_invocation`と`receipt_required: true`を維持する。
- プロバイダー固有処理はツール本体へ直接埋め込まず、`apps/rockstar_ibot/lib`のadapterを参照する。
- 共通仕様を変えるPRと個別ツールを変えるPRを分ける。

## ツールとコネクタの違い

- **ツール**: 利用者が選ぶ仕事。「教材を作る」「決済を確認する」など。
- **コネクタ**: 仕事が利用する外部接続。「Telegram」「X」「Stripe」など。

ツール数は10に固定されません。新しいフォルダを追加すれば11個目以降も同じ契約で登録できます。ただし無料3ツール／有料枠の上限変更は、料金・法定表示・権限テストを別途更新してください。
