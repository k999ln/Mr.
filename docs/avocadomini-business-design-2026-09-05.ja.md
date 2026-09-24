# avocadomini 事業設計書

**版:** 2.0 - 2 Bot運営版
**作成日:** 2026-09-05 JST
**基準Git:** `k999ln/Mr.` `main@4240e0367ba1dfefa6b467127265da9384f89e72`
**事業ブランド:** avocadomini
**基盤システム:** Rockstar_ibot
**状態:** 無料pilot準備段階。課金開始は未承認。

## 0. この文書の結論

avocadominiは、AI機能を並べて売る事業ではない。小規模事業者が「これを売りたい」「この仕事を終わらせたい」と自然文で依頼すると、必要事項の確認、制作、検査、承認、納品、結果記録までを、証拠付きで閉じる実行サービスである。

事業を回す単位は会話量でも生成回数でもなく、**合格条件を満たして納品できた1つの結果**とする。初期は無料で1-3種類の道具を選ばせ、有料化は「1 outcome = 1商品」から始める。繰り返し利用が確認できてからpack、subscription、platform/APIへ広げる。

Telegramは2 Botを正とする。

| Bot | 利用者 | 役割 | 収益上の位置づけ |
|---|---|---|---|
| `@Rockstar_ibot` | Kaiのみ | 運営、承認、監視、緊急停止、事業数字、Life OS | 原則非販売。事業を安全に回すcontrol plane |
| `@avocadominibot` | 顧客、pilot参加者 | 集客後の受付、道具選択、依頼、進捗、納品、再依頼、購入 | 売上を生むcustomer surface |

2 Botは人格違いではなく、**権限と利用者が異なる別システム境界**である。token、webhook、deployment、command、queue、監査主体を分ける。現行Gitは`byob_single`、つまり1 deploymentにつき1 Botを前提としているため、2 Botを同一processの環境変数へ詰め込んではならない。初期実装は2つの独立serviceから同じCoreへ接続する。

## 1. 事業仮説

### 顧客が困っていること

初期顧客は、講座、教材、有料コミュニティ、小規模SaaS、デジタル成果物を売る個人または小規模事業者である。彼らはX、Telegram、メール、LP、決済、納品を手作業でつなぎ、次の負担を抱える。

- 何から着手すればよいか分からない。
- 依頼のたびに説明をやり直す。
- AIで案は出ても、公開、販売、納品まで終わらない。
- 誰が何を承認し、何が本当に届いたか確認できない。
- 売上、原価、返金、修正が別々で、利益が見えない。

### 顧客が買うもの

顧客が買うのは「AI」ではなく、次の状態変化である。

```text
曖昧な相談
  -> 必要入力が揃った依頼
  -> 検査可能な成果物
  -> 本人承認
  -> 実行または納品
  -> provider readbackとreceipt
  -> 次回に再利用できる事業知識
```

最初のJob To Be Doneは、たとえば「この講座を売れる状態にして」である。avocadominiは不足素材、価格、期限、顧客像を確認し、制作と外部操作を分離し、外部操作は本人承認後だけ行い、最後に何が完了したかを証拠で返す。

### 市場での位置

avocadominiの競争軸は、汎用性ではなく**完了の再現性**である。

| 競争軸 | 一般的なAI chat | 単機能SaaS | avocadomini |
|---|---|---|---|
| 自然文の相談 | 強い | 弱い | 強い |
| 定型業務の再現性 | 中 | 強い | 強くする |
| 外部操作の安全性 | 製品ごと | 製品ごと | approvalとcapabilityで統一 |
| 完了証拠 | 弱い | 一部 | receiptを完了条件にする |
| 複数工程の連結 | 弱い | 限定 | CoreとCellで連結 |

防御力はmodelそのものではなく、依頼、判断、承認、実行、readback、結果の連鎖を安全に蓄積し、次回の成功率と粗利を改善する運用データにある。

## 2. 2 Bot事業アーキテクチャ

```text
                                Kai
                                 |
                         @Rockstar_ibot
                  owner control / approvals
                                 |
                     owner service + policy
                                 |
                +----------------+----------------+
                |        Rockstar_ibot Core       |
                | identity / jobs / proof / money |
                | capability / audit / life guard |
                +----------------+----------------+
                                 |
                    customer service + tenant ACL
                                 |
                       @avocadominibot
                                 |
                   prospects / pilot / customers
```

### `@Rockstar_ibot` - owner control plane

目的は、Kaiが事業と生活の両方を一か所から管理すること。公開集客には使わず、Kaiの確認済みTelegram user/chatだけをallowlistする。

主な機能:

- 全体状態、失敗Job、滞留、粗利、返金、support負荷の確認
- 外部公開、決済、返金、権限付与など高影響操作の承認
- pause、resume、kill switch、provider切替、incident確認
- 自分の予定、身体、心、お金、仕事を扱うLife OS
- Service Cellの追加候補、品質異常、採算悪化の運営通知

やってはいけないこと:

- 顧客向けにusernameを宣伝する
- customer onboardingや一般supportを受ける
- allowlist外から管理commandを実行する
- customer Botのtoken、webhook secret、顧客credentialを表示する

### `@avocadominibot` - customer and revenue plane

目的は、顧客獲得後の価値提供と売上発生を一つの会話で完了すること。

主な機能:

- `/start`から仕事内容を聞き、1-3種類の道具を選ぶ
- `/home`、`/tools`、`/jobs`、`/today`、`/help`から迷わず再開する
- 自然文の依頼を固定intakeへ変換する
- Job進捗、確認依頼、成果物、修正、完了receiptを返す
- 商品選択、購入、利用権付与、残数、次回提案を扱う

やってはいけないこと:

- owner-only commandやインフラ操作を公開する
- 他顧客のJob、素材、支払い、会話へ到達する
- receiptなしで「送った」「公開した」「支払った」と表示する
- 本人承認なしに公開、送信、決済、送金する

### 分離契約

| 境界 | 要件 |
|---|---|
| Bot credential | tokenとwebhook secretを別々のsecret storeへ置く |
| Runtime | 初期はBotごとに独立deploymentまたは独立process |
| Webhook | 推測困難な別route、別secret、公式API readback |
| Identity | ownerはallowlist、customerは`installation_id + chat_id`でtenant binding |
| Commands | owner commandとcustomer commandを別registryにする |
| Queue | source Botとtenantをidempotency keyに含める |
| Database | 共通Coreを使う場合もrole、RLS、capabilityを分離する |
| Audit | 誰が、どちらのBotから、何を承認・実行したか残す |
| Emergency | customer Botだけを止めてもowner Botから状況確認できる |

### 現状とのギャップ

| 項目 | 現在のGit/receipt | 2 Bot正本で必要なこと |
|---|---|---|
| `@avocadominibot` | webhook、6 command、Railway Coreの確認記録あり | token rotation、実顧客message ID付きE2E |
| `@Rockstar_ibot` | Git履歴とowner判断では存在。現行台帳でlive接続未確認 | Kai所有確認、`getMe`、webhook、allowlist、実送受信receipt |
| runtime | `byob_single`、1 deployment = 1 Bot | 2つの独立serviceとして配備 |
| current docs | 1公開Bot内のprofile/workspaceとして説明 | owner Botとcustomer Botを権限境界として更新 |

このため、2 Botは**事業上の決定済み構成**だが、**本番配備完了とはまだ言えない**。

## 3. 何を商品として回すか

### 10種類のService Cell

| # | 道具 | 顧客が渡すもの | 納品物 | 初期販売 |
|---:|---|---|---|---|
| 1 | 依頼整理 | 相談、素材、期限 | 合意済みbrief | pilot |
| 2 | 講座・教材作成 | テーマ、対象者、素材 | 構成、原稿、教材 | pilot |
| 3 | 内容・出典確認 | 原稿、主張、source | 根拠表、修正案、判定 | pilot |
| 4 | 販売ページ・offer | 商品、顧客、条件 | LP文面、offer、CTA | 次段階 |
| 5 | SNS投稿・予約 | 素材、目的、媒体 | 投稿案、承認済み配信 | 次段階 |
| 6 | 見込み客・顧客連絡 | audience、条件、文脈 | 返信案、承認済み送信 | 次段階 |
| 7 | 決済・失敗回復 | SKU、価格、購入状態 | 決済結果、失敗回復記録 | 課金gate後 |
| 8 | 納品・利用権 | 購入receipt、成果物 | access、delivery receipt | 課金gate後 |
| 9 | 成果・売上分析 | provider receipt | 売上、原価、改善memo | データ蓄積後 |
| 10 | 収益分配 | 契約、確定売上 | 承認済み分配記録 | 最終段階 |

最初の10人には、外部副作用が小さく品質検査がしやすい1-3だけを出す。表示上10種類が存在しても、全provider操作が接続済みという意味にはしない。

### 最初の有料SKU候補

価格はまだ確定しない。先に成果物と合格条件を固定する。

| SKU候補 | 1つの約束 | 合格条件 |
|---|---|---|
| Brief Sprint | 曖昧な相談を実行可能な1 briefにする | 目的、対象、入力、出力、期限、禁止事項が確定 |
| Course Module | 1 moduleを公開準備できる状態にする | 構成、本文、演習、検査結果が揃う |
| Evidence Check | 1成果物の主張と根拠を検査する | 主張別source、信頼度、要修正箇所が見える |

複数成果をまとめた「何でもやる月額」は初期には売らない。失敗理由と原価が見えなくなるためである。

## 4. どう回して売上にするか

```text
手動招待 / 紹介 / X / 無料PDF
  -> 公開LP
  -> 1-3道具を選択
  -> @avocadominibotで初回価値
  -> 1 outcomeを購入
  -> intake
  -> Cell実行
  -> quality gate
  -> 必要なら本人承認
  -> 納品 + receipt
  -> 修正 / 完了
  -> 次のoutcome提案
  -> pack
  -> 反復が証明された顧客だけsubscription
```

### 日次運営

1. `@avocadominibot`が新規相談を受け、無料範囲か有料outcomeかを判定する。
2. CoreがJobを作り、tenant、入力、合格条件、予算、期限を固定する。
3. Service Cellが下書きまたは検査結果を作る。
4. quality gateが不足、危険、unsupported claimを止める。
5. 顧客へ確認し、外部操作がある場合は操作単位で承認を取る。
6. 納品後、message ID、provider ID、artifact hashなどをreceiptとして保存する。
7. `@Rockstar_ibot`が失敗、遅延、赤字、返金、承認待ちだけをKaiへ集約する。
8. 完了Jobから次の最小outcomeを提案する。自動継続課金はしない。

### 週次運営

- Cell別に完了率、原価、修正、返金、support時間を確認する。
- 赤字または低品質Cellは範囲を狭める、価格を変える、停止する。
- 成功Jobのintakeと検査をtemplate化する。
- 未接続providerを増やすより、1つのCellの完了率を上げる。
- 顧客の同意範囲内で、再利用可能な事業知識を更新する。

## 5. マネタイズ設計

### 収益階段

| 段階 | 商品 | 課金単位 | 開始条件 |
|---|---|---|---|
| 0. 無料入口 | 1-3道具の選択、sample、初回整理 | 無料 | 現在のpilot |
| 1. Paid outcome | Brief、Module、Checkなど | 1完了結果 | SKU、合格条件、返金条件、receipt E2E |
| 2. Pack | 同一Cellの複数回または連続工程 | 回数・工程pack | repeatと原価が見えた後 |
| 3. Subscription | 定期的に必要な運用 | 月次枠、超過は個別 | 4週retentionとsupport採算を確認後 |
| 4. Platform/API | 他社Cell、partner販売、API実行 | usage、売上手数料 | tenant隔離、metering、partner審査後 |

Telegram内で完結するpilotではStarsを第一候補とする。ただし、価格、消費単位、返金、法務、会計、本人所有の受取先、provider readbackが揃うまで課金を有効化しない。過去資料の固定価格は承継せず、実測原価から決める。

### 粗利の見方

```text
contribution margin
= receiptで確認できた回収売上
- model / tool / storage / payment cost
- 人間support時間の原価
- 返金 / 再実行 / 失敗回復
```

売上を増やしても、人間の手直しが増えるCellは拡大しない。初期の判断目標は次の通り。

| 指標 | 目標 |
|---|---:|
| Time to First Value | 10分以内 |
| 自動完了率 | 80%以上 |
| Cell contribution margin | 70%以上 |
| 返金率 | 5%以下 |
| 4週継続率 | 30%以上 |
| support負荷 | active userあたり週15分以下 |
| cross-tenant leak | 0 |
| receipt付き納品 | 100% |

目標は承認済みSLAではなく、pilotで継続・停止を判断する基準である。

## 6. 顧客獲得

### 最初の10人

広告から始めず、対象が分かっている人へ手動招待する。

- デジタル商品をすでに持っている、または30日以内に売りたい人
- Telegramを使える人
- 1つの成果物へ範囲を絞れる人
- feedbackと結果測定に同意する人

最初のofferは「AIを試してください」ではなく、たとえば「販売したい講座の1 moduleを、根拠確認付きで公開準備まで整える」とする。

### 拡大経路

1. 手動招待と紹介で10人
2. 完了前後のcase studyで30人
3. X、無料PDF、partner経由で100人
4. 勝ちCellを固定して300人
5. self-serve onboarding、support自動化、load test後にFirst 3000

公開case studyは本人許可、匿名化、事実確認を必須にする。架空の売上や未確認の成功談を使わない。

## 7. データと防御力

蓄積する中心データは生会話ではなく、同意済みの実行連鎖である。

```text
source materials
  -> structured brief
  -> proposal and artifact
  -> user decision
  -> approved action
  -> provider receipt
  -> business outcome
```

この連鎖から、どの入力が不足しやすいか、どの検査が失敗を防ぐか、どのCellが利益を残すかを学ぶ。学習利用、保存期間、export、deleteを明示し、顧客データを勝手に共有modelの学習へ流さない。

## 8. 安全とガバナンス

### 外部操作の原則

- 公開、第三者送信、決済、返金、送金、権限付与はdraftとexecuteを分ける。
- execute直前に、対象、内容、金額、送信先を本人へ表示する。
- provider資格情報がなければfail closedにする。
- API成功ではなくreadbackまで確認する。
- retryはidempotency keyで二重実行を防ぐ。
- receiptがなければcompletedにしない。

### 2 Bot固有のrelease gate

- `@Rockstar_ibot`はKaiのallowlist外から全commandを拒否する。
- customer Botからowner capabilityへ到達できないtestを通す。
- 片方のtokenを使って他方のwebhookを通過できないtestを通す。
- owner Bot停止時もcustomer Jobは安全側にpauseできる。
- customer Bot停止時もowner Botからincidentとqueueを確認できる。
- 両Botのsecret rotation、rollback、readback手順を別々に持つ。

## 9. 現在地

### できている

- 公開Web Hubと1-3道具の選択導線
- `@avocadominibot`のWebhook、command同期、Railway Core
- Supabaseの永続queue
- Mac Codex bridge
- request、course、verification executor
- Jobの再開、修正、完了状態
- provider credentialがない場合のfail closed方針

### まだできていない

- `@Rockstar_ibot`をowner-only control planeとして配備した公式receipt
- Web -> Telegram -> Codex -> Telegram実結果の顧客message ID付きE2E
- token rotation完了receipt
- Paid SKU、価格、Stars invoice、返金のend-to-end
- 10種類すべての外部provider実行
- 3,000人のload、privacy、support acceptance
- receiptに基づく実売上と粗利実績

したがって現段階は、**無料pilotを実施して最初の完了データを取る直前**であり、販売拡大や自律実行の段階ではない。

## 10. 90日計画

### Day 0-14 - 2 Bot境界と無料E2E

- `@Rockstar_ibot`の所有、username、token保管、webhookを公式APIで確認する。
- owner allowlistとowner-only commandを実装する。
- 2つの独立deployment、別secret、別routeを用意する。
- customer Botで実ユーザー1人の結果message IDまで通す。
- cross-bot、cross-tenant、duplicate update testを通す。

### Day 15-30 - 最初のoutcome

- 依頼整理、講座・教材、内容確認の3 Cellだけで10人を招待する。
- 7/10以上が人手の作り直しなしで合格条件へ到達することを目指す。
- 原価、修正回数、support分、完了時間をJob別に記録する。

### Day 31-45 - 課金設計

- 最も再現性が高い1 CellをPaid SKUにする。
- price、消費単位、返金、利用権、receiptを固定する。
- Starsのtest invoice、失敗、重複、返金をE2Eで確認する。
- paid go-liveをKaiが明示承認する。

### Day 46-60 - 小規模有料pilot

- 5-10件だけ販売する。
- 粗利70%、返金5%以下、receipt 100%を評価する。
- owner Botへ異常だけを集約し、support時間を測る。

### Day 61-90 - 100人準備

- 勝ちSKUをpack化する。
- case studyと紹介導線を作る。
- onboarding、support、billing、delete/exportを自動化する。
- 100人loadとtenant isolationを確認してから募集を広げる。

## 11. どこへ向かうか

```text
Phase 1  Sales execution OS
         3 pilot Cell -> 10道具 -> outcome課金

Phase 2  Service platform
         勝ちCellのpack / subscription / partner Cell

Phase 3  Partner and API economy
         外部開発者、metering、売上分配、marketplace

Phase 4  Personal Life OS
         仕事で証明したCoreを、予定、身体、心、お金、生活へ拡張

Phase 5  Essentials Distribution
         人間承認と検証済みvendorによる必要品・必要serviceの直接提供
```

短期のnorth starは登録者数でも会話数でもない。

> 1週間あたりの「receipt付きで完了し、粗利が残ったoutcome数」

長期では、ユーザーが考える、作る、育てる、売る、届ける、学ぶを一つのCoreで回し、自分専用の安全な実行OSを持てる状態を目指す。

## 12. 今決めること

すぐ必要な意思決定は次の5つである。

1. `@Rockstar_ibot`をKai専用・非公開のowner Botとして確定する。
2. 最初の有料SKUをBrief、Course Module、Evidence Checkのどれにするか決める。
3. 最初の10人の候補と、pilotで扱う実案件を決める。
4. Paid SKUの合格条件、修正上限、返金条件を決める。
5. 2 Bot分離と顧客E2Eのreceiptが揃うまでpaid go-liveを保留する。

## 13. 事実・決定・提案の区分

| 区分 | 内容 |
|---|---|
| Gitで確認済み | `@avocadominibot`、Railway Core、Supabase、Mac bridge、3 executor、`byob_single` |
| owner決定 | Telegram Botは2つ。`@Rockstar_ibot`と`@avocadominibot` |
| この文書の設計判断 | owner Botとcustomer Botを権限・deploymentで分離する |
| 未確認 | `@Rockstar_ibot`の現在のtoken、webhook、実送受信receipt |
| 未承認 | price、課金開始、subscription、外部への自律実行 |

## 14. 参照した正本

- `project.md`
- `README.md`
- `config/owner-public.json`
- `docs/owner-account-registry.ja.md`
- `docs/avocadomini-release-gates.ja.md`
- `docs/avocadomini-telegram-rooms.ja.md`
- Git履歴上の`Rockstar_ibot` Telegram登録・統合記録

この文書は、現行Gitの内容とKaiの「Telegram Botは2つ」という訂正を統合した事業設計である。現在の`project.md`等に残る1公開Bot前提は、実装変更と公式receiptを伴う別作業で同期する。
