'use client';
import { useState } from 'react';
import type { ExecutionDeviceState } from '../lib/execution-contract.mjs';

export default function ExecutionDevice({device,onChange}:{device:ExecutionDeviceState;onChange:()=>Promise<void>}) {
  const [code,setCode]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  async function change(action:'pair'|'revoke'){
    if(!window.confirm(action==='pair'?'自分の端末を接続するコードを作成します。既存の接続と実行待ち・処理中の依頼は停止されます。続けますか？':'実行端末を切断し、実行待ち・処理中の依頼を停止しますか？'))return;
    setBusy(true);setNotice('');
    try{
      const response=await fetch('/api/execution-device',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
      const result=await response.json() as {error?:string;token?:string};if(!response.ok)throw new Error(result.error||'接続設定を保存できませんでした。');
      setCode(result.token||'');setNotice(action==='pair'?'コードはこの画面で一度だけ確認できます。他の人に渡さないでください。':'端末を切断しました。');await onChange();
    }catch(error){setNotice(error instanceof Error?error.message:'接続に失敗しました。');}finally{setBusy(false);}
  }
  return <section className="execution-device" id="execution-device" aria-labelledby="execution-title">
    <div><p className="card-kicker">実行環境</p><h3 id="execution-title">{device.ready?'接続確認済み・実行可能':device.paired?'端末の起動待ち':'実行端末が未接続です'}</h3><p>6サービスの作成・分析を、本人が接続した端末のCodexで処理します。端末の起動・通信・Codexの利用枠が必要です。投稿・外部納品・決済は行いません。</p>{device.lastSeenAt&&<p className="execution-meta">最終応答: {new Date(device.lastSeenAt).toLocaleString('ja-JP')}</p>}</div>
    <details open={!device.paired}><summary>自分のMacを接続する手順</summary><ol>
      <li>Mr.リポジトリをMacに用意し、Codexにログインします。</li>
      <li>下のボタンで本人専用コードを発行します。</li>
      <li>Mr.のフォルダで <code>node services/service-executor/cli.mjs connect SITE_URL</code> を実行します。SITE_URLはこのWebハブのURL（末尾の /life は除く）に置き換え、求められたらコードを貼り付けます。コードはKeychainに保存されます。</li>
      <li><code>node services/service-executor/cli.mjs start</code> を実行します。生成確認が成功すると、この画面が「実行可能」に変わります。</li>
    </ol><p>端末は自動起動しません。この起動方法は接続確認用です。停止は端末でCtrl+C、接続解除は下のボタンから行えます。</p></details>
    <div className="execution-actions"><button type="button" disabled={busy} onClick={()=>change('pair')}>{device.paired?'接続コードを再発行':'実行端末の接続コードを作る'}</button>{device.paired&&<button type="button" disabled={busy} onClick={()=>change('revoke')}>端末を切断</button>}<button type="button" disabled={busy} onClick={()=>onChange().catch(()=>setNotice('接続状態を確認できませんでした。'))}>状態を確認</button></div>
    {code&&<div className="execution-code"><label>本人専用の接続コード<input type="password" readOnly value={code} autoComplete="off" /></label><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(code);setNotice('コードをコピーしました。端末に貼り付けてください。');}catch{setNotice('コピーを許可してもう一度お試しください。');}}}>コードをコピー</button><button type="button" onClick={()=>setCode('')}>画面から消す</button></div>}
    <p role="status">{notice}</p>
  </section>;
}
