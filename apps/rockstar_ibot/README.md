# Rockstar_ibot Core

このdirectoryは、Rockstar_ibotのAPI、Telegram webhook、scheduler、worker、通話・移動workflow、Mr. Commerceを収録するCore applicationです。

リポジトリ全体の導入方法と現在の状態は[ルートREADME](../../README.md)を先に参照してください。

## 変更前に読む文書

| 変更対象 | 正本 |
|---|---|
| 日次organ、wake call、移動、位置、遅刻通知 | [日次organ設計](../../docs/superpowers/specs/2026-08-01-lm-daily-organ-design.md) |
| finance、marketing、runtime、panel | [platform設計](../../docs/superpowers/specs/2026-07-29-rockstar_ibot-finance-marketing-platform-design.md) |
| Mr. Commerce | [Commerce統合方針](../../docs/revenue-assurance-integration.ja.md) |
| 導入者所有provider | [provider設定](../../docs/owner-tools-setup.ja.md) |

新規host-side stateの標準rootはLIFE_MANAGER_STATE_HOMEです。local stackの設定はdeploy/local/.env、Coreの一部はLM_DATA_DIRまたはLIFE_MANAGER_ENV_FILEを使います。既存の`.openclaw`参照は既知のlegacy-path課題であり、新規実装へ増やしません。いずれの経路でもsecretをsource treeへ保存しません。

## 起動

~~~bash
npm ci
npm start
~~~

Core全体を含むローカルstackはリポジトリrootから起動します。

~~~bash
./scripts/local-up.sh
~~~

## Telegram connector

現在のconnectorはbyob_singleです。1 deploymentにつき、導入者が所有するBotFather Botを1つ接続します。

リポジトリrootで実行:

~~~bash
npm run telegram:configure -- \
  --public-url https://your-rockstar-ibot.example \
  --register
~~~

tokenは非表示promptで入力され、private envはmode 0600で保存されます。Webhookには公開HTTPS originが必要です。

## Mr. Commerce

Commerce Coreは次を扱います。

- Telegramからのproduct、campaign、approval、pause
- Telegram workflow projectionはtenant単位
- canonical evidence storeはtenant・merchant単位
- immutable Offer／Promise Version
- Payment／Refund／Chargeback Observation
- durable Webhook inboxとlease fencing
- purchaser Entitlementのdesired／observed state
- Consent／Rights／Withdrawal
- Decision candidates、確率、承認、Experiment、Outcome

/approveと/pauseは、連携済み所有者のTelegram個人chatだけに限定します。group、actor欠落、actor不一致は保存・queue投入前に拒否します。

外部providerのcredential、adapter、capability、公式readbackが揃わないworkflowは完了扱いにしません。

## MetaMask送金先

認証済みCore PanelのConnectionsからMetaMaskを接続し、Base Mainnet（chain ID 8453）のUSDC受取addressを登録できます。サーバーが発行した5分有効・一回限りのSIWE messageへ署名してaddress所有を確認します。秘密鍵、seed phrase、token approval、送金transactionは要求しません。

既存DBでは`migrations/2026-09-05-lm-panel-metamask-wallet.sql`を先に適用します。この登録は受取先の確認だけで、自動送金を有効化する操作ではありません。

### avocadominiのTelegram Stars販売

Telegram内のデジタル商品販売は`XTR`固定です。`LM_DORAEMON_STARS_AMOUNT`と
`LM_DORAEMON_STARS_PAYLOAD`を設定し、`2026-09-01-lm-doraemon-stars.sql`を適用すると、
`/buy`から請求、`pre_checkout_query`の厳格照合、支払証跡の保存、購入者権限の付与までを処理します。
決済問い合わせは`/paysupport`で受け付けます。

## テスト

### Commerce

~~~bash
npm run test:commerce
~~~

### Core全体

~~~bash
npm test
~~~

### 構文

~~~bash
node --check server.js
~~~

## 主なfile

| File／directory | 役割 |
|---|---|
| server.js | HTTP、Telegram webhook、route wiring |
| scheduler.js | wake・organ scheduler |
| lib/commerce-command.js | Commerce slash command |
| lib/commerce-approval.js | 承認・取消境界 |
| lib/commerce-workflow-runtime.js | durable jobへのcompile・enqueue |
| lib/commerce-assurance-store.js | Offer、Promise、決済観測 |
| lib/commerce-webhook-inbox.js | provider event inbox |
| lib/commerce-purchaser-entitlement-store.js | 購入者権限と不一致 |
| lib/commerce-consent-rights-store.js | 同意・権利・撤回 |
| lib/commerce-decision-store.js | 候補・決定・Outcome |
| lib/panel-wallet.js | MetaMask用SIWE challenge、Base固定、署名検証 |
| migrations/ | Postgres／Supabase schema |

## 導入者所有providerの確認

リポジトリrootで実行します。

~~~bash
npm run owner:check -- --profile base,calendar,voice,billing
~~~

この検査は値を表示しません。ただしprovider所有権、migration適用、残高、OAuth、Webhook到達性までは証明しません。

## データ境界

- raw credential、email、電話番号、住所、会話本文をCommerce台帳へ保存しない
- jobとeventには秘密値ではなくcredential referenceを渡す
- Telegram projectionはtenant、canonical evidenceはtenant・merchantで分離する
- provider readbackなしに成功・売上を作らない
- 不明状態をfalseへ変換しない
- append-only evidenceとreconciliationを残す
