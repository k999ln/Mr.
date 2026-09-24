import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { runCodex,selfCheck,workerClient } from '../services/service-executor/worker.mjs';
import { EXECUTION_PROTOCOL } from '../apps/rockstar_ibot-hub/app/lib/execution-contract.mjs';

// Real model + real local HTTP/D1 only. Never accepts a hosted origin.
const base='http://localhost:3000', marker=`MR execution smoke ${randomUUID()}`;
const dbPath=process.argv[2];
assert.ok(dbPath&&resolve(dbPath).includes('/apps/rockstar_ibot-hub/.wrangler/state/v3/d1/'),'Provide the exact local test D1 file');
const sql=new DatabaseSync(resolve(dbPath));
const signIn=await fetch(`${base}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=signIn.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
const call=async(path,body,key=randomUUID(),method='POST')=>{
 const response=await fetch(`${base}${path}`,{method:body?method:'GET',headers:{Cookie:cookie,...(body?{'content-type':'application/json',Origin:base,'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
};
const original=await call('/api/runs');assert.equal(original.executionDevice.paired,false,'Do not replace an existing device');
const cases=[
 ['slot.create','youtube-script-writer','初心者向けにデスクの片付けを説明する60秒YouTube台本。3つの手順を含め、300文字程度にする。'],
 ['slot.grow','seo-blueprint','個人の文章校正サービス。対象は初めてブログを書く人。提供情報だけで検索意図の仮説と記事構成を作る。検索量は不明。'],
 ['slot.launch','landing-page-sprint','商品名「ていねい校正」。日本語文章の誤字と表現を確認する。金額・申込URLは未定。短い単体HTML/CSSを作成する。'],
 ['slot.sell','sales-objection-reply-builder','問い合わせ「ブログ原稿1000文字の校正をお願いできますか」。提供範囲は誤字と表現の改善。価格と納期は要相談。返信文を作成。'],
 ['slot.learn','user-interview-synthesizer','顧客A「どこを直したか分かると助かる」。顧客B「修正理由も知りたい」。この2つの発言だけから分析して提案を整理する。'],
 ['slot.deliver','gig-delivery-verifier','要件: 1. タイトルがある 2. 問い合わせ先がある。成果物本文:「ていねい校正。文章の誤字と表現を確認します。」この本文との照合だけを行う。'],
];
let heartbeat,token,request;const runIds=[];
try{
 assert.equal((await fetch(`${base}/api/runs`)).status,401);
 assert.equal((await fetch(`${base}/api/internal/execution`,{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"claim"}'})).status,401);
 const paired=await call('/api/execution-device',{action:'pair'});token=paired.token;
 request=workerClient(base,token,{allowLocal:true});
 const check=await selfCheck();assert.equal(check.status,'completed',check.errorCode);console.log('PASS: live Codex generation self-check');
 await request({action:'heartbeat',protocol:EXECUTION_PROTOCOL,verified:true});
 heartbeat=setInterval(()=>request({action:'heartbeat',protocol:EXECUTION_PROTOCOL,verified:true}).catch(()=>{}),20_000);
 await call('/api/portfolio/connect-all',{});
 for(const [slotId,cellId,summary] of cases){
   const key=randomUUID(),body={slotId,cellId,summary:`${marker}\n${summary}`,executionConsent:true};
   const saved=await call('/api/runs',body,key);const run=saved.runs.find(row=>row.summary===body.summary);assert.ok(run);runIds.push(run.id);
   await call('/api/runs',body,key);
   const {job}=await request({action:'claim'});assert.equal(job.id,run.id);
   assert.equal((await call('/api/runs')).runs.find(row=>row.id===run.id).status,'running');
   const generated=await runCodex(job);assert.equal(generated.status,'completed',generated.errorCode);
   await request({action:'complete',id:job.id,claimToken:job.claimToken,...generated});
   await request({action:'complete',id:job.id,claimToken:job.claimToken,...generated});
   const fresh=await call('/api/runs');const completed=fresh.runs.find(row=>row.id===run.id);
   assert.equal(completed.status,'completed');assert.ok(completed.execution.result.body.length>=30);
   assert.equal(fresh.runs.filter(row=>row.id===run.id).length,1);
   console.log(`PASS: ${cellId} — queued → running → completed → reload (${completed.execution.result.body.length} characters)`);
 }
 assert.equal((await call('/api/data')).schemaVersion,3);
 console.log('PASS: six real artifacts, owner-scoped save/reload, idempotency, export');
}finally{
 clearInterval(heartbeat);
 if(token){
   const hash=createHash('sha256').update(token).digest('hex');
   if(sql.prepare('SELECT owner_id FROM execution_devices WHERE token_hash=?').get(hash))await call('/api/execution-device',{action:'revoke'});
 }
 for(const slot of original.slots)await call('/api/portfolio/slots',slot);
 for(const id of runIds){
   const run=sql.prepare('SELECT owner_id,input_summary FROM service_runs WHERE id=?').get(id);
   if(!run?.input_summary.startsWith(marker))throw new Error('Cleanup target changed');
   sql.prepare('DELETE FROM service_executions WHERE run_id=? AND owner_id=?').run(id,run.owner_id);
   sql.prepare("DELETE FROM integration_outbox WHERE owner_id=? AND topic='service.run_requested' AND json_extract(payload,'$.runId')=?").run(run.owner_id,id);
   sql.prepare("DELETE FROM audit_events WHERE owner_id=? AND action='service.run_queued' AND json_extract(payload,'$.runId')=?").run(run.owner_id,id);
   sql.prepare('DELETE FROM service_runs WHERE id=? AND owner_id=? AND input_summary LIKE ?').run(id,run.owner_id,`${marker}%`);
 }
 assert.equal(sql.prepare('SELECT count(*) AS n FROM service_runs WHERE input_summary LIKE ?').get(`${marker}%`).n,0);
 sql.close();console.log('PASS: synthetic runs removed; original selections restored; test device disconnected');
}
