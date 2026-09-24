# Rockstar_ibot — 製品設計と方向性

**最終更新:** 2026-09-05

**対象:** Rockstar_ibot全体、Rockstar_ibot One、First 3000

## 最新の優先仕様: Mr. Automation Hub（2026-09-05）

Kaiの最新依頼により、製品の中心を**内製・外部の自動化ツールを管理する共通ハブ**へ移す。Web、インストール型Webアプリ、専用OS作業環境を同じ契約の入口とし、Telegramは依頼・通知・確認・承認の補助入口とする。月額の基本利用料は**8.88 USD（電気代プラン）**、利用者売上の分配は0%。AIや外部サービスの従量費を基本料と分離する。この判断は下記の旧単品Cell優先・Telegram中心・将来subscriptionの記述より優先する。旧顧客の課金状態は暗黙移行しない。

実装済みの今回のbaseは、15件の共通カタログ、利用状態別のWebライブラリ、導入確認のowner-scoped保存、ココナラ提案文・納品チェックのオフライン作成、認証されたloopback runner、ネットワーク無効のDocker構成、月額契約の純粋な利用権判定である。Webの既存機能は`/life`へ保持する。OSイメージ、署名済みnative desktop、外部ツール実行、Web/Coreのidentity統合、月額の実請求は未完成。

Core / Hub / Service Cells、権限・receipt・台帳、MCPの固定digest審査、二重実行防止の良い設計を継承する。旧所有者のruntime隔離は解除しない。詳細と次の実装順は[`docs/mr-automation-hub-foundation.ja.md`](docs/mr-automation-hub-foundation.ja.md)を正本とする。

以下は既存サービスの運用状態・継承する設計・過去の段階展開計画である。料金や入口の優先順位が異なる場合は上記の最新仕様を使う。

**状態:** Web HubはToday・Body・Mind・Money・Work・Services・Connections・Proof・export・再試行可能なpilot削除経路まで実装済み。Xcode/SwiftUI iOS clientはPreview面とSimulator検証まで実装済み。TelegramはKai専用owner Bot `@Rockstar_ibot`と顧客向けBot `@avocadominibot`の2 Botを運営上の正本とする。現在の公式receiptは`@avocadominibot`の`getMe`、Webhook、6コマンドまでで、`@Rockstar_ibot`の現行credential、Webhook、allowlist、実送受信は未確認である。runtimeは`1 deployment = 1 Bot`の`byob_single`まで実装済みのため、2 Botは同じprocessへtokenを追加せず独立deploymentで接続する。共有processへ多数の所有者Botを格納するregistryは未実装。必需品支援は現金給付を停止し、privacy最小化request、cash-like拒否、人間・提携団体の承認、vendor-direct調達planまで実装済みだが、実販売業者・在庫・配送・care providerは未接続。外部AIはMCP Registry互換manifest、Rockstar_ibot権限overlay、運営digest registry、Web/iOS共通カタログ生成まで実装済みだが、実行は意図的に無効。Product Hunt候補検索connectorは公式API限定・候補分離・ローカル事故防止gateまで実装済み。default configは通信前に停止し、商用許諾と本番制御が未完成のためproduction利用は未承認。添付削除のdurable crash回収、既存Coreとの統一アカウント、iOS本番API、Service Cellと外部AIの隔離実行、課金、3,000人規模のacceptanceは未完成。

## この文書の役割

この`project.md`を、Rockstar_ibotの製品設計と方向性の正本とする。

- `README.md` / `README.ja.md`: 基本情報、現在できること、導入方法、主要リンク
- `project.md`: 製品判断、architecture、段階配信、容量、収益、roadmap
- `config/service-portfolios/default-3000.json`: 機械可読な標準ポートフォリオ契約
- `integrations/ai-tools/`: 外部AI packageの配布manifest、権限overlay、運営審査registry
- `docs/`: 個別仕様、監査、実行証拠、詳細runbook
- `specs/`: 実装計画と設計履歴

### 命名契約

- システム全体の正式名と文書上の表示は`Rockstar_ibot`とする。
- repository内のdirectory・package・command用slugは`rockstar_ibot`、Swiftなどの型名は`RockstarIbot`とする。hostnameやMCP server nameなどunderscoreを許可しない規格では`rockstar-ibot`を使う。
- 利用者向けブランドは`avocadomini`、顧客向けTelegram Botは`@avocadominibot`とする。
- Kai専用の運営・承認・監視用Telegram Botは`@Rockstar_ibot`とする。システム名`Rockstar_ibot`と同じ文字列だが、文書では必要に応じて「システム」と「owner Bot」を書き分ける。
- 2 Botというowner決定と、外部接続済みという事実を混同しない。現在接続receiptが揃うのは`@avocadominibot`だけであり、`@Rockstar_ibot`は公式readback完了まで未接続として扱う。
- `LIFE_MANAGER_*`、`life_manager`、既存Hub URL、過去repository URLのように外部状態や保存済みdataへ結び付く値は互換識別子である。移行・readback・rollbackが揃うまで削除や無断置換をしない。

GitHubもREADMEには「何をするか、なぜ有用か、どう始めるか」など開始に必要な情報を置き、長い説明は別文書へ分けることを案内している。この役割分離を以後維持する。[GitHub Docs — リポジトリのREADMEについて](https://docs.github.com/ja/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

## avocadomini本番slice（2026-09-05）

Rockstar_ibot全体の長期構想と、いま利用者へ出すavocadominiの範囲を混同しない。現在の本番sliceは、10種類から1〜3種類を選び、顧客向け`@avocadominibot`の総合司令室または道具別ルームへ自然文で頼み、隔離されたCodex Jobから下書き・確認結果を受け取り、修正・完了・再開するところまでである。

初回は`/start`、再開と迷子防止は`/home`、`/tools`、`/jobs`、`/today`、`/help`を共通入口とする。Coreは起動時にWebhook、Bot本人、上記コマンド一覧、公開説明を公式APIで照合し、差分だけ自動修復してreadbackする。Supabaseが一時停止しても`/help`の使い方だけは返す。

サイト選択、`@avocadominibot`のTelegram Webhook、Supabaseの永続queue、Railway Core、Mac bridgeは配備済み。公開、第三者への送信、決済、返金、権限付与、送金は、このsliceのJobから自動実行しない。対応provider、本人の個別承認、provider公式receiptが揃った機能だけ、別の段階で実行可能にする。「10種類が表示される」と「10種類の外部provider操作が全部接続済み」を同じ意味にしない。

`@Rockstar_ibot`はKaiが失敗Job、承認待ち、粗利、返金、停止状態、Life OSを扱うowner control planeとする。顧客獲得や一般supportには使わない。現在はこの役割を設計上確定した段階で、BotFather identity、独立Webhook、Kai allowlist、owner commandのlive receiptは未完了である。

Mac上の定期browser loopは`screen_impact=none`を機械検証し、headlessだけを許可する。可視GUIが必要な例外は、ownerが単発で承認した60〜900秒の`interactive_handoff`だけとし、再利用、同時実行、KeepAliveへの昇格を拒否する。実行面、承認期限、開始・終了・取消は秘密値やcommand本文を含めずローカル監査へ残す。詳細は[`docs/automation-browser-screen-takeover-prevention.ja.md`](docs/automation-browser-screen-takeover-prevention.ja.md)を正本とする。

利用者journeyとrelease gateの詳細は[`docs/avocadomini-release-gates.ja.md`](docs/avocadomini-release-gates.ja.md)、外部環境の実receiptは[`docs/owner-account-registry.ja.md`](docs/owner-account-registry.ja.md)を正本とする。

## 結論

Rockstar_ibotは、何でも受けるAI受託業者から、範囲・入力・成果物・品質・価格を固定したサービスを提供する基盤へ移行する。

製品の中心は次の4層である。

1. **Rockstar_ibot Core** — 目標、identity、proof、money、safetyを共有する。
2. **Rockstar_ibot One Hub** — ユーザーが自分のサービス構成を一画面で選び、連携し、依頼し、履歴を確認する。
3. **Service Cells** — YouTube台本、SEO、LP、営業、顧客分析、納品確認など、独立して購入・実行・検査できる商品。
4. **Essentials Distribution** — 本人同意と必要性を権限者が確認し、検証済み業者から必要品・必要サービスを直接届け、購入・発送・受領を別々に検証する支援面。

> 考える、作る、育てる、売る、届ける、学ぶを一つに。

Rockstar_ibotは製品名であり、会社名や内部namespaceと混同しない。ローカル版とクラウド版も別製品ではなく、同じ契約を異なる実行面で提供する。

## 解決する問題

従来の受託は、案件ごとに営業、ヒアリング、見積り、制作、修正、納品を作り直す。この構造では、人が増えるほど個別対応が増え、品質、原価、納期が安定しない。

Rockstar_ibotは繰り返し現れる仕事をService Cellへ変換する。

```text
受託
案件を探す → 個別交渉 → 毎回違う要件 → 人が制作 → 人が確認 → 納品

サービス
商品を選ぶ → 固定intake → 専用Cellが実行 → quality gate → 証拠付き納品
```

商品化できない仕事を無理に自動化しない。繰り返せない、検査できない、利益が残らない、個別判断が多すぎる仕事は、Cellの範囲を狭めるか提供対象から外す。

## 対象ユーザー

First 3000では対象を次へ絞る。

- independent creator
- freelancer
- solo founder
- 一人または小規模のデジタルサービス事業者
- コンテンツ、知識、Web成果物を販売する人

初期対象外：

- 医療診断・治療
- 自律投資や利益保証
- 要件が確定していない大規模software開発
- 明示許可のないmarketplace・browser automation
- 複雑なenterprise権限管理

全世界を対象にする構想は維持するが、最初から全用途へ広げない。3,000人で再現性、安全性、粗利、support負荷を証明してから対象を増やす。

## 製品構成

### Rockstar_ibot Core

| Core | 役割 |
|---|---|
| Command | 目標、注文、期限、証拠から次にやる一手を決める |
| Proof Vault | 本人情報、利用許可、成果物、receiptをユーザー別に分離する |
| Money Lens | 売上、返金、原価、粗利を実取引から表示する |
| Life Guard | 心身、予算、権限、品質、privacyの境界を守る |

CoreはCellの差し替えによって無効化できない。

### Essentials Distribution — 必需品の現物・サービス支援

Rockstar_ibotの対人支援は受益者への現金給付ではない。食料、水、衛生用品、衣類、一時住居、必須utility、資格を持つ医療・薬局、目的限定の交通、通信、学習・就労用基本用品などについて、privacyを最小化したrequestを作り、本人同意と必要性を権限を持つ人間または提携団体が確認する。承認後だけ検証済み業者または資格を持つproviderへ直接発注し、購入、発送・予約、受領・例外を別のreceiptで記録する。

モデルは不足情報の確認、重複検知、候補業者整理、進捗追跡を補助できるが、支援対象者の選定、重大な適格性判断、受益者への現金・銀行振込・暗号資産・gift card・prepaid card・無制限voucherの提供は行わない。銀行振込基盤自体は、承認済み業者への調達費、事業支払い、顧客返金のために残す。現在はpolicy、調達plan、用途制限付きvendor bank requestまで実装済みで、Kai所有bank credentialによる実振込・実調達・配送は未接続である。詳細は[`docs/superpowers/specs/2026-08-28-rockstar_ibot-essentials-distribution-design.ja.md`](docs/superpowers/specs/2026-08-28-rockstar_ibot-essentials-distribution-design.ja.md)を正本とする。

### Rockstar_ibot One — 標準6枠

| 枠 | デフォルトCell | 結果 | 内部目標時間 |
|---|---|---|---:|
| Create | YouTube Script Writer | 収録可能な台本 | 10分 |
| Grow | SEO Blueprint | 読者中心の検索・記事設計 | 15分 |
| Launch | Landing Page Sprint | CTAが動く1ページLP | 45分 |
| Sell | Sales Objection Reply Builder | 正式条件に基づく返信・提案 | 3分 |
| Learn | User Interview Synthesizer | 根拠付き意思決定memo | 15分 |
| Deliver | Gig Delivery Verifier | 契約と成果物の一致判定 | 10分 |

時間は現時点の公開SLAではない。First 3000で待ち時間、再実行、provider rate limit、人間介入を測定した後に外部保証へ昇格する。

### 個人別Portfolio Overlay

ユーザーは標準6枠を土台に、自分の構成へ変更できる。

変更可能：

- 任意枠の有効化・無効化
- 許可済みvariantへの差し替え
- 言語、tone、brand、出力形式
- 予算、回数、通知頻度
- 検証済みプロフィールの公開可能な事実

変更不可：

- tenant、注文、Cell間の分離
- 未検証の本人情報・実績・数値・URLの禁止
- quality gateとreceipt条件
- 外部操作・継続課金の明示承認
- retention、export、deleteの権利

AIは変更を提案できるが、勝手に有効化、差し替え、課金しない。変更はユーザー承認後にversion付きで保存し、defaultへ戻せるようにする。

## ワンボタン連携の意味

「すべて連携」は、6つのサービスが即座に成果物を完成させるボタンではない。

現在の意味：

1. 認証済みユーザーの標準ポートフォリオを作成する。
2. 6枠を有効化する。
3. 選択内容をD1へ保存する。
4. 監査eventを残す。
5. `portfolio.connected`をdurable outboxへ登録する。

将来の完成形：

6. 各executorが連携eventを受け取り、必要なworkspace、policy、queueを準備する。
7. Hubから依頼すると対象Cellだけが実行する。
8. quality gateを通過したartifactとreceiptをHubへ返す。
9. 実際のdelivery readback後だけ`completed`へ進む。

UI上の「連携済み」と「仕事が完了した」を混同しない。

## 設置者所有provider / BYO方針

現在の配布単位は`1 deployment = 1 operator = 1 provider secret set`とする。Telegram、Supabase、Google／Composio、Gemini、Telnyx、Stripe、Resend、Unipile、Inngest、browser基盤、将来の調達・配送providerなどの運営credentialは、リポジトリ所有者の共有accountへfallbackせず、そのdeploymentの設置者が所有・保管・rotateする。利用者本人のGoogle CalendarやGmailは、設置者のserver credentialを配るのではなく、検証済みOAuth／hosted-auth connectionとして委任を受ける。

別operatorのBot tokenやAPI keyを同じprocess-global envへ追加しない。複数operatorを1 deploymentへ収容するには、tenant別installation registry、暗号化credential vault、provider別revocation、cross-tenant isolationが完成してから`shared_registry`として別途設計する。

設置者がチャットへ回答してよい公開URL・username・domainと、端末／secret vaultだけへ保存する変数は[`docs/owner-account-intake.ja.md`](docs/owner-account-intake.ja.md)を正本とする。Telegramの実接続は[`docs/telegram-bot-setup.ja.md`](docs/telegram-bot-setup.ja.md)に従う。

### 現在のfresh-install blockers

- avocadomini入口用の最小Supabase bootstrap（`lm_users`、無料同意、3つ選択）は追加済みだが、Core全機能用のcanonical baseline schemaは未完成で、既存migrationは`lm_wake_log`、`lm_ask_log`等の既存tableを前提とする。local Composeが自動適用するのはruntime job系migrationだけである。
- Hubの`integration_outbox`をCore/providerへ届けるconsumer、統一identity gateway、iOS用`/api/mobile/v1/*`は未配備である。
- Gmail fresh-user callback、Resend受信本文取得と署名検証、Landing subsetの独立buildは未完成である。
- Product Huntは商用許諾、本番broker、rate ledgerが未完成、外部AI packageはcatalog-onlyでexecutorと課金が未実装である。
- 必需品支援はpolicyとplannerのみで、本人同意・必要性審査の運用主体、検証済みvendor registry、在庫、配送、care-provider契約、返金、受領readbackが未接続である。
- 旧運営者前提の自律runtimeは履歴・移行用に同梱するが、`config/legacy-owner-quarantine.json`が解除されるまでinstallerはdaemon有効化を拒否する。

したがって、環境変数の形式検査がGREENでもfresh installation全体の本番readyを意味しない。baseline schema、provider readback、実E2E receiptを別々に合格させる。

## Telegram独自Bot接続

avocadominiのTelegram利用者向け画面は、単一の個人チャット内に「総合司令室」と「道具別ルーム」を設ける。サイトで1〜3種類を選んだ利用者は再同意・再選択を挟まず総合司令室へ入り、直接Botを開いた利用者は仕事内容別おすすめまたは10種類一覧から選ぶ。詳細な画面、10種類の責務、通知、合格条件は[`docs/avocadomini-telegram-rooms.ja.md`](docs/avocadomini-telegram-rooms.ja.md)を正本とする。

### 2 Bot運営契約

Kaiが運営する本番topologyは次の2 Botを正とする。これは同じBotの表示名違いではなく、利用者、権限、credential、Webhook、deploymentが異なるsecurity boundaryである。

| Bot | 利用者 | 主な役割 | 公開 | 現在の状態 |
|---|---|---|---|---|
| `@Rockstar_ibot` | Kaiのみ | 運営、承認、監視、pause/resume、事業数字、Life OS | 一般公開しない | owner決定とGit履歴は確認。live identity、Webhook、allowlist、実送受信receiptは未確認 |
| `@avocadominibot` | 顧客、pilot参加者 | 受付、1〜3道具選択、依頼、進捗、納品、修正、購入 | 顧客向け公開入口 | `getMe`、Webhook、6コマンドをreadback済み。token rotationと実Job結果message IDが未完了 |

`@avocadominibot`内のMr. Bot、BotMother、Baby、Life Guardは会話profileであり、追加のTelegram Botではない。`/commerce`で開く販売画面と16会話styleも同じcustomer surface内のworkspace／表現overlayである。profileやstyleはowner capabilityを増やさない。

owner側の`/status`、`/approve`、`/pause`、`/resume`、異常通知は最終的に`@Rockstar_ibot`へ置く。顧客側は`/start`、`/home`、`/tools`、`/jobs`、`/today`、`/help`を共通入口にする。移行完了までは既存owner-only commandを顧客へ公開せず、Kaiのuser IDとprivate chat IDを検証できない場合は副作用前に拒否する。

### 現段階のdefault決定（2026-09-05）

runtime contractは`byob_single`を維持する。これは「事業全体でBotは1つ」という意味ではなく、**1 process / 1 deploymentが保持できるBot credentialは1組だけ**という意味である。Kaiの2 Bot構成は、customer serviceとowner serviceを別deploymentとして配備し、共通Coreへは異なるroleとcapabilityで接続する。同じprocess-global envへ2つのtokenを追加しない。

```text
ownerのTelegram account
  → BotFather /newbot
  → hidden token input
  → getMeでbot ID / username検証
  → private env（0600）
  → getWebhookInfo
  → 明示したHTTPS originの /telegram
  → setWebhook + readback
  → 検証済みusernameだけをPanel / Webへ公開
```

Bot tokenはpasswordとして扱う必要があるため、CLI引数、stdout、公開API、HTML、receipt、Gitへ入れない。[Telegram Bot Tutorial](https://core.telegram.org/bots/tutorial)の核心は“Treat this token like a password”である。WebhookはTelegram公式`setWebhook` contractに従い、HTTPS URL、`X-Telegram-Bot-Api-Secret-Token`、限定した`allowed_updates`を使う。[Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook)

runtimeは次をfail closedにする。

- token、32文字以上のWebhook secret、公開HTTPS originのいずれかがない
- `getMe.username`と設定usernameが一致しない
- 未実装の`shared_registry` modeが指定された
- 旧中央deploymentまたは旧共通Botへfallbackしようとした
- 別URLの既存Webhookを、移管flagなしで上書きしようとした

公開面が読めるのは、検証済みBot username、deep link、mode、構成状態だけである。token、Webhook secret、業務callback secretは別のauthorityとして保持する。Webhook secretを業務callback署名鍵へ流用しない。

利用者はBotから先に個別連絡を受けられないため、自分でBotを開き最初のmessageを送る。[Telegram Bots](https://core.telegram.org/bots)が示すこの制約をonboarding contractに含める。Mini Appが送る`initData`は、利用前に接続元Botのtokenから検証する。[Telegram Mini Apps — validating data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)

### First 3000での境界

現在の安全な配置と未完成境界は次の通りである。

| 配置 | Bot数 | 現在の扱い |
|---|---:|---|
| Kai運営のowner/customer分離 | 2 deploymentに各1 | 設計上の正本。customer Botは接続済み、owner Botは公式readback待ち |
| 1人ごとに独立deploymentを配布 | deploymentごとに1 | `byob_single`で対応 |
| 1つの運営Botを複数利用者が使う | process全体で1 | 既存chat/user分離を使う。3,000人load・privacyは未証明 |

「3,000人が各自作った3,000 Botを1つの共有SaaSへ接続」は未実装である。これを有効化する前に、次を別phaseで完成させる。

- tenant別`telegram_bot_installations` registryとsecret vault reference
- Botごとの推測困難なWebhook routeと定数時間secret照合
- `installation_id + chat_id`を正本にしたuser binding
- `(installation_id, update_id)`によるWebhook重複排除
- 接続元installationからMini App検証tokenを選ぶ仕組み
- Bot別outbound queue、429 `retry_after`、jitter付きself-heal controller
- Bot Aのtoken／secret／chatでBot Bのtenantへ到達できないcross-bot isolation test

共有multi-bot設計が完成するまでは、process-global envへ複数tokenを追加しない。導入手順の正本は[`docs/telegram-bot-setup.ja.md`](docs/telegram-bot-setup.ja.md)とする。

## Architecture

```text
 Customers                 Kai                    User
     │                       │           ┌─────────┴─────────┐
     ▼                       ▼           ▼                   ▼
@avocadominibot       @Rockstar_ibot  Responsive Web Hub  Native iOS
 customer service      owner service     ChatGPT Auth     session planned
     │                       │                 │                 │
     └──── role/capability boundary ───────────┴─────────────────┐
                                                                ▼
                                                   Rockstar_ibot Core
                                             identity / jobs / proof / money
                                              capability / audit / Life Guard
                                                                │
                                   ┌────────────────────────────┴───────────┐
                                   ▼                                        ▼
                         Rockstar_ibot One D1/R2                  Service Cell executors
                         tasks / portfolio / audit               bounded tools / isolation
                                   │                                        │
                                   └──────── artifact + evidence + receipt ─┘
```

2 BotのcredentialとWebhookはCoreの外側で分離し、eventには`bot_role`、`installation_id`、`chat_id`、`tenant_id`を渡す。owner Botが停止してもcustomer Jobを安全側にpauseでき、customer Botが停止してもowner Botからincidentとqueueを確認できる構成を目標とする。canonical identityとこのcross-bot bindingは未実装である。

長時間処理はHTTP request内で完了させず、queueで受ける。Cellごとにqueueと同時実行上限を分け、3分のSales処理が45分のLanding Page処理に塞がれないようにする。

取り消せないmoney actionは既存の`EffectIntent`と`ConnectorOutbox`を通す。実行したつもり、click、model出力、pending balanceは完了証拠にしない。

Web HubのChatGPT user ID、既存CoreのTelegram/Supabase user ID、将来のApple mobile sessionは同じidentityではない。`canonical_account_id`と検証済み`identity_links(provider, subject)`が完成するまでは、Web HubのD1記録と既存Coreの実データを自動的に同一人物として結合しない。

### WebとiOSの役割

- **Web Hub:** 全体像、手入力のToday/Body/Mind/Money/Work、Service Cell構成、接続入口、監査履歴を一画面で操作する。
- **iOS:** `docs/superpowers/specs/2026-08-08-rockstar_ibot-ios-spec.md`を正本とし、WebViewではなくSwiftUIを使う。native onboarding後は一つのchronological chatを主画面にし、設定はsheetに置く。
- **既存Core:** Calendar、route、Telegram、Voice、care、diet、mental、earningsなどの判断と外部side effectを所有する。
- **共通境界:** mobile/Webが別のdecision engineを持たず、認証済み共通APIを通じて同じbackend結果とreceiptを読む。

## 外部AIツール・パッケージ

外部AIを追加しやすくする。ただし「packageを置いたらRockstar_ibot process内で任意codeが動く」plugin方式にはしない。第一段階は、配布・権限・審査状態を機械可読にし、Web/iOSへ同じカタログを表示するmetadata-only package gateである。

### 現段階のデフォルト決定（2026-08-28）

現行設計をFirst 3000向けのデフォルトとして進める。標準packageは`server.json`と`rockstar_ibot-tool.json`の2-manifest構成、運営審査は`registry.json`、Web/iOSは同一生成catalogを読む。runtimeは`catalog_only`を維持し、install、credential受け渡し、外部実行、成果物完成判定、課金はデフォルトに含めない。これらは下記の隔離実行境界が完成した後の次フェーズとして、別の設計判断と検証を経て有効化する。

### Product Hunt候補検索

Product Huntを外部AI package候補の発見sourceへ加える。ただし候補とpackageを混ぜない。検索は運営側serverだけが公式GraphQL APIへ行い、Web/iOS clientからの直接検索、HTML/DOM scraping、browser automation、第三者packageへのProduct Hunt token委譲は禁止する。

```text
operator query
→ topics(query:, first: bounded)
→ posts(topic:, postedAfter:, postedBefore:, order: NEWEST)
→ Product Hunt post IDでdedupe
→ candidate_only queue（公開なし・実行なし）
→ publisher / API / MCP / terms / security review
→ 既存2-manifest scaffold・validator・digest registry
→ Web/iOS catalog_only
```

Product Huntのdocumented APIにはpost全文検索がないため、`topics(query:)`から一致topicを解決し、`posts(topic:)`を取得する。topicが0件なら正常な空候補queueにする。API error、401/403、429、schema差分、timeout、response上限超過ではfail closedにし、Web scrapingへfallbackしない。[Product Hunt GraphQL topics](https://api-v2-docs.producthunt.com/query/topics/)

API文書はデフォルトの商用利用を認めず、business利用は`hello@producthunt.com`への連絡を求めている。現在のdefaultは`permission_required`で、config・runtime flag・raw token確認のローカル仮gateによりfetch 0回で停止する。これは法的許諾やtoken provenance/scopeの証明ではない。本番は運営署名済み許諾recordと失効状態、server brokerによるclient credentials交換と`public` scope確認を必須にし、OSSのdefaultを`approved`にしない。[Product Hunt API 2.0](https://api.producthunt.com/v2/docs)

Product Hunt利用規約はcrawl、scrape、spiderとContentの重要部分の保存を禁止する。候補queueにはID、名称、短いtagline、topic、Product Hunt URL、未訪問website URL、日時、vote観測値、query/候補hash、rate-limit header、許諾referenceだけを保存対象にし、最大30日後の`expiresAt`を付ける。description、maker個人情報、comment、画像、raw response、tokenは保持しない。実削除schedulerが未完成のため、本番有効化前のrelease gateとする。[Product Hunt Terms](https://www.producthunt.com/legal)

Product Hunt掲載、featured、vote数は発見順序の参考値に限る。publisher確認、公式API/MCPの存在、署名、安全性、品質、採用可否の証明として扱わず、自動承認、自動install、自動registry登録を禁止する。候補dataはWeb/iOS共通catalog生成元の外に置く。

検索budgetは全tenant共通の運営connectorが所有する。GraphQL操作は固定し、検索語はsource configの審査済み公開taxonomyにallowlistする。query最大8、topic/query最大5、post/topic最大20、候補最大100、1 response最大2MiB、run累積response最大8MiB、run timeout最大60秒、安全残量100を標準上限にする。rate-limit headerが欠ける、残量が閾値以下、または429ならrunを停止し、即時retryしない。公式制限はGraphQL complexity pointsなので現行の100はheuristicに限り、本番は中央の排他budget ledgerが実測operation costを予約する。[Product Hunt API rate limits](https://api.producthunt.com/v2/docs/rate_limits/headers)

### Package contract

```text
external-ai-tool/
├── server.json                 # MCP Registry公式配布manifest
└── rockstar_ibot-tool.json      # Rockstar_ibot最小権限overlay

operator-owned
└── integrations/ai-tools/registry.json
    ├── exact combined manifest SHA-256
    ├── publisher verification
    ├── security/signature review
    └── enabled capabilities
```

MCP Registryの`server.json`はremote MCPに加え、npm、PyPI、Cargo、OCI、NuGet、MCPBを表現できる。公式schemaはpackage versionについてspecific versionを要求し、rangeを拒否する。Rockstar_ibotも`latest`、range、可変branchを受け付けない。[MCP Registry server.json schema](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json)

Rockstar_ibot overlayは次を必須にする。

- capability ID、input/output data class
- effect: `read | external_write | message | publish | money`
- owner approval: install時または実行ごと
- credentialの値ではなく論理slot
- HTTPS、exact hostname、port、HTTP methodのegress申請
- data retention、個人data有無
- timeout、最大output、同時実行上限
- free / fixed / metered / subscription / quoteの商流区分
- action receiptと、外部effectに対するprovider readback

unknown field、wildcard host、HTTP、localhost/IP、manifest内secret、未固定version、外部effectの包括承認をfail closedで拒否する。MCP Authorizationは、serverがclientから受け取ったtokenをupstream APIへpass-throughしてはならないと定めるため、将来の実行時もtenant/package/run限定credential brokerを使う。[MCP Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

packageが`verified`、`trusted`、platform fee、実行許可を自己申告することは禁止する。これらは運営側registry、tenant別grant、実行前quoteだけが決める。署名確認も署名者identityとartifact digestの一致を別々に検査する。[Sigstore — Verify Signatures](https://docs.sigstore.dev/cosign/verifying/verify/)

### 状態を混ぜない

| 状態 | 意味 |
|---|---|
| `schema_valid` | 2つのmanifestが形式・cross-field検証を通った |
| `publisher_unverified / metadata_reviewed` | 提供者metadataの運営確認状態 |
| `catalog_only` | 発見・表示だけ。install、secret、network、実行、課金なし |
| `read / external_write / message / publish / money` | capabilityが起こし得る外部effect |

Web/iOSに表示されたことは、安全認定、接続成功、認証成功、成果物完成を意味しない。現在のgeneratorはruntime stateを常に`catalog_only`へ固定し、package側の値で変更できない。

### 将来の実行境界

```text
digest-pinned package
→ tenant install grant
→ quote / current approval
→ isolated executor or remote gateway
→ empty environment + credential broker + exact-host egress
→ output schema validation
→ authoritative provider readback
→ signed action / usage / billing receipt
```

現行の`runtime/loop` host subprocess、`agent_runner.py`の親environment複製・`auth.json`参照、Core process内`require`は第三者packageへ流用しない。Web HubとiOSはpackage codeを実行しない。sandbox、secret broker、egress gateway、digest固定outbox、revocation、receiptが揃うまではcatalogの先へ進めない。

## AIの動作契約

AIはService Cellごとに次の順序で動く。

1. Intake Contractで必須入力、危険、範囲外を判定する。
2. ユーザー、注文、Cell専用のworkspaceを作る。
3. 許可された入力・tool・検証済み事実だけを渡す。
4. Production Contractに従って成果物を作る。
5. 決定論的検査を先に実行する。
6. AI品質検査で意味、根拠、scopeを確認する。
7. 不合格なら範囲内で再生成するか、人へ返す。
8. artifact、検査結果、delivery readbackをreceiptへ結びつける。
9. receiptが確認できた場合だけ完了報告する。

購入者のpromptや添付は未信頼dataであり、system policy、tool権限、他ユーザーdataへのアクセスを変更できない。

### 現在のHubコード

| パス | 責務 |
|---|---|
| `apps/rockstar_ibot-hub/app/lib/catalog.ts` | 4 Core、6枠、許可variant、成果物一覧 |
| `apps/rockstar_ibot-hub/app/lib/portfolio-store.ts` | D1状態、全体連携、切替、run、audit、outbox |
| `apps/rockstar_ibot-hub/app/lib/operating-catalog.ts` | Body・Mind・Money・Work・Systemの機能mapとCore接続入口 |
| `apps/rockstar_ibot-hub/app/lib/operating-store.ts` | task、daily check-in、通貨別money ledger、auditのowner-scoped D1操作 |
| `apps/rockstar_ibot-hub/app/lib/data-control-store.ts` | Hub dataのowner-scoped JSON exportとD1/R2 pilot削除経路 |
| `apps/rockstar_ibot-hub/app/lib/api-guard.ts` | 認証、送信元検査、owner別mutation/export rate limit、削除lock検査 |
| `apps/rockstar_ibot-hub/app/lib/operating-response.ts` | 入力・競合・上限・内部障害のHTTP分類 |
| `apps/rockstar_ibot-hub/app/api/portfolio/` | 一括連携、個別変更、初期化API |
| `apps/rockstar_ibot-hub/app/api/operating/` | task、check-in、moneyの認証済みmutation API |
| `apps/rockstar_ibot-hub/app/api/data/route.ts` | Hub data export・全削除API |
| `apps/rockstar_ibot-hub/app/api/files/route.ts` | 10MB制限、形式制限、R2保存、owner境界 |
| `apps/rockstar_ibot-hub/app/api/runs/route.ts` | 有効なCellへの実行受付 |
| `apps/rockstar_ibot-hub/app/components/hub-dashboard.tsx` | 8領域のWeb Hub、全体連携、依頼、履歴UI |
| `integrations/ai-tools/` | MCP配布manifest、権限schema、運営registry、remote MCP template |
| `scripts/ai-tool-package.mjs` | scaffold、fail-closed validation、Web/iOS共通catalog生成 |
| `lib/producthunt-discovery.mjs` | Product Hunt公式GraphQL候補検索、ローカル許諾事故防止gate、最小metadata化、dedupe、receipt |
| `integrations/ai-tools/discovery/` | Product Hunt source/candidate schema、運営有効化手順。候補実dataはrepo外 |
| `apps/rockstar_ibot-hub/app/generated/ai-tool-catalog.json` | Webへ渡すmetadata-only外部AI projection |
| `apps/rockstar_ibot-ios/RockstarIbot/Resources/AIToolCatalog.json` | iOSへ渡す同一projection |
| `apps/rockstar_ibot-hub/db/schema.ts` | portfolio、task、check-in、money、file、run、audit、outbox schema |
| `apps/rockstar_ibot-ios/` | Xcodeで開くnative SwiftUI client。完成状態はiOS READMEとtest receiptで判定 |

## 現在の実装状態

### 実装済み

- Rockstar_ibot One Hubのdesktop/mobileレスポンシブUIとmobile bottom navigation
- ChatGPT認証必須化
- Todayの次の一手を領域・期限付きで追加、完了、再開、削除
- Body・Mind・Energyの1〜5日次check-inとメモ
- JPY、USD、EUR、GBPの収支記録、通貨別集計、削除
- Work queue、全機能map、Core接続入口、audit trail
- ユーザー別ポートフォリオ作成
- 6枠の一括連携、個別ON/OFF、variant選択、初期化
- 依頼内容の受付と履歴
- 10MBまでのPDF、text、JSON、PNG、JPEG、WebP添付
- D1によるportfolio、run、file metadata、audit、outbox保存
- R2によるowner-scoped file保存
- cross-site mutation拒否、owner別90 mutation/分、6 export/分のapp-level制限
- task、money、Service run、添付、Service Cell構成のIdempotency-Key重複防止
- task 500件、check-in 2,000日、money 2,000件、Service run 500件、添付100件・250MBのowner上限
- 入力error、競合、上限、内部障害のHTTP分類と内部error非公開化
- audit/outbox/操作receipt各5,000件までのJSON export。内部claim tokenと添付binaryを含めずmanifestを書き出す
- owner deletion lease、write generation fence、token付きD1削除、R2 generation prefix、永続tombstoneを使う再試行可能なpilot削除経路
- audit最新5,000件保持と未処理outbox 2,000件のbackpressure
- queuedをcompletedと表示しない状態契約
- Web App Manifestとinstallable metadata
- operating APIの正常系、削除、cross-site 403 smoke
- production build、type check、lint、desktop/mobile visual smoke
- owner-onlyの本番deploy
- 外部AIの`server.json` + 権限overlay schema、scaffold、strict validator、運営SHA-256 registry
- remote MCP、npm、PyPI、Cargo、OCI、NuGet、MCPBを表すWeb/iOS共通catalog projection
- Web/iOSでvalidation、publisher trust、runtime、effectを分離したpackage表示
- Product Hunt公式GraphQLの`topics(query:)`→`posts(topic:)`候補検索connector、固定query、期間/件数/response上限、dedupe、rate-limit停止
- Product Hunt候補の`candidate_only` schema、query/candidate hash、許諾reference、API budgetを持つ運営receipt
- 商用許諾未確認、runtime flag欠落、token欠落時にnetwork call 0で停止するローカル事故防止gate
- default portfolio、Web、iOS間のGrowth・Launch・Learn variant ID統一
- 1 deploymentにつき1つの導入者所有Telegram Botを扱うhidden token入力、`getMe`照合、private env保存、Webhook takeover guard、登録readback
- `@avocadominibot`のBot identity、Webhook、6コマンド、公開説明の公式readback
- 固定Bot名・旧中央Webhook fallbackの汎用runtime／Landing／Hub／Panelからの除去
- Webhook secretと業務callback secretの分離、検証済みBotだけを公開するfail-closed接続
- Core PanelでMetaMaskを検出し、Base Mainnet（chain ID 8453）のUSDC受取addressを5分の一回限りSIWE所有署名でtenantへ登録する境界。秘密鍵・seed・token承認・送金権限は要求せず、自動送金の有効化とは分離
- 必需品requestのprivacy最小化validator、cash-like拒否、人間・提携団体の承認と検証済みvendorを要求する調達planner
- 旧UBI自動hook、on-chain payout、recipient bank payout watcherのfail-closed停止。基礎bank adapterはvendor・事業支払い・返金用にpurpose gate付きで保持

### 未完成

- 6 Cellすべてのoutbox consumerとexecutor
- `@Rockstar_ibot`の独立owner deployment、Kai allowlist、owner command、Webhook、実送受信receipt
- customer Botからowner capabilityへ到達できないcross-bot isolation testと、Bot別queue／監査主体
- 多数の導入者所有Botを1つの共有SaaSへ安全に接続するinstallation registry、vault、Bot別Webhook、複合identity
- ChatGPT、Telegram、Supabase、mobile sessionを結ぶcanonical account / identity link
- Web Hubから既存Calendar、Voice、Telegram、Moneyの実状態を読む認証gateway
- iOS向け`/api/mobile/v1`の本番session、bootstrap、chat、operating、analysis、device、delete実装
- APNs、Keychain token rotation、TestFlight、App Store署名とsubmission receipt
- executorからHubへ結果・artifact・errorを返すAPI
- quality receiptとdelivery receiptの表示・検証
- 統一price、checkout、税、返金、subscription
- usage eventの署名と課金idempotency
- retention期限と、D1/R2以外のCore・Supabase・Telegramを含む統一export／完全削除
- support・障害対応用の運営console
- signed release、段階配信、rollbackの実証
- 3,000人を対象にしたtenant isolation testとload test
- public onboarding、利用規約、privacy、地域別販売要件
- D1のapp-level counterより前で拒否するedge/WAF rate limit
- 削除tombstoneを確実に回収するdurable R2 reaperと実行中upload drain
- 5,000件保持を越えた古いIdempotency-Keyを再有効化しないreceipt retentionまたはdurable watermark
- exportに保持方針、purge watermark、残存するsecurity metadataの目的と期限を明示
- 外部AI package用のisolated executor / remote gateway、credential broker、egress gateway
- tenant別install/grant、dispatch直前revocation、digest固定outbox、署名・SBOM・provenance審査
- package用action / readback / usage / billing receiptとreplay-safe settlement
- Product Huntからの商用API利用許諾、運営署名済み許諾recordのruntime検証、server secret brokerでのclient credentials交換と`public` scope確認、実API contract canary
- Product Hunt候補queueの中央排他scheduler/rate ledger、30日expiry purgeと削除receipt、署名/MAC付きqueue receipt、利用条件変更監視、即時停止switch
- 必需品支援の同意・必要性審査運用、検証済みvendor registry、調達資金account、在庫・配送・care-provider接続、refundと受領receipt

## Data model

| Entity | 役割 |
|---|---|
| `portfolios` | ownerごとのbase portfolioと全体連携状態 |
| `portfolio_slots` | owner、slot、選択Cell、有効状態 |
| `service_runs` | 依頼、Cell、添付参照、実行状態 |
| `service_files` | R2 objectのowner、形式、size、key |
| `file_upload_reservations` | 冪等な添付予約、hash、pending/complete状態 |
| `portfolio_mutation_receipts` | 連携・個別切替・初期化・task/money作成の不変な冪等受付証明 |
| `audit_events` | 誰のどの設定・受付がいつ変わったか |
| `integration_outbox` | 後続executorへ確実に渡すevent |
| `life_tasks` | ownerごとのToday・Body・Mind・Money・Work action |
| `daily_checkins` | ownerと日付ごとの身体・心・energy scoreとメモ |
| `money_entries` | ownerごとの通貨、収入/支出、分類、日付 |
| `mutation_rate_limits` | ownerと1分windowごとのWeb mutation回数 |
| `data_export_rate_limits` | ownerと1分windowごとのJSON export回数 |
| `owner_data_locks` | Hubデータ全削除中の書き込み遮断と失敗後再開状態 |
| `owner_write_fences` | 削除の前後を分け、古いrequestの書き込みを拒否するgeneration |
| `owner_cleanup_tombstones` | 削除対象のR2 generation境界を永続化する回収記録 |

次のschema変更では、canonical account、identity links、Telegram installationと`bot_role`、mobile session、run status transition、lease、retry、dead-letter、artifact、quality result、delivery receipt、billing eventを追加する。Telegram updateの重複排除は`installation_id + update_id`、利用者bindingは`installation_id + chat_id`を正本にする。受付のIdempotency-Keyは実装済みだが、executor・納品・課金まで同じkeyを伝播し、二重納品・二重課金を防ぐ必要がある。

必需品支援をliveにする前に、`aid_requests`、`need_reviews`、`recipient_consents`、`vendor_verifications`、`procurement_orders`、`dispatch_receipts`、`receipt_confirmations`を追加する。住所・健康情報・本人確認資料はtableへ直書きせず、tenant別private vault参照だけを保存する。

## 収益モデル

初期はCellごとの固定価格とする。購入者に見えない手数料を、利用者の受託売上から勝手に差し引かない。

現段階のavocadominiは1〜3道具の無料入口までを本番sliceとし、有料化は「1つの合格条件付きoutcome = 1商品」から始める。4つ目の道具や10道具解放をそのまま承認済み商品とは扱わない。価格、Stars消費量、修正上限、返金条件、法定表示、受取先、実決済receiptが揃うまでpaid go-liveは無効である。顧客への商品提示と購入は`@avocadominibot`が担当し、owner control planeの`@Rockstar_ibot`自体は販売しない。

サービス売上と必需品支援資金は会計上も権限上も分離する。寄付・助成・割当資金を受ける場合、Kai所有の調達資金accountへ記録し、承認済み注文の検証済み業者へだけ直接支払う。これは受益者向けpayout、売上分配、暗号資産配布ではない。

課金対象：

- Rockstar_ibotが直接納品するService Cell
- 明示された利用回数・追加生成
- 保存容量・長期保存
- 優先実行・追加検査
- 複数Cellを組み合わせたpack
- 審査済み外部AI packageの利用料と、購入前に明示するRockstar_ibot platform fee

導入順：

1. 単品固定価格
2. 実測された組み合わせのpack
3. 反復利用が証明されたCellだけsubscription
4. API・partner distribution

各価格には、成果物、修正回数、処理期限、返金条件、data retention、追加料金を購入前に表示する。

外部packageの価格・usage自己申告だけでは請求しない。Rockstar_ibotが`publisher price + platform fee + tax + total + ceiling + expiry`をquote receiptへ固定し、ユーザー承認後にreserveする。独立したusage/action receiptと品質・納品条件が一致した場合だけsettleし、失敗・取消はreleaseまたはrefund receiptへ進める。手数料率はpublisher manifestではなく運営契約とユーザー向けquoteが所有する。

計測する数字：

- paid order数
- time to first value
- queue wait / execution time / delivery time
- automated completion rate
- quality gate不合格率
- regeneration rate
- refund rate
- human support minutes per active user
- model、tool、storage、payment原価
- Cell別粗利
- repurchaseと4週継続

生成回数、click、model自己評価、未回収売上は価値へ加算しない。

## 需要と供給が崩れた時の設計

普及により提供者や生成物の供給だけが増えると、品質低下、価格競争、発見困難、support増加が起きる。Cell数を増やすこと自体を成長としない。

### 供給過多への対策

1. **需要証拠があるCellだけ有効化する。** paid order、再購入、検索・問い合わせの実需要を確認する。
2. **Cell追加より既存Cellの品質と採算を優先する。** 低利用Cellは停止、統合、差し替えする。
3. **出品数ではなく結果でrankする。** receipt、返金後粗利、再購入、品質合格を使う。
4. **同じ成果物の大量生成を制限する。** budget、rate limit、重複検出、類似度検査を持つ。
5. **需要別queueへ分離する。** 短い仕事、大容量制作、premium処理を分ける。
6. **最低価格と原価上限を持つ。** 赤字供給を補助金や隠れた人手で延命しない。
7. **Portfolioをユーザー別にする。** 全員へ同じ6枠を押し付けず、使わない枠を止める。
8. **供給者を増やす前にdistributionを増やす。** partner、affiliate、creator audience、API導入を測る。

需要超過時は、queue予測時間、利用上限、優先枠、代替Cellを明示し、無限retryや納期の過剰約束をしない。

## 3,000人の容量仮定

現在のWeb Hubは単一D1を使う。Cloudflare公式では1 database最大10GBで、個別databaseはqueryを一件ずつ処理するsingle-threaded modelである。平均queryが長くなるほどthroughputは下がり、queue超過時はoverloaded errorになる。[Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

したがって、現在の単一D1構成の限界は「登録3,000人」そのものではなく、全ownerのwrite集中、audit/outboxの増加、10GB到達のどれかで先に来る。app-level上限は暴走を抑えるguardrailであり、3,000人capacityの証明ではない。

| 現在のowner別guardrail | 上限 |
|---|---:|
| Web mutation | 90回/分 |
| JSON export | 6回/分、audit/outbox各5,000件、添付binaryなし |
| task | 500件 |
| daily check-in | 2,000日 |
| money entry | 2,000件 |
| Service run受付 | 500件 |
| 添付 | 100件・合計250MB、1件10MB |
| audit / 未処理outbox | 最新5,000件 / 2,000件 |

全員が上限まで使えば、task 150万行、check-in 600万行、money 600万行、run 150万行にaudit/outboxが加わる。これは単一databaseへ永久に置く設計ではない。First 3000へ進む前に、少なくとも次の条件で水平分割する。

1. `canonical_account_id`から安定したshard keyを作る。
2. 100〜500人または実測storage/write量を境に複数D1へ分割する。
3. account directoryだけを小さなcontrol databaseへ置き、個人のtask/check-in/money/runはassigned shardへ置く。
4. executor queue、billing、artifact metadataを同じhot databaseへ集中させない。
5. 50%、70%、85%のstorage・write latency alertと、停止せずに移すmigration receiptを用意する。

現在のmanifestは次を計画値としている。

| 指標 | 仮定 |
|---|---:|
| 登録ユーザー | 3,000 |
| DAU | 30% = 900 |
| 1 active userあたりjob/日 | 4 |
| 全job/日 | 3,600 |
| peak hour | 15% = 540 job/hour |
| 平均処理時間 | 120秒 |
| 理論上の平均同時処理 | 18 |
| 最低load test | 同時60 |

これはcapacityの証明ではない。LP生成のような長時間job、添付size、provider rate limit、再試行、quality check、model latencyをCell別に実測する。

本番acceptanceには最低限、次を含める。

- 60同時実行でcross-tenant leak 0
- SalesとLaunchのqueue starvation 0
- retry時の二重課金・二重納品0
- worker停止後のlease回収
- dead-letterからの安全な手動再開
- R2、D1、model providerの障害注入
- p50、p95、p99の待ち時間と原価

## First 3000 rollout

### 0–100: 価値確認

- YouTube、Sales、Customer Intelの3 Cellに絞る
- first value 10分以内を目標
- 他ユーザー情報混入0
- 未検証owner claim 0
- 隠れた人手supportを週15分/active user以下へ

### 101–500: 商品確認

- SEO Blueprintを追加
- 実価格で購入、返金、再購入を測る
- automated completion 80%以上を目標
- Cell別原価・粗利を内部表示する

### 501–1,500: 基盤確認

- Landing Page Sprintを追加
- 同時60の隔離load test
- retry、重複防止、dead-letter、復旧を実証
- export、delete、retention期限を実証

### 1,501–3,000: 配布確認

- Portfolio Overlayを一般提供
- signed version、段階配信、rollback
- 4週継続、返金、粗利、support負荷で次の拡大を判定
- 未達Cellを停止・改善・差し替えする

## 卒業条件

次を同時に満たすまで「3,000人対応済み」と表示しない。

1. cross-tenant leak incident 0
2. unsupported owner claim incident 0
3. artifact-bound delivery 100%
4. automated completion 80%以上
5. human support週15分/active user以下
6. refund rate 5%以下を目標として実測
7. week-four retention 30%以上を目標として実測
8. Cell別gross margin 70%以上を目標として実測
9. signed green releaseとrollbackの動作

目標未達を個別受託で埋めない。入力、scope、価格、executor、quality gateのどこが原因かを修正する。

## Roadmap

### Phase 1 — 実行を閉じる

- `@Rockstar_ibot`を独立owner deploymentへ接続し、Kai allowlist、owner command、Webhook readbackを完了する
- `@avocadominibot`からowner capabilityへ到達できないcross-bot testを追加する
- default portfolio、Web、iOSのcatalog IDを機械可読manifestから生成
- 外部AI packageのtenant install/grant、digest固定outbox、isolated executor境界を実装
- credential broker、exact-host egress、dispatch時revocationを実装
- YouTube、Sales、Customer Intelのoutbox consumerを接続
- status transition、lease、retry、dead-letterを実装
- artifact、quality result、delivery receiptをHubに返す

### Phase 2 — 商品として売れる状態

- Cell別priceとcheckout
- idempotent usage / billing event
- refundと再実行policy
- Core全体のdata export、delete、retention
- 運営consoleとsupport runbook

### Phase 3 — 100人pilot

- invite onboarding
- first value、support、refund、marginの実測
- 3 Cellのscopeとintakeを改善
- 結果の出ないCellを停止する

### Phase 4 — 500〜1,500人

- SEO、Landing Pageを段階追加
- load、failure、recovery test
- signed release、canary、rollback
- Cell別queueと原価制御

### Phase 5 — 3,000人とその先

- Portfolio Overlay一般提供
- 多言語、地域別price・policy
- partner / API distribution
- cross-bot isolation合格後の共有multi-bot registry（需要が実証された場合だけ）
- 実需要に基づくCell marketplace
- 次の地域・顧客segmentへ拡張

## 直近の優先順位

1. `@Rockstar_ibot`をKai専用owner deployment、`@avocadominibot`を顧客deploymentとして分離し、両方の`getMe`、Webhook、allowlist、command、実送受信receiptを残す。
2. customer Botからowner capabilityへ到達できないcross-bot testを通す。
3. `canonical_account_id`と検証済みidentity linkを作り、別人の状態を結合できないtenant contractを固定する。
4. 既存Coreを再実装せず、Web/iOS共通の認証gatewayと`/api/mobile/v1`を完成する。
5. SimulatorでGREENのSwiftUI clientを、実API、canonical identity、Keychain session、foreground refreshへ接続する。
6. `service.run_requested`を消費する共通worker contractを作る。
7. 必需品支援の同意・必要性審査主体とverified vendor registryを確定し、現金を介さない1件のvendor-direct pilotを設計する。
8. YouTube、Sales、Customer Intelの3 Cellだけをend-to-endで閉じる。
9. `queued → running → quality_review → delivered / failed`、artifact、delivery receiptをHubへ反映する。
10. catalogとmanifestのID差分をなくす。
11. 100人pilot前にCore横断retention、統一export／delete、運営consoleを作る。
12. 実価格、原価、refund、supportを測ってからCellを増やす。

## 非交渉原則

1. 一つのCellは一つの明確な結果を販売する。
2. 入力・許可されたsourceにない事実を作らない。
3. ユーザー、注文、Cellのdataを混ぜない。
4. qualityを検査できないartifactを自動納品しない。
5. receiptなしに完了、売上、支払いをclaimしない。
6. 明示承認なしに外部操作・継続課金を有効化しない。
7. 人間の個別作業を自動化として隠さない。
8. 利用者がdata、価格、処理、削除方法を理解できる状態を保つ。
9. 投資利益、SEO順位、売上、健康結果を保証しない。
10. 対応範囲を広げる前に再現性、安全性、採算を証明する。
11. 対人支援は本人同意と権限者の必要性確認を必須にし、モデルだけで適格性を決めない。
12. 支援資金は検証済み業者へだけ直接支払い、受益者へ現金・暗号資産・現金同等物を渡さない。
13. 定期自動化は利用者の画面・keyboard focusを奪わず、可視操作はowner承認付きの時間制限handoffに限定する。
14. 顧客Botへowner command、owner secret、他tenantの状態を公開しない。

## 文書更新ルール

- 基本情報や導入方法が変わったらREADMEを更新する。
- 製品判断、scope、roadmap、数値目標が変わったらこの`project.md`を更新する。
- portfolio ID、slot、variant、機械判定条件が変わったらmanifestとschemaを先に更新する。
- 実装済みと未実装を同じ表現で混ぜない。
- 計画値を実測値として書かない。
- 古い判断は削除で隠さず、必要なら`docs/`または`specs/archive/`へ移す。
- Hubの公開範囲やexecutor状態が変わったら、READMEとこの文書を同じ変更で更新する。

## 関連資料

- [`config/service-portfolios/default-3000.json`](config/service-portfolios/default-3000.json)
- [`docs/rockstar_ibot-default-portfolio-3000.ja.md`](docs/rockstar_ibot-default-portfolio-3000.ja.md)
- [`docs/rockstar_ibot-service-platform.ja.md`](docs/rockstar_ibot-service-platform.ja.md)
- [`docs/owner-account-intake.ja.md`](docs/owner-account-intake.ja.md)
- [`docs/owner-migration-status.ja.md`](docs/owner-migration-status.ja.md)
- [`docs/coconala-distribution-operations-audit-2026-08-27.md`](docs/coconala-distribution-operations-audit-2026-08-27.md)
- [`docs/telegram-bot-setup.ja.md`](docs/telegram-bot-setup.ja.md)
- [`docs/agent-economy.ja.md`](docs/agent-economy.ja.md)
- [`docs/avocadomini-business-design-2026-09-05.ja.md`](docs/avocadomini-business-design-2026-09-05.ja.md)
- [`THESIS.md`](THESIS.md)
- [`SOUL.md`](SOUL.md)
