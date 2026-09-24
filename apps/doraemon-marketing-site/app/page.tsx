import EffectStory from "./EffectStory";
import LeadCapture from "./LeadCapture";
import ProofMechanisms from "./ProofMechanisms";
import ActionEffectValue from "./ActionEffectValue";
import SiteMotion from "./SiteMotion";
import FloatingAvocados from "./FloatingAvocados";
import Image from "next/image";
import CompactHome from "./CompactHome";

const steps = [
  ["01", "DRAFT", "普通の文章から、選んだ仕事の具体的な下書きを作成。"],
  ["02", "RECOVER", "一時的な失敗だけを、画面を触らない隔離環境で最大2回まで自動修復。"],
  ["03", "AUTHORIZE", "公開・送信・決済は、対象と内容を見てから個別に承認。"],
  ["04", "VERIFY", "接続済みサービスで実行した時だけ、外部の結果を再確認。"],
  ["05", "RECEIPT", "結果IDを保存し、確認できない操作を完了扱いにしない。"],
];

const manifestoTools = ["企画", "教材", "確認", "投稿", "LP", "販売", "決済", "納品", "会員", "分析"];

export function LongFormHome() {
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
  return (
    <SiteMotion><main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="avocadomini トップ">
          avocadomini<span>/</span>10
        </a>
        <nav aria-label="メインナビゲーション">
          <a href="/start">START</a>
          <a href="#story">10 TOOLS</a>
          <a href="#system">SYSTEM</a>
          <a href="#proof">PROOF</a>
          <a href="#diagnosis">FREE PDF</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <FloatingAvocados variant="whole" count={8} motion="rain" className="avocado-field--hero" />
        <div className="hero-copy">
          <p className="hero-kicker">avocadomini for Telegram</p>
          <h1>10の道具を、<br />ひとつに。</h1>
          <p className="hero-lead">作る。伝える。売る。届ける。<br />まずは、使える下書きから。</p>
          <div className="hero-actions">
            <a href="/start">はじめる</a>
            <a href="#story">10の道具を見る <span>›</span></a>
          </div>
        </div>
        <div className="hero-product" aria-label="Telegram上で10個の道具を操作するavocadominiの画面イメージ">
          <div className="hero-phone">
            <div className="hero-phone-top"><span>avocadomini</span><i>•••</i></div>
            <div className="hero-chat hero-chat-user">この教材を売って</div>
            <div className="hero-chat hero-chat-bot"><b>依頼を受付しました。</b><span>外部へ送らず、まず販売ページの下書きを作ります。</span></div>
            <div className="hero-tool-dock" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => <i key={index}>{index + 1}</i>)}
            </div>
          </div>
        </div>
      </section>

      <section className="manifesto" aria-labelledby="manifesto-title">
        <FloatingAvocados variant="emoji" count={10} motion="drift" />
        <div className="manifesto-copy site-reveal">
          <p className="eyebrow">WHY avocadomini</p>
          <h2 id="manifesto-title">人間は、<br />やりたいことを。<br /><em>AIは、下書きと確認を。</em></h2>
          <p className="sr-only">avocadominiは10の道具から必要なものを選び、普通の文章から下書きと確認を進めます。外部操作は利用者が内容を確認するまで行いません。</p>
          <div className="manifesto-demo" aria-label="ひとことの依頼から、選んだ道具が下書きを作り、利用者へ確認を返す様子">
            <div className="manifesto-demo-top">
              <span>avocadomini / SAFE DRAFT</span>
              <span className="manifesto-live"><i /> 稼働中</span>
            </div>
            <div className="manifesto-workflow">
              <div className="manifesto-request">
                <small>あなたが決める</small>
                <strong>「この教材を売って」</strong>
              </div>
              <div className="manifesto-engine" aria-hidden="true">
                <div className="manifesto-core"><span>D</span><small>つなぐ</small></div>
                <div className="manifesto-rail"><i className="manifesto-pulse" /></div>
                <div className="manifesto-tools">
                  {manifestoTools.map((tool, index) => <span className="manifesto-tool" key={tool}><i>{String(index + 1).padStart(2, "0")}</i>{tool}</span>)}
                </div>
              </div>
              <div className="manifesto-result">
                <small>確認できる形で返す</small>
                <strong><i>✓</i> 下書きができました</strong>
                <span>外部操作 0件</span>
              </div>
            </div>
            <div className="manifesto-demo-bottom">
              <span>作る</span><i>→</i><span>伝える</span><i>→</i><span>売る</span><i>→</i><span>届ける</span><i>→</i><span>確かめる</span>
            </div>
          </div>
          <div className="manifesto-finale">
            <p className="manifesto-finale-intro">自動化で、いちばん大切なこと。</p>
            <p className="manifesto-finale-primary">
              作った、送った、売れたを、<br className="manifesto-break" />
              <em>混ぜない</em>ということです。
            </p>
            <p className="manifesto-finale-secondary">
              下書きはすぐに。<br />
              外部操作は確認後に。<br />
              <strong>結果は証拠と一緒に。</strong>
            </p>
          </div>
        </div>
      </section>

      <section className="purchase-experience" id="buy">
        <FloatingAvocados variant="slices" count={8} motion="conveyor" />
        <div className="purchase-copy site-reveal">
          <p className="eyebrow">カードもメールも、いらない。</p>
          <h2>無料で使える。<br />1〜3つ。</h2>
          <p>あなたの抱える問題を解決するツールを選ぶだけ。</p>
          <a className="purchase-cta" href="/start">無料スタート <span>→</span></a>
        </div>
        <div className="purchase-device" aria-label="使いたい道具を選び、価値が見つかった時だけ購入を確認する画面イメージ">
          <div className="device-island" />
          <p>まず、選んで試す。</p>
          <div className="free-counter"><b>選択中</b><strong>3 / 10</strong></div>
          <div className="tool-choice-grid" aria-hidden="true">
            <span className="tool-choice is-selected">教材</span>
            <span className="tool-choice is-selected">投稿</span>
            <span className="tool-choice is-selected">決済</span>
            <span className="tool-choice">納品 ＋</span>
          </div>
          <div className="upgrade-notice"><b>入力情報から要確認を整理</b><span>確認済み・未確認・次にすることを分けて表示</span></div>
          <button type="button" tabIndex={-1}>下書きを見る</button>
          <div className="device-progress"><i className="is-current" /><i /><i /></div>
        </div>
      </section>

      <EffectStory />

      <section className="system" id="system">
        <FloatingAvocados variant="half" count={4} motion="bloom" />
        <div className="section-intro site-reveal">
          <p className="eyebrow">ひとことから、一つずつ進む。</p>
          <h2>止まっても、<br />安全な範囲で自動修復。</h2>
          <p>
            依頼、成果物、修正、完了を一つのJobとして保存します。一時的な失敗は隔離した新しい実行で直し、
            認証・公開・送信・決済・結果不明は止めて確認します。ブラウザや利用者の画面へ勝手に切り替えません。
          </p>
        </div>
        <div className="steps" role="list">
          {steps.map(([no, title, body]) => (
            <article className="step" key={no} role="listitem">
              <span className="step-no">{no}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="proof" id="proof">
        <FloatingAvocados variant="print-whole" count={8} motion="rain" />
        <div className="proof-visual">
          <Image
            src="/og.png"
            width={1672}
            height={941}
            alt="ONE EFFECTの文字と、複数BOTから検証済み成果へ至る実行経路を描いた二色印刷ビジュアル"
          />
        </div>
        <div className="proof-copy site-reveal">
          <p className="eyebrow">結果まで、ちゃんと見届ける。</p>
          <h2>成功した、ではない。<br /><em>確認できた</em>を残す。</h2>
          <p className="lead">
            BOTの自己申告では報酬を確定しない。各サービスの記録、通知、決済記録を
            照合し、結果不明なら再送せず保留します。
          </p>
          <ProofMechanisms />
        </div>
      </section>

      <section className="chain site-reveal" aria-labelledby="chain-title">
        <FloatingAvocados variant="print-slices" count={8} motion="conveyor" />
        <p className="eyebrow">ひとつの流れ。ひとつの記録。</p>
        <h2 id="chain-title">ACTION → EFFECT → VALUE</h2>
        <ActionEffectValue />
      </section>

      <section className="download site-reveal" id="contact">
        <FloatingAvocados variant="print-overprint" count={7} motion="rain" />
        <div className="lead-copy" id="diagnosis">
          <p className="eyebrow">FREE DIAGNOSIS / PDF</p>
          <h2>売上が漏れる場所を、<br />10項目で見つける。</h2>
          <p>{turnstileSiteKey ? "自動化を増やす前に、決済失敗・納品漏れ・権限残り・二重送信・効果測定の分断を診断します。入力は約1分。PDFはメールとこの画面で受け取れます。" : "自動化を増やす前に、決済失敗・納品漏れ・権限残り・二重送信・効果測定の分断を診断します。公開ベータ中はメール登録なしで直接ダウンロードできます。"}</p>
        </div>
        <div className="lead-card">
          <p><b>無料</b> 販売事故・売上漏れ診断</p>
          <LeadCapture turnstileSiteKey={turnstileSiteKey} />
        </div>
      </section>

      <footer>
        <a className="wordmark" href="#top">avocadomini<span>/</span>10</a>
        <p>10 TOOLS. ONE COMMAND.</p>
        <p><a href="/privacy">PRIVACY</a> · <a href="/legal">LEGAL</a> / 2026</p>
      </footer>
      <div className="sale-bar is-live">
        <span>選択・調査は無料・カード登録不要</span>
        <a href="/start">無料スタート</a>
      </div>
    </main></SiteMotion>
  );
}

export default function Home() {
  return <CompactHome />;
}
