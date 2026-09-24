# Rockstar_ibot — Telegram販売司令塔

Rockstar_ibotの販売機能（内部互換名`Mr. Commerce`）は、Telegramを操作画面にして、商品・販売施策・承認・実行・provider readback・結果を一つのtenant-scopedな流れへ接続します。別の公開Botを増やさず、MrBotの既存Telegram gatewayとRockstar_ibotの実行台帳を再利用します。

Rockstar_ibotは、Mr. Bot、BotMother、Baby、Life Guardと並ぶ会話profileではありません。`/commerce`で開く販売業務ワークスペースです。会話profileを切り替えずに利用でき、`/main`で全体司令塔へ戻れます。Babyは外部案件による収益化、Rockstar_ibotは自分の商品販売を担当するため、両者の責務は分離します。

## 現行プランとコネクタ選択

- 現行DBと`/tools`は、商品ツールではなく外部接続先（connector key）を選択しています。
- 公開プランの「好きな3ツールまで無料」とはまだ課金単位が一致していません。
- 商品ツールとコネクタを分離する移行設計は `docs/doraemon-tool-modules.ja.md` を正本とします。
- 移行完了前に、コネクタ数を根拠として自動課金してはいけません。

`/tools`のボタンで現在選択・解除できるのは次の10コネクタです。

| connector | 主な役割 | 現在のruntime境界 |
|---|---|---|
| Telegram | 配信・納品通知 | 選択可能。Commerce executor登録待ち |
| X | 投稿・指標readback | adapter接続待ち |
| Telegram Stars | digital商品の決済 | adapter接続待ち |
| Stripe | 決済・購読・返金 | merchant adapter接続待ち |
| Email | 配信・delivery receipt | sender・同意・adapter接続待ち |
| Landing Page | 下書き・公開・分析 | hosting adapter接続待ち |
| LMS | course・enrollment・完了 | vendor adapter接続待ち |
| Software License | 発行・確認・失効 | signing/provider adapter接続待ち |
| Community | 招待・権限・状態 | vendor adapter接続待ち |
| Brain Import | 許可済みexportの取込 | importer接続待ち |

### 「選択」「接続」「実行可能」は別

1. ボタン選択は無料枠を確保するだけです。
2. OAuth/API設定後、provider固有の接続フローがsetup referenceとruntime adapter referenceを検証します。
3. 検証済みの2参照が揃って初めて`connected`になります。
4. templateに必要な入力とadapterが全て揃った工程だけが`ready`になります。

秘密鍵・token・passwordはCommerce DBへ保存しません。vault等の参照URIだけを保存します。選択操作から接続済み状態や架空のadapter URIを合成することもありません。

## ボタン一つの統合フロー

`/product 商品名 | 種別 | 価格`で商品を作ると「発売まで自動で組む」ボタンが表示されます。押すと、選択済みツールのうち`launch_offer`に関係する全ツールを同じplanへfan-outします。接続不足があれば不足項目を出し、外部操作はしません。

```text
最終成果と期限
  ↓ 逆算
決済準備 → LP/LMS等の準備 → X/Telegram/Emailで告知
  ↓
人間の承認
  ↓
Rockstar_ibot共有runtime queue
  ↓
公式provider readback → 結果 → 次に必要な判断
```

実装済みtemplateは以下です。

- `launch_offer`: 商品発売
- `recover_revenue`: 決済失敗の回収
- `deliver_order`: 購入後の納品・権限付与・通知
- `nurture_customer`: 購入者の利用・継続支援

各工程は期限から`latest_start_at`を逆算し、その時刻を共有queueの`available_at`へ設定します。後続工程は、依存する前工程が`completed`になるまでclaimされません。

## Telegram入口

| 入口 | 動作 |
|---|---|
| `/commerce` | 販売司令塔メニュー |
| `/tools` | 現行コネクタ選択・解除。商品ツール3枠への移行前 |
| `/product` | 商品下書きとワンタップ発売ボタン |
| `/workflow` | 種類・対象・期限から統合planを作成 |
| `/today` | 承認待ち・接続待ち・次の一手を要約 |
| `/factcheck` `/content` `/campaign` | 単独job案。executor未接続なら実行済みとは扱わない |
| `/orders` `/customers` | tenant内の実レコードだけを表示 |
| `/delivery` | 注文に紐づく納品job案 |
| `/analytics` | receiptがある実数だけを集計 |
| `/pause` | 新規承認・queue投入を拒否し、未開始Rockstar_ibot jobのclaimを停止 |

## 承認・停止・再試行

Workflow承認は次の状態を通ります。

```text
approval_required → queueing → queued → provider readback待ち
```

- `queueing`で承認者・承認時刻・plan digestから決まる`approval_ref`を固定します。
- 各runtime jobは`workflow_ref`と`approval_ref`を持ちます。
- DBのworkflowが`queued`で同じ承認参照を保持するまでjobはclaimできません。
- enqueue途中で障害が起きても、決定論的job IDで同じ工程を安全に再投入できます。
- 承認時点で逆算開始時刻を過ぎていれば、黙って工程を圧縮せず再planを求めます。
- `/pause`中は新規承認を拒否し、既にqueuedだが未開始のRockstar_ibot jobもclaimしません。実行中だった外部効果は二重実行を避けるためreconcileします。

`queued`は外部完了を意味しません。message ID、payment ID、subscription state等の公式readbackを受け、共有runtime receiptが`completed`になった時だけ後続工程へ進みます。

## 価値のあるデータを減らさない

価値の中心は個人情報や会話本文ではなく、次の閉ループです。

```text
対象状態 → 提案理由 → 承認 → 実行対象 → provider readback → 購入/継続/返金/解約
```

保存対象は、tenant内ID、商品・offer・content version・campaign・experiment・workflow・plan digest・step・connector・capability・理由code・接触段階・結果label・receipt参照です。本文、email、token、credential、複数merchantを横断する人物IDは保存対象外です。

同意、experiment assignment、eligible/delivered exposure、承認、enqueue、provider readback、outcomeはappend-only eventとして接続します。これにより短期売上だけでなく、返金・解約・継続を含めて「どの判断がどの結果につながったか」を検証できます。

## 現在の完了境界

このブランチで実装しているのは、catalog、無料5枠、tenant分離、接続証明、統合plan、逆算schedule、Telegramの選択/発売/承認ボタン、承認/停止/依存関係gate、共有runtime queue、readback契約、append-onlyイベント契約です。

各providerのOAuth画面・実executorはまだ含みません。したがって「ボタンで選べる」は実装済みですが、「10ツールすべてへ本番投稿・決済・権限付与できる」とはまだ主張しません。次段階は、providerごとに接続フロー、adapter、official readback verifierを追加し、同じ契約テストへ通すことです。
