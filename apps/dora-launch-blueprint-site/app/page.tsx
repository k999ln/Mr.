import {
  ArrowDown, ArrowUpRight, Bot, Check, Database, Download, ExternalLink,
  GitBranch, LockKeyhole, MessageCircle, Radio, ShieldCheck, Sparkles,
  Waypoints, X,
} from 'lucide-react';

const tools = [
  ['01', '受付BOT', '依頼を受け取る', '不足条件を補い、実行可能な依頼にする', '実装済み・未設定'],
  ['02', '教材BOT', '商品を作る', 'メモ・音声・URLから教材の初稿を作る', '基盤'],
  ['03', '確認BOT', '根拠を確かめる', '主張・出典・訂正履歴を残す', '基盤'],
  ['04', '販売BOT', '売り場を作る', 'オファー、LP、申込導線を組み立てる', '基盤'],
  ['05', 'X投稿BOT', '発信する', '投稿案、ツリー、予約、反応をつなぐ', '基盤'],
  ['06', '配信BOT', '見込み客へ届ける', 'Telegram・メールの配信と同意を管理する', '基盤'],
  ['07', '決済BOT', '代金を回収する', '入金確認後だけ売上を確定する', '実装済み・未設定'],
  ['08', '納品BOT', '商品を届ける', '教材・ツール・コミュニティ権限を開閉する', '実装済み・未設定'],
  ['09', '分析BOT', '結果を測る', '購入・継続・返金・解約まで評価する', '基盤'],
  ['10', '分配BOT', '報酬を分ける', '成果とルールに基づき分配額を確定する', '基盤'],
];

const nav = [
  ['overview', '概要'], ['journey', '体験'], ['tools', '10の道具'],
  ['architecture', '構成'], ['launch', '立ち上げ'], ['gates', '公開判定'],
];

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="kicker">{children}</p>;
}

function SectionTitle({ number, title, lead }: { number: string; title: string; lead?: string }) {
  return (
    <div className="section-heading">
      <span>{number}</span>
      <div><h2>{title}</h2>{lead ? <p>{lead}</p> : null}</div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="avocadomini 立ち上げ設計書 トップへ">
          <span className="brand-mark"><Waypoints size={17} /></span>
          <span>avocadomini</span><em>LAUNCH BLUEPRINT</em>
        </a>
        <nav aria-label="ページ内メニュー">
          {nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <a className="download-compact" href="/avocadomini_立ち上げ設計書_2026-09-03.pdf" download>
          <Download size={16} /> PDF
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-inner">
          <div>
            <Kicker>10 TOOLS / ONE COMMAND</Kicker>
            <h1>avocadomini<br /><span>立ち上げ設計書</span></h1>
            <p className="hero-statement">人間は、やりたいことを。<br />AIは、残り全部を。</p>
            <div className="hero-actions">
              <a className="primary-button" href="#overview">設計を読む <ArrowDown size={18} /></a>
              <a className="secondary-button" href="/avocadomini_立ち上げ設計書_2026-09-03.pdf" download>
                PDFを保存 <Download size={17} />
              </a>
            </div>
          </div>
          <div className="hero-system" aria-label="10個のBOTをひとつの指令につなぐ概念図">
            <div className="command-pulse"><Sparkles size={18} /> ONE COMMAND</div>
            <div className="hub"><Bot size={32} /><strong>avocadomini</strong><span>ORCHESTRATOR</span></div>
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            {tools.map((tool, index) => <span className={`node node-${index + 1}`} key={tool[0]}>{tool[0]}</span>)}
          </div>
        </div>
        <div className="hero-meta">
          <span>VERSION 0.1</span><span>2026.09.03</span><span>OWNER / KAI</span><span>INTERNAL · PARTNER SHARE</span>
        </div>
      </section>

      <div className="content-shell">
        <aside className="rail" aria-label="目次">
          <p>CONTENTS</p>
          {nav.map(([id, label], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{label}</a>)}
          <div className="rail-rule" />
          <a href="https://effect-os-verified.kirin-999.chatgpt.site/" target="_blank" rel="noreferrer"><ExternalLink size={14} /> 公開サイト</a>
        </aside>

        <article className="document">
          <section className="doc-section" id="overview">
            <SectionTitle number="01" title="一言で、何を作るか" lead="Telegramを入口に、販売の最初から最後までを一つの実行系へ。" />
            <div className="definition-card">
              <p>avocadominiは、Telegramを操作画面にして、商品を<strong>作る・確かめる・売る・届ける・結果を測る</strong>までを、10個のBOTでつなぐ販売自動化基盤です。</p>
              <div className="principle"><span>設計原則</span><strong>提案で終わらない。承認済みの仕事を実行し、外部の証拠で完了を確かめる。</strong></div>
            </div>
            <div className="two-columns audience-grid">
              <div><h3>最初の対象</h3><ul>
                <li>教材・ツール・有料コミュニティの販売者</li>
                <li>X、Telegram、メール、LPを手作業でつなぐ人</li>
                <li>制作より確認・入金・納品に時間を奪われる人</li>
              </ul></div>
              <div><h3>解決する問題</h3><ol>
                <li><span>01</span>同じ情報を何度も入力する</li>
                <li><span>02</span>施策と売上の関係が見えない</li>
                <li><span>03</span>決済後の納品や権限付与が漏れる</li>
                <li><span>04</span>AIの後始末を人間がしている</li>
              </ol></div>
            </div>
          </section>

          <section className="doc-section" id="journey">
            <SectionTitle number="02" title="利用者の体験" lead="無料スタートから成果報告まで、操作面はTelegramに集約する。" />
            <div className="journey">
              {[
                ['サイト', '無料スタートを押す', Radio],
                ['Telegram', '解決したい問題と3つの道具を選ぶ', MessageCircle],
                ['avocadomini', '不足条件を整理し、実行計画を作る', GitBranch],
                ['承認', '外部操作と金額を確認する', ShieldCheck],
                ['実行', '10個のBOTを必要な順番で動かす', Bot],
                ['証拠', '成果・未完了・次の一手を返す', Database],
              ].map(([label, text, Icon], index) => {
                const JourneyIcon = Icon as typeof Bot;
                return <div className="journey-step" key={label as string}><span>{String(index + 1).padStart(2, '0')}</span><JourneyIcon size={22} /><div><strong>{label as string}</strong><p>{text as string}</p></div></div>;
              })}
            </div>
            <div className="free-band"><LockKeyhole size={22} /><div><strong>無料開始時に、カードもメールもいらない。</strong><p>最初は3ツールまで無料。4つ目を有効化するときだけ、Telegram Starsの購入確認を開く。</p></div></div>
          </section>

          <section className="doc-section" id="tools">
            <SectionTitle number="03" title="10個の道具" lead="各BOTを独立して改良でき、オーケストレーターが一つの仕事としてつなぐ。" />
            <div className="tools-list">
              {tools.map(([number, name, role, outcome, status]) => (
                <div className="tool-row" key={number}>
                  <span className="tool-number">{number}</span>
                  <div className="tool-name"><strong>{name}</strong><small>{role}</small></div>
                  <p>{outcome}</p>
                  <span className={`status ${status.includes('実装済み') ? 'status-ready' : ''}`}>{status}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="doc-section" id="architecture">
            <SectionTitle number="04" title="システム構成と境界" lead="Core、One Hub、Service Cellsを分離し、外部資格情報がなければ安全側に停止する。" />
            <div className="architecture">
              <div className="arch-core"><Bot size={28} /><strong>avocadomini Orchestrator</strong><span>実行計画 · 承認 · 冪等性 · 証拠</span></div>
              <div className="connector-lines"><i /><i /><i /></div>
              <div className="arch-cards">
                <div><MessageCircle /><strong>One Hub</strong><span>Telegram UI</span></div>
                <div><Waypoints /><strong>Service Cells</strong><span>10個の独立BOT</span></div>
                <div><ExternalLink /><strong>Adapters</strong><span>X · Stars · Email · LP</span></div>
              </div>
            </div>
            <div className="data-loop">
              <div><span>01</span><strong>意思決定</strong><small>なぜ選んだか</small></div><ArrowUpRight />
              <div><span>02</span><strong>承認</strong><small>誰が許可したか</small></div><ArrowUpRight />
              <div><span>03</span><strong>実行</strong><small>何を行ったか</small></div><ArrowUpRight />
              <div><span>04</span><strong>結果</strong><small>何が変わったか</small></div>
            </div>
            <p className="caption">価値の中心は会話ログではなく、施策 → 承認 → 実行 → 購入・継続・返金・解約を切れずに記録すること。</p>
          </section>

          <section className="doc-section" id="launch">
            <SectionTitle number="05" title="立ち上げ計画" lead="見せられる状態と、外部へ安全に実行できる状態を分けて判断する。" />
            <div className="readiness">
              <div><span>現在</span><strong>販売デモ可能</strong><p>サイト、無料導線、10ツールの説明、選択体験</p></div>
              <div><span>次</span><strong>限定運用</strong><p>BYOB Telegram、3ツール、少人数、有人監視</p></div>
              <div><span>その後</span><strong>一般公開</strong><p>Stars本番、返金導線、全ツールの証拠検証</p></div>
            </div>
            <div className="launch-phases">
              {[
                ['PHASE 0', '公開準備', '所有先、規約、価格、サポート窓口を確定'],
                ['PHASE 1', 'パイロット', '10名以内・3ツール・操作上限つきで検証'],
                ['PHASE 2', '課金検証', '4つ目のStars請求、成功通知、権限解放を通す'],
                ['PHASE 3', '一般公開', '障害対応、監査ログ、返金を含む運用へ'],
              ].map(([phase, title, text]) => <div key={phase}><span>{phase}</span><strong>{title}</strong><p>{text}</p></div>)}
            </div>
            <div className="responsibilities">
              <div><Kicker>KAIが決める</Kicker><ul><li>Starsの価格と期間</li><li>返金・禁止用途・利用規約</li><li>公開用Telegram bot</li><li>最初のパイロット利用者</li></ul></div>
              <div><Kicker>チームが実装する</Kicker><ul><li>BotFather接続とWebhook</li><li>請求・権限・証拠のE2E</li><li>各BOTのadapter接続</li><li>監視・停止・復旧手順</li></ul></div>
            </div>
          </section>

          <section className="doc-section" id="gates">
            <SectionTitle number="06" title="Go / No-Go ゲート" lead="公開日は気分で決めない。下の証拠が揃ったときだけGOにする。" />
            <div className="gates-grid">
              <div className="gate go"><div><Check size={21} /><strong>GO</strong></div><ul><li>所有者の接続先だけが設定されている</li><li>3ツール無料枠が実機で動く</li><li>4つ目の請求が明示され、二重請求されない</li><li>支払成功後だけ10ツールが開く</li><li>外部実行のreceiptを保存できる</li><li>停止・返金・問い合わせ導線が動く</li></ul></div>
              <div className="gate nogo"><div><X size={21} /><strong>NO-GO</strong></div><ul><li>Telegram bot所有者が未確認</li><li>Stars価格・期間・返金条件が未決定</li><li>主要BOTが説明だけで実行できない</li><li>結果不明時に成功扱いする</li><li>第三者の秘密値を既定値に使う</li><li>禁止操作や利用目的が曖昧</li></ul></div>
            </div>
            <div className="metrics">
              <div><strong>Activation</strong><span>無料開始 → 3ツール選択率</span></div>
              <div><strong>Execution</strong><span>依頼 → 証拠付き完了率</span></div>
              <div><strong>Conversion</strong><span>4つ目選択 → Stars成功率</span></div>
              <div><strong>Reliability</strong><span>重複・誤実行・結果不明率</span></div>
              <div><strong>Value</strong><span>回収売上・時間削減・継続率</span></div>
            </div>
          </section>

          <section className="closing">
            <div><Kicker>FINAL PRINCIPLE</Kicker><h2>人間は、やりたいことを。<br /><span>AIは、残り全部を。</span></h2></div>
            <p>ただし「全部」は、許可された範囲を確実に実行し、完了を証明できる仕事だけを指す。</p>
            <div className="closing-links">
              <a href="https://effect-os-verified.kirin-999.chatgpt.site/" target="_blank" rel="noreferrer">avocadominiを見る <ArrowUpRight size={17} /></a>
              <a href="https://github.com/k999ln/Mr/" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={17} /></a>
              <a href="https://x.com/doraemonbottt" target="_blank" rel="noreferrer">X @doraemonbottt <ArrowUpRight size={17} /></a>
            </div>
          </section>
        </article>
      </div>

      <footer><span>avocadomini © 2026 KAI</span><span>LAUNCH BLUEPRINT / VERSION 0.1</span></footer>
    </main>
  );
}
