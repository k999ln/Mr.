import { PRIVACY_VERSION } from "../../lib/lead-constants";
import Link from "next/link";

export default function PrivacyPage() {
  const contact = process.env.DORAEMON_PRIVACY_CONTACT || "公開前に連絡先を設定します";
  const legalName = process.env.DORAEMON_LEGAL_NAME || "公開前に正式な送信者名を設定します";
  const legalAddress = process.env.DORAEMON_LEGAL_ADDRESS || "公開前に住所を設定します";
  return <main className="legal-page"><Link className="wordmark" href="/">avocadomini<span>/</span>10</Link><p className="eyebrow">PRIVACY / {PRIVACY_VERSION}</p><h1>Telegram BOT・無料資料・メール配信に関する情報</h1><h2>運営・問い合わせ</h2><p>送信者：{legalName}<br />住所：{legalAddress}<br />問い合わせ先：{contact}</p><h2>Telegram BOTで取得する情報</h2><p>Botを開始すると、TelegramのユーザーID・チャットID、表示名、同意文面版、選択したツール、決済結果とTelegram決済ID、操作・結果記録を取得します。無料枠の開始にメールアドレスやカード情報は求めません。</p><h2>無料資料フォームで取得する情報</h2><p>メールアドレス、任意回答（商材種別、注文数帯、利用チャネル、課題、Telegram利用状況）、同意日時・同意文面版、UTM、資料取得履歴を取得します。</p><h2>利用目的</h2><p>Botの利用権限管理、二重処理・不正利用の防止、販売業務の実行と検証、無料資料の送付、同意した方への情報配信、施策別の集計分析に利用します。販売者をまたいだ人物追跡や、入力情報の第三者販売には利用しません。</p><h2>外部サービス</h2><p>Botとデジタル商品の決済にTelegramおよびTelegram Stars、ホスティングと保存にCloudflare、メール送信にResendを利用します。当サイトとBotはカード番号を取得・保存しません。</p><h2>選択と停止</h2><p>案内メールは任意です。各メールの配信停止リンクから解除できます。削除・訂正の依頼先：{contact}</p><h2>保持</h2><p>不要になった個人情報は削除します。同意・配信停止・決済・返金・不正防止に必要な記録は、法令対応と権利保護に必要な範囲で保持します。</p><Link href="/">サイトへ戻る</Link></main>;
}
