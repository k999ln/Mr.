import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createExecutionStore } from './execution-store.mjs';
import { EXECUTION_PROTOCOL,executionCells,executionPrompt,validateExecutionResult,deviceReady } from './execution-contract.mjs';

function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE owner_data_locks(owner_id TEXT PRIMARY KEY,state TEXT);CREATE TABLE owner_write_fences(owner_id TEXT PRIMARY KEY,generation INTEGER);CREATE TABLE service_runs(id TEXT PRIMARY KEY,owner_id TEXT,slot_id TEXT,cell_id TEXT,input_summary TEXT,status TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE integration_outbox(id TEXT PRIMARY KEY,owner_id TEXT,topic TEXT,payload TEXT,status TEXT,updated_at TEXT);');
  sql.exec(readFileSync(new URL('../../drizzle/0010_numerous_hellcat.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  let time=1_800_000_000_000;
  const db={prepare(query){const statement=sql.prepare(query);return {bind(...args){return {async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}}}}},async batch(statements){sql.exec('BEGIN');try{const r=await Promise.all(statements.map(s=>s.run()));sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  sql.exec("INSERT INTO owner_write_fences VALUES('alice',1),('bob',1)");
  const store=createExecutionStore(db,()=>time);
  const insert=(owner,id='a'.repeat(64))=>{sql.prepare("INSERT INTO service_runs VALUES(?,?, 'slot.sell','proposal-builder','提案文を作成してください','queued',?,?)").run(id,owner,new Date(time).toISOString(),new Date(time).toISOString());return id;};
  const ready=async owner=>{const pair=await store.pair(owner,1);const actor=await store.authenticate(pair.token);await store.heartbeat(actor,true,EXECUTION_PROTOCOL);return actor;};
  return {sql,store,ready,insert,advance:ms=>{time+=ms;}};
}
const result={title:'提案書',body:'ご依頼の内容を確認しました。提供された条件に基づき、納品前の確認事項を整理してご提案します。',checks:['入力条件を反映'],warnings:['納期は未確定']};

test('18 variants have concrete instructions and reject arbitrary tools',()=>{
  assert.equal(executionCells.length,18);for(const c of executionCells)assert.match(executionPrompt({...c,summary:'提供情報から成果物を作成する'}),/ツールは使わない/);
  assert.throws(()=>executionPrompt({slotId:'slot.sell',cellId:'shell',summary:'execute'}));
  assert.deepEqual(validateExecutionResult(result),result);assert.throws(()=>validateExecutionResult({...result,script:'run'}));
  assert.throws(()=>validateExecutionResult({...result,body:'done'}));
});
test('pairing stores hashes only and is scoped to one owner',async()=>{
  const f=fixture();const a=await f.ready('alice');const pair=await f.store.pair('bob',1);
  assert.notEqual(f.sql.prepare('SELECT token_hash FROM execution_devices WHERE owner_id=?').get('bob').token_hash,pair.token);
  assert.equal((await f.store.device('alice')).ready,true);assert.equal((await f.store.device('bob')).ready,false);
  const id=f.insert('alice');await f.store.enqueue('alice',1,id);const b=await f.store.authenticate(pair.token);await f.store.heartbeat(b,true,EXECUTION_PROTOCOL);
  assert.equal(await f.store.claim(b),null);assert.equal((await f.store.claim(a)).id,id);
});
test('receipt survives refresh and repeated completion; no duplicate execution',async()=>{
  const f=fixture();const actor=await f.ready('alice');const id=f.insert('alice');await f.store.enqueue('alice',1,id);await f.store.enqueue('alice',1,id);
  const job=await f.store.claim(actor);assert.equal(await f.store.claim(actor),null);
  await f.store.complete(actor,{...job,status:'completed',result});await f.store.complete(actor,{...job,status:'completed',result});
  assert.equal(f.sql.prepare('SELECT status FROM service_runs WHERE id=?').get(id).status,'completed');assert.deepEqual((await f.store.list('alice'))[0].result,result);
  assert.equal((await f.store.list('bob')).length,0);
});
test('offline, stale heartbeat, malformed completion and expired claims fail closed',async()=>{
  const f=fixture();const id=f.insert('alice');await assert.rejects(f.store.enqueue('alice',1,id),/executor_offline/);
  const actor=await f.ready('alice');await f.store.enqueue('alice',1,id);const job=await f.store.claim(actor);
  await assert.rejects(f.store.complete(actor,{...job,status:'completed',result:{}}),/invalid_result/);
  f.advance(301_000);assert.equal((await f.store.device('alice')).ready,false);
  await assert.rejects(f.store.complete(actor,{...job,status:'completed',result}),/claim_lost/);await f.store.list('alice');
  assert.equal(f.sql.prepare('SELECT status FROM service_runs WHERE id=?').get(id).status,'failed');
  assert.equal(deviceReady({protocol:EXECUTION_PROTOCOL,verified:true,heartbeatAt:10},9),false);
});
test('old queued records do not run; cancellation and device rotation invalidate claims',async()=>{
  const f=fixture();const actor=await f.ready('alice');const id=f.insert('alice');assert.equal(await f.store.claim(actor),null);
  await f.store.enqueue('alice',1,id);const job=await f.store.claim(actor);await f.store.cancel('alice',1,id);
  await assert.rejects(f.store.complete(actor,{...job,status:'completed',result}),/claim_lost/);
  const replacement=await f.store.pair('alice',1);await assert.rejects(f.store.authenticate('f'.repeat(64)),/unauthorized/);
  assert.notEqual((await f.store.authenticate(replacement.token)).hash,actor.hash);
});
test('deletion fences block pairing, claims and late result writes',async()=>{
  const f=fixture();const actor=await f.ready('alice');const id=f.insert('alice');await f.store.enqueue('alice',1,id);const job=await f.store.claim(actor);
  f.sql.exec("UPDATE owner_write_fences SET generation=2 WHERE owner_id='alice'");
  await assert.rejects(f.store.pair('alice',1),/data_locked/);await assert.rejects(f.store.complete(actor,{...job,status:'completed',result}),/claim_lost/);
  assert.equal((await f.store.device('alice')).paired,false);
});
test('queue capacity is bounded and failures never produce completed artifacts',async()=>{
  const f=fixture();const actor=await f.ready('alice');for(const letter of ['a','b','c']){const id=f.insert('alice',letter.repeat(64));await f.store.enqueue('alice',1,id);}
  const over=f.insert('alice','d'.repeat(64));await assert.rejects(f.store.enqueue('alice',1,over),/execution_limit/);
  const job=await f.store.claim(actor);await f.store.complete(actor,{...job,status:'failed',errorCode:'secret diagnostics'});
  const finished=(await f.store.list('alice')).find(row=>row.id===job.id);assert.equal(finished.result,null);assert.equal(finished.errorCode,'execution_failed');
});
