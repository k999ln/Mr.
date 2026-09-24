import Link from "next/link";
import StartSelector from "./StartSelector";
import { telegramBotBaseUrl } from "../telegram-start";

export const dynamic = "force-dynamic";

export default function StartPage() {
  return <main className="start-page">
    <header className="start-header">
      <Link className="wordmark" href="/" aria-label="avocadomini トップ">avocadomini<span>/</span>10</Link>
      <span>CHOOSE YOUR TOOLS</span>
    </header>

    <section className="start-intro">
      <p className="eyebrow">無料・カード登録不要</p>
      <h1>最初に使いたい道具を、<br />1〜3つ選んでください。</h1>
      <p>選んだ道具は、そのままTelegramへ反映されます。すべての道具に共通のSafety Gateが入り、普通の文章で頼むと、まず無料の下書きや確認結果が届きます。</p>
      <div className="start-safety" aria-label="Safety Gateの動作">
        <strong>画面を奪わず、問題は安全な範囲で自己解決。</strong>
        <span>一時的な失敗だけを隔離環境で最大2回まで再試行します。</span>
        <span>認証・公開・送信・決済・結果不明は勝手に進めず、止めて確認します。</span>
      </div>
    </section>

    <StartSelector telegramBaseUrl={telegramBotBaseUrl()} />
  </main>;
}
