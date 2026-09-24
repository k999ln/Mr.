import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  Network,
  RefreshCcw,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

const flow = [
  ['01', '起動', 'ユーザーが1回の操作で実行を開始'],
  ['02', '条件固定', '権限・予算・禁止効果をマニフェスト化'],
  ['03', '権限発行', 'BOTごとに限定権限と実行IDを発行'],
  ['04', '依存実行', '依存関係に沿って異種BOTを順序実行'],
  ['05', '証拠取得', '公式API・Webhook・決済記録から外部証拠を取得'],
  ['06', '独立検証', 'BOT自身の申告ではなく外部状態で効果を確定'],
  ['07', '状態分類', '重複・失敗・不明・取消・補償を分類'],
  ['08', '寄与接続', '検証済み効果と売上を寄与グラフで接続'],
  ['09', '報酬確定', '条件を満たしたBOTだけに支払い額を計算'],
  ['10', '取消反映', '返金・取消・不正時は報酬を反転・相殺'],
];

const claims = [
  {
    code: 'A',
    title: 'ポリシー固定実行',
    priority: '土台',
    body: '実行時のマニフェスト固定、狭い権限、予算、期限、承認条件。',
  },
  {
    code: 'B',
    title: '外部効果検証・回復',
    priority: '最優先',
    body: '直接応答と独立観測を組み合わせ、不明時の再実行防止・補償・回復を制御。',
  },
  {
    code: 'C',
    title: '機械検証可能な寄与',
    priority: '収益化への橋',
    body: '実行・成果物・外部効果・売上を一意IDと依存関係で接続。',
  },
  {
    code: 'D',
    title: '成果連動精算',
    priority: '従属・分割候補',
    body: '効果確定に合わせて報酬を保留・解放・反転する二重台帳。',
  },
  {
    code: 'E',
    title: 'プライバシー保護証明',
    priority: '将来拡張',
    body: '顧客データやBOT内部情報を開示せず、参加・条件充足・成果事実のみを証明。',
  },
];

const risks = [
  ['抽象的なビジネス方法', '20', '重大', '重複防止・障害回復・検証精度などの技術効果を中心にする'],
  ['先行技術による新規性否定', '20', '重大', '請求項要素に分解して専門調査'],
  ['公開による新規性喪失', '15', '高', '公開履歴を保存し、追加公開前に優先出願'],
  ['発明者・権利帰属の争い', '12', '高', '技術的着想者、分担、日付、譲渡契約を記録'],
  ['FTO調査不足による侵害', '15', '高', '特許性調査と事業実施自由度調査を分ける'],
  ['決済・送金規制との衝突', '12', '高', '資金を直接預からず、KYC対応の決済事業者を利用'],
];

const roadmap = [
  ['NOW', '秘密管理と公開履歴', 'リポジトリ、README、デモ、SNS、提案書の公開日と内容を保存。'],
  ['1-2 WEEKS', '発明提案書を固定', 'アーキテクチャ、状態遷移、データ構造、代替例、発明者を文書化。'],
  ['PARALLEL', '先行技術とFTO', '権利化可能性と他社権利の侵害リスクを、別の調査として進める。'],
  ['BEFORE FILING', '障害系プロトタイプ', 'タイムアウト、重複、部分失敗、返金を再現し、技術効果を数値化。'],
  ['出願', '日本優先出願', '外部効果検証・回復とポリシー固定を中心に、公開前の出願を優先。'],
  ['12 MONTHS', 'PCT判断', '市場、比較実験、先行技術、予算の証拠を見て国際出願を判断。'],
];

const sources = [
  ['特許庁「ソフトウェア関連発明」附属書B', 'https://www.jpo.go.jp/system/laws/rule/guideline/patent/handbook_shinsa/document/index/app_b.pdf'],
  ['特許庁「新規性喪失の例外」', 'https://www.jpo.go.jp/toppage/dictionary/japanese_shi.html'],
  ['USPTO MPEP 2106 - Patent Subject Matter Eligibility', 'https://www.uspto.gov/web/offices/pac/mpep/s2106.html'],
  ['WIPO - PCT FAQs', 'https://www.wipo.int/pct/en/docs/faqs-about-the-pct.pdf'],
  ['Model Context Protocol - Authorization', 'https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization'],
  ['US 11,488,159 B1 - MaaS revenue share', 'https://patents.google.com/patent/US11488159B1/en'],
  ['US 8,538,848 B1 - Revenue allocation', 'https://patents.google.com/patent/US8538848B1/en'],
  ['US 12,412,138 B1 - Agentic orchestration', 'https://patents.google.com/patent/US12412138B1/en'],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="MCP BOT HUB トップへ">
          <span className="brand-mark">M</span>
          <span>MCP BOT HUB</span>
        </a>
        <nav aria-label="ページ内ナビゲーション">
          <a href="#decision">結論</a>
          <a href="#system">発明の核</a>
          <a href="#claims">権利化</a>
          <a href="#risks">リスク</a>
          <a href="#roadmap">ロードマップ</a>
        </nav>
        <a className="header-cta" href="/MCP_Bot_Hub_特許戦略メモ.pdf" download>
          <Download size={16} /> 原文PDF
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" />
        <div className="hero-content">
          <p className="eyebrow">PATENT STRATEGY / PRELIMINARY MEMO</p>
          <h1>
            「ワンクリック」ではなく、
            <span>検証済みの効果</span>を権利化する。
          </h1>
          <p className="hero-lead">
            複数BOTの一括実行から、外部効果の検証、寄与の記録、成果連動報酬の精算まで。
            「失敗しても二重実行しない」分散自動化の制御方式を、特許戦略として整理します。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#decision">
              暂定結論を見る <ArrowDown size={18} />
            </a>
            <span>2026.08.31 / 発明整理・弁理士相談用</span>
          </div>
        </div>

        <aside className="decision-panel" id="decision">
          <div className="decision-label"><CheckCircle2 size={18} /> 暂定結論</div>
          <strong>条件付き GO</strong>
          <p>
            「ワンクリックMCPマーケットプレイス」だけでは弱い。権利化の中心は、外部効果の検証と、重複・部分失敗・取消・返金を処理したうえで、検証済み寄与だけに報酬を精算する技術制御方式。
          </p>
          <div className="decision-meta">
            <span><ShieldCheck size={15} /> 日本優先出願の準備: GO</span>
            <span>高額なPCT/米国出願: 保留</span>
          </div>
        </aside>
      </section>

      <section className="intro-strip" aria-label="メモの要点">
        <p>01 / SCOPE</p>
        <h2>検証の精度、再実行の安全性、精算の完全性を、ひとつの状態機械で制御する。</h2>
      </section>

      <section className="section system-section" id="system">
        <div className="section-heading">
          <div>
            <p className="section-kicker">02 / INVENTION CORE</p>
            <h2>不確実なBOT実行を、<br />監査可能な一連の制御へ。</h2>
          </div>
          <p>
            独立請求項はmcpに限定しません。API、RPA、Webhook、メッセージキューを含む実施形態とし、技術的な発明の中心を守ります。
          </p>
        </div>

        <div className="flow-grid">
          {flow.map(([num, title, body], index) => (
            <article className="flow-card" key={num}>
              <div className="flow-top"><span>{num}</span>{index < flow.length - 1 && <ArrowRight size={15} />}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <div className="tech-grid">
          <article className="tech-card feature">
            <div className="tech-icon"><Fingerprint /></div>
            <p className="mini-label">EXECUTION MANIFEST</p>
            <h3>実行条件を版固定</h3>
            <p>BOTの版、依存順序、権限、予算、期限、人の承認、成功・取消条件、報酬率を一括で固定します。</p>
          </article>
          <article className="tech-card">
            <div className="tech-icon"><FileCheck2 /></div>
            <p className="mini-label">EFFECT RECEIPT</p>
            <h3>外部の証拠で効果を確認</h3>
            <p>BOTの自己申告で精算せず、公式API、Webhook、決済記録、公式画面と実行IDを接続します。</p>
          </article>
          <article className="tech-card">
            <div className="tech-icon"><GitBranch /></div>
            <p className="mini-label">PROVENANCE GRAPH</p>
            <h3>成果までの寄与を再現</h3>
            <p>入出力ハッシュ、BOT版、時刻、承認者、外部証拠をノード化。検証済み結果に接続した経路のみ評価します。</p>
          </article>
          <article className="tech-card dark-card">
            <div className="tech-icon"><RefreshCcw /></div>
            <p className="mini-label">SETTLEMENT STATE MACHINE</p>
            <h3>不明・返金を台帳まで反映</h3>
            <p>通信中断時は再送せず照会。売上確定後に報酬を解放し、取消・返金・不正で反転します。</p>
          </article>
        </div>

        <figure className="state-figure">
          <figcaption>正常系と不明系を同じ状態機械で扱う</figcaption>
          <div className="state-track">
            {['未計上', '仮売上', '効果検証', '売上確定', '支払可能', '支払済'].map((state, i) => (
              <div className="state-node" key={state}><span>{i + 1}</span>{state}</div>
            ))}
          </div>
          <div className="unknown-track"><Clock3 size={18} /><strong>結果不明</strong><span>再試行を保留</span><ArrowRight size={15} /><span>外部状態を照会</span><ArrowRight size={15} /><span>確定または人が承認</span></div>
        </figure>
      </section>

      <section className="section claims-section" id="claims">
        <div className="section-heading compact">
          <div><p className="section-kicker">03 / CLAIM ARCHITECTURE</p><h2>何をどの順番で<br />権利化するか。</h2></div>
          <p>「自動化」や「報酬分配」を広く取るのではなく、分散外部処理の不確定性を解消する制御の連鎖を取りに行きます。</p>
        </div>

        <div className="claim-list">
          {claims.map((claim, index) => (
            <details className="claim-row" key={claim.code} open={index === 1}>
              <summary>
                <span className="claim-code">{claim.code}</span>
                <span className="claim-title">{claim.title}</span>
                <span className={`priority ${index === 1 ? 'highest' : ''}`}>{claim.priority}</span>
                <span className="plus">+</span>
              </summary>
              <p>{claim.body}</p>
            </details>
          ))}
        </div>

        <blockquote className="claim-skeleton">
          <p className="mini-label">INDEPENDENT CLAIM / SKELETON</p>
          <p>
            単一の起動入力に応じて複数の処理エージェントを開始し、実行時点の権限・予算・予期効果・精算条件を固定。各操作の外部効果を外部システムの状態で検証し、重複・取消・補償済み効果を除外した寄与情報から、各エージェントの精算額を決定する。
          </p>
        </blockquote>
      </section>

      <section className="section prior-section">
        <div className="section-heading compact light-heading">
          <div><p className="section-kicker">04 / PRIOR ART</p><h2>広いアイデアは、<br />すでに囲まれている。</h2></div>
          <p>複数主体への収益分配、取引証拠に基づく分配、AIエージェント・RPA・人の協調実行に関する先行特許文献は存在します。</p>
        </div>
        <div className="no-go-grid">
          {[
            ['複数BOTの協調', 'それ単独では先行技術が強い'],
            ['証拠付き収益分配', '分配条件だけでは差別化できない'],
            ['AIが寄与度を計算', '寄与計算の抽象概念は弱い'],
            ['MCPで接続', '接続仕様自体は発明の中心にならない'],
          ].map(([title, body]) => (
            <article key={title}><span>NO-GO ALONE</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
        <div className="differentiator"><Network size={28} /><p><strong>差別化の中心</strong><br />リトライ安全性、重複防止、独立検証、補償処理、報酬台帳の一貫性を、同じ状態遷移で一体化する。</p></div>
      </section>

      <section className="section risk-section" id="risks">
        <div className="section-heading compact">
          <div><p className="section-kicker">05 / RISK REGISTER</p><h2>失敗理由を、<br />出願前に潰す。</h2></div>
          <p>現時点で最も大きいのは、抽象的ビジネス方法と先行技術のリスク。特許性とFTOは混ぜずに調査します。</p>
        </div>
        <div className="risk-table" role="table" aria-label="特許戦略の主要リスク">
          <div className="risk-row risk-head" role="row"><span>リスク</span><span>スコア</span><span>対応方針</span></div>
          {risks.map(([risk, score, level, action]) => (
            <div className="risk-row" role="row" key={risk}>
              <span className="risk-name"><TriangleAlert size={17} />{risk}</span>
              <span className={`risk-score ${score === '20' ? 'critical' : ''}`}><strong>{score}</strong><small>{level}</small></span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section evidence-section">
        <div className="section-heading compact light-heading">
          <div><p className="section-kicker">06 / EVIDENCE BEFORE FILING</p><h2>アイデアではなく、<br />技術効果を証明する。</h2></div>
          <p>取るべき証拠は、実行マニフェスト、Effect Receipt、寄与グラフ、精算台帳、攻撃対策、比較実験の6系統です。</p>
        </div>
        <div className="metric-grid">
          <article><strong>-</strong><span>通信障害後の<br />重複実行率</span></article>
          <article><strong>-</strong><span>結果不明時の<br />再実行損失</span></article>
          <article><strong>-</strong><span>外部効果と<br />支払記録の不一致</span></article>
          <article><strong>-</strong><span>障害後の<br />監査再構成時間</span></article>
        </div>
        <div className="evidence-list">
          {['マニフェストの項目・署名・ハッシュ・版固定', '権限・予算・期限・効果種類を制限するBOTトークン', '応答・Webhook・公式画面・決済明細を統合するEffect Receipt', '成功・タイムアウト・重複・部分失敗・取消の状態遷移', '寄与グラフのノード・エッジ・一意ID・再計算', '仮売上・確定・支払い・反転・相殺を扱う二重台帳', '証拠偽造・リプレイ・BOT共謀・自己売上・ID除去への対策', '技術的着想、分担、日付、公開履歴、契約の発明者記録'].map((item, i) => (
            <div key={item}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p><BadgeCheck size={18} /></div>
          ))}
        </div>
      </section>

      <section className="section roadmap-section" id="roadmap">
        <div className="section-heading compact">
          <div><p className="section-kicker">07 / ROADMAP</p><h2>いま必要なのは、<br />広い出願ではない。</h2></div>
          <p>まず日本優先出願に向けた証拠を揃え、障害系プロトタイプと先行技術調査の結果を見て、高額な国際出願を判断します。</p>
        </div>
        <div className="timeline">
          {roadmap.map(([when, title, body], i) => (
            <article key={when}><div className="timeline-dot">{i + 1}</div><p className="mini-label">{when}</p><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="section truth-section">
        <div className="truth-grid">
          <article><span>FACT</span><h3>確認済みの事実</h3><ul><li>日本ではソフトウェア関連発明を全体として審査するが、通常のシステム化は進歩性を欠き得る。</li><li>複数主体の収益分配、寄与評価、エージェント協調の先行特許が存在する。</li></ul></article>
          <article><span>INFERENCE</span><h3>資料からの推論</h3><ul><li>外部効果検証、リトライ安全性、補償処理、精算整合性の組み合わせが最も有望。</li></ul></article>
          <article><span>ASSUMPTION</span><h3>今後の検証が必要</h3><ul><li>成果報酬は、外部システムで確定した売上回収・増分売上・コスト削減を契約で定義。</li><li>BOT開発者への支払いはKYC・税務・決済規制に対応する外部事業者が担う。</li></ul></article>
        </div>
      </section>

      <section className="section sources-section" id="memo">
        <div className="section-heading compact">
          <div><p className="section-kicker">08 / SOURCE MATERIAL</p><h2>原文と一次資料。</h2></div>
          <a className="download-card" href="/MCP_Bot_Hub_特許戦略メモ.pdf" download><FileText /><span><strong>PDF版をダウンロード</strong><small>9ページ / 弁理士相談用</small></span><Download /></a>
        </div>
        <div className="source-list">
          {sources.map(([title, url], i) => <a href={url} target="_blank" rel="noreferrer" key={url}><span>{String(i + 1).padStart(2, '0')}</span><p>{title}</p><ExternalLink size={16} /></a>)}
        </div>
      </section>

      <section className="legal-note">
        <Scale size={22} />
        <div><strong>重要な注意</strong><p>本ページは特許戦略の検討メモであり、法律意見、網羅的な先行技術調査、権利化の保証ではありません。出願、発明者確定、新規性喪失の例外、FTO、決済規制は専門家に確認してください。</p></div>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">M</span><span>MCP BOT HUB</span></div>
        <p>外部効果を検証し、寄与を記録し、正しく精算する。</p>
        <span>PRELIMINARY MEMO / 2026</span>
      </footer>
    </main>
  );
}
