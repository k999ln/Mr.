import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { codexArgs,childEnvironment,validateSiteUrl,workerClient,runCodex } from './worker.mjs';
const job={slotId:'slot.sell',cellId:'proposal-builder',summary:'入力条件に基づく提案文を作ってください。'};
const result={title:'提案文',body:'入力された条件に基づいてご提案します。まず対象の文章と希望納期を確認し、そのうえで対応範囲を確定いたします。',checks:['入力を確認'],warnings:['価格は要相談']};
function fakeSpawn({event,resultValue=result,exitCode=0,hang=false}={}){
 return (_bin,args,opts)=>{
   assert.equal(opts.shell,undefined);assert.equal(args.at(-1),'-');
   const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
   child.kill=()=>{setImmediate(()=>child.emit('close',1));return true;};
   child.stdin.on('finish',async()=>{if(event)child.stdout.write(JSON.stringify({type:'item.started',item:{type:event}})+'\n');if(hang)return;await writeFile(args[args.indexOf('-o')+1],JSON.stringify(resultValue));setImmediate(()=>child.emit('close',exitCode));});
   return child;
 };
}
test('runner disables shell/browser/connectors and excludes account secrets from child environment',()=>{
 const args=codexArgs('/tmp/empty','/tmp/schema','/tmp/result');
 for(const flag of ['--ignore-user-config','--ignore-rules','--ephemeral','read-only','web_search="disabled"'])assert.ok(args.includes(flag));
 for(const feature of ['shell_tool','unified_exec','apps','plugins','browser_use','computer_use','hooks'])assert.ok(args.includes(feature));
 const env=childEnvironment({HOME:'/home/test',PATH:'/bin',MR_EXECUTOR_TOKEN:'private',OPENAI_API_KEY:'private',LM_HUB_LINK_SECRET:'private'});
 assert.equal(env.HOME,'/home/test');assert.equal(env.MR_EXECUTOR_TOKEN,undefined);assert.equal(env.OPENAI_API_KEY,undefined);
});
test('only exact HTTPS origins are allowed; loopback is opt-in for local tests',()=>{
 assert.equal(validateSiteUrl('https://example.com'),'https://example.com');
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?secret=1'])assert.throws(()=>validateSiteUrl(url));
 assert.throws(()=>validateSiteUrl('http://localhost:3000'));
 assert.equal(validateSiteUrl('http://localhost:3000',{allowLocal:true}),'http://localhost:3000');
});
test('worker credentials stay in authorization headers and redirects fail closed',async()=>{
 let seen;const request=workerClient('https://example.com','a'.repeat(64),{fetchImpl:async(url,init)=>{seen={url,init};return new Response('{"job":null}');}});
 assert.equal((await request({action:'claim'})).job,null);assert.equal(seen.url,'https://example.com/api/internal/execution');assert.equal(seen.init.redirect,'error');
 assert.ok(!seen.url.includes('a'.repeat(64)));assert.equal(seen.init.headers.Authorization,`Bearer ${'a'.repeat(64)}`);
});
test('validated model result is returned; malformed or failed model responses are never completed',async()=>{
 assert.deepEqual(await runCodex(job,{spawnImpl:fakeSpawn()}),{status:'completed',result});
 assert.equal((await runCodex(job,{spawnImpl:fakeSpawn({resultValue:{}})})).errorCode,'invalid_result');
 assert.equal((await runCodex(job,{spawnImpl:fakeSpawn({exitCode:1})})).status,'failed');
});
test('tool-call events and timeouts stop execution and suppress results',async()=>{
 assert.equal((await runCodex(job,{spawnImpl:fakeSpawn({event:'command_execution',hang:true})})).errorCode,'invalid_result');
 assert.equal((await runCodex(job,{spawnImpl:fakeSpawn({hang:true}),timeoutMs:10})).errorCode,'model_timeout');
});
