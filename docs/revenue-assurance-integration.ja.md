# Rockstar_ibot Revenue Assurance 統合方針

状態: 実装中。外部providerの資格情報と本番readbackがない機能はfail closedにする。

## 正本と実行系

Rockstar_ibot自身が正本として保有するのは、販売者ごとに分離された次の記録である。

- immutableな商品・Offer Version・Promise Version
- 注文と、providerから取得したPayment／Refund／Chargeback Observation
- 購入者Entitlementのdesired stateとobserved state
- Consent／Rights／Purpose／Notice Version／Withdrawal
- Approval principalとpolicy version
- Decision Opportunity、候補、却下、選択確率、model／policy version
- 実行、provider readback、Outcome、純経済価値
- 不一致とReconciliation Case

Telegram、Stripe、Stars、LMS、Community、License、CMS、CRM、実験基盤は
正本ではなく、観測を返しコマンドを実行する交換可能なadapterである。

    Telegram approval UI
            ↓
    Rockstar_ibot canonical records
            ↓ transactional job/outbox
    replaceable provider adapters
            ↓ signed/readback observation
    payment・entitlement・outcome reconciliation

## データ境界

- merchant_idを全てのID・query・idempotency・authorization境界に含める。
- 販売者をまたぐ人物IDを作らない。
- raw email、token、password、会話本文を意思決定台帳へ保存しない。
- unknown、pending、falseを区別し、不明を未購入として扱わない。
- 売上ではなく、返金・手数料・割引・対応費用を差し引いた純経済価値を保存する。
- 同意撤回後の処理を停止し、法的保存が必要な証拠とは分離する。

## OSS境界

vendor/commerce-upstreams/は固定commitの評価用sourceであり、production採用を
意味しない。各OSSは独立serviceまたはadapter behind portとして扱う。金銭、
約束、権限、同意、承認の意味を外部schemaへ委譲しない。

採用前に、license、security advisory、outbound telemetry、tenant isolation、
backup/export、削除、差し替え手順を確認する。秘密値や実顧客データを使った起動は
個別の承認とowner-owned provider設定が完了するまで禁止する。

## 完了条件

1. 同じWebhookを100回再送しても業務効果が1回である。
2. 決済成功・権限未付与、返金済み・権限残存を必ず不一致として検出する。
3. Orderは正確なOffer／Promise Versionに固定される。
4. 承認イベントから承認主体とauthorization policyを追跡できる。
5. Decisionから候補・却下・確率・実行・長期Outcomeを再構成できる。
6. provider停止中もイベントを失わず、復旧後に重複なく再開できる。
7. 実provider readbackなしにcompletedや売上を表示しない。
