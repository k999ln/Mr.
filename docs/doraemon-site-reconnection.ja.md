# avocadomini サイト外部接続・再接続台帳

**更新日:** 2026-09-04
**対象:** 指定された2タスクで制作・公開したサイト群
**正本ブランチ:** `main`

この台帳は、チャット履歴を読まなくてもサイトを再ビルドし、Sites・D1・Telegram・メール・決済の接続状態を復旧できるようにするためのものです。秘密値は保存しません。秘密値は各サービスのSecret Storeまたはローカルのprivate envへ再入力します。

## 1. 正本と公開先

| 項目 | 値 |
|---|---|
| GitHub | `https://github.com/k999ln/Mr.` |
| 最新ブランチ | `main` |
| 現在のGitHub main | `15f0465b27e9a266e27769bf057720d9fa404287` |
| 販売サイト | `https://effect-os-verified.kirin-999.chatgpt.site/` |
| 販売サイト詳細 | `https://effect-os-verified.kirin-999.chatgpt.site/details` |
| Vercel公開先 | `https://doraos.vercel.app/` |
| Telegram | `https://t.me/avocadominibot` / `@avocadominibot` |
| Stripe公開Payment Link | `https://buy.stripe.com/4gMaEX2OK1yo4GX144c7u00` |
| X | `https://x.com/doraemonbottt` |

上記の`main`が現在の正本です。作業再開時はこのmainを基準にし、旧`vvvv`や別workspaceを現在状態の根拠にしません。

## 2. Sitesプロジェクト

| 役割 | リポジトリ内ソース | Sites `project_id` | D1 binding | R2 | 公開URL |
|---|---|---|---|---|---|
| 販売・LP | `apps/doraemon-marketing-site/` | `appgprj_6a95c35f945c8191a2620a20be9e7bf5` | `DB` | なし | `effect-os-verified.kirin-999.chatgpt.site` |
| 立ち上げ設計 | `apps/dora-launch-blueprint-site/` | `appgprj_6a9856163e788191a641595e6f9d6a57` | なし | なし | `dora-os-launch-blueprint.kirin-999.chatgpt.site` |
| MCP Bot Hub特許構想 | `apps/mcp-bot-hub-patent-site/` | `appgprj_6a98319dfb6c8191b454f138b6699a3e` | なし | なし | `mcp-bot-hub-patent.kirin-999.chatgpt.site` |

各アプリの`.openai/hosting.json`にもプロジェクトIDとbindingを保存しています。サイト側のプロジェクト所有権、ログインアカウント、現在の公開版、Secret Storeの中身はSites側で確認します。

販売サイトの現在確認値はVersion 43です。公開deploymentは`appgdep_6a9ac11880d481918e786c1a18ea027d`です。Version 35、deployment `appgdep_6a9882967cd48191b2bdeabc46fa7cd3`、version `appgver_9ae19f6ffbfc81919d2e2d0d47705249`は履歴上の照合値で、現在の公開版と混同しません。

### 2026年9月4日 22:11 JST時点の接続receipt

- Railway `avocadomini-core` deployment `a2c3c070-baba-4b01-a5b5-2f7829456601` は`SUCCESS`。
- Core `https://avocadomini-core-production.up.railway.app/health` はHTTP 200、buildはMr main SHA `15f0465b27e9a266e27769bf057720d9fa404287`。
- Telegram `@avocadominibot` の`getMe`は成功。
- Telegram `getWebhookInfo`は `https://avocadomini-core-production.up.railway.app/telegram`、pending update 0件。
- Supabaseの1〜3選択migration適用、実機での`/start` message ID、サイトの1〜3選択がBot側へ保存されたreceiptは未確認。

## 3. サイトの構成と通常の利用方法

販売サイトのページは次のとおりです。

- `/` — avocadominiの説明、10道具、無料スタート、無料診断PDF
- `/start` — 10道具から1〜3個を選択し、同意後にTelegramへ引き継ぐ
- `/details` — 10道具と仕組みの詳細
- `/legal` — 利用条件・法定表示
- `/privacy` — プライバシー方針

利用者の流れは次のとおりです。

```text
トップ
  → 無料スタート
  → 10道具から選択
  → 利用条件・データ利用へ同意
  → 「Telegramで使う」
  → 選択内容を付けたTelegramアプリ起動
```

`/start`の現在の実装は、1〜3個の選択内容を`f2_<base36 mask>`へ変換し、`https://t.me/avocadominibot?start=...`を生成します。Telegramを開いた後は利用者が`START`を押して開始し、Coreが選択を保存してBotへ反映します。サイトで選んでいない人はBot内で最大3個を選べます。4つ目以降の有料確認や実行はCore／Telegram側の責務で、サイト表示だけで購入・全機能稼働を意味しません。

## 4. 販売サイトの再ビルド

必要環境はNode.js 22.13以上、npmです。

```bash
git clone https://github.com/k999ln/Mr..git rockstar_ibot
cd rockstar_ibot
git checkout main
cd apps/doraemon-marketing-site
npm ci
npm run test
```

個別確認:

```bash
npm run lint
npm run build
npm run db:generate
```

Sitesへ再公開するときは、対象の`project_id`に対応するソースをarchive化し、Sitesでsave version → deploy version → deployment statusを順に確認します。receiptにはGit commit SHA、Sites version ID、deployment ID、公開URL、HTTP確認結果を残します。

## 5. 販売サイトの環境変数

値ではなく、設定名・用途・保存場所だけをGitHubへ置きます。`apps/doraemon-marketing-site/.env.example`が入力票です。

### 公開値または表示値

```dotenv
DORAEMON_TELEGRAM_BOT_USERNAME=avocadominibot
DORAEMON_STARS_DISPLAY_PRICE=<確定したStars価格>
DORAEMON_PUBLIC_ORIGIN=<実際に公開するHTTPS origin>
TURNSTILE_SITE_KEY=<Turnstile site key>
DORAEMON_MAIL_FROM=<検証済みドメインのFrom>
DORAEMON_REPLY_TO=<返信先>
DORAEMON_PRIVACY_CONTACT=<削除・訂正依頼窓口>
DORAEMON_LEGAL_NAME=<正式な氏名または法人名>
DORAEMON_LEGAL_ADDRESS=<事業者住所>
```

### 秘密値

次はSites Secret Storeへ保存し、GitHub、チャット、HTML、ログへ書きません。

```dotenv
TURNSTILE_SECRET_KEY=<secret>
RESEND_API_KEY=<secret>
```

TurnstileまたはResendを未設定にすると、リード受付・メール送信機能は安全側に停止します。公開ベータの直接PDF配布とは別の機能です。

## 6. D1の再接続

- 対象Sites project: `appgprj_6a95c35f945c8191a2620a20be9e7bf5`
- binding名: `DB`
- schema定義: `apps/doraemon-marketing-site/db/schema.ts`
- migration: `apps/doraemon-marketing-site/drizzle/0000_glamorous_starbolt.sql`
- migration管理設定: `apps/doraemon-marketing-site/drizzle.config.ts`
- Worker binding型: `apps/doraemon-marketing-site/worker/index.ts`

再接続時は、Sites側で同じ所有者のD1を`DB`としてbindingし、migration適用後に次を確認します。

- `marketing_leads`
- `lead_download_tokens`
- `lead_email_schedules`
- `lead_events`

D1の実データ、database ID、認証情報はGitHubへ保存しません。実データの復旧はD1側のbackup/exportとSites側の所有者権限で行います。

## 7. Telegram・Core・Stripeの接続

販売サイトはBot usernameを公開値として読みます。Bot token、Webhook secret、Core DB credentialはサイトのclientへ渡しません。

Core／Telegram側で必要な設定名:

```dotenv
LM_TELEGRAM_MODE=byob_single
LM_TELEGRAM_BOT_TOKEN=<secret>
LM_TELEGRAM_BOT_USERNAME=avocadominibot
LM_TELEGRAM_WEBHOOK_SECRET=<secret>
LM_LATE_APPROVAL_CALLBACK_SECRET=<別secret>
LM_PUBLIC_URL=<Telegram webhookを受ける公開HTTPS origin>
SUPABASE_URL=<owner-owned Supabase URL>
SUPABASE_SERVICE_ROLE_KEY=<secret>
```

接続手順:

```bash
npm run telegram:configure -- \
  --public-url https://<owner-owned-core-origin> \
  --register
```

確認receipt:

1. Telegram `getMe`でusernameが`avocadominibot`と一致する。
2. `getWebhookInfo`で既存Webhookを確認する。
3. `setWebhook`後のURL、secret、`allowed_updates`をreadbackする。
4. `https://<core-origin>/api/public/telegram`でtokenやsecretを含まないconfigured状態を確認する。
5. Bot本人のprivate chatで`/start`を送る。

Stripeは互換用の別経路です。

```dotenv
LM_DORAEMON_PAYMENT_LINK=https://buy.stripe.com/4gMaEX2OK1yo4GX144c7u00
STRIPE_WEBHOOK_SECRET=<secret>
STRIPE_SECRET_KEY=<secret・現行サイトのclientへ渡さない>
```

Webhook endpointは`POST https://<core-origin>/api/stripe/webhook`です。Payment Linkのredirect、Webhook署名、購入claim、Telegram接続、返金後の権限取消は、実receiptが揃うまで本番完了扱いにしません。

## 8. 再接続後のHTTP・画面確認

```text
GET /                 → 200
GET /start            → 200
GET /details          → 200
GET /legal            → 200
GET /privacy          → 200
GET /resources/sales-automation-checklist-v1.pdf → 200
```

画面では、`/start`で3個を選び、同意チェックを入れたときだけ「Telegramで使う」が有効になることを確認します。選択内容がTelegram deep linkへ引き継がれ、token・secret・顧客情報がHTMLへ出ていないことも確認します。

## 9. GitHubに置かないもの

- Telegram Bot token、Webhook secret、Supabase service-role key
- Turnstile secret、Resend API key、Stripe secret・Webhook secret
- Vercel／Sitesのaccess token、ログイン情報、credential付きURL
- D1の実データ、顧客メール、会話本文、private chat ID

これらを紛失した場合は、各サービスで再発行・rotateし、Secret Storeを更新します。GitHubへ値を追加する復旧方法は採用しません。

## 10. 現在の制約

- avocadominiサイトのソース、文章、画像、PDF、通常の使い方はこのリポジトリに保存済み。
- SitesのプロジェクトIDとD1の論理bindingは保存済み。ただしSitesの所有者セッション、実D1データ、現在のSecret Store値は外部サービス側にある。
- Telegram tokenのRailway設定とWebhookは確認済み。無料3ツール選択・引き継ぎ画面も実装済みだが、実機の`/start` message ID、サイト選択のBot側反映、10機能すべての本番executor、購入、納品、返金取消の一続きのE2Eは未完了。
- 最新サイト成果は`k999ln/Mr.`の`main`を正本として保存する。

## 11. PRIVATE/PIXEL（今回のサイト要約との差分）

今回の要約で新たに確認でき、従来の台帳になかった別製品サイトです。avocadominiの販売サイト、Telegram Bot、D1とは混在させません。

| 項目 | 値 |
|---|---|
| 製品 | Pixel 7（`panther`）向けGrapheneOS公式配布物の日本語導入支援 |
| Sites `project_id` | `appgprj_6a94e35b46348191a218a9f73f6f6ef0` |
| D1 binding | `DB` |
| R2 | なし |
| 公開URL | `https://private-pixel.kirin-999.chatgpt.site/` |
| Sites側確認commit | `9949df3` |
| 照合時のソース位置 | `apps/private-pixel-site/` |
| ローカルインストーラー | `apps/private-pixel-installer/` |
| Vercel入口 | `apps/private-pixel-vercel/` |

上記3パスはローカル絶対パスを記録せず、すべてGitHub相対表記へ正規化しました。照合時点では`apps/private-pixel-site/`は独立したSites管理Gitで、`vvvv`の対象ブランチにはソース本体が未収録です。この台帳は接続情報を保存しますが、`vvvv`だけからPRIVATE/PIXELを完全再構築できるとは扱いません。Sites側の所有権とcommit `9949df3`を先にreadbackし、GitHubへミラーする場合は`.git/`、`.env*`の実値、`node_modules/`、`.next/`、`.vinext/`、`.wrangler/`、`dist/`、`test-results/`を含めません。

主な公開面と運用面:

- `/`、`/guide` — 製品説明、購入前ガイド、リード受付
- `/terms`、`/privacy`、`/tokushoho`、`/refund`、`/support` — 法務・返金・30日サポート
- `/admin` — 注文、利用権再発行、メール再送、返金、サポート、障害イベント。`ADMIN_USER_ID`未設定時は閉じる
- `/api/health`、`/api/readiness` — DBと販売準備状態。秘密値は返さない
- `/api/stripe/*` — Checkout、署名済みWebhook、決済状態確認
- `/api/installer/*`、`/api/releases/pixel7` — 1台1回の利用権、ジョブ、承認済みPixel 7リリース
- `/api/telegram/*` — PRIVATE/PIXEL専用Botの起動・Webhook。avocadomini Botのtokenを流用しない

販売は`SALE_MODE=disabled`を既定にし、`/api/readiness`の`saleReady=true`を確認するまで有料Checkoutを503で停止します。`live`へ進める条件は、Stripe・Resend・販売者情報・サポート窓口・固定済みGrapheneOSリリース・所有するPixel 7での全消去を伴う実機試験・本番決済E2Eです。GrapheneOSまたはGoogleの公式・提携サービスとは表示しません。

再接続時にSecret Storeへ入力する名前だけを記録します。値はGitHubへ保存しません。

```text
PUBLIC_SITE_URL
SALE_MODE
SELLER_NAME
SELLER_REPRESENTATIVE
SELLER_ADDRESS
SELLER_PHONE
SUPPORT_EMAIL
SUPPORT_HOURS
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
ORDER_FROM_EMAIL
LEAD_FROM_EMAIL
SUPPORT_FROM_EMAIL
OPS_ALERT_EMAIL
ADMIN_USER_ID
RATE_LIMIT_SALT
GRAPHENEOS_RELEASE_PIN
GRAPHENEOS_RELEASE_PREVIOUS
PIXEL7_DEVICE_TEST_APPROVED
LIVE_PAYMENT_E2E_APPROVED
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_BOT_USERNAME
OWNER_TEST_COUPON_ENABLED
OWNER_TEST_COUPON_HASH
OWNER_TEST_COUPON_MAX_REDEMPTIONS
X_USER_ACCESS_TOKEN
X_POSTING_ENABLED
```

D1の再構築順は`apps/private-pixel-site/drizzle/0000_public_eddie_brock.sql`から`0005_sour_garia.sql`までです。復旧時は`SALE_MODE=disabled`のまま新規DBへmigrationを適用し、暗号化された所有者管理backupをimportして、注文件数・未使用利用権・未処理Webhook・未解決サポートを照合します。D1 database ID、実データ、注文情報、端末のIMEI・シリアルはGitHubへ置きません。

関連資料:

- [販売サイトREADME](../apps/doraemon-marketing-site/README.md)
- [X・LP・メール運用開始チェック](doraemon-marketing-launch.ja.md)
- [Telegram Bot接続runbook](telegram-bot-setup.ja.md)
- [provider設定と未完成境界](owner-tools-setup.ja.md)
- [所有者設定とsecret分離](owner-account-intake.ja.md)
