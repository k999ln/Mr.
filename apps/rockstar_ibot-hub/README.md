# Mr. Automation Hub / avocadomini Workspace

新しい入口`/`は内製・外部ツールの在庫と導入候補、端末内のココナラ提案文作成です。従来の生活・仕事・収支・接続・配給・データ管理は、認証と保存内容を維持して`/life`へ移しました。新しい月額8.88 USDの基本プランは設計のみで、既存Stripeの商品とは別です。登録だけで外部ツールをインストールしたり、課金を始めたりしません。

この更新ではGitHub未反映だったSites v19の実装も保全しています。下記の接続機能はコードとして残していますが、providerの現在の接続・実行結果まで今回再検証したという意味ではありません。

avocadominiの所有者向けWeb操作面です。Today、身体・心、お金、仕事、財団設立準備の配給申請、6つのService Cell、Coreへの接続入口、証跡を、一つのレスポンシブHubで扱います。内部ではLife Manager Core、Life Manager One Hub、Mr.Botを互換名として維持します。

## 現在動くもの

- Sign in with ChatGPTによる認証とowner単位のD1分離
- taskの追加、完了、再開、削除
- 身体・心・energyの日次check-in
- JPY、USD、EUR、GBPの手入力ledgerと通貨別集計
- 非換金・非譲渡のService/AI unit残高、生活必需品支援を分離した配給申請、初期取消、audit、outbox
- 操作receiptで冗等化した6 Service Cellの一括連携、個別切替、variant選択
- 冪等なR2添付予約、依頼受付、audit、durable outbox
- Hub保存データのJSON exportと、owner lease・write generation・R2 tombstone sweepを使う再試行可能なpilot削除経路
- desktop/mobile UI、Web App Manifest、safe-area対応
- `/owner`の追加内容・機能状態・未完了・証拠を確認する運営設計資料（専用管理権限は未実装。集計はログイン本人のデータ）
- 外部AI packageの形式・提供者審査・effect・`catalog_only`を分離表示する、生成済みmetadata catalog
- avocadomini Botとの10分・単回利用本人link、接続状態polling、通知・日次自動化・タイムゾーン設定
- Bot本人link済みownerだけが使えるCloudflare Core経由のGmail Hosted Auth開始導線
- Resend上の本人所有送信domain・返信domain・署名Webhookを照合し、確認dialog後だけ一通送信するmail rail。返信本文はCoreで暗号化して取り込む
- Bot本人link済みownerだけに発行するStripe Payment Link参照と、署名Webhook由来のサービス利用状態表示
- Bot本人link済みownerだけが確認できるTelnyx resource/Webhook照合状態。受信署名receiptだけで、実発信は無効
- Bot本人link済みownerだけが確認できるGemini専用credential・固定モデルreadback。実生成は無効
- Maps専用credentialをserver-onlyで使う、確認dialog付きGoogle Routes計算。座標は保存しない
- Bot本人link済みownerだけが確認できるPostiz本人integration readback。内部IDは表示せず、投稿は無効
- Bot本人link済みownerだけが確認できるGMOあおぞら法人口座readback。口座情報は表示せず、振込は無効
- Bot本人link済みownerだけが確認できるCloudflare Browser account/token readback。session IDは表示せず、実行は無効

Service Cellの依頼は現在`queued`として保存されます。executor、成果物返却、品質receipt、課金まで完了したことを意味しません。

配給は`Life Manager Foundation Stewardship / formation stage`として実装しています。新規残高は0で、`requested`は承認・配給・提供完了ではありません。reviewer/steward/auditor権限、grant/reserve/consume、全体供給量、実Service executor、実vendor、法人登記、公益・税務認定、寄付受付は未接続です。法的地位が確認できるまで一般財団法人、公益財団法人、寄付控除対象とは表示しません。

外部AI packageも表示のみです。Hubはpackage code、secret、install commandを受け取らず、実行APIも公開しません。表示dataはrootの`npm run ai-tools:catalog`から生成します。

## ローカル起動

```bash
npm install
npm run dev
```

Core接続先はserver-onlyの`LM_CLOUDFLARE_CORE_URL`と`LM_HUB_LINK_SECRET`で設定します。表示用URLはbuild-time env `NEXT_PUBLIC_LM_PRODUCT_URL`、Telegramの公開usernameは`NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME`です。HTTPS URL（ローカル開発だけはloopback HTTPも可）が未設定・不正な場合、Core接続カードは外部の旧所有者domainへ開かず、Hub内の`#connections`設定導線に留まります。秘密情報は`NEXT_PUBLIC_*`へ入れません。値の形は[.env.example](./.env.example)を参照してください。

ローカルの`/signin-with-chatgpt`はSites開発用ユーザーを作ります。データにはCloudflare bindingの`DB`、添付には`FILES`を使います。

## 検証

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev --audit-level=moderate
```

schema変更時:

```bash
npm run db:generate
```

外付けmacOSボリュームが作るAppleDoubleファイルは、migration生成前に`db:generate`が`drizzle/`内だけを除去します。

## 安全境界

- mutationはsame-origin、認証済みowner、1分90回までです。JSON exportはownerごとに1分6回までです。
- task、money、配給申請・取消、Service run、添付、Service Cell構成には`Idempotency-Key`を使い、retryで二重作成・二重連携しません。
- 上限はtask 500件、check-in 2,000日、money 2,000件、配給申請50件・同種active一件、Service run 500件、添付100件・合計250MBです。
- 配給unitは0以上で、reserved + consumedがgrantを超えられません。user APIに承認・grantを公開せず、AI単独承認とself-approvalを許可しません。
- auditはownerごとに最新5,000件を保持し、未処理outboxは2,000件で受付を止めます。executor consumerが進んでから再試行します。
- exportはaudit/outbox/操作receiptを各5,000件に制限し、内部`claim_token`を除外します。添付はmanifestのみでbinary本体は含みません。
- Hub削除はD1/R2のHub領域だけが対象です。Core、Telegram、Supabaseまで含む統一削除は未実装です。遅延uploadのcrash回収を保証するdurable reaperも公開前の必須項目です。
- R2 keyはowner内でwrite generationごとに分離します。削除leaseを失った古い処理は、削除後の新しいgenerationに触れません。
- 想定内の入力errorだけを4xxで返し、内部障害の詳細はclientへ返しません。
- 実行完了を証明するreceiptがない状態を`completed`と表示しません。

## 公開ゲート

2026-09-05 JSTのSites読み取り確認では、既存サイトのアクセスはPUBLICです。過去のowner-only記述は現在のアクセス制御の証拠ではありません。新しい画面の公開更新は所有者の確認待ちです。以下を実証するまで、3,000人向けの本番運用を完了扱いにしません。

- D1へ到達する前に拒否するCloudflare edge/WAF rate limit
- `deleted: true`後のcrashでも古いR2 objectを残さない、削除tombstoneのdurable reaperと実行中uploadのdrain設計
- cross-tenant、同時write、障害注入を含む60並列以上のacceptance test
- 統一identity、executor、成果物receipt、課金、返金、利用規約、privacyの本番経路
- foundation reviewer/steward/auditor権限、供給台帳、異議申立て、法人・公益・税務・fundraising表示のreadback

## 主要API

| Endpoint | 役割 |
|---|---|
| `/api/operating/tasks` | task追加・状態変更・削除 |
| `/api/operating/checkin` | 日次check-in保存 |
| `/api/operating/money` | ledger追加・削除 |
| `/api/foundation/distribution` | 配給状況、申請、初期取消。承認・grantは非公開 |
| `/api/portfolio/*` | Service Cell構成 |
| `/api/files` | 添付受付 |
| `/api/runs` | Service Cell依頼受付 |
| `/api/data` | owner data export・pilot削除経路 |
| `/api/connections/telegram` | 認証済みownerのTelegram link作成・状態確認・preference更新 |
| `/api/connections/timing` | Calendar/通知台帳の状態確認とGoogle FreeBusy同期 |
| `/api/connections/mail` | 本人link済みownerのGmail Hosted Auth開始。provider接続完了を偽装しない |
| `/api/connections/mail-delivery` | Resend送受信resourceの本人readbackと確認済み一通送信。結果不明時は自動再送しない |
| `/api/connections/billing` | Stripeサービス利用状態と本人専用Payment Link。配給・寄付・payoutとは分離 |
| `/api/connections/voice` | Telnyx application・番号・Webhook v2の本人resource照合。実発信は行わない |
| `/api/connections/ai` | Gemini専用credentialと固定した安定版modelのreadback。prompt送信・生成は行わない |
| `/api/connections/maps` | 確認後だけGoogle Routesを呼ぶ経路計算。座標は保存せず、距離・所要時間receiptだけを保持 |
| `/api/connections/social` | Postizのintegration ID・provider種別・公開profile・disabled状態を本人設定と照合。投稿は行わない |
| `/api/connections/vendor-bank` | GMOあおぞら法人APIから本人の円普通預金だけを照合。残高照会・振込は行わない |
| `/api/connections/browser` | Cloudflare Browser Rendering session一覧GETで本人account/tokenを照合。新規sessionは起動しない |

全体設計、未完成の境界、First 3000のrolloutはリポジトリ直下の`project.md`を正本とします。
