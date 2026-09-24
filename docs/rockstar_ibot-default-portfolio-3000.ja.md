# Rockstar_ibot One — First 3000 default portfolio

**Status:** design candidate

**Machine-readable contract:** `config/service-portfolios/default-3000.json`
**Purpose:** 最初の3,000人へ提供する標準パッケージを固定し、個人別変更を安全な差分として扱う。

## 結論

デフォルトパッケージ名は **Rockstar_ibot One** とする。

> **考える、作る、育てる、売る、届ける、学ぶを一つに。**

「全人類に必要なすべて」を最初から主張しない。最初の3,000人は、知識・コンテンツ・デジタル成果物を一人または小規模で販売する人へ絞る。

- クリエイター
- フリーランサー
- 一人会社
- 小規模な専門サービス事業者

Upworkの2025年調査では、企業がweb design、生成AI、動画制作などの専門スキルを外部人材に求めていること、generalistよりspecialist需要が強まっていることが報告されている。このため、最初のポートフォリオは「何でもAI」ではなく、検査可能な専門成果へ分ける。[Upwork Research Institute](https://www.upwork.com/research/in-demand-skills-2025)

IABの2025年調査でも、creator領域では支出拡大と同時に、成果測定・標準化・運用ツールが課題とされている。Createだけでなく、Sell・Learn・Money Lensまで一つの標準パッケージに含める理由はここにある。[IAB Creator Economy Report](https://www.iab.com/insights/2025-creator-economy-ad-spend-strategy-report/)

## 名前負けさせない条件

Rockstar_ibotという名前を使う以上、単発の文章生成画面では足りない。最低限、利用者の活動を次の一周として閉じる必要がある。

```text
Command
  ↓ 次の一手を決める
Create
  ↓ 価値を成果物にする
Grow
  ↓ 必要な人へ見つけてもらう
Launch / Sell
  ↓ 購入可能な形にする
Deliver
  ↓ 契約どおりか検査して届ける
Learn + Money Lens
  ↓ 顧客反応と採算を次の判断へ戻す
```

すべてを自動実行することが「高性能」ではない。事実、権限、品質、採算を確認し、不明なら止まれることまでを性能に含める。

## Life Core — 全員に共通する4機能

### Command

目標、注文、期限、証拠から「今やる一手」を1つに絞る。長い提案リストではなく、理由・期限・必要時間・停止条件を表示する。

### Proof Vault

本人の実績、公開プロフィール、利用許可、顧客条件、成果物receiptを分離して保存する。期限切れまたは用途外の事実をAIへ渡さない。

### Money Lens

売上、返金、AI原価、保存費、サービス別粗利を表示する。投資収益や将来売上を保証せず、実際に確定した取引だけを集計する。

### Life Guard

ユーザー分離、Service Cell分離、道具の権限、保存期限、品質検査、外部操作承認を強制する。ユーザーがカスタマイズしても無効化できない。

## 標準ポートフォリオ — 交換可能な6枠

| 枠 | デフォルトCell | 約束する結果 | 初期性能目標 |
|---|---|---|---|
| Create Studio | YouTube Script Writer | 事実に基づく収録可能な台本一式 | 10分以内・修正1回 |
| Growth Studio | SEO Blueprint | 読者中心の発見・記事設計 | 15分以内・修正1回 |
| Launch Studio | Landing Page Sprint | CTAが動く1ページLP | 45分以内・修正1回 |
| Sales Desk | Sales Objection Reply Builder | 質問へ答える返信とproof gap | 3分以内・修正1回 |
| Customer Intelligence | User Interview Synthesizer | 根拠付き意思決定memo | 15分以内・修正1回 |
| Delivery Guard | Gig Delivery Verifier | 契約と成果物の一致判定 | 10分以内・証拠必須 |

時間は公開保証ではなく、First 3000で検証する内部SLOである。実測分布、再生成、待ち時間を取得してから外部SLAへ昇格する。

SEO Cellは検索順位を約束しない。Googleも有用性、信頼性、読者中心、独自価値を重視し、自動的な上位表示の秘密はないと明記している。[Google Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

## 人によって変えられる仕組み

各ユーザーはRockstar_ibot Oneを土台に、自分のPortfolio Overlayを持つ。

```json
{
  "base_portfolio": "rockstar_ibot-one.default-3000.v1",
  "owner_id": "private-owner-reference",
  "overrides": {
    "slot.create": "short-video-script-writer",
    "slot.grow": "seo-article-renewal",
    "slot.launch": "portfolio-site-sprint",
    "language": "ja",
    "monthly_budget": "private-setting",
    "notification_cadence": "daily"
  }
}
```

変更できるもの：

- 不要な任意枠の無効化
- 枠ごとの許可済みCell差し替え
- 言語、tone、brand、出力形式
- 予算、回数、通知頻度
- 検証済みプロフィールの事実

変更できないもの：

- ユーザー・注文・Cell間の分離
- 証拠なしの完了報告禁止
- 未確認の本人実績・数値・URLの禁止
- 品質検査と保存期限
- 外部操作と継続課金の明示承認

AIは利用履歴からCell変更を提案できるが、勝手に変更、課金、有効化しない。変更はユーザー承認後にversion付きoverlayとして保存し、元のdefaultへ戻せるようにする。

## Portfolio Value Index

個人別Portfolioが成長すると「価値が上がる」状態を、曖昧なAI評価ではなく実取引から測る。この指数は会社の金融上のvaluationではなく、Service Cellの運用品質を比較する内部指標である。

| 指標 | 重み |
|---|---:|
| 実際に支払われた需要 | 25% |
| 再購入・継続利用 | 20% |
| 返金後の粗利 | 20% |
| 人手を隠さない自動完了率 | 15% |
| 品質合格・低返金 | 10% |
| 他環境へ移せる標準化 | 10% |

クリック、生成回数、モデルの自己評価、未回収売上は価値へ加算しない。Cell追加より、再購入されるCellの品質と採算改善を優先する。

## 3,000人の容量設計

manifestでは次を計画値とする。

- 登録者：3,000人
- DAU仮定：30% = 900人
- 1人1日：4 job
- 1日：3,600 job
- peak hour：15% = 540 job/hour
- 平均処理時間：120秒
- 理論上の同時処理：18
- load test：同時60、理論値の3倍超

これは実容量の証明ではない。キュー待ち時間、モデルproviderのrate limit、大容量LP生成、再試行、ファイル保存は別に測る。各Cellに独立queueと同時実行上限を持たせ、Sales Deskの短い処理がLP制作に塞がれないようにする。

## First 3000 rollout

### 0–100：価値確認

- YouTube、Sales、Customer Intelligenceの3 Cellだけを有効化
- 最初の価値到達10分以内
- 誤った所有者情報・他ユーザー混入0
- 1人あたり週15分を超える隠れた人手対応を禁止

### 101–500：商品確認

- SEO Blueprintを追加
- 実価格で購入・返金・再購入を測定
- 自動完了率80%以上を目標
- Cell別の原価と粗利を表示

### 501–1,500：基盤確認

- Landing Page Sprintを追加
- 同時60の隔離load test
- 障害時の再実行、重複課金防止、復旧を実証
- データexport・削除・保存期限を実証

### 1,501–3,000：配布確認

- 個人別Portfolio Overlayを一般提供
- 署名済みversion、段階配信、rollback
- 4週間継続率、返金率、粗利、support負荷で次の拡大を判定
- 未達Cellは無理に残さず、停止・改善・差し替え

## 課金

最初はCellごとの固定価格で、何に支払うかを明示する。利用量が反復して初めてpackまたはsubscriptionへ移行する。

継続課金を導入する場合、usage eventにはtenant、Cell、数量、時刻、重複防止IDを持たせる。Stripe Billingもmeter eventの一意識別子によるidempotencyを案内している。[Stripe Billing](https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works)

## 実装境界

現在すでに再利用できるもの：

- `skills/capafy/catalog/youtube-script-writer`
- `skills/capafy/catalog/sales-objection-reply-builder`
- `skills/capafy/catalog/user-interview-synthesizer`
- `skills/earn/gig-delivery-verifier`
- 検証済みowner profileとAI出力guard

未実装または標準Cellとして未完成のもの：

- SEO Blueprint
- Landing Page Sprint
- Portfolio Overlay保存・承認・rollback
- 統一store、決済、返金
- 3,000人向けtenant isolationとload test

したがってmanifestのstatusは`design_candidate`であり、実装済み、販売中、3,000人対応済みとは表現しない。

## First 3000の卒業条件

3,000登録だけでは成功にしない。次を同時に満たした時、次の配布段階へ進む。

1. 他ユーザー情報の混入0。
2. 未検証の所有者claim 0。
3. 納品の100%がartifact-bound evidenceを持つ。
4. 自動完了率80%以上。
5. 1ユーザーあたり人手supportが週15分以下。
6. 返金率5%以下を目標として実測。
7. 4週継続率30%以上を目標として実測。
8. サービス別粗利70%以上を目標として実測。
9. 署名済みgreen releaseとrollbackが動く。

目標未達を個別受託で補わない。Cellの範囲、入力、価格、工程のどこが原因かを修正する。
