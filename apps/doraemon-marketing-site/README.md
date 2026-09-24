# avocadomini 販売サイト

10個の販売機能をTelegramから動かす「avocadomini」の公開LPです。サイト上で機能を選択し、同意版と選択内容をTelegramへ引き継ぎます。複数機能の選択・初期調査は無料で、検証済みの価値ある結果を開示または実行する時だけTelegram Starsの購入確認へ進みます。

## 実装範囲

- Apple系の静かなプロダクト体験とGSAPアニメーション
- カード・メール登録なしでTelegramへ進む無料導線（Core側の`/doraemon`）
- 10機能の選択・初期調査は無料、価値ある結果の開示・実行時だけStarsを明示確認
- Cloudflare TurnstileによるBOT対策
- D1へのリード・同意・UTM・資料取得履歴の保存
- Resendによる診断PDFの即時送付
- 任意同意者への4通ステップメール
- ワンクリックではなく確認付きの配信停止
- iPhone対応の6ページPDF
- プライバシー情報ページ

## 必要環境

- Node.js 22.13以上
- npm
- SitesのD1 binding `DB`

```bash
npm ci
npm run db:generate
npm run lint
npm run build
```

## 本番環境変数

値はGitやチャットへ貼らず、SitesのSecret Storeへ保存します。

| 変数 | 秘密 | 用途 |
|---|---:|---|
| `DORAEMON_TELEGRAM_BOT_USERNAME` | いいえ | BotFatherで確認した公開Botユーザー名（現在は`avocadominibot`） |
| `DORAEMON_STARS_DISPLAY_PRICE` | いいえ | 特商法ページへ表示する実際のStars価格 |
| `DORAEMON_PUBLIC_ORIGIN` | いいえ | この公開サイトのHTTPS origin |
| `TURNSTILE_SITE_KEY` | いいえ | フォームへ表示するTurnstile site key |
| `TURNSTILE_SECRET_KEY` | はい | Turnstile server-side検証 |
| `RESEND_API_KEY` | はい | メール送信・予約・取消 |
| `DORAEMON_MAIL_FROM` | いいえ | 検証済みドメインのFrom |
| `DORAEMON_REPLY_TO` | いいえ | 返信受付メール |
| `DORAEMON_PRIVACY_CONTACT` | いいえ | 削除・訂正依頼の公開窓口 |
| `DORAEMON_LEGAL_NAME` | いいえ | 正式な氏名または法人名 |
| `DORAEMON_LEGAL_ADDRESS` | いいえ | メール本文に表示する事業者住所 |

Turnstile、メール、正式な送信者表示のいずれかが欠けると、リード受付は503で停止します。個人情報だけ保存して資料が届かない状態を作りません。

## データ

`db/schema.ts`の4テーブルを使います。

- `marketing_leads`: メール、任意の事業属性、同意、UTM、配信状態
- `lead_download_tokens`: 7日間の資料リンクと取得回数
- `lead_email_schedules`: ステップメールの予約・取消状態
- `lead_events`: 取得、ダウンロード、配信停止などのイベント

販売者をまたいだ人物追跡ID、正確な売上額、顧客名簿、Stripe ID、Bot tokenは取得しません。

## 公開前確認

1. D1 migrationを適用する。
2. Turnstile widgetを公開ドメインへ登録する。
3. Resendで送信ドメインを検証する。
4. From、Reply-To、プライバシー窓口を設定する。
5. CoreのTelegram webhook、Stars価格、無料枠同意RPCを確認する。
6. テストメール、PDF取得、配信停止、予約メール取消を実データで確認する。
7. 所有者が公開版を承認してからデプロイする。

詳細は[運用開始チェックリスト](../../docs/doraemon-marketing-launch.ja.md)を参照してください。
