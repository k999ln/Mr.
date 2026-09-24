# Rockstar_ibot 設置者アカウント入力票

**最終更新:** 2026-08-28

**対象:** 自分が所有するprovider account、domain、公開プロフィールでRockstar_ibotを設置するoperator

この入力票は、Rockstar_ibotの設置者が「公開してよい情報」と「端末またはsecret vaultだけへ保存する情報」を混ぜないためのものです。

現在の安全な単位は`1 deployment = 1 operator = 1 provider secret set = 1 Telegram Bot`です。同じdeploymentを複数利用者が使うことはできますが、別Bot、別operatorのBot tokenやAPI keyを同じprocess-global envへ追加しません。Kaiの運営topologyは`@Rockstar_ibot`と`@avocadominibot`の2 Botで、2つの独立deploymentへ1 Botずつ設定します。

## 1. チャットへコピペしてよい公開情報

次のblockだけをコピーして回答してください。値が決まっていない項目は推測せず`未設定`と書きます。

```text
# Rockstar_ibot owner public intake
OWNER_NAME=Kai
GITHUB_OWNER_CHOICE=k999ln
GITHUB_REPO_URL=https://github.com/k999ln/Mr.
REPO_VISIBILITY=private
GITHUB_REPO_SETUP=verified_existing_private
CORE_PUBLIC_URL=未設定
PANEL_PUBLIC_URL=未設定
WEB_PUBLIC_URL=未設定
HUB_PUBLIC_URL=https://life-manager-one-hub.kirin-999.chatgpt.site

TELEGRAM_BOT_CREATED=未設定
TELEGRAM_BOT_USERNAME=未設定
TELEGRAM_PUBLIC_CHANNEL_USERNAME=未設定
TELEGRAM_PUBLIC_CHANNEL_ID=未設定

TIKTOK_HANDLE=未設定
INSTAGRAM_HANDLE=未設定
X_HANDLE=未設定
YOUTUBE_CHANNEL_URL=未設定
YOUTUBE_CHANNEL_ID=未設定
LINKEDIN_PUBLIC_URL=未設定
SOCIAL_AUTOMATION_MODE=draft_only

MAIL_PROVIDER=resend
MAIL_FROM=未設定
MAIL_REPLY_DOMAIN=未設定
MAIL_SENDING_DOMAIN_VERIFIED=未設定

IOS_BUNDLE_ID_BASE=未設定
APPLE_DEVELOPMENT_TEAM=未設定

SERVICE_NAME=Rockstar_ibot
COMPANY_NAME=未設定
DEFAULT_TIME_ZONE=America/New_York

STRIPE_PAYMENT_LINK=未設定
REVENUE_RAIL=未選択
LIFE_MANAGER_PAY_TO=未設定
LM_X402_PUBLIC_URL=未設定
```

現在のcanonical GitHub ownerは`k999ln`、正本repositoryは`k999ln/Mr.`です。repositoryがprivateであることと、接続中のGitHub sessionにpush権限があることをreadbackしました。

### 公開情報の対応先

| 入力項目 | Rockstar_ibotでの対応 | 入力規則 |
|---|---|---|
| `OWNER_NAME` | 公開owner registry | Operator名はKai。secretではない |
| `GITHUB_OWNER_CHOICE` | canonical GitHub ownerの選択 | `k999ln`を本人が選択済み。GitHub設定画面、connector、local `gh` CLIが一致 |
| `GITHUB_REPO_URL` | 今後の所有repoとsetup文書への公開link | `existing_repo`なら実在するrepo、`create_new_fork_authorized`なら新規作成してよい希望先。`https://github.com/<owner>/<repo>`形式とし、PATやtoken付きURLは禁止 |
| `REPO_VISIBILITY` | repoの公開範囲 | `public`または`private`。作成前は`未選択`。privateを選んでもcredential付きURLは送らない |
| `GITHUB_REPO_SETUP` | Git repoの設置方針と作成許可 | `verified_existing_private`。`k999ln/Mr.`はprivateで実在し、接続中のGitHub sessionのpush権限をprovider readback済み |
| `CORE_PUBLIC_URL` | `LM_PUBLIC_URL` | path・query・fragmentなしのHTTPS origin |
| `PANEL_PUBLIC_URL` | `LM_PANEL_BASE_URL` | Coreと同じ場合は同じURL |
| `WEB_PUBLIC_URL` | `LM_WEB_ORIGIN`または公開Landing URL | pathなしのHTTPS origin |
| `HUB_PUBLIC_URL` | Rockstar_ibot One Hubの公開URL | HTTPS URL |
| `TELEGRAM_BOT_CREATED` | BotFather botの準備状況 | 普通のTelegram accountではなくBotFatherで作ったBotがあれば`yes`、なければ`no` |
| `TELEGRAM_BOT_USERNAME` | `LM_TELEGRAM_BOT_USERNAME`、`NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME` | BotFather botの`@username`だけ。Bot tokenは絶対に入れない |
| SNS handle / channel | 公開導線と検証済みowner profile | 公開プロフィールだけ。login email、cookie、session IDは禁止 |
| `SOCIAL_AUTOMATION_MODE` | SNSの既定権限 | 最初は`draft_only`。本人確認付き投稿まで許可する場合だけ`publish_after_approval`へ変更する。自動無承認投稿はdefaultにしない |
| `MAIL_PROVIDER` | outbound mail adapter | 現コードの既定は`resend`。通常のmailboxがあるだけではResend送信設定済みとは扱わない |
| `MAIL_FROM` | `LM_MAIL_FROM` | 検証済み送信domain上の公開From。mailbox passwordは禁止 |
| `MAIL_REPLY_DOMAIN` | `LM_REPLY_DOMAIN` | 所有する受信domain名だけ。DNS provider tokenは禁止 |
| `MAIL_SENDING_DOMAIN_VERIFIED` | mail provider側のdomain検証状態 | DNS検証済みなら`yes`、未検証なら`no`。API keyやDNS tokenは送らない |
| `IOS_BUNDLE_ID_BASE` | iOS app/test/UI-test identifier | 自分が管理するreverse-DNS形式（例`com.company.rockstaribot`）。未設定中は`invalid.rockstaribot.*`で署名対象外にする |
| `APPLE_DEVELOPMENT_TEAM` | Xcode signing Team | Apple Developer Team ID。証明書、秘密鍵、Apple ID passwordは送らない |
| `DEFAULT_TIME_ZONE` | `LM_TIME_ZONE` | `Asia/Tokyo`、`America/New_York`などIANA timezone |
| `STRIPE_PAYMENT_LINK` | `LM_STRIPE_PAYMENT_LINK` | 顧客へ共有する公開Payment Linkだけ |
| `REVENUE_RAIL` | 初期の収益経路 | `stripe`、`x402`、`both`、`disabled`から選ぶ。選択だけで実課金は有効化しない |
| `LIFE_MANAGER_PAY_TO` | x402の公開受取address | Kaiが管理するEVM公開address。秘密鍵、seed phrase、wallet fileは絶対に送らない |
| `LM_X402_PUBLIC_URL` | x402 endpointの公開origin | 自分が管理するHTTPS origin。未設定時はx402 discovery/deployを停止する |

Telegram公式はBot tokenをpasswordとして扱い共有しないよう求めています。[Telegram Bot Tutorial](https://core.telegram.org/bots/tutorial)

StripeはPayment LinkをWeb、email、SNSで共有する公開URLとして案内する一方、secret API keyはserver環境に限定しています。[Stripe Payment Links](https://docs.stripe.com/payment-links)、[Stripe secret key best practices](https://docs.stripe.com/keys-best-practices)

### 公開情報でも送らないもの

- 個人の電話番号、住所、生年月日、本人確認書類
- private Telegram chat ID、operator alert chat ID
- Stripe customer ID、account login email、顧客情報
- URL queryに埋めたemail、token、署名、`client_reference_id`
- private repository URLに付いたcredential
- 公開を本人が承認していない実績、フォロワー数、売上、肩書

## 2. チャットへ送らず、端末またはsecret vaultだけへ保存する値

以下は値をチャット、issue、PR、Git、screenshot、log、公開HTMLへ貼りません。必要な相手にも値ではなく「設定済み／未設定」だけを伝えます。

### Core・database・署名

```text
LM_TELEGRAM_BOT_TOKEN
LM_TELEGRAM_WEBHOOK_SECRET
LM_LATE_APPROVAL_CALLBACK_SECRET
SUPABASE_SERVICE_ROLE_KEY
LM_UID_SECRET
LM_PANEL_SESSION_ROTATION_SECRET
LM_FEEDBACK_PROVENANCE_KEY
LM_RELATIONS_HASH_SECRET
LM_CALL_SECRET
LM_INBOUND_SECRET
LM_BROWSER_SESSION_KEY
LM_RUNTIME_DATABASE_URL
LM_FEEDBACK_DATABASE_URL
```

`LM_RUNTIME_DATABASE_URL`と`LM_FEEDBACK_DATABASE_URL`はpasswordを含み得るため、URL全体をsecretとして扱います。各HMAC・Webhook secretは別々の乱数を使い、流用しません。

### Calendar・Google・AI・browser

```text
COMPOSIO_API_KEY
GEMINI_API_KEY
GOOGLE_API_KEY
LIFE_MAPS_KEY
GOG_KEYRING_PASSWORD
LM_AGENTMAIL_API_KEY
```

### Voice・billing・mail・durable execution

```text
TELNYX_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
UNIPILE_TOKEN
UNIPILE_NOTIFY_SECRET
INNGEST_SIGNING_KEY
INNGEST_SIGNING_KEY_FALLBACK
INNGEST_EVENT_KEY
```

`STRIPE_PAYMENT_LINK`は公開情報ですが、`STRIPE_SECRET_KEY`と`STRIPE_WEBHOOK_SECRET`は別物です。
`RESEND_WEBHOOK_SECRET`は受信Webhook署名検証を実装した後に使う予定の専用secretで、現コードはまだ読みません。
`INNGEST_SIGNING_KEY_FALLBACK`と`INNGEST_EVENT_KEY`も将来のrotation／server-side event送信用で、現runtimeが必須にするのは`INNGEST_SIGNING_KEY`だけです。

### Social・storage・automation

```text
LM_POSTIZ_API_KEY
PRODUCT_HUNT_ACCESS_TOKEN
MINIO_ROOT_PASSWORD
MINIO_SECRET_KEY
GH_TOKEN
GITHUB_TOKEN
APPLE_ID_PASSWORD
```

credentialやsessionを指す次のfile pathも、file内容と一緒に公開しません。

```text
LM_INSTAGRAM_CREDENTIALS_PATH
LM_INSTAGRAM_ACCOUNTS_PATH
THE402_CREDENTIALS_PATH
LM_AGENT_WALLET_PATH
```

### passwordではないが、公開入力票へ不要な内部設定

次は必ずしもsecretではありませんが、deployment topologyや内部accountを識別するため、通常のチャット入力票へ貼らずprivate configで管理します。

```text
SUPABASE_URL
COMPOSIO_GCAL_AUTH_CONFIG
TELNYX_CONNECTION_ID
TELNYX_PHONE_NUMBER
TELNYX_PUBLIC_KEY
UNIPILE_DSN
LM_ADMIN_TELEGRAM_CHAT_ID
LM_TELEGRAM_ALERT_CHAT_ID
LM_RUNTIME_TENANT_ID
LM_TIKTOK_INTEGRATION
LM_HONNE_EN_INSTAGRAM_PROFILE_REF
LM_HONNE_EN_TIKTOK_INTEGRATION_REF
MINIO_ENDPOINT
MINIO_ROOT_USER
LM_DEV_RAILWAY_PROJECT_ID
LM_DEV_RAILWAY_APP_SERVICE
LM_DEV_RAILWAY_POSTGRES_SERVICE
LM_DEV_RAILWAY_ENVIRONMENT
LM_DEV_HEALTH_URL
LM_DEV_PROJECT
```

## 3. 保存方法

### local deployment

1. `deploy/local/.env.example`を`deploy/local/.env`へ複製する。
2. `deploy/local/.env`を`chmod 600`にする。
3. secretはshell historyへ残るCLI引数で渡さない。
4. Telegramはhidden promptを使う。

```bash
npm run telegram:configure -- \
  --public-url https://life.example \
  --register
```

### cloud deployment

- Railwayなどdeployment providerのsecret variablesへ登録する。
- GitHub Actionsから使う場合はrepositoryまたはenvironment secretを使い、workflowやlogへ値を書かない。
- client buildへ渡してよいのは明示的な公開値だけ。`NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME`にtokenを入れない。

GitHubはAPI keyやtokenをActions secretsとして保存し、アクセス範囲を制限する仕組みを提供しています。[GitHub Docs — シークレット](https://docs.github.com/ja/actions/concepts/security/secrets)

## 4. 値を表示しない設定確認

default packageの変数名と形式を、値を表示せず検査します。

```bash
npm run owner:check -- --profile base,calendar,voice,billing
```

任意機能は必要なものだけ追加します。

```bash
npm run owner:check -- --profile mail
npm run owner:check -- --profile durable
npm run owner:check -- --profile browser
npm run owner:check -- --profile social
npm run owner:check -- --profile source
```

`source`は運営者専用のGitHub／self-heal deploy laneです。`LM_GITHUB_REPOSITORY`とRailway targetが揃い、GitHubのwrite権限、Git remote、Railway service、health endpointをreadbackできるまで自動PR／merge／deployを有効にしません。

`discovery`はProduct Huntの実商用許諾を取得した場合だけ確認します。環境変数を`true`にすること自体は許諾になりません。

この検査は文字列形式だけを確認します。provider accountの所有権、Supabase schema、OAuth redirect、Webhook readback、実送信・実課金成功までは証明しません。

## 5. 現時点のfresh-install制約

公開入力票とsecretをすべて埋めても、現時点では次が自動完成しません。

- fresh Supabase用のcanonical baseline schema。現在のmigrationは既存`lm_users`、`lm_wake_log`、`lm_ask_log`等を前提にする
- Hubの`integration_outbox`をCoreやproviderへ届けるconsumer
- Gmail fresh-user callbackと、Resend受信本文取得・Webhook署名検証
- iOSが呼ぶ`/api/mobile/v1/*`の本番backend
- Landing subsetの独立buildに必要な共有component/package
- 外部AI packageのcredential broker、isolated executor、usage/billing receipt
- Product Huntの商用許諾recordと本番credential broker

`npm run owner:check`がGREENでも、上記を本番readyとは表示しません。

## 6. 漏洩時

1. 貼ったmessageやcommitを消すだけで終わらせない。
2. 該当providerでtoken/key/passwordを失効またはrotateする。
3. secret vaultを新しい値へ更新する。
4. deploymentを再起動し、Webhook・OAuth・送信・課金をreadbackする。
5. provider audit logで不審な利用を確認する。

## 関連資料

- [独自Telegram Bot接続runbook](telegram-bot-setup.ja.md)
- [local private env template](../deploy/local/.env.example)
- [製品設計とBYO方針](../project.md)
- [Rockstar_ibot Core README](../apps/rockstar_ibot/README.md)
