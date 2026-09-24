# Telegram Seller OS Bot 調査・設計まとめ

**作成日:** 2026-09-01
**対象:** Kai / avocadomini / Rockstar_ibot
**状態:** 調査・構想・既存実装監査まで完了。以下に記す外部配信、MCP実行、メール受信、共有multi-bot、全Service Cellは未完成。

## 結論

作るべきものは、単体の教材生成Botや自動投稿Botではない。

**Telegramを販売者の承認付き操作盤にし、情報収集、根拠確認、商品制作、集客、販売、納品、会員管理、顧客育成、証言再利用、次の商品開発までを閉じる「Seller OS Bot」**を、avocadomini / Rockstar_ibot Core上のService Cellsとして構築する。

販売者ごとに本人所有のBotFather Botを1つ接続する`byob_single`を維持する。Telegram上は1 Botでも、内部はCoreと複数Cellに分離し、権限、同意、外部操作、課金、証拠を一元管理する。

想定する商品メッセージは次のとおり。

> 毎朝Telegramに今日の販売施策が届く。承認するとX・Telegram・メールへ配信され、購入後の納品、会員管理、感想の許諾取得、LP掲載、再販、次の教材作成まで一つにつながる。

## ここで行ったこと

### 1. Telegram Botで可能なことを体系化した

Telegram Botを単なる自動返信ではなく、次を提供できる商用プラットフォームとして整理した。

- 会話、FAQ、AIアシスタント
- 通知、定期配信、アラート
- グループ、チャンネル、コミュニティ管理
- 商品販売、決済、購読、会員権限
- Mini AppによるEC、フォーム、会員ページ、管理画面
- 教材配布、クイズ、進捗、ゲーム
- CRM、サポート、予約、社内ワークフロー
- ファイル、音声、画像、PDF処理
- 外部API、AI、データベース、IoTとの連携

同時に、Botは未接触ユーザーへ勝手にDMを開始できないこと、グループ権限、Privacy Mode、配信レート、Secret Chat非対応、決済区分などの制約も確認した。

### 2. Telegram Bot、Mac、MCPの違いを整理した

- **Telegram Bot:** Telegram上の特殊アカウントと、そのBot APIに接続するバックエンド。
- **Mac:** BotやローカルMCP Serverを動かせる端末の一つ。Botそのものではない。
- **MCP:** AIアプリが外部ツール、データ、サービスを利用するための共通プロトコル。Botそのものではない。

推奨構成は次のとおり。

```text
Telegramユーザー
  ⇅ Telegram Bot API
販売者本人のBot
  ⇅
Botバックエンド / AIエージェント
  ├─ identity / permission / consent
  ├─ approval / queue / audit / receipt
  └─ MCP Client
       ├─ Web・検索・Fact Check
       ├─ Notion・Drive・Docs・Storage
       ├─ X・投稿管理サービス
       ├─ Stripe・CRM・メール
       ├─ CMS・LP・Analytics
       └─ 必要時のみローカルMac
```

逆方向に、Telegram Bot APIをMCP Serverで包み、CodexやClaude等からTelegramへ通知・承認依頼を送る構成も可能。ただしTelegram公式がMCPを直接提供しているわけではなく、アダプターが必要になる。

### 3. MCP連携が有効な用途を整理した

MCPは、固定APIを1回呼ぶだけのBotよりも、自然言語から複数サービスを横断する処理で価値が高い。

- 今日の予定、重要メール、期限タスクを横断して日次要約
- 音声、PDF、画像を処理し、NotionやDriveへ保存
- CRM、注文、過去対応を確認して返信案を作成
- Webと社内資料を調査して教材・投稿・LPを生成
- GitHub、ログ、監視、デプロイ履歴を横断して障害調査
- 外部送信、LP公開、返金、デプロイ等をTelegramで承認
- 同じMCP ServerをTelegram、Web Hub、Codex等から再利用

単純な定期通知、固定フォーム、単一API照会では、MCPを挟まず直接APIを呼ぶ方が簡単で安定する。

### 4. 商売でTelegramを使う層の商材を分類した

対象として次を検討した。

- 教材、オンライン講座、一般情報商材
- ソフトウェア、AIツール、テンプレート
- 物販
- コミュニティサブスク
- 成人向けコンテンツ
- 株、暗号資産等の情報商材

市場で販売されているBotの代表パターンは、会員制・サブスク管理、Mini App型EC、マーケティング・CRM、コミュニティ管理、金融・暗号資産アラートに大別できる。ただし各ベンダーの機能紹介は市場シェアや品質の証明ではない。

### 5. ユーザーが提示した販売フローを一つの閉ループへ統合した

提示された要素は次のとおり。

- 教材を作る
- ファクトチェックする
- コースのフォント、ブランド、体裁を整える
- X投稿を作成・投稿する
- マーケ情報をプールして毎日Telegramへ送る
- Brainや購入者のコメントをX、LPへ利用する
- コメント・紹介と割引を連動する
- 反応を基に新規教材を作る
- 購入者メールリストを生成して配信する

これを以下の閉ループとして設計した。

```text
Brain・情報プール
→ 調査・Fact Check
→ 教材・商品制作
→ LP・X・Telegram・メール
→ 見込み客登録
→ 決済確認
→ 納品・会員権限
→ 利用支援・コミュニティ
→ 質問・感想・離脱データ
→ 掲載許諾・証言・紹介
→ 再販・次の商品開発
```

### 6. 現行avocadomini / Rockstar_ibot設計との整合性を確認した

現行SSOTと所有権資料を読み、次を確認した。

- Telegramは`byob_single`がdefault。
- `1 deployment = 1 operator = 1 provider secret set`を維持する。
- Telegram、Stripe、メール、SNS等はKai本人所有の接続先だけを使う。
- 未設定credentialを旧所有者の値で補完しない。
- 外部操作はcapability、approval、outbox、provider readback、receiptで管理する。
- 長時間処理はHTTP request内で完了させず、Cell別queueへ送る。
- 現在の外部AI/MCP packageはcatalog metadataまでで、実行は意図的に無効。
- 多数の販売者所有Botを単一shared processへ格納する構成は未実装。

## 得られた成果

### 成果1: 商品の中心を「生成」から「販売運用の閉ループ」へ定義できた

教材、投稿、LPを生成するだけでは差別化が弱い。価値の中心を次に定めた。

- 投稿から購入への帰属
- 決済後の確実な納品
- 会員権限と期限管理
- 顧客の同意と配信停止
- 証言の原文、許諾、特典関係
- 再購入、更新、紹介
- 顧客反応から次の商品を作る仕組み
- 全外部操作のreceipt

### 成果2: 1 Bot・3つの利用面を定義できた

1. **販売者用非公開司令室** — 制作、承認、顧客、売上、設定。
2. **購入者用Bot / Mini App** — 商品、購入、納品、サポート、感想、配信設定。
3. **チャンネル・グループ用Bot** — 会員権限、FAQ、要約、定期投稿、モデレーション。

管理者機能はTelegramの表示名ではなく、検証済み`from.id`、`chat.id`、installation、roleで制御する。

この3面は「誰がどこで使うか」の区分であり、内部の担当名とは別軸である。現行表示は次の4階層に固定する。

1. **公開Bot** — `@avocadominibot`の1つだけ。
2. **会話profile** — Mr. Bot、BotMother、Baby、Life Guard。16会話スタイルはprofileへの表現overlay。
3. **業務workspace** — Rockstar_ibot。`/commerce`で開く販売・決済・顧客管理画面であり、21個目のprofileや別Botではない。
4. **外部connector** — Telegram、X、Stripe、LMS等。選択、接続、実行可能を別状態として扱う。

責務が近く見えるBabyとRockstar_ibotは、Babyを「外部の仕事・案件から報酬を得る計画」、Rockstar_ibotを「自分の商品を販売し購入者を管理する業務」に分ける。Life Guardは両者の安全・権限・証拠を横断検査するが、実行主体にはならない。

### 成果3: 内部Service Cellsを定義できた

#### Core

- owner / user identity
- RBAC、権限、同意
- 商品、購入、顧客、権利の共通モデル
- scheduler、queue、retry、dedupe
- approval、audit、receipt
- capability、credential reference、provider readback

#### Brain / Information Pool Cell

- Telegramメモ、音声、PDF、画像、過去教材
- Notion、Drive、Web、ニュース、公式資料
- 顧客質問、コミュニティ話題、投稿反応、販売結果
- 重複排除、出典、日付、関連商品、投稿済み状態
- 毎日の教材候補、投稿候補、古い情報、顧客課題の要約

#### Fact Check Cell

- 主張単位の検査
- 一次資料、URL、取得日時、引用箇所
- 支持、反証、確度、未確認点、更新期限
- `verified / conditional / unverified / expert_review`

Fact CheckはAIによる再回答ではなく、根拠台帳を成果物にする。

#### Course Factory Cell

- 対象顧客、課題、到達点
- 章、レッスン、原稿、ワーク、クイズ、FAQ
- PDF、スライド、動画台本、Telegram分割講座、メール講座
- 版管理、訂正、更新期限、追加教材
- 購入者質問と離脱箇所から新レッスンを提案
- フォント、色、余白、行間、可読性、商用ライセンス、埋め込み権限

#### Campaign / Distribution Cell

- X単発、スレッド、返信案
- Telegramチャンネル、Botセグメント配信
- メール、LP、FAQ、短尺動画台本
- 重複、危険表現、リンク、出典の検査
- Telegram上の差分表示と承認
- 投稿URL、message ID、provider IDのreadback

#### Funnel / LP Cell

- LP、無料教材フォーム、Deep Link、UTM、紹介コード
- クーポン、期限、対象商品、利用回数
- A/Bテスト、放棄カート、アップセル、ダウンセル
- staging、差分プレビュー、承認、公開readback、rollback

#### Customer Proof Cell

- 購入者確認、感想依頼、原文保存
- 実名・匿名、掲載媒体、掲載期間、編集範囲
- X、LP、メールへの掲載許諾
- 特典提供関係、撤回、削除
- 紹介コードと売上帰属

#### CRM / Email Cell

- メール取得元、利用目的、同意日時、配信内容
- 購入商品、セグメント、配信停止、bounce、complaint
- 購入完了、納品、オンボーディング、更新、再販、休眠復帰
- CSV exportは高権限操作として別承認

Telegram IDやusernameからメールアドレスを自動取得することはできない。Mini App、LP、決済、購入後フォーム等で本人から明示的に取得する。

#### Commerce / Entitlement Cell

- 商品、価格、決済、purchase receipt
- 教材納品、ダウンロード権限、限定チャンネル招待
- サブスク更新、期限切れ、refund request
- クーポン、紹介、売上集計、アップセル

#### Community Cell

- 参加権限、期限切れ退出、invite link
- onboarding、FAQ、要約、アンケート、イベント
- spam、BAN、MUTE、通報、モデレーション
- 質問や話題をBrainへ戻す

### 成果4: 商材別Vertical Packを定義できた

| 商材 | 固有機能 |
|---|---|
| 教材・一般情報商材 | 分割配信、進捗、Q&A、理解度確認、版管理、追加教材、アップセル |
| ツール | license発行、初期設定、利用状況、障害通知、更新、解約防止 |
| 物販 | SKU、在庫、注文、配送、返品、再入荷、再購入 |
| コミュニティ | 決済連動の参加権限、期限切れ退出、紹介、要約、FAQ、moderation |
| 成人向け | 年齢・地域・権利確認、転載対策、通報、削除、媒体・決済審査 |
| 株・金融情報 | 出典、取得時刻、訂正履歴、免責、実績検証、誇大表現検査 |

成人向けと金融情報は共通MVPに含めず、追加審査と強いpolicy gateを持つ別Packにする。金融の初期範囲は一般情報の出典付き配信までとし、自動売買、送金、利益保証、無登録の個別投資助言は対象外とする。

### 成果5: 自動化と人間承認の境界を定義できた

#### 自動化しやすい処理

- 情報収集、分類、重複排除
- 非公開の日次要約
- 原稿、教材、返信、LPのdraft
- Fact Check候補と出典提示
- 顧客segment候補
- 売上、反応、離脱分析
- purchase receipt確認後の既定商品の納品
- 既存ルールに基づく権限期限管理

#### 毎回または限定grantで承認が必要な処理

- X、Telegram、メールの外部送信
- LP公開・公開内容変更
- 顧客コメントの転載
- 割引、価格変更、返金
- メールリストexport
- 大量配信
- 成人向け・金融情報の公開
- shell、deploy、削除、権限変更
- 新しい自動化ルールの有効化

固定キャンペーンは、対象、期間、送信上限、予算、停止条件、使用テンプレートを承認した場合だけ限定自動運転へ昇格できる。

### 成果6: 実装優先順位を定義できた

#### Phase 1 — 売上の土台

- BYOB Bot
- canonical identity
- 商品、購入、顧客、entitlement
- Stripe / Stars receipt
- 納品、会員権限
- 同意付きメール取得
- audit、dedupe、receipt

#### Phase 2 — 毎日のマーケ司令室

- Brain、情報プール、Fact Check
- X、Telegram、メールdraft
- Telegram承認
- 投稿・配信readback
- 日次売上・マーケレポート

#### Phase 3 — 顧客の声・紹介ループ

- 感想依頼
- 掲載許諾、匿名化、撤回
- 評価内容に依存しない公平な特典
- LP / X候補
- 紹介コード、売上帰属

#### Phase 4 — 教材ファクトリー

- 質問、販売結果、反応から新教材提案
- コース、原稿、PDF、スライド
- Brand Kit、フォント、体裁
- 根拠台帳、版管理、訂正

## 現在の途中課題

### 1. 現行コードの完成度

実装済みまたは一部実装済み：

- `byob_single`の独自Telegram Bot接続
- hidden token入力、`getMe`照合、Webhook takeover guard、readback
- Stripe署名済み購入イベントからのentitlement更新
- Commerce用Telegram UIの一部
- MCP Registry互換manifestとRockstar_ibot権限overlay
- Service run受付、audit、outboxの一部

未完成：

- 6 Service Cellのexecutor、outbox consumer、artifact納品
- Core / Hub / Telegram / mobileのcanonical identity
- メール受信本文取得、Svix署名、fresh Gmail binding
- 一般配布用のSNS publish lane
- X専用connectorと投稿receipt
- LPの独立build、staging、publish、rollback
- Starsを含む統一商品・課金・税・返金
- 顧客同意、testimonial、email subscriptionの共通data model
- 外部MCPのisolated executor、credential broker、egress gateway
- 3,000人load、tenant isolation、support console
- 多数の販売者所有Botを共有SaaSへ接続するinstallation registry

設定値を追加しただけでこれらが動くわけではない。

### 2. shared multi-bot問題

現在安全に扱えるのは次の2構成。

- 販売者ごとに独立deploymentと1 Bot
- 運営が所有する1 Botを複数購入者が利用

「多数の販売者が各自のBotを1つの共有processへ接続」は未実装。必要になるもの：

- tenant別`telegram_bot_installations`
- secret vault reference
- Bot別Webhook route / secret
- `(installation_id, chat_id)` identity
- `(installation_id, update_id)` dedupe
- Bot別outbound queue、429、`retry_after`
- cross-bot isolation test

process-global envへ多数のBot tokenを詰め込まない。

### 3. メールリストと個人情報

- Telegramからメールを自動抽出できない。
- 購入者であることと広告メール同意は別に管理する。
- 利用目的、保存期間、配信停止、外部委託先を記録する。
- メールリストexportは漏えい影響が大きいため、管理者再確認と監査receiptが必要。
- buyer、subscriber、community member、leadを同一視しない。

### 4. 顧客コメント、割引、ステマ

- 「高評価、星5、推奨コメントを書けば割引」は禁止方向にする。
- 特典を出すなら評価内容に関係なく同条件にする。
- 原文、編集差分、購入確認、特典、掲載許諾を保存する。
- X、LP、メールごとに掲載権限を分ける。
- AIが存在しない証言を作成しない。
- 広告・PR関係を消費者が判別できるよう表示する。

### 5. ファクトチェックの限界

- 「AIが確認した」を完了証拠にしない。
- 一次資料を優先し、出典日と引用箇所を保持する。
- ニュース、市場価格、法律、規約、金融情報は更新期限を持たせる。
- 反証と未確認点も表示する。
- 金融、健康、法律等は人間または専門家reviewへ送る。

### 6. X、Telegram、メールの配信リスク

- 外部送信はRead / Draft / Publishを分離する。
- 同じ投稿やメールの二重送信をidempotency keyで防ぐ。
- 投稿成功はモデル出力やHTTP受付だけでなく、provider ID、URL、message ID等で確認する。
- 無差別DM、同意のない大量配信、フォロワー操作を行わない。
- Botはユーザーが先に開始しない限り個別会話を開始できない。

### 7. 成人向け・金融Verticalのリスク

成人向け：

- 年齢、出演同意、権利、非同意画像、児童性的コンテンツ、削除依頼
- App Store、決済会社、Telegram、広告媒体、地域法
- 公開面とprivate entitlement面の分離

金融情報：

- 情報提供と個別投資助言の境界
- 取得日時、訂正履歴、リスク、免責
- 利益保証、誇大な実績、チェリーピッキング
- 自動売買、ウォレット、送金権限

両方とも共通MVPでは公開・配信をdefault denyにする。

### 8. Mac / local MCPの運用リスク

- Macが電源オフ、スリープ、ネットワーク断なら処理できない。
- ローカルMCP Serverをインターネットへ直接公開しない。
- localhost、認証付きprivate network、VPN、broker等を使う。
- shell、file delete、Git、browser操作は限定権限と承認を必要とする。

## その他の重要な判断

### Telegramを何に使い、何を外に出すか

Telegramに向いているもの：

- 指示、通知、承認、短い確認、サポート
- 写真、音声、PDF等のintake
- 日次要約、売上・異常通知
- 購入者との会話、コミュニティ

Mini App / Webに向いているもの：

- 商品一覧、カート、複雑なフォーム
- 教材閲覧、会員ページ、進捗
- LP編集、長い差分、analytics
- 同意、privacy、配信設定

バックエンドに置くもの：

- AI、MCP、queue、DB、credential
- fact ledger、customer、product、purchase、entitlement
- audit、receipt、readback、billing

### 推奨する商品構成

- **Core月額:** Bot、identity、商品、顧客、権利、承認、receipt
- **Growth Pack:** Brain、Fact Check、X、Telegram、メール、LP
- **Course Pack:** コース、PDF、スライド、版管理、Brand Kit
- **Community Pack:** サブスク、招待、期限、FAQ、moderation
- **Commerce Pack:** 物販、在庫、注文、配送、返品
- **High-risk Pack:** 成人向けまたは金融向け。個別審査と追加料金
- **Agency Pack:** 複数顧客、white-label、承認者分離。shared multi-bot完成後

初期収益は売上歩合より、導入設定費、Core月額、Cell追加、従量費の方が説明・監査しやすい。

### 残るプロダクト判断

- 公開商品名を`DORA Seller Bot`、`Seller OS Bot`、別名のどれにするか
- MVP対象を教材販売者、有料コミュニティ、物販のどこまで絞るか
- X投稿を公式API直結、Postiz等のadapter、両対応のどれにするか
- デジタル商品をStars中心、外部Web checkout中心、併用のどれにするか
- メールproviderとdouble opt-in方針
- LP/CMS provider
- 1販売者1deploymentを製品として維持する期間
- 投稿、配信、教材生成の利用上限と価格
- 顧客data retention、export、完全削除

## 重要ファイル

### 現行設計・所有権

- [`../project.md`](../project.md) — Rockstar_ibot全体設計のSSOT、Service Cells、BYOB Telegram、実装状態、ロードマップ。
- [`../config/owner-public.json`](../config/owner-public.json) — 公開してよいKai所有者情報・URLのSSOT。
- [`owner-account-intake.ja.md`](owner-account-intake.ja.md) — 外部アカウント準備状況、公開可能値と秘密値の境界。
- [`owner-tools-setup.ja.md`](owner-tools-setup.ja.md) — Telegram、Stripe、メール、SNS、AI等の接続状態と未完成箇所。
- [`telegram-bot-setup.ja.md`](telegram-bot-setup.ja.md) — BYOB BotFather Botの安全な接続手順。
- [`../config/legacy-owner-quarantine.json`](../config/legacy-owner-quarantine.json) — 旧所有者固有値の隔離ルール。

### Telegram・Commerce実装

- [`../apps/rockstar_ibot/lib/telegram-config.js`](../apps/rockstar_ibot/lib/telegram-config.js) — Bot identity、token、Webhook設定の検証。
- [`../apps/rockstar_ibot/scripts/configure-telegram.js`](../apps/rockstar_ibot/scripts/configure-telegram.js) — hidden token入力、`getMe`、Webhook登録・readback。
- [`../apps/rockstar_ibot/lib/telegram.js`](../apps/rockstar_ibot/lib/telegram.js) — Telegram runtime処理。
- [`../apps/rockstar_ibot/lib/telegram-reply.js`](../apps/rockstar_ibot/lib/telegram-reply.js) — Telegram返信処理。
- [`../apps/rockstar_ibot/lib/commerce-telegram-ui.js`](../apps/rockstar_ibot/lib/commerce-telegram-ui.js) — Commerce用ツール選択、承認UI、workflow proposal。
- [`../apps/rockstar_ibot/lib/bot-profile.js`](../apps/rockstar_ibot/lib/bot-profile.js) — 内部Bot profile選択。
- [`../packages/telegram-bot-family/catalog.json`](../packages/telegram-bot-family/catalog.json) — 1 Bot内の内部profile catalog。旧公開usernameは現行owner SSOTと一致しないため、現行の送信先・既定値として使わない。
- [`../apps/rockstar_ibot/migrations/2026-08-28-lm-bot-internal-profile.sql`](../apps/rockstar_ibot/migrations/2026-08-28-lm-bot-internal-profile.sql) — 内部profile保存migration。
- [`../apps/rockstar_ibot/migrations/2026-09-01-lm-doraemon-purchase-claims.sql`](../apps/rockstar_ibot/migrations/2026-09-01-lm-doraemon-purchase-claims.sql) — 購入claim / entitlement用migration。

### MCP・外部AI

- [`../integrations/ai-tools/`](../integrations/ai-tools/) — MCP Registry互換manifest、Rockstar_ibot権限overlay、registry、templates。
- [`../integrations/ai-tools/rockstar_ibot-tool.schema.json`](../integrations/ai-tools/rockstar_ibot-tool.schema.json) — effect、approval、credential、egress、receipt等のcontract。
- [`../integrations/ai-tools/templates/remote-mcp/`](../integrations/ai-tools/templates/remote-mcp/) — remote MCP package template。
- [`../scripts/ai-tool-package.mjs`](../scripts/ai-tool-package.mjs) — package scaffold、validation、catalog生成。

### 関連設計

- [`../docs/superpowers/specs/2026-07-29-rockstar_ibot-finance-marketing-platform-design.md`](superpowers/specs/2026-07-29-rockstar_ibot-finance-marketing-platform-design.md) — marketing、Postiz、metrics、receiptに関する大規模設計・履歴。
- [`../specs/29-CAPAFY-10K-MRR-CLOSED-LOOP.md`](../specs/29-CAPAFY-10K-MRR-CLOSED-LOOP.md) — marketing、subscription、MRR、Telegram receiptのclosed-loop参考設計。

## 重要な公式リンク

### Telegram

- [Telegram Bots](https://core.telegram.org/bots/)
- [Telegram Bot Features](https://core.telegram.org/bots/features)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Mini Apps — initData validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [Telegram Payments](https://core.telegram.org/bots/payments)
- [Telegram Stars](https://core.telegram.org/bots/payments-stars)
- [Telegram Subscriptions](https://core.telegram.org/api/subscriptions)
- [Telegram Business](https://core.telegram.org/api/business)
- [Telegram Bot Developer Terms](https://telegram.org/tos/bot-developers)
- [Telegram Ads Getting Started](https://ads.telegram.org/getting-started)
- [Telegram Ads Guidelines](https://ads.telegram.org/guidelines)

### MCP

- [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)
- [MCP Server Features](https://modelcontextprotocol.io/specification/2026-07-28/server/index)
- [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP Streamable HTTP Security](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP Authorization Security](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)
- [MCP Registry](https://github.com/modelcontextprotocol/registry)

### X・表示・個人情報・金融

- [X API — Manage Posts](https://docs.x.com/x-api/posts/manage-tweets/quickstart)
- [消費者庁 — ステルスマーケティング規制](https://www.caa.go.jp/policies/policy/representation/fair_labeling/stealth_marketing)
- [消費者庁 — ステルスマーケティングQ&A](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/stealth_marketing/)
- [個人情報保護委員会 — メールアドレスと個人関連情報](https://www.ppc.go.jp/all_faq_index/faq1-q8-2/)
- [個人情報保護委員会 — 個人情報保護法ガイドライン](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/)
- [金融庁 — 金融商品取引業者等向け監督指針・投資助言](https://www.fsa.go.jp/common/law/guide/kinyushohin/07.html)
- [金融庁 — 金融事業者登録ガイドブック](https://www.fsa.go.jp/policy/marketentry/guidebook/02.html)

### 市場参考例

以下は機能・商品構成の参考であり、安全性、品質、市場シェアを保証するものではない。

- [InviteMember](https://www.invitemember.com/) — Telegram/Discord会員制、購読、紹介、権限管理。
- [TelegaShop](https://telegashop.com/) — Telegram Mini App型EC。
- [Neurly](https://neurly.store/) — Telegram Store、CRM、分析。
- [SendPulse Telegram Chatbot](https://sendpulse.com/ru/features/chatbot/telegram) — シナリオ配信、CRM、メール連携。
- [ManyChat Telegram Integration](https://help.manychat.com/hc/en-us/articles/14281355805212-How-to-connect-your-Telegram-account-to-Manychat) — Telegram自動化。
- [Combot](https://combot.org/) — コミュニティ管理、分析、moderation。
- [Combot API / MCP](https://combot.org/api) — Telegram管理機能のAPI / MCP例。

## 次の実装判断

次に進む場合は、まずPhase 1を独立specにする。最初のspecでは、公開投稿生成より先に次を確定する。

1. `canonical_account_id`とTelegram / Stripe / email identity link。
2. `products`、`purchases`、`entitlements`、`customers`、`consents`。
3. purchase receiptから納品・権限付与までのidempotent state machine。
4. 管理者Telegram承認、期限、replay防止、audit receipt。
5. unsubscribe、testimonial permission、data export / delete。
6. 本人所有のprovider credentialがない場合のfail-closed動作。

この土台がない状態でX自動投稿、メール一斉配信、顧客コメント転載を先に有効化しない。
