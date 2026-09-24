import Link from 'next/link';
import type { OwnerStatus } from '../lib/owner-registry';
import {
  ownerBlockers,
  ownerCapabilities,
  ownerChanges,
  ownerLayers,
  ownerProduct,
} from '../lib/owner-registry';

type OwnerConsoleProps = {
  user: { displayName: string };
  signOutPath: string;
  live: {
    connectedCells: number;
    serviceRuns: number;
    openTasks: number;
    auditEvents: number;
  };
};

const statusLabels: Record<OwnerStatus, string> = {
  live: '稼働中',
  implemented: '実装済み',
  partial: '一部接続',
  blocked: '安全停止',
};

export default function OwnerConsole({ user, signOutPath, live }: OwnerConsoleProps) {
  const statusCounts = ownerCapabilities.reduce<Record<OwnerStatus, number>>(
    (counts, capability) => {
      counts[capability.status] += 1;
      return counts;
    },
    { live: 0, implemented: 0, partial: 0, blocked: 0 },
  );

  return (
    <main className="owner-shell">
      <a className="skip-link" href="#owner-main">管理内容へ移動</a>

      <aside className="owner-rail" aria-label="運営設計資料ナビゲーション">
        <a className="owner-brand-mark" href="#owner-overview" aria-label="avocadomini Owner Console ホーム">A</a>
        <nav>
          <a href="#owner-overview"><span>00</span>概要</a>
          <a href="#owner-changes"><span>01</span>追加内容</a>
          <a href="#owner-capabilities"><span>02</span>機能状態</a>
          <a href="#owner-blockers"><span>03</span>未完了</a>
          <a href="#owner-proof"><span>04</span>証拠</a>
        </nav>
        <div>PRODUCT / REFERENCE</div>
      </aside>

      <section className="owner-workspace" id="owner-main">
        <header className="owner-topbar">
          <div>
            <p className="eyebrow">MR. / 運営設計資料</p>
            <p className="top-title">追加したものと、まだ動いていないものを分けて確認</p>
          </div>
          <div className="owner-top-actions">
            <span className="owner-identity"><i />{user.displayName}</span>
            <Link href="/life">仕事・収支画面</Link>
            <Link href="/">自動化ハブ</Link>
            <a href={signOutPath}>ログアウト</a>
          </div>
        </header>

        <section className="owner-hero" id="owner-overview">
          <div>
            <p className="section-index">00 / CONTROL SURFACE</p>
            <h1>Added.<br />Verified.<br />Visible.</h1>
            <p>{ownerProduct.promise}</p>
          </div>
          <div className="owner-release-card">
            <span>CURRENT RELEASE</span>
            <strong>{ownerProduct.release}</strong>
            <dl>
              <div><dt>PRODUCT</dt><dd>{ownerProduct.name}</dd></div>
              <div><dt>UPDATED</dt><dd>{ownerProduct.updatedAt}</dd></div>
              <div><dt>ACCESS</dt><dd>SIGNED-IN REFERENCE</dd></div>
            </dl>
            <p>このページはログイン利用者向けの設計資料です。機能台帳は保存時点の記録、件数はログイン本人のデータです。所有者専用の権限管理画面ではありません。秘密値は表示しません。</p>
          </div>
        </section>

        <section className="owner-live-strip" aria-label="現在のHub状態">
          <article><span>OPEN TASKS</span><strong>{live.openTasks}</strong><p>未完了の次の一手</p></article>
          <article><span>CONNECTED CELLS</span><strong>{live.connectedCells}</strong><p>有効な制作Cell</p></article>
          <article><span>SERVICE RUNS</span><strong>{live.serviceRuns}</strong><p>受付済みの依頼</p></article>
          <article><span>AUDIT EVENTS</span><strong>{live.auditEvents}</strong><p>この利用者の監査記録</p></article>
        </section>

        <section className="owner-section" id="owner-changes">
          <div className="owner-section-heading">
            <div><p className="section-index">01 / WHAT CHANGED</p><h2>何を追加したか。</h2></div>
            <p>画面、基盤、接続を一件ずつ分け、実装しただけの状態を「稼働中」と混ぜません。</p>
          </div>
          <div className="owner-change-list">
            {ownerChanges.map((change, index) => (
              <article key={change.id}>
                <div className="owner-change-index">{String(index + 1).padStart(2, '0')}</div>
                <div className="owner-change-copy">
                  <div>
                    <time dateTime={change.date}>{change.date}</time>
                    <span className="owner-status" data-status={change.status}>{statusLabels[change.status]}</span>
                  </div>
                  <h3>{change.title}</h3>
                  <p>{change.summary}</p>
                  <ul>{change.surfaces.map((surface) => <li key={surface}>{surface}</li>)}</ul>
                </div>
                <div className="owner-evidence"><span>EVIDENCE</span><p>{change.evidence}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="owner-section owner-section-dark" id="owner-capabilities">
          <div className="owner-section-heading">
            <div><p className="section-index">02 / CAPABILITY MAP</p><h2>いま、どこまで動くか。</h2></div>
            <div className="owner-status-summary" aria-label="機能状態の件数">
              {(Object.keys(statusLabels) as OwnerStatus[]).map((status) => (
                <span key={status} data-status={status}><b>{statusCounts[status]}</b>{statusLabels[status]}</span>
              ))}
            </div>
          </div>
          <div className="owner-capability-table" role="table" aria-label="機能状態一覧">
            <div className="owner-capability-header" role="row">
              <span role="columnheader">領域</span><span role="columnheader">現在</span><span role="columnheader">次</span><span role="columnheader">状態</span>
            </div>
            {ownerCapabilities.map((capability) => (
              <article role="row" key={capability.area}>
                <div role="cell"><span>{capability.area}</span><strong>{capability.surface}</strong></div>
                <p role="cell">{capability.current}</p>
                <p role="cell">{capability.next}</p>
                <div role="cell"><span className="owner-status" data-status={capability.status}>{statusLabels[capability.status]}</span></div>
              </article>
            ))}
          </div>
        </section>

        <section className="owner-section" aria-labelledby="owner-architecture-title">
          <div className="owner-section-heading">
            <div><p className="section-index">PRODUCT ARCHITECTURE</p><h2 id="owner-architecture-title">一つのブランド、五つの責務。</h2></div>
            <p>利用者からは一つのavocadominiに見せ、内部は安全に差し替えられる単位へ分離します。</p>
          </div>
          <div className="owner-layer-grid">
            {ownerLayers.map((layer) => (
              <article key={layer.code}><span>{layer.code}</span><h3>{layer.name}</h3><p>{layer.description}</p></article>
            ))}
          </div>
        </section>

        <section className="owner-section owner-blocker-section" id="owner-blockers">
          <div className="owner-section-heading">
            <div><p className="section-index">03 / NOT DONE</p><h2>未完了を隠さない。</h2></div>
            <p>以下が残っている間は、一般公開・自動実行・本番課金を完了扱いにしません。</p>
          </div>
          <ol>{ownerBlockers.map((blocker, index) => <li key={blocker}><span>{String(index + 1).padStart(2, '0')}</span>{blocker}</li>)}</ol>
        </section>

        <section className="owner-section owner-proof-section" id="owner-proof">
          <div>
            <p className="section-index">04 / PROOF</p>
            <h2>証拠があるものだけを、完了に。</h2>
            <p>コード追加、外部接続、公開、実送信、決済、納品は別の状態です。外部サービスはproviderのreadbackやmessage IDなどを確認してから完了へ進めます。</p>
          </div>
          <div className="owner-proof-actions">
            <a href="/api/data">Hubデータを書き出す</a>
            <Link href="/life">仕事・収支画面へ戻る</Link>
          </div>
        </section>

        <footer className="owner-footer"><span>MR. / 運営設計資料</span><span>PRODUCT REFERENCE</span></footer>
      </section>

      <nav className="owner-mobile-nav" aria-label="所有者モバイルナビゲーション">
        <a href="#owner-overview"><span>⌂</span>概要</a>
        <a href="#owner-changes"><span>＋</span>追加</a>
        <a href="#owner-capabilities"><span>◉</span>状態</a>
        <a href="#owner-blockers"><span>!</span>未完了</a>
        <Link href="/"><span>↗</span>Hub</Link>
      </nav>
    </main>
  );
}
