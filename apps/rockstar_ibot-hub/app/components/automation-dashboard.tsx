'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { tools, servicePlan, buildCoconalaDraft, type ToolStatus, type CoconalaDraft } from '../generated/automation-hub/index.mjs';

const statusLabels: Record<ToolStatus, string> = {
  runnable_local: 'この場で使える', sign_in_required: 'ログインして使える', connection_required: '接続・移植が必要', catalog_only: 'カタログ登録',
};
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function AutomationDashboard({ displayName, accountPath }: {
  displayName: string | null; accountPath: string;
}) {
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('all');
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState<CoconalaDraft | null>(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [requestNotice, setRequestNotice] = useState('');
  const [installNotice, setInstallNotice] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestOrigin, setRequestOrigin] = useState('builtin');
  const [requestUrl, setRequestUrl] = useState('');
  const [requests, setRequests] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [requestLoadError, setRequestLoadError] = useState('');
  const mutation = useRef<{ fingerprint: string; key: string } | null>(null);
  const savingRef = useRef(false);
  const results = useMemo(() => tools.filter(tool =>
    (origin === 'all' || tool.origin === origin) && (status === 'all' || tool.status === status) &&
    `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ), [query, origin, status]);

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!displayName) return;
    const controller = new AbortController();
    fetch('/api/automation/requests', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('候補一覧を読み込めませんでした。仕事の一覧から確認できます。');
      return await response.json() as { requests: { id: string; title: string; completed: boolean }[] };
    }).then(result => setRequests(result.requests)).catch(error => {
      if (!controller.signal.aborted) setRequestLoadError(error.message);
    });
    return () => controller.abort();
  }, [displayName]);

  function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const input = Object.fromEntries(['title', 'requirements', 'deliverables', 'deadline', 'price'].map(key => [key, String(form.get(key) || '')]));
      setDraft(buildCoconalaDraft(input));
      setDraftNotice('入力した条件から下書きを作りました。内容を確認してからお使いください。');
    } catch (error) {
      setDraft(null); setDraftNotice(error instanceof Error ? error.message : '入力を確認してください。');
    }
  }

  function draftText() {
    if (!draft) return '';
    return `${draft.proposal}\n\n納品前チェック\n${draft.checklist.map(item => `□ ${item}`).join('\n')}\n\n${draft.warnings.join('\n')}`;
  }

  function downloadDraft() {
    const url = URL.createObjectURL(new Blob([draftText()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mr-coconala-draft.txt'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function requestTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setRequestNotice('');
    const body = { name: requestName, origin: requestOrigin, url: requestUrl };
    const fingerprint = JSON.stringify(body);
    if (mutation.current?.fingerprint !== fingerprint) mutation.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch('/api/automation/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': mutation.current.key }, body: fingerprint,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '保存できませんでした。');
      setRequestNotice('導入確認を「仕事と実行履歴」に保存しました。導入時に権限・費用・接続方法を確認します。');
      setRequestName(''); setRequestUrl(''); mutation.current = null;
      // Saving succeeded already. A failed list refresh must not prompt another write.
      try {
        const refreshed = await fetch('/api/automation/requests');
        if (!refreshed.ok) throw new Error('refresh failed');
        const next = await refreshed.json() as { requests: { id: string; title: string; completed: boolean }[] };
        setRequests(next.requests); setRequestLoadError('');
      } catch { setRequestLoadError('候補は保存済みです。一覧の更新はページを再読み込みしてお試しください。'); }
    } catch (error) { setRequestNotice(error instanceof Error ? error.message : '保存できませんでした。'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function installApp() {
    if (!installPrompt) {
      setInstallNotice('対応ブラウザのメニューから「アプリとしてインストール」または「ホーム画面に追加」を選べます。ログインや保存には通信が必要です。');
      return;
    }
    try {
      await installPrompt.prompt(); const choice = await installPrompt.userChoice;
      setInstallNotice(choice.outcome === 'accepted' ? 'インストールを受け付けました。' : 'インストールを見送りました。');
    } catch { setInstallNotice('ブラウザのメニューからインストールしてください。'); }
    setInstallPrompt(null);
  }

  return <div className="automation-shell">
    <a className="skip-link" href="#tools">ツール一覧へ</a>
    <aside className="automation-sidebar"><Link className="automation-brand" href="/">Mr.<span>AUTOMATION HUB</span></Link>
      <nav aria-label="メイン"><a href="#tools" aria-current="page">ツールライブラリ</a><a href="#draft">ココナラ提案準備</a><a href="/life#work">仕事と実行履歴</a><a href="/life#money">収支の記録</a><a href="#add-tool">ツールを追加する</a><a href="#environment">環境と利用料</a><a href="/life#connections">接続と生活管理</a></nav>
      <div className="automation-plan"><small>基本利用料 / 設計価格</small><strong>${(servicePlan.amountMinor / 100).toFixed(2)} <span>USD / 月</span></strong><p>電気代プラン<br/>課金はまだ開始していません。</p></div>
    </aside>
    <main className="automation-main"><header className="automation-top"><span>WORKSPACE / FOUNDATION</span><a href={accountPath} target="_top">{displayName ? 'ログアウト' : 'ログインして保存'}</a></header>
      <div className="automation-heading"><div><p className="automation-eyebrow">YOUR AUTOMATION WORKSPACE</p><h1>道具をそろえて、仕事を動かす。</h1><p>内製ツールも外部サービスも、ここから管理。</p></div><a className="automation-primary" href="#draft">提案文を作る ↗</a></div>
      <section className="automation-highlight"><div><span className="automation-badge">最初のワークフロー · 追加API費用なし</span><h2>案件の条件から、提案と納品の準備へ。</h2><p>入力した情報だけを使うテンプレート作成。ブラウザ内で処理します。</p></div><span className="automation-big-number">01</span></section>

      <section className="automation-section" id="tools" aria-labelledby="library-title">
        <div className="automation-section-title"><h2 id="library-title">ツールライブラリ <span>{tools.length}</span></h2><p>実行できる状態を、ひとつずつ確認。</p></div>
        <div className="automation-filters"><label className="automation-search">ツールを検索<input type="search" placeholder="ココナラ、台本、カレンダー…" value={query} onChange={e => setQuery(e.target.value)} /></label><label>開発元<select value={origin} onChange={e => setOrigin(e.target.value)}><option value="all">すべて</option><option value="builtin">内製・既存コード</option><option value="external">外部サービス</option></select></label><label>利用状態<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">すべて</option>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        <p className="automation-result-count" aria-live="polite">{results.length}件を表示 · 状態はソースの実装範囲です。お使いのアカウントの接続状態ではありません。</p>
        <div className="automation-tool-grid">{results.map((tool, index) => <article className="automation-tool" key={tool.id}>
          <div className="automation-tool-meta"><span className="automation-tool-symbol" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="automation-status" data-status={tool.status}>{statusLabels[tool.status]}</span></div>
          <p className="automation-source">{tool.origin === 'builtin' ? '内製・既存コード' : '外部サービス'}</p><h3>{tool.name}</h3><p className="automation-tool-description">{tool.description}</p>
          <details><summary>必要な準備・費用</summary><p>{tool.nextAction}</p><p>{tool.costModel.description}</p>{tool.requirements.length > 0 && <ul>{tool.requirements.map(item => <li key={item}>{item}</li>)}</ul>}</details>
          {tool.id === 'money-ledger' || tool.id === 'work-queue' ? <a className="automation-tool-action" href={tool.id === 'money-ledger' ? '/life#money' : '/life#work'}>ワークスペースを開く →</a> : tool.status === 'runnable_local' ? <a className="automation-tool-action" href="#draft">使う →</a> : <button type="button" className="automation-tool-action" onClick={() => { setRequestName(tool.name); setRequestOrigin(tool.origin); setRequestUrl(''); document.getElementById('add-tool')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('tool-name')?.focus({ preventScroll: true }); }}>導入の準備をする →</button>}
        </article>)}</div>
        {!results.length && <div className="automation-empty">一致するツールがありません。検索語や絞り込みを変えてください。</div>}
      </section>

      <section className="automation-section" id="draft" aria-labelledby="draft-title"><div className="automation-section-title"><h2 id="draft-title">ココナラ提案準備</h2><p>案件の整理 → 提案文 → 納品前チェック</p></div>
        <div className="automation-draft-grid"><form className="automation-panel automation-form" onSubmit={createDraft} onChange={() => { if (draft) { setDraft(null); setDraftNotice('条件が変わりました。下書きを再作成してください。'); } }}>
          <label>案件名<input name="title" required maxLength={160} placeholder="例：店舗サイトのトップページ改善" /></label>
          <label>依頼内容・条件<textarea name="requirements" required maxLength={6000} rows={4} placeholder="依頼者が求める内容を、一行ずつ入力" /></label>
          <label>納品するもの<textarea name="deliverables" required maxLength={6000} rows={3} placeholder="例：ページ案、修正後のデータ、操作説明" /></label>
          <div className="automation-form-row"><label>納期<input name="deadline" maxLength={160} placeholder="例：資料受領後7日" /></label><label>見積金額・通貨<input name="price" maxLength={100} placeholder="例：20,000円（税込）" /></label></div>
          <p className="automation-help">氏名、連絡先、パスワードは入れないでください。入力内容はサーバーへ送信・保存されません。</p>
          <button className="automation-primary" type="submit">提案文とチェックリストを作成</button>
        </form><div className="automation-panel automation-output" aria-label="作成結果">
          <p className="automation-eyebrow">DRAFT / YOUR DELIVERABLE</p>
          {draft ? <><h3>提案文</h3><pre>{draft.proposal}</pre><h3>納品前チェック</h3><ul>{draft.checklist.map(item => <li key={item}>{item}</li>)}</ul>{draft.warnings.length > 0 && <div className="automation-warning">{draft.warnings.map(item => <p key={item}>{item}</p>)}</div>}<div className="automation-actions"><button type="button" onClick={downloadDraft}>テキストを書き出す</button><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(draftText()); setDraftNotice('コピーしました。'); } catch { setDraftNotice('コピーできませんでした。テキストの書き出しをご利用ください。'); } }}>コピー</button></div></> : <div className="automation-draft-empty"><span aria-hidden="true">↗</span><h3>次の仕事の、最初の一歩。</h3><p>左の条件から提案文を組み立てます。実績や金額は勝手に補いません。</p><p>外部への応募・送信は行いません。納品や売上の実績は、取引後に記録してください。</p></div>}
          <p className="automation-feedback" role="status">{draftNotice}</p>
        </div></div>
      </section>

      <section className="automation-section" id="add-tool"><div className="automation-section-title"><h2>ツールを追加する</h2><p>自社開発も、外部サービスも。</p></div>
        <div className="automation-add-grid"><form className="automation-panel automation-form" onSubmit={requestTool}>
          <label htmlFor="tool-name">ツール名<input id="tool-name" required minLength={2} maxLength={70} value={requestName} onChange={e => setRequestName(e.target.value)} placeholder="導入したいツール" /></label>
          <label>開発元<select value={requestOrigin} onChange={e => setRequestOrigin(e.target.value)}><option value="builtin">自社開発</option><option value="external">外部サービス</option></select></label>
          <label>公式URL（任意）<input type="url" maxLength={120} value={requestUrl} onChange={e => setRequestUrl(e.target.value)} placeholder="https://example.com" /></label>
          <p className="automation-help">APIキーや認証情報は入力しないでください。保存すると、あなたの仕事一覧に導入確認が追加されます。</p>
          {displayName ? <button className="automation-primary" disabled={saving} type="submit">{saving ? '保存中…' : '導入確認として保存'}</button> : <a className="automation-primary" href={accountPath} target="_top">ログインして保存</a>}
          <p className="automation-feedback" role="status">{requestNotice}</p>
        </form><div className="automation-panel"><h3>追加から利用まで</h3><ol className="automation-steps"><li><strong>候補を登録</strong><span>名前と公式URLを、自分の仕事一覧に保存。</span></li><li><strong>権限と費用を確認</strong><span>必要なデータ、実行場所、利用条件を確認。</span></li><li><strong>接続して動作を検証</strong><span>利用者ごとの接続情報で動かし、結果を確認。</span></li></ol><p className="automation-help">現在は候補の保存まで対応しています。登録だけでインストールや課金は始まりません。</p><a href="/life#work">保存した導入確認を管理 →</a>{displayName && <><h3 className="automation-saved-heading">保存した候補</h3>{requestLoadError ? <p role="status">{requestLoadError}</p> : requests.length ? <ul className="automation-request-list">{requests.slice(0, 10).map(request => <li key={request.id}><span>{request.completed ? '確認済み' : '確認待ち'}</span>{request.title.replace(/^\[ツール導入確認・[^\]]+\]\s*/, '')}</li>)}</ul> : <p className="automation-help">導入候補はまだありません。</p>}</>}</div></div>
      </section>

      <section className="automation-section" id="environment"><div className="automation-section-title"><h2>環境と利用料</h2><p>入口が変わっても、同じツールを。</p></div>
        <div className="automation-environments"><article className="automation-panel"><span className="automation-eyebrow">WEB</span><h3>ブラウザから</h3><p>ツールの確認、提案準備、仕事と収支の管理。</p><a href="/life">仕事・収支のワークスペース →</a></article><article className="automation-panel"><span className="automation-eyebrow">APP</span><h3>日常のアプリに</h3><p>対応ブラウザから、ホーム画面やデスクトップに追加できます。</p><button className="automation-tool-action" type="button" onClick={installApp}>インストール方法 →</button><p role="status" className="automation-help">{installNotice}</p></article><article className="automation-panel"><span className="automation-eyebrow">OS / LOCAL</span><h3>専用の作業環境</h3><p>同じ提案ツールを端末で動かす実行基盤があります。専用OSイメージと端末間同期は開発予定です。</p><span className="automation-status">ローカル実行基盤</span></article></div>
        <div className="automation-commercial"><div><p className="automation-eyebrow">ELECTRICITY PLAN</p><h3>${(servicePlan.amountMinor / 100).toFixed(2)} <span>USD / 月</span></h3><p>基本利用料としての「電気代」。従量の電力料金ではありません。</p></div><div><strong>利用者の売上からの分配：{servicePlan.revenueShareBps / 100}%</strong><p>外部AI・有料ツールの料金は別枠で、利用前に確認します。現在は課金準備中です。税・利用上限・解約条件を確定してから販売を開始します。</p><span className="automation-status">自動請求は未接続</span></div></div>
        <div className="automation-panel automation-telegram"><h3>Telegramは、外出先の確認窓口へ。</h3><p>顧客用Botは依頼と結果の確認、運営用Botは承認・監視・停止を担当する設計です。このハブで作った下書きやアカウントの自動同期はまだありません。</p></div>
      </section>
      <div className="automation-footnote">Mr. Automation Hub · avocadomini基盤 / 作成・実行・成果を分けて記録。収益は保証されません。</div>
    </main></div>;
}
