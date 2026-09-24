# Mr. Automation Hub / avocadomini

Mr.は、自社開発・外部の自動化ツールをまとめ、Web・アプリ・専用作業環境から利用するハブを目指します。新しい基本利用料の設計は**8.88 USD/月（電気代プラン）・利用者売上の分配0%**です。従量のAI費用・外部有料ツールは別枠とし、実際の月額請求はまだ接続していません。

今回の基盤には、15件のツール在庫と検索、利用状態の区別、導入候補を仕事一覧へ保存する機能、ココナラの提案文・納品チェックのオフライン作成、共通のローカルrunnerを追加しました。Webの新版は検証・保存済みで、既存の公開サイトへの反映は所有者の確認待ちです。専用OSイメージ、署名済みデスクトップ配布、全ツールの実行、収益の自動発生を完成済みとは扱いません。

- [新しいサービス設計と実装範囲](docs/mr-automation-hub-foundation.ja.md)
- [共通ツールカタログと料金契約](packages/automation-hub/README.md)
- [ローカル実行の使い方](services/automation-runner/README.md)
- [OS実行環境の基盤](deploy/automation-os/README.md)

新版Webは`/`がツールハブ、既存の生活・仕事・収支・Service Cell・接続・配給・データ管理は`/life`です。GitHub未反映だった最新Sitesの追加実装も保全し、同じ認証と保存データを使用します。`/owner`は専用管理権限のある画面ではなく、設計資料と本人データの集計です。`npm run test:automation-hub`とSite内の`npm test`でこの基盤を検証できます。既存Telegramサービスの説明は以下に残します。旧無料枠・Stars・単品販売・Stripe商品は、新しい月額プランへの移行完了まで別の既存仕様として扱います。

avocadominiは、仕事の整理、教材作成、内容確認、販売準備、集客、顧客案内、入金確認、納品、分析、報酬分配を、Telegramから動かす仕事の司令室です。

システム全体の正式名は`Rockstar_ibot`です。`Mr. Commerce`と`Doraemon`は互換性のため残る内部package名で、利用者向けの製品名は「avocadomini」です。

> 現在の本番範囲は、10種類から1〜3種類を選び、Telegramへ自然文で依頼し、隔離されたCodexから下書き・確認結果を受け取り、修正・完了・再開するところまでです。外部providerの認証情報や公式readbackがない操作は成功扱いにしません。

<!-- hourly-repository-sync:start -->
## 毎時リポジトリ同期

| 項目 | 状態 |
|---|---|
| 最終自動同期 | 2026-09-04 23:00 UTC |
| 対象ブランチ | `main` |
| 追跡ファイル | 7,076件 |
| 実行receipt | [run 33928034327](https://github.com/k999ln/Mr./actions/runs/33928034327) |

> この範囲は毎時のGitHub Actionsが更新します。製品説明や運用状態は、根拠となる変更と同じcommitで本文を更新します。
<!-- hourly-repository-sync:end -->

[正式サイト](https://effect-os-verified.kirin-999.chatgpt.site/start) · [画面ジャック対策](docs/automation-browser-screen-takeover-prevention.ja.md) · [自動化管理画面](https://mr-automation-control-20260904.kirin-999.chatgpt.site) · [新チャット用引き継ぎ](docs/CHAT-HANDOFF.ja.md) · [接続台帳](docs/owner-account-registry.ja.md) · [外部変更履歴](docs/operations-change-log.ja.md) · [利用者journeyとrelease gate](docs/avocadomini-release-gates.ja.md) · [プロジェクト索引](docs/PROJECT_MEMORY_INDEX.ja.md) · [Rockstar_ibot One Hub](https://life-manager-one-hub.kirin-999.chatgpt.site) · [GitHub](https://github.com/k999ln/Mr.) · [Telegram Bot設定](docs/telegram-bot-setup.ja.md) · [製品設計](project.md) · [MIT License](LICENSE)

## TelegramからCodexへ指示を送り、結果を受け取る

一般利用者は`@avocadominibot`の道具別ルームか総合司令室へ普通の文章を送ると、Mac上のCodexが読み取り専用の空の一時folderで下書き・確認結果を作り、同じTelegramへ返します。Kai専用の運営・承認・監視は`@Rockstar_ibot`へ分離する設計で、現時点ではowner Botのlive接続receiptが未完了です。`/codex`はMr.の調査用、`/codex edit`は明示したrepository変更用です。接続と安全境界は[Telegram ↔ Codex 引き継ぎ](docs/codex-telegram-bridge.ja.md)にまとめています。

利用者向けの共通入口は`/start`、`/home`、`/tools`、`/jobs`、`/today`、`/help`です。Core起動時にBotFatherの一覧と説明を自動照合し、差分だけ修復します。データベースが一時停止しても`/help`の説明は返します。

Mac上の定期ブラウザはheadless固定で、通常は画面や入力フォーカスを奪いません。例外的に可視操作が必要なときだけ、`bin/lm-screen approve <loop-id> --seconds 60..900`の後に`bin/lm-screen run <loop-id> -- <command>`で単発実行します。`bin/lm-screen revoke`で実行中のhandoffを停止でき、承認は再利用されません。

## 初めて読む人向け：本番に必要なもの

Mr.は、1つのサイトだけで完結するアプリではありません。利用者が見るサイト、Telegramで返事をする裏側のサーバー、情報を保存するデータベースが連携します。

### 「データベース（DB）」とは

データベースは、サイトやBotが使うオンラインの台帳です。Excelの表に近いものですが、アプリが自動で読み書きします。Mr.では、TelegramのユーザーID、選んだ機能、利用条件への同意、利用履歴、決済や実行の結果などを保存します。利用者が普段直接見るサイトではありません。

### 外部サービスの役割と確認状況

次の表は、2026-09-05 01:10 JSTまでにこの導入環境から確認した状態です。「未確認」はサービスが存在しないという意味ではなく、この作業環境から所有者用の管理画面や設定を確認できていないという意味です。

| サービス | 役割 | 確認状況 |
|---|---|---|
| GitHub `k999ln/Mr.` | Mr.の正本コード。対象ブランチは`main` | 接続済み。`vvvv`は使用しない |
| Codex Sites / サイト公開 | `avocadomini`の利用者向け正式サイト | owner確認済み。version 44、deployment成功、`/start` HTTP 200 |
| Vercel | 古い`doraos.vercel.app`利用者を正式サイトへ案内 | accountとprojectを確認済み。全path/queryをCodex SitesへHTTP 307で転送。GitHubからの自動deployだけ未設定 |
| Railway | customer Botの`/start`、Job受付、返信を処理する裏側のサーバー | `avocadomini-production` / `avocadomini-core`稼働中。deployment成功、health HTTP 200、build SHA確認済み。owner Bot用serviceは未配備 |
| Supabase | Coreが使うデータベース。選択、Job、状態、receiptを保存 | `Kai Mr` / `avocadomini-production`へ必要migration適用済み。RLSとservice-role-only権限をreadback済み |
| Telegram customer Bot / BotFather | 顧客受付、Webhook、利用者への返信 | `@avocadominibot`、`getMe`成功、Webhook登録済み。token rotationと実Job E2Eが未完了 |
| Telegram owner Bot / BotFather | Kai専用の承認、監視、停止、Life OS | `@Rockstar_ibot`を正とする。独立deployment、`getMe`、Webhook、allowlist、実送受信receiptは未完了 |
| Resend | メールや診断PDFの送信 | Telegram開始導線には不要。メール機能を使うときだけ送信キーと送信元ドメインが必要 |
| Stripe | 有料機能の決済 | 設定済みの可能性はあるが、現在の管理画面からの公式確認は未完了。無料の3機能選択には不要 |

### 最初のTelegram導線だけに必要な情報

「サイトで1〜3個選ぶ → Telegramを開く → `/start`で選択内容を反映する」だけなら、次の3つが必要です。

1. 裏側のサーバーを置く場所（Railwayなど）と、その管理権限
2. データベース（Supabase）のプロジェクトと、migrationを適用できる権限
3. BotFatherで作ったTelegram Botをサーバーから動かす権限

Bot token、Webhook secret、Supabaseのservice role keyなどの秘密値は、GitHub、README、issue、チャットへ貼りません。RailwayやSupabaseの環境変数、Keychain、秘密情報保管場所へ保存します。

### 全機能を使う場合の追加サービス

10個の販売機能をすべて有効にする場合は、上記に加えて、メール送信のResend、決済のStripe、Google Calendar・MapsやAI provider、音声通話のTelnyx、必要に応じたブラウザ実行基盤などを、それぞれKai所有のアカウントで接続します。これらは、最初の無料Telegram導線を確認するための必須条件ではありません。

各サービスのアカウント、project、秘密値の保管先、確認日時、receipt、未確認事項は[avocadomini外部サービス接続台帳](docs/owner-account-registry.ja.md)と[新チャット用引き継ぎ](docs/CHAT-HANDOFF.ja.md)に集約しています。新しいチャットではこれらを先に読み、確定済みの接続を聞き直しません。

### 正本repoとclone方法

GitHubの正式な正本は末尾にピリオドがある`k999ln/Mr.`です。clone URLが`Mr..git`になるのは正常です。修正、commit、push、deployはこのrepoの`main`だけを対象にします。旧repo`vvvv`を修正先・push先・deploy先として使いません。

## X・LP・メール販売導線

公開サイトの正本は`apps/doraemon-marketing-site`です。無料診断PDF、同意付きフォーム、UTM、Resendの即時送付と4通ステップメール、配信停止まで実装しています。

- X投稿: `marketing/x/posts.json`（30日×3件）
- 人が読むカレンダー: `marketing/x/30-day-calendar.ja.md`
- 無料資料: `apps/doraemon-marketing-site/public/resources/sales-automation-checklist-v1.pdf`
- メール設計: `marketing/email/sequence.ja.md`
- 本人作業と公開前検査: `docs/doraemon-marketing-launch.ja.md`

実投稿、一般公開、決済、メール配信はKai所有のX、Sites、Stripe、Telegram、Resend、Turnstileを接続し、各receiptを確認してから有効化します。

## 10個の道具

1. 依頼を整理
2. 教材を作る
3. 内容を検証
4. 売り場を作る
5. 集客を広げる
6. 見込み客を育てる
7. 入金を確認
8. 商品を届ける
9. 成果を測る
10. 報酬を分ける

単なる一斉送信BOTではありません。人の承認、重複実行防止、providerの公式結果、施策と長期成果の記録を一つのworkflowにします。

## 何ができるか

| 領域 | 主な機能 | 現在の状態 |
|---|---|---|
| Telegram顧客Bot | 受付、道具選択、依頼、進捗、納品 | `@avocadominibot`を接続済み。token rotationと実Job E2Eが残る |
| Telegram owner Bot | 承認、停止、状態確認、Life OS | `@Rockstar_ibot`をKai専用で別deploymentへ接続する設計。live receiptは未完了 |
| Rockstar_ibot Core | 予定、移動、通知、生活・仕事・収支workflow | 一部は実運用、一部はprovider接続待ち |
| MetaMask送金先 | Core PanelからBase MainnetのUSDC受取addressを所有署名で登録 | 実装済み。DB migration適用後に有効。送金権限は要求しない |
| Rockstar_ibot One Hub | Today、Body/Mind、Money、Work、Connections、Proof | 所有者限定で稼働 |
| Service Cells | 作成、集客、販売、学習、納品の定型service | executorは段階実装中 |
| Rockstar_ibot | 商品、決済観測、権限、同意、施策、成果の統合 | 正本data modelと安全な保存境界を実装済み |
| 外部AI catalog | MCP等のmanifest、権限、digest検証 | metadataのみ。install・実行・課金は無効 |
| iOS | native SwiftUIクライアント | PreviewとSimulator検証まで完了 |
| ローカルruntime | API、scheduler、worker、Postgres、object store | Docker構成あり。fresh Core schemaは未完成 |

## 2つのTelegram Botと担当

Telegramは、Kai専用の`@Rockstar_ibot`と顧客向け`@avocadominibot`の2 Botを正とします。customer Botは接続確認済み、owner Botは独立deploymentと公式readbackが未完了です。Mr. Bot、BotMother、Baby、Life Guardは追加Botではなく、`@avocadominibot`内の会話窓口です。

~~~text
@Rockstar_ibot（Kai専用owner Bot）
└── 運営・承認・監視・停止・Life OS

@avocadominibot（顧客向け公開Bot）
├── 会話担当
│   ├── Mr. Bot       全体司令塔
│   ├── BotMother     生活必需品・必要サービス支援
│   ├── Baby          外部の仕事・案件による収益化
│   └── Life Guard    安全・権限・証拠確認
├── 業務ワークスペース
│   └── Rockstar_ibot 自分の商品・決済・顧客・納品
└── 話し方
    └── 16スタイル    担当や権限を変えない会話表現
~~~

| 名前 | 開き方 | 担当する用途 | 担当しない用途 |
|---|---|---|---|
| Mr. Bot | `/main` | 未分類の相談、予定・生活・仕事・お金の全体整理、担当の振り分け | 販売の詳細操作や専門審査 |
| Rockstar_ibot | `/commerce` | 自分の商品、販売施策、注文、決済、購入者、同意、納品、販売分析 | 外部案件探し、生活支援、安全審査そのもの |
| BotMother | `/mother` | 必需品・必要サービス支援の申請整理 | 現金給付、販売CRM、無承認発注 |
| Baby | `/baby` | 自分のスキルに合う外部案件、提案、作業、報酬確認 | 自分の商品販売と購入者管理 |
| Life Guard | `/guard` | 安全、権限、privacy、証拠、完了条件の横断検査 | 販売・仕事・支援の実行主体 |
| 会話スタイル | `/style` | 同じ担当の伝え方・考え方を変更 | 機能追加、権限追加、心理診断 |

### 重複して見える入口の違い

| 入口 | 違い |
|---|---|
| `/status` / `/today` / `/analytics` | `/status`はLife Manager全体、`/today`は販売部門の要対応、`/analytics`はreceipt確認済みの販売結果 |
| `/baby` / `/commerce` | Babyは外部の仕事で稼ぐ相談、Rockstar_ibotは自分の商品を売る業務 |
| 商品作成後の発売ボタン / `launch_offer` | 同じ統合発売フロー。ボタンは入力を省く近道 |
| `/delivery` / `deliver_order` | `/delivery`は単独の納品案、`deliver_order`は支払確認・納品・通知をつなぐ統合フロー |
| 承認ボタン / `/approve` | 同じ承認処理。コマンドはボタンが使えない場合の代替入口 |
| `/tools`で選択 / provider接続 | 選択は利用枠の指定だけ。資格情報・adapter・provider確認が揃って初めて接続済みになる |

## Rockstar_ibot

Rockstar_ibotはシステム全体の名前であり、Telegramを操作面にした販売・意思決定基盤です。同名の`@Rockstar_ibot`はKai専用owner control plane、`@avocadominibot`は顧客向けcustomer and revenue planeです。販売の業務ワークスペースはcustomer Botから`/commerce`で開きます。

~~~text
商品・Offer・約束を版として固定
        ↓
施策候補を作成し、承認者が選択
        ↓
投稿・通知・決済・権限付与を実行
        ↓
providerの公式結果を観測
        ↓
購入・返金・継続・解約・不一致を記録
        ↓
施策と長期Outcomeを検証
~~~

### 実装済みの正本data

- 変更不能なOffer VersionとPromise Version
- Order、Payment、Refund、Chargebackの観測
- 購入者Entitlementのdesired stateとobserved state
- Consent、Purpose、Notice Version、Withdrawal
- Decision Opportunity、全候補、却下、選択確率、承認
- Experiment、holdout、Outcome、純経済価値への参照
- Webhook inbox、lease、retry、reconciliation evidence
- 承認主体と承認policyの仮名化参照

個人を販売者横断で追跡するIDは作りません。raw email、電話番号、token、password、会話本文を意思決定台帳へ保存せず、販売者単位の仮名参照と許可済み集計結果を使います。

### 保証する整合性

- 同じprovider Webhookを100回受けても1つの観測へ収束する
- 期限切れleaseを持つ古いworkerは結果を確定できない
- Refund／Chargebackは対応する元Paymentだけを取り消せる
- 累計取消額は元Paymentを超えない
- Orderは正確なOffer／Promise Versionへ固定される
- 存在しない旧Versionをsupersedes先にできない
- 実provider readbackなしに売上や完了を表示しない
- canonical evidence storeではtenant、merchant、idempotency、authorizationの境界を分離する

詳細は[Rockstar_ibot統合方針](docs/revenue-assurance-integration.ja.md)を参照してください。

## 5分で確認する

### 必要環境

- Git
- Node.js 20.19.0以上
- npm
- Docker（ローカルstackを起動する場合）

### 1. clone

このリポジトリはsubmoduleを含みます。

~~~bash
git clone --recurse-submodules https://github.com/k999ln/Mr..git
cd Mr.
~~~

すでにclone済みの場合:

~~~bash
git submodule update --init --recursive
~~~

### 2. Commerceテスト

~~~bash
cd apps/rockstar_ibot
npm ci
npm run test:commerce
~~~

現在のCommerce suiteは、Telegram承認、tenant分離、決済観測、Webhook再送、権限、同意、意思決定を含む125件です。server依存がない環境ではHTTP統合確認1件だけをskipします。

### 3. ローカルstack

リポジトリrootで実行します。

~~~bash
./scripts/local-up.sh
./scripts/local-up.sh status
./scripts/local-up.sh logs
~~~

停止:

~~~bash
./scripts/local-up.sh down
~~~

ローカルstackはPostgres、object store、API、scheduler、workerを起動します。ただし、Telegram、Supabase、Calendar等は導入者所有の外部設定を使うため、起動だけで全機能が接続済みになるわけではありません。

## 初期設定

### 秘密情報の扱い

秘密値をGit、README、issue、チャットへ貼らないでください。最初の`./scripts/local-up.sh`実行時に、local stack用の`deploy/local/.env`がmode 0600で作成され、MinIO passwordもランダム生成されます。`.env.example`をそのまま`.env`へcopyしないでください。

その他の秘密値はmode 0600のprivate env、Keychain、またはtenant vaultへ保存します。job、event、manifestにはcredential本体ではなく参照だけを渡します。

### 導入者所有providerを検査する

~~~bash
npm run owner:check -- --profile base,calendar,voice,billing
~~~

このコマンドは値を表示せず、必要な変数名と形式を検査します。provider所有権、残高、OAuth同意、migration適用、Webhook到達性までは証明しません。

- [設置者アカウント入力票](docs/owner-account-intake.ja.md)
- [provider設定一覧](docs/owner-tools-setup.ja.md)

### Telegram Botを接続する

runtimeの標準は、導入環境ごとにBotFather Botを1つ所有する`byob_single`です。Kaiの2 Botは2つの独立deploymentへ1 Botずつ接続し、同じprocessへ2 tokenを入れません。

~~~bash
npm run telegram:configure -- \
  --public-url https://your-rockstar-ibot.example \
  --register
~~~

tokenは非表示promptで入力します。WebhookにはTelegramから到達できるHTTPS URLが必要です。別Botの既存Webhookは、明示許可なしに上書きしません。

## Stripeで購入してTelegramへ接続する

購入画面は`GET /doraemon`です。購入者はStripeのホスト型決済へ移動し、支払い後に`GET /doraemon/complete?session_id={CHECKOUT_SESSION_ID}`へ戻ります。成功画面を見ただけでは権限を付与しません。

~~~text
/doraemonで購入開始
  → 公開用client_reference_idを発行
  → Stripe Payment Linkで決済
  → 署名済みcheckout.session.completed / async_payment_succeededを受信
  → 同じブラウザだけに一回限りTelegramリンクを表示
  → /start doraemon_<token>を原子的に消費
  → 購入権限とTelegram accountを接続
~~~

接続tokenの生値はDBへ保存せず、SHA-256 hashだけを保存します。支払前、期限切れ、別Telegramで使用済み、Webhook未確認の場合は接続を拒否します。

### Stripe側の設定

1. 自分名義のStripe accountで商品とPayment Linkを作る。
2. Payment Linkの支払後動作を`redirect`にし、URLを`https://<LM_PUBLIC_URL>/doraemon/complete?session_id={CHECKOUT_SESSION_ID}`にする。
3. Webhook endpointを`POST https://<LM_PUBLIC_URL>/api/stripe/webhook`に設定し、`checkout.session.completed`、`checkout.session.async_payment_succeeded`とsubscription lifecycle eventを購読する。
4. `apps/rockstar_ibot/migrations/2026-09-01-lm-doraemon-purchase-claims.sql`をSupabaseへ適用する。
5. private envへ次を保存する。秘密値をGitへ追加しない。

~~~dotenv
LM_DORAEMON_PAYMENT_LINK=https://buy.stripe.com/...
STRIPE_WEBHOOK_SECRET=whsec_...
LM_TELEGRAM_BOT_TOKEN=
LM_TELEGRAM_BOT_USERNAME=
LM_TELEGRAM_WEBHOOK_SECRET=
~~~

日本のStripe標準料金は初期費用・月額料金なしですが、カード決済成功ごとに3.6%の決済手数料が発生します。Payment Links自体は標準Payments料金に追加料金なしで含まれます。料金は変更され得るため、本番開始前に[Stripe日本料金](https://stripe.com/jp/pricing)を再確認してください。

## Telegram owner操作

- /commerce — Rockstar_ibotの販売メニュー
- /tools — connector選択・状態確認
- /product — 商品workflowの開始
- /campaign — campaign workflowの開始
- /approve &lt;id&gt; — 承認待ちworkflowの承認
- /pause — 新しい実行の停止

これらは最終的に`@Rockstar_ibot`へ置くowner-only操作です。owner Botの移行完了までは顧客へ公開せず、`/approve`と`/pause`は連携済み所有者のTelegram個人chatで、実際のuser IDとchat IDが一致するときだけ処理します。group、未連携actor、actor差し替えは副作用前に拒否します。

connectorを選択しただけでは接続済み・実行可能にはなりません。credential reference、adapter、必要capability、provider確認が揃うまでworkflowはblockedまたはapproval待ちのままです。

## アーキテクチャ

~~~text
Telegram / Hub / iOS
        │
        ▼
Rockstar_ibot API・承認境界
        │
        ├── Core workflows
        │
        └── Rockstar_ibot canonical stores
              ├── Offer / Promise
              ├── Payment observations
              ├── Entitlement reconciliation
              ├── Consent / Rights
              └── Decision / Outcome
        │
        ▼
Durable queue・effect fence・append-only ledger
        │
        ▼
交換可能なprovider adapter
        │
        ▼
公式readback・receipt・reconciliation
~~~

外部providerを正本にしません。Stripe、Telegram Stars、LMS、Community、CRM等は、commandを実行して観測を返す交換可能なadapterとして扱います。

## 評価用OSS submodule

vendor/commerce-upstreams/には次のsourceを固定commitで配置しています。

| OSS | 評価対象 |
|---|---|
| Formance Ledger | money ledger |
| Temporal | 長時間workflow |
| OpenFGA | authorization |
| grammY | Telegram adapter |
| Payload | content・evidence revision |
| GrowthBook | experiment |
| Casdoor | operator IAM |
| Chatwoot | support adapter |
| Medusa | commerce adapter |

これらは評価用であり、本番採用済みという意味ではありません。license、security advisory、telemetry、tenant isolation、backup、export、削除、差し替えを確認してから独立serviceまたはadapter behind portとして採用します。固定commit一覧は[commerce-upstreams.json](config/commerce-upstreams.json)にあります。

## テスト

### Commerceのみ

~~~bash
cd apps/rockstar_ibot
npm run test:commerce
~~~

### Rockstar_ibot全体

~~~bash
cd apps/rockstar_ibot
npm test
~~~

既知事項: 現在の基準commitには、旧OpenClaw／Anicca pathを検出するtest:legacy-pathsの既存失敗があります。Commerce変更とは独立しており、配布前に別途解消が必要です。

## 現在の制約

| 項目 | 状態 |
|---|---|
| Commerce正本schema・store・test | 実装済み |
| Telegram承認actor検証 | 実装済み |
| provider Webhookのdurable inbox | 実装済み |
| Core PanelのMetaMask送金先登録 | 実装済み。Base Mainnet（chain ID 8453）固定、5分の一回限り署名challenge、session・Origin・CSRF・tenant境界あり。自動送金は別機能 |
| Stripe／Telegramの本番credential | 導入者設定待ち。秘密値なしではfail closed |
| Stripe購入→Telegram接続 | 実装済み。Supabase migration・Payment Link redirect・Webhook設定後に有効 |
| その他Commerce provider routes・adapter | 未接続。catalog、選択、workflow境界まで実装済み |
| fresh Supabase用Core baseline schema | avocadomini入口用の最小bootstrapは実装・適用済み。Core全機能用baselineは未完成 |
| HubからCoreへの本番outbox consumer | 未完成 |
| shared multi-bot SaaS registry | 未完成 |
| `@Rockstar_ibot` owner deployment | 未完成。`getMe`、Webhook、Kai allowlist、owner command、実送受信receiptが必要 |
| 本番mobile API・APNs・StoreKit | 未完成 |
| 全Service Cell executor | 一部のみ |
| 3,000人規模の分離・負荷試験 | 未証明 |
| 一般公開 | 未承認 |

設定値が存在することと、本番で安全に動作することは別です。外部資格情報と公式readbackがない機能はfail closedのまま維持します。

## リポジトリ構成

| Path | 役割 |
|---|---|
| apps/rockstar_ibot/ | API、Telegram、scheduler、worker、Commerce |
| apps/rockstar_ibot-hub/ | Rockstar_ibot One Web Hub |
| apps/rockstar_ibot-ios/ | native SwiftUI iOS client |
| apps/doraemon-marketing-site/ | 公開販売サイト、開始導線、法定・privacyページ |
| apps/dora-launch-blueprint-site/ | 立ち上げ設計書の共有サイトとPDF |
| apps/mcp-bot-hub-patent-site/ | MCP Bot Hub特許構想の共有サイトとPDF |
| apps/rockstar_ibot/migrations/ | Core・Commerce schema変更 |
| runtime/ | durable job、effect fence、economic runtime |
| skills/ | 再利用可能なagent能力 |
| services/ | compute、settlement、共有service |
| integrations/ai-tools/ | 外部AI package manifestとcatalog |
| vendor/commerce-upstreams/ | 固定commitの評価用OSS |
| config/ | machine-readable policy・catalog |
| docs/ | 設計、runbook、監査、証拠 |
| specs/ | 実装計画と設計履歴 |

## データ・安全契約

- 既存Telegram projectionはtenant単位、新しいcanonical evidence storeはtenant・merchant単位で分離する
- 販売者をまたぐ人物tracking IDを作らない
- 合法かつ契約済みの業務dataだけを扱う
- raw PII、credential、会話本文を意思決定・成果台帳へ保存しない
- 同意目的、通知版、撤回、期限を別々に記録する
- 未観測、pending、falseを混同しない
- 成果物と外部readbackに結びつくreceiptなしに完了報告しない
- 取消不能な外部操作と金融操作は現在の明示承認なしに実行しない
- 売上、検索順位、健康、投資成果を保証しない
- 個人追跡、標的選定、兵器用途には使用しない

## 主要ドキュメント

- [project.md](project.md) — 製品設計とroadmapの正本
- [Rockstar_ibot統合方針](docs/revenue-assurance-integration.ja.md)
- [Telegram Bot接続runbook](docs/telegram-bot-setup.ja.md)
- [provider設定と未完成境界](docs/owner-tools-setup.ja.md)
- [公開情報とsecretの分離](docs/owner-account-intake.ja.md)
- [外部サービス運用変更履歴](docs/operations-change-log.ja.md)
- [プロジェクト索引](docs/PROJECT_MEMORY_INDEX.ja.md)
- [サイト外部接続・再接続台帳（avocadomini / PRIVATE/PIXEL）](docs/doraemon-site-reconnection.ja.md)
- [2タスク全成果インベントリ](docs/DORA_OS_全成果インベントリ_2026-09-02.md)
- [チャット削除・復元監査](docs/maintenance/chat-deletion-readiness-2026-09-04.ja.md)
- [外部AI package仕様](integrations/ai-tools/README.md)
- [SOUL.md](SOUL.md)・[THESIS.md](THESIS.md)

## コントリビューション

1. 変更対象に近いAGENTS.mdと設計文書を先に読む
2. secret、実顧客data、credential付きURLをcommitしない
3. 外部作用は明示承認、idempotency、receipt、reconciliationを設計する
4. 実装に対応するfocused testを追加する
5. git diff --checkと該当testを通す
6. 実装済みと未接続をREADME・docsで区別する

## ライセンス

MIT License。詳細は[LICENSE](LICENSE)を参照してください。
