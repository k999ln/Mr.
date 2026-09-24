# Rockstar_ibotを自分名義のツールだけへ接続する

**最終更新:** 2026-09-05
**対象:** 現在の`byob_single`構成、配布者、self-host/BYO運営者

## 結論

現在のコードで実現できる「自分のツール」は、Rockstar_ibotのsourceを使いながら、Telegram、Supabase、Composio、Google、Gemini、Telnyx、Stripeなどを**導入者本人のprovider account、project、domain、API key**へ接続する方式である。

Telegram runtimeは`1 deployment = 1 Bot`である。Kaiの運営では、owner-only `@Rockstar_ibot`とcustomer-facing `@avocadominibot`を別deploymentへ接続する。現在はcustomer Botだけ公式receiptがあり、owner Botは接続・allowlist・command profileの確認待ちである。

これは「外部providerを一切使わず、全serviceを自前実装・自前hostする」という意味ではない。完全自前にするには、providerごとのadapterとdata migrationがさらに必要になる。

```text
現在できる所有
  source code         → 自分のfork / deployment
  provider account    → 自分名義
  domain / billing    → 自分名義
  secret / user data  → 自分のvault / project

まだできない完全自前化
  Supabase互換Core DB、Calendar OAuth、電話網、決済網、メール配送、
  Hub auth/D1/R2を外部providerなしで置換すること
```

secretをこの文書、Git、issue、chat、screenshotへ貼らない。ローカルでは`deploy/local/.env`を`0600`、cloudではdeployment providerのsecret vaultを使う。

## まず選ぶ構成

### 現在の推奨default

最初は次の順で構成する。

1. `base` — 独自Telegram Bot、公開HTTPS、独自Supabase、内部署名鍵
2. `calendar` — 独自Composio/Google Calendar、Maps、Gemini
3. `voice` — 独自Telnyx番号、Call Control、Gemini Live
4. `billing` — 独自Stripe Payment LinkとWebhook
5. `mail`、`browser`、`social`、`discovery`は後述の未完成境界を確認してから個別に有効化する

local composeのin-process schedulerを使うならInngestは任意である。Inngestを使う場合はin-process loopと同時に同じeffectを書かせない。

## 所有者設定の一覧

| 領域 | 自分で作るもの | 主な設定 | 現在の状態 |
|---|---|---|---|
| Source / Git | 自分がwrite権限を持つGitHub repository | owner/repo URL、Git remote、必要時だけ`GH_TOKEN` | 固定旧repo fallbackは削除済み。自己修復Issue/PRはowner repoとwrite権限をreadbackできるまで停止 |
| 公開先 | HTTPSが使えるdeploymentとdomain。Voice時はWSSも用意 | `LM_PUBLIC_URL`、必要時`LM_PANEL_BASE_URL`, `LM_WEB_ORIGIN`, `PUBLIC_WSS` | Core HTTPSは必須。Panel/Webはfallback可、WSSはVoice時のみ |
| Telegram | 自分のTelegram accountから作ったBotFather Bot | `LM_TELEGRAM_*` | 1 deployment＝1 Botまで実装済み。Kaiの2 Botは2 deploymentへ分離 |
| Core DB | 自分のSupabase project | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | avocadomini入口の最小schemaはbootstrap済み。Core全機能のfresh schemaは未完成 |
| 内部署名 | 用途別に異なるrandom secret | `LM_UID_SECRET`など | 必須。流用禁止 |
| Calendar | 自分のComposio projectとGoogle Calendar auth config | `COMPOSIO_API_KEY`, `COMPOSIO_GCAL_AUTH_CONFIG` | 実装済み |
| Maps | 自分のGoogle Cloud projectで制限したkey | `LIFE_MAPS_KEY`または`GOOGLE_API_KEY` | 実装済み |
| AI | 自分のGoogle AI project/API key | `GEMINI_API_KEY` | text resolveとvoice bridgeで使用 |
| 電話 | 自分のTelnyx account、番号、Call Control app | `TELNYX_*` | 実装済み。実通話は課金を伴う |
| 課金 | 自分のStripe account、Payment Link、Webhook endpoint | `STRIPE_WEBHOOK_SECRET`, `LM_STRIPE_PAYMENT_LINK` | signed webhook entitlementまで実装済み |
| 送信mail | 自分のResend accountと検証済みdomain | `RESEND_API_KEY`, `LM_MAIL_FROM`, `LM_REPLY_DOMAIN` | 送信railは実装済み。受信railは未完成 |
| Gmail | 自分のUnipile account | `UNIPILE_DSN`, `UNIPILE_TOKEN`, `UNIPILE_NOTIFY_SECRET` | fresh-user callback未完成 |
| Durable | 自分のInngest app/environment | `INNGEST_SIGNING_KEY`。`INNGEST_EVENT_KEY`は将来の送信用 | endpoint/functions実装済み。運用方式は二者択一 |
| Browser | 自分で運用するprivate Steel serviceとDB | `LM_BROWSER_*` | cloud前提の一部実装。local bundle未完成 |
| Hub | 自分のSites project、ChatGPT auth、D1、R2 | logical bindings `DB`, `FILES` | pilot実装済み。Coreとは未接続 |
| SNS | 自分のPostiz/Instagram/TikTok assets | `LM_POSTIZ_*`, `LM_INSTAGRAM_*`, `LM_TIKTOK_*` | operator限定。default無効 |
| Product Hunt | 自分のAPI credentialと実際の商用許諾 | `PRODUCT_HUNT_*` | `permission_required`。本番無効 |
| 外部AI package | publisher審査、manifest、将来のcredential broker | package manifest | metadata-only。実行無効 |
| iOS | 自分のApple Developer team、Bundle ID、mobile backend | Xcode signing + 将来のAPI | Previewのみ。backend未完成 |
| DEV自己修復 | 自分のGitHub repo、Railway project/services/environment | `LM_GITHUB_REPOSITORY`, `LM_DEV_RAILWAY_*`, `LM_DEV_HEALTH_URL` | operator限定。全項目が明示されなければfail closed |

## exact environment profiles

正本templateは[`deploy/local/.env.example`](../deploy/local/.env.example)である。

### `base`

```dotenv
LM_TELEGRAM_MODE=byob_single
LM_TELEGRAM_BOT_TOKEN=
LM_TELEGRAM_BOT_USERNAME=
LM_TELEGRAM_WEBHOOK_SECRET=
LM_LATE_APPROVAL_CALLBACK_SECRET=
LM_PUBLIC_URL=
LM_PANEL_BASE_URL=
LM_WEB_ORIGIN=
NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME=
LM_TIME_ZONE=Asia/Tokyo

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

LM_UID_SECRET=
LM_PANEL_SESSION_ROTATION_SECRET=
LM_CALL_SECRET=
LM_FEEDBACK_PROVENANCE_KEY=
LM_RELATIONS_HASH_SECRET=
```

`NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME`だけが公開可能なBot usernameである。token、service-role key、署名鍵を`NEXT_PUBLIC_*`へ入れてはいけない。Supabaseのservice-role/secret keyはRLSを迂回できるbackend authorityなので、Web、iOS、Hub clientへ渡さない。

`LM_WEB_ORIGIN`は静的WebとCore APIが別originの場合に設定する。同一originでも配布時は明示すると監査しやすい。

### `calendar`

```dotenv
COMPOSIO_API_KEY=
COMPOSIO_GCAL_AUTH_CONFIG=
LIFE_MAPS_KEY=
GOOGLE_API_KEY=
GEMINI_API_KEY=
```

Maps keyは`LIFE_MAPS_KEY`が優先され、なければ`GOOGLE_API_KEY`を読む。server用keyはsourceへ入れず、利用APIと送信元IPなどで制限する。1つの無制限keyをWeb、mobile、serverで共用しない。

現行cloud defaultのCalendar transportはComposioである。コードには`gog`とUnipile transportもあるが、Panel onboardingとDocker imageを含めた完全な代替distributionにはなっていない。

GOGを単一所有者のlocal transportとして試す場合だけ、次を設定する。

```dotenv
LIFE_TRANSPORT=gog
GOG_ACCOUNT=owner@example.com
GOG_BIN=gog
GOG_KEYRING_PASSWORD=
```

`gog` binaryとkeyringはruntime Docker imageへ同梱されず、1 host accountを利用者全員で共有するため、First 3000の共有SaaS構成には使わない。

### `voice`

```dotenv
TELNYX_API_KEY=
TELNYX_CONNECTION_ID=
TELNYX_PHONE_NUMBER=+12025550100
TELNYX_PUBLIC_KEY=
PUBLIC_WSS=wss://life.your-domain.tld
LM_CALL_SECRET=
GEMINI_API_KEY=
LM_AMD=on
MAX_CONCURRENT_CALLS=8
```

`TELNYX_PHONE_NUMBER`はE.164、`PUBLIC_WSS`はpathなしの公開WSS originにする。runtimeが`/ws`を追加する。TelnyxのCall Control applicationには、同じ公開deploymentのWebhookを設定する。`LM_AMD`は`on`または`off`だけを使う。AMDが有効な既定状態では`TELNYX_PUBLIC_KEY`が必須で、受信Webhook署名の検証に使う。明示的に`LM_AMD=off`とした場合だけ公開鍵を任意にできる。

### `billing`

ドラえもんの既定課金はTelegram Starsです。無料開始時はTelegram本人IDと同意版だけを保存し、3ツールまで同時利用できます。4つ目の選択でStars確認画面を開き、本人が承認した成功通知を検証してから10ツールを解放します。事前に次のmigrationを適用します。

```text
apps/rockstar_ibot/migrations/2026-09-02-lm-doraemon-free-tier.sql
apps/rockstar_ibot/migrations/2026-09-02-lm-commerce-free-limit.sql
apps/rockstar_ibot/migrations/2026-09-01-lm-doraemon-stars.sql
```

```dotenv
LM_DORAEMON_STARS_ENABLED=0
LM_DORAEMON_STARS_AMOUNT=
LM_DORAEMON_STARS_PAYLOAD=dora-os-lifetime-v1
DORAEMON_TERMS_URL=https://doraos.vercel.app/legal
DORAEMON_PRIVACY_URL=https://doraos.vercel.app/privacy
```

`LM_DORAEMON_STARS_ENABLED`は、法定表示、正確なStars価格、返金窓口、test環境の決済・自動解放・返金E2Eを確認した後だけ`1`にする。`0`でも無料3ツールは利用できる。

Stripe導線は既存購入者との互換用に残りますが、新規ユーザーの既定入口にはしません。

```dotenv
STRIPE_WEBHOOK_SECRET=
LM_STRIPE_PAYMENT_LINK=https://buy.stripe.com/...
LM_DORAEMON_PAYMENT_LINK=https://buy.stripe.com/...
# 現コードはStripe API callに使わない。将来用。
STRIPE_SECRET_KEY=
```

Payment LinkとWebhook endpointは同じ自分のStripe accountに作る。endpointは`POST <LM_PUBLIC_URL>/api/stripe/webhook`。`STRIPE_WEBHOOK_SECRET`はAPI secret keyと別物で、endpointごとに異なる。ドラえもん専用リンクを分けない場合は`LM_DORAEMON_PAYMENT_LINK`を空欄にすると`LM_STRIPE_PAYMENT_LINK`を使う。

ドラえもんの購入後redirectは`<LM_PUBLIC_URL>/doraemon/complete?session_id={CHECKOUT_SESSION_ID}`にする。`checkout.session.completed`または`checkout.session.async_payment_succeeded`の署名済みWebhookが`lm_doraemon_purchase_claims`をpaidへ更新するまで、Telegram接続リンクは表示されない。事前に`apps/rockstar_ibot/migrations/2026-09-01-lm-doraemon-purchase-claims.sql`を適用する。

現在のruntimeは、Telegramの`successful_payment`または署名済みStripe eventからentitlementを更新する。`STRIPE_SECRET_KEY`で商品作成や返金を行うコードはまだない。

### `mail`

```dotenv
RESEND_API_KEY=
LM_MAIL_FROM=Rockstar_ibot <hello@your-domain.tld>
LM_REPLY_DOMAIN=reply.your-domain.tld
LM_INBOUND_SECRET=

UNIPILE_DSN=
UNIPILE_TOKEN=
UNIPILE_NOTIFY_SECRET=
```

旧運営者domainへのfallbackは削除済みで、`LM_MAIL_FROM`または`LM_REPLY_DOMAIN`がなければ送信をfail closedにする。

ただし本番受信はまだ有効化しない。現在の`/inbound-email`は独自query secretだけを検査し、Resend公式のSvix署名検証を行わない。またResendの`email.received` webhookには本文が含まれないため、Receiving APIから本文を取得する実装が必要である。Gmail onboardingもUnipile `notify_url` callbackをrepository内に実装し、返された`account_id`を内部userへbindするまで未完成である。

### `durable`

```dotenv
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=
```

現在の受信endpointが直接必要とするのは`INNGEST_SIGNING_KEY`である。`INNGEST_EVENT_KEY`は将来serverからeventを送る場合に使う予約欄で、現runtimeは直接参照しない。local Inngest Dev Serverの場合だけsigning keyなしのdev modeを使える。

### `browser`

```dotenv
LM_BROWSER_TASKS_ENABLED=1
LM_BROWSER_SESSION_KEY=
LM_FEEDBACK_DATABASE_URL=postgresql://...
LM_AGENT_BROWSER_EMAIL=
LM_AGENT_BROWSER_NAME=
```

`LM_BROWSER_SESSION_KEY`は32 random bytesを64桁hexにした値である。現行browser clientは`steel-browser.railway.internal`というprivate serviceを前提とするが、`deploy/local/compose.yaml`にはSteelもbrowser migration一式も同梱していない。設定検査に通ってもlocal browserがreadyという意味ではない。

### `social`

```dotenv
LM_DATA_DIR=/var/lib/rockstar_ibot/data
LM_WORKER_CAPABILITIES=
LM_RUNTIME_TENANT_ID=
LM_POSTIZ_API_KEY=
LM_INSTAGRAM_HANDLE=
LM_INSTAGRAM_ACCOUNTS_PATH=
LM_INSTAGRAM_SETTINGS_PATH=
LM_INSTAGRAM_CREDENTIALS_PATH=
LM_INSTAGRAM_PROFILE_STATE_DIR=
LM_TIKTOK_INTEGRATION=
LM_HONNE_EN_INSTAGRAM_PROFILE_REF=
LM_HONNE_EN_TIKTOK_INTEGRATION_REF=
```

composeに残っていた旧運営者のInstagram/TikTok ref defaultは削除済みである。default capabilityはpublishを含まず、空欄のままでは投稿しない。ただしnative carouselやHonne/Anicca用script群には旧運営者のaccount、integration、承認済みartifact hashを固定したlegacy laneが残る。一般配布のdefault serviceではなく、自分のlane定義とreceipt検証へ置き換えるまでpublish capabilityを付与しない。

### `discovery`

```dotenv
PRODUCT_HUNT_ACCESS_TOKEN=
PRODUCT_HUNT_COMMERCIAL_API_APPROVED=false
```

`true`と書くだけでは許諾にならない。Product Huntから実際の商用API利用許諾を取得し、署名済みapproval referenceをsource configに登録するまで`false`のままにする。候補検索はpackage installや実行ではない。

### `dev/self-heal` — operator限定

```dotenv
LM_GITHUB_REPOSITORY=your-owner/your-repository
ANICCA_FORUM_REPO=your-owner/your-repository
GITHUB_IDENTITY=your-github-login
LM_SOURCE_REPOSITORY_URL=https://github.com/your-owner/your-repository.git
JOB_SEARCH_FRAMEWORK_REPOSITORY=https://github.com/your-owner/your-job-search-framework.git
JOB_SEARCH_FRAMEWORK_SHA=0123456789abcdef0123456789abcdef01234567
LM_X402_DISCOVERY_HEALTH_URL=https://x402.your-domain.tld/health
LM_X402_SALE_OBSERVER_CONFIG=/absolute/private/path/x402-sale-observer.json
LM_DEV_RAILWAY_PROJECT_ID=123e4567-e89b-42d3-a456-426614174000
LM_DEV_RAILWAY_APP_SERVICE=life-core
LM_DEV_RAILWAY_POSTGRES_SERVICE=life-postgres
LM_DEV_RAILWAY_ENVIRONMENT=production
LM_DEV_HEALTH_URL=https://life.your-domain.tld/health
```

`LM_DEV_RAILWAY_PROJECT_ID`はRailwayのproject UUID、serviceとenvironmentはそのproject内の明示selectorにする。`error-intake-inject.js`は4つの`LM_DEV_RAILWAY_*`が全て妥当で、appとPostgresのserviceが異なる場合だけRailway CLIを呼ぶ。不足時や不正selector時に旧projectへfallbackしない。

`ANICCA_FORUM_REPO`はIssue型のAI連携用で、未設定時は`LM_GITHUB_REPOSITORY`を使う。`GITHUB_IDENTITY`は受託／bounty lane用で、`gh api user`の実ログインと一致しなければ停止する。`LM_SOURCE_REPOSITORY_URL`はクラウド子インスタンスがcloneする公開sourceで、未設定時は妥当な`LM_GITHUB_REPOSITORY`からHTTPS URLを組み立てる。いずれも他人のrepoへfallbackしない。

Job Search frameworkは、所有するHTTPS GitHub URLと40桁commit SHAの両方がなければclone前に停止する。x402 sale observerも絶対パスの外部JSON（`schemaVersion: 1`）がなければ通信せず、旧wallet、商品ID、asset、Railway URLへfallbackしない。credential本体やwallet秘密鍵はJSONやGitへ入れず、JSONからprivate credential fileの絶対パスだけを参照する。

このscriptはPostgres serviceの`DATABASE_PUBLIC_URL`とapp serviceの`LM_FEEDBACK_PROVENANCE_KEY`（または`LM_UID_SECRET`）をRailwayから読み、本番相当のfeedback DBへ制御されたtest incidentを書く。通常のservice起動には不要で、対象とbackup/readbackを確認したoperatorだけが手動実行する。`LM_DEV_HEALTH_URL`はmerge/deploy guard用のpath付きHTTPS health endpointで、error injector自体は参照しない。

## 初回設定手順

### 0. 自分がwriteできるGit remoteを確定する

公開入力は`https://github.com/<owner>/<repo>`だけとし、tokenをURLへ含めない。現在の作業treeが読取専用upstreamを指している場合は、forkまたは自分のrepositoryを作った後でremoteを切り替える。正確なURLと公開／privateの選択が決まる前に、AIがrepositoryを新規作成したりremoteを書き換えたりしない。

自己修復系`feedback-to-issue`とdaily DEV loopは`LM_GITHUB_REPOSITORY`を明示しない限り停止する。`error-intake-inject.js`は4つの`LM_DEV_RAILWAY_*`を明示しない限りRailwayへ接続しない。merge/deploy系を使う場合は、自分が所有するrepoとhostingのreadbackをE2E確認するまでlaunchdやcronで有効化しない。

### 1. private envを作る

```bash
cp deploy/local/.env.example deploy/local/.env
chmod 600 deploy/local/.env
```

GitHub repoをinstallation ownerが作成し、write権限を確認した後だけ次を設定する。

```dotenv
LM_GITHUB_REPOSITORY=your-owner/your-repository
```

内部secretは用途ごとに別々に生成する。

```bash
openssl rand -hex 32
```

同じ出力を複数の変数へ流用しない。生成値をterminal log、shell history、chatへ貼らず、private envまたはcloud vaultへ直接保存する。

### 2. 独自Telegram Botを接続する

```bash
npm run telegram:configure -- \
  --public-url https://life.your-domain.tld \
  --register
```

このcommandだけはTelegramへ実際に`getMe`、Webhook登録、readbackを行う。詳しくは[`telegram-bot-setup.ja.md`](telegram-bot-setup.ja.md)を参照する。

### 3. provider dashboardで自分のresourceを作る

- Supabase projectと必要schema
- Composio auth configとGoogle Calendar consent app
- Google Maps用に制限したserver key
- Gemini API key
- Telnyx番号、Call Control application、Webhook public key
- Stripe Payment LinkとWebhook endpoint
- 必要な機能だけResend、Unipile、Inngest、Postiz

provider accountをcodeやAIが勝手に所有者名義で作ることはできない。本人が規約、請求先、電話番号、domain verification、OAuth consent、税務情報を確認して作る。

### 4. 設定名と形式だけを検査する

```bash
npm run owner:check -- --profile base,calendar,voice,billing
```

全項目を監査する場合：

```bash
npm run owner:check -- --profile all
```

`all`は任意・未完成profileも含むため、使わない機能が`FAIL`になるのは正常である。checkerはsecret値を表示せず、欠落した変数名と形式だけを報告する。providerへloginせず、account所有権、残高、schema、OAuth consent、Webhook到達性を証明しない。

### 5. Coreを起動する

```bash
./scripts/local-up.sh
```

local composeのPostgresはruntime job/lease、MinIOはlocal object store用である。現在のTelegram、Panel、daily Coreは別途設定したSupabaseを読むため、「local composeを起動しただけで全個人dataがlocalへ閉じる」とは扱わない。

## コードのどこが各設定を読むか

| 動作 | 主なコード |
|---|---|
| Telegram identity、Webhook URL、secret検証 | `apps/rockstar_ibot/lib/telegram-config.js`, `webhook-selfheal.js` |
| Telegram/Panel/Stripe/Telnyx/Inngest HTTP入口 | `apps/rockstar_ibot/server.js` |
| Calendar、Maps、日次判断、通知 | `apps/rockstar_ibot/scheduler.js` |
| Telnyx発信 | `apps/rockstar_ibot/lib/dial.js` |
| Resend送信元とReply-To | `apps/rockstar_ibot/lib/mail-resend.js` |
| Gmail Hosted Auth URL | `apps/rockstar_ibot/lib/gmail-onboard.js` |
| browser secret/session | `apps/rockstar_ibot/lib/browser-auth-session-store.js`, `browser-job-runtime.js` |
| local provider envのAPI/scheduler配線 | `deploy/local/compose.yaml` |
| Hub D1/R2 state | `apps/rockstar_ibot-hub/app/lib/*-store.ts` |
| Product Hunt事故防止gate | `lib/producthunt-discovery.mjs` |

## 設定だけでは解決しない現在のblocker

### 1. fresh Supabase bootstrap

`apps/rockstar_ibot/migrations/2026-09-04-lm-doraemon-fresh-bootstrap.sql`は、avocadominiの無料開始・サイトから3つ選択する入口に必要な最小`lm_users`を作る正本migrationであり、関連する無料枠・選択migrationとともにbootstrap済みである。その他のmigrationは既存`lm_wake_log`、`lm_ask_log`等を前提にするため、これだけでは完全なCore schemaを再現できない。配布前に全migration順序、RLS/service-role権限、rollback、seedなしE2Eを完成させる必要がある。

### 2. Hubの「全体連携」

Hubのbuttonは現在、D1のportfolio状態を更新し、`integration_outbox`へ`pending` eventを記録するところまでである。repository内にそのoutboxを消費してCore、Telegram、Calendar、Voice、Stripeへ実接続するdispatcherはない。したがって「連携希望をdurableに受付済み」であり、「全provider接続完了」ではない。

Hub deploymentに必要なのはSites提供のChatGPT authとlogical binding `DB`（D1）、`FILES`（R2）である。既存の`.openai/hosting.json`は現在のpilot projectを指すため、配布者は自分のSites projectとbindingを用意する。既存pilotのproject IDを全配布先で共用しない。

### 3. Gmail/Resend受信

- fresh userのGmail callbackを受けて`account_id`をbindするrouteが未完成
- 現在のUnipile `notify_url`はrepository内にない旧Netlify routeを指す
- Resend Svix署名検証が未実装
- `email.received`の`email_id`からReceiving APIで本文を取得する処理が未実装

この4点が完成するまでmail profileは本番OFFにする。

### 4. Browser

private Steel service、browser DB migration、local network、session isolationを1つの配布bundleとして再現できない。envを入れるだけでは完成しない。

### 5. iOSとLanding

iOS clientが読む`/api/mobile/v1/*` backend、mobile session、APNs、StoreKitは未完成で、現在はPreview dataである。Landingもこのrepositoryだけから独立deployできるpackage境界を完成していない。

### 6. 外部AI、Product Hunt、Service Cell

外部AI packageはcatalog metadataまで、Product Huntは候補検索gateまで、6つのService Cellは全executor/outbox consumer/納品/課金まで未完成である。credentialを追加しても自動実行には進まない。

### 7. GitHub自己修復lane

`error-intake-inject.js`のRailway targetは上記`LM_DEV_RAILWAY_*`へ分離済みで、旧運営projectのfallbackはない。ただし、GitHub Issue／PR、author allowlist、merge/deploy、health readbackを含むlane全体は、repository、author、Railway target、`LM_DEV_HEALTH_URL`、feedback databaseの全てを自分のinstallation configとして検証し、E2E readbackに合格するまで無効とする。

## 3,000人へ配る時の所有モデル

現在安全に扱える配置と未完成境界は次の通りである。

| model | provider所有 | Telegram | 現在の対応 |
|---|---|---|---|
| Kai owner/customer分離 | Kaiが各deploymentを所有 | `@Rockstar_ibot`と`@avocadominibot`を別deployment | customer接続済み、owner未確認 |
| self-host/BYO配布 | 利用者または配布者が各deploymentを所有 | deploymentごとに1 Bot | 対応 |
| 運営SaaS | 運営がprovider accountと1 Botを所有 | 1 Botを3,000人が利用 | load/privacy未証明 |
| shared BYO SaaS | 各利用者が自分のBot/providerを所有 | 1 shared processに多数Bot | 未実装 |

shared BYO SaaSにはtenant別installation registry、secret vault reference、Bot別Webhook route、複合identity、quota、providerごとのcredential brokerが必要である。現在のprocess-global envへ3,000個のtokenを詰め込まない。

## 完全自前化へ進む場合

| 現provider依存 | 完全自前化に必要な変更 |
|---|---|
| Supabase REST/schema | managed/self-host Postgres + PostgREST互換adapter、baseline migration、RLS再設計 |
| Composio | Google OAuth client、token vault、refresh/revocation、Calendar adapter |
| Gemini | model gatewayとvoice realtime adapter、eval、cost/timeout policy |
| Telnyx | carrier abstraction、発信/AMD/media/Webhook署名/CDR adapter |
| Stripe | billing provider interface、entitlement event contract、refund/tax adapter |
| Resend/Unipile | SMTP/inbound parserまたは別provider adapter、署名、本文取得、account lifecycle |
| Inngest | self-host queue/scheduler、lease、retry、dead-letter、observability |
| Sites D1/R2/Auth | standalone Web auth、SQL/object-store adapter、migration/export/delete |
| Steel | configurable private browser serviceとsandbox/session manager |

「自分名義の外部accountで動く」段階を先に完成させ、その後provider interfaceを一つずつ切り出す方が、3,000人へ壊れたself-host bundleを配るより検証可能である。

## 公式資料

- [Telegram Bot Tutorial](https://core.telegram.org/bots/tutorial) / [Bot API setWebhook](https://core.telegram.org/bots/api#setwebhook)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) / [Securing your data](https://supabase.com/docs/guides/database/secure-data)
- [Composio custom auth configs](https://docs.composio.dev/docs/extending-sessions/custom-mcp)
- [Google Maps API security guidance](https://developers.google.com/maps/api-security-best-practices)
- [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Telnyx Call Control applications](https://developers.telnyx.com/api-reference/call-control-applications/retrieve-a-call-control-application) / [Webhook signatures](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks)
- [Stripe API keys](https://docs.stripe.com/keys) / [Webhook signatures](https://docs.stripe.com/webhooks)
- [Resend Receiving](https://resend.com/docs/dashboard/receiving/introduction)
- [Unipile Hosted Auth](https://developer.unipile.com/docs/hosted-auth)
- [Inngest environment variables](https://www.inngest.com/docs/sdk/environment-variables)
- [Cloudflare D1 local/remote development](https://developers.cloudflare.com/d1/best-practices/remote-development/) / [R2](https://developers.cloudflare.com/r2/)
