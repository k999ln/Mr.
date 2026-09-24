# ドラえもん X・LP・メール運用開始チェックリスト

**更新:** 2026-09-02

**所有者:** Kai

**状態:** 原稿・LP・PDF・無料3ツール→Starsアップグレード設計と実装は完成。X公開アカウントは`@doraemonbottt`で確定。Core、Telegram、DB、本番決済、公開承認は未完了。

値を表示せず現在の不足を再検査できます。

```bash
npm run marketing:check
```

## 1. 完成済み

- X向け30日×3投稿、合計90件
- 10ステップの週次スレッドと無料診断PDF CTA
- 商品説明・Telegram無料開始・4つ目からStars購入を説明するLP
- 6ページの「販売事故・売上漏れ10項目診断」
- メール、事業属性、同意、UTM、資料取得履歴のD1モデル
- Turnstile server-side検証
- Resend即時送付、4通の予約メール、配信停止時の予約取消
- プライバシー表示
- 型検査、lint、production build

## 2. Kai本人しか完了できないもの

秘密値はここやチャットへ貼らず、各サービスのSecret Storeへ入力します。

### X

- Kai所有のX公開アカウントは`@doraemonbottt`
- X DeveloperまたはKai所有PostizへOAuth接続する
- login、2FA、CAPTCHAを本人が完了する
- 最初の7日間は`draft_only`、承認投稿後に`publish_after_approval`へ変更する

旧所有者の`@diceai0`、`@selawmqt`や既存cookieは使用禁止です。

### メールとフォーム

- 送信用ドメインを所有し、ResendでDNS検証する
- `RESEND_API_KEY`をSites Secretへ登録する
- 公開From、Reply-To、削除依頼先を決める
- 正式な氏名または法人名、事業者住所を確定し、メール本文とプライバシー表示へ設定する
- 公開ドメイン用Turnstile widgetを作り、site keyとsecretを登録する

### Telegram

- BotFatherでKai所有Botを作る
- 公開Bot usernameだけを共有する
- tokenとwebhook secretはCoreのSecret Storeへ登録する
- `/start`→同意→無料3ツール選択→4つ目でStars確認→決済後10ツール解放を本人のTelegramで確認する

### Stripe

以下は既存購入導線との互換用です。新規ユーザーの既定導線はTelegram Starsです。

- Kai所有Stripeのtest modeで、4,980円・買い切りの商品とPayment Linkを作成済み
  - Payment Link: `plink_1UAbQCGznhTYdjxQzkMZ9fkR`
  - Product: `prod_VAxKmSVDw18pp0`
  - Price: `price_1UAbQ6GznhTYdjxQKX9kYe4W`
  - テストURL: `https://buy.stripe.com/test_4gMaEX2OK1yo4GX144c7u00`
- StripeのKYB入力項目は完了し、live modeが有効。test IDはlive設定へ流用しない
- live modeの商品とPayment Linkを作成済み（購入CTAへはCore E2E完了後に接続する）
  - Payment Link: `plink_1UAbpCGznhTYdjxQYsiqxV7Z`
  - Product: `prod_VAxkpB9OMq6NGF`
  - Price: `price_1UAbp4GznhTYdjxQfXIfIcbw`
  - URL: `https://buy.stripe.com/4gMaEX2OK1yo4GX144c7u00`
  - 表示価格: `4,980円`（内税設定、Stripe Taxの自動徴収は無効）
  - 2026-09-01時点でKYB項目は完了表示だが、Stripeの追加レビューにより一部機能が2〜3日停止中
- `checkout.session.completed`等のWebhookをCoreへ設定する
- webhook secretをCoreのSecret Storeへ登録する
- テスト決済→Telegram権限付与→返金→権限取消を確認する

### 公開判断

- 「ドラえもん」を商用名称として公開する権利リスクを確認する。第三者の著名な商標・キャラクターと衝突する可能性があるため、弁理士・弁護士確認または独自名称への変更が必要
- Sitesの新バージョンを全員公開してよいと明示承認する
- pilotの価格、対象者、提供範囲、返金条件を確定する

## 3. 発信から販売までの導線

```text
Xの教育投稿
  ↓ プロフィール固定投稿
無料診断LP（UTM付き）
  ↓ 必須の資料送付同意
診断PDFを即時送付
  ↓ 任意の情報配信同意
2・5・9・14日目メール
  ↓ 返信または診断申込
20分の導線診断
  ↓ またはLPから直接
無料3ツール → 4つ目でStars確認 → 10ツール解放
  ↓
利用・継続・返金・解約を検証
```

プロフィールの主CTAは一つにし、無料診断LPへ送ります。Telegram無料開始リンクは固定投稿とLP内に残しますが、日々の投稿で毎回売り込みません。

## 4. メール以外に取得する価値がある情報

| 情報 | 取得方法 | 用途 | 境界 |
|---|---|---|---|
| 商材種別 | LPの任意選択 | 教材・ツール・コミュニティ別の案内 | 自由記述で顧客情報を書かせない |
| 月間注文数帯 | LPのレンジ選択 | 運用規模の判定 | 正確な売上額は不要 |
| 利用チャネル | 複数選択 | 接続優先順位 | login ID・cookieは取得しない |
| 最大の詰まり | LPの選択 | 商談内容・教材改善 | センシティブ情報を書かせない |
| Telegram利用状況 | LPの選択 | 導入難度 | phone番号は取得しない |
| UTM | Xリンク | 投稿・スレッド別効果 | emailをURLへ入れない |
| 資料取得 | token付きリンク | 登録後の行動 | tokenは7日で失効、hash保存 |
| メール反応 | Resend event | 内容改善 | 任意配信同意者だけ |
| 診断申込・出席 | 将来Cal.com等 | 商談化の計測 | カレンダー公開範囲を限定 |
| 注文・返金・更新 | Telegram Stars / Stripe webhook | 本当の事業成果 | カード情報は保持しない |
| Telegram権限 | Bot/Core | 納品・利用状態 | 販売者横断IDを作らない |

## 5. 後から接続できるツール候補

必要になった時だけadapterで追加します。最初から全てを入れません。

- 投稿予約：PostizまたはX API
- 行動分析：PostHogまたはPlausible
- 商談予約：Cal.com
- フォーム拡張：TallyまたはTypeform
- メール：Resend
- 決済：Telegram Stars（既定）、Stripe（互換）
- 操作画面：Telegram Bot
- 実行接続：MCP、API、Webhook、必要最小限のRPA

選定条件は、API/Webhook、データexport、削除、同意管理、Kai所有アカウント、料金上限、障害時のreadbackです。人物追跡目的のfingerprintingや、同意なしの名寄せは採用しません。

## 6. 最初の7日

1. Kai所有X、Resend、Turnstile、Telegramを接続し、Stars価格を設定する。
2. 自分のメールでPDF取得と配信停止を確認する。
3. 無料3枠、4つ目のStars確認、成功後の10枠、返金後の権限取消を確認する。
4. Xプロフィールと固定投稿を無料診断LPへ統一する。
5. Day 1〜7を下書き登録する。
6. 毎日、朝・昼・夜の投稿を承認する。
7. 7日後にUTM、PDF取得、返信を確認し、仮説を一つだけ修正する。

## 7. 中止基準

- 本人所有でないアカウントや送金先しか接続できない
- PDF送付同意と任意メール同意を分けられない
- 配信停止後も予約メールが送られる
- Telegramの`successful_payment`またはStripeの公式Webhookなしに購入完了扱いする
- Telegram tokenや顧客データが公開ログへ出る
- 公開名称の権利リスクを解消できない
- 7日間のテストで資料未達、二重送信、誤権限付与が再現する

一つでも該当する場合、実投稿・実決済・一般公開を開始しません。
