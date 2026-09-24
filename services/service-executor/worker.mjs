import { spawn } from 'node:child_process';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXECUTION_PROTOCOL,executionPrompt,executionResultSchema,validateExecutionResult } from '../../apps/rockstar_ibot-hub/app/lib/execution-contract.mjs';

export function codexArgs(workdir, schema, output) {
  const disabled=['shell_tool','unified_exec','apps','plugins','remote_plugin','multi_agent','multi_agent_v2','browser_use','browser_use_external','computer_use','in_app_browser','image_generation','view_image','hooks','code_mode','code_mode_host','skill_search','skill_mcp_dependency_install','tool_suggest','workspace_dependencies'];
  return ['exec','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--sandbox','read-only','--color','never','--json',
    ...disabled.flatMap(name=>['--disable',name]),'-c','web_search="disabled"','-c','mcp_servers={}','-c','project_doc_max_bytes=0','-c','history.persistence="none"','-c','shell_environment_policy.inherit="none"',
    '-C',workdir,'--output-schema',schema,'-o',output,'-'];
}
export function childEnvironment(source=process.env) {
  const result={BROWSER:'/usr/bin/false',GIT_TERMINAL_PROMPT:'0',NO_COLOR:'1'};
  for(const key of ['HOME','PATH','USER','LOGNAME','LANG','LC_ALL','TMPDIR','TMP','TEMP','CODEX_HOME','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS'])if(source[key])result[key]=source[key];
  return result;
}
export async function runCodex(job,{codexBin=process.env.CODEX_BIN||'codex',timeoutMs=240_000,spawnImpl=spawn,onEventType=()=>{}}={}) {
  const prompt=executionPrompt(job);
  const workdir=await mkdtemp(join(tmpdir(),'mr-service-run-'));
  const schema=join(workdir,'result-schema.json'), output=join(workdir,'result.json');
  await writeFile(schema,JSON.stringify(executionResultSchema),{mode:0o600});
  try {
    const execution=await new Promise(resolve=>{
      let settled=false,reason=null,buffer='',bytes=0;
      const child=spawnImpl(codexBin,codexArgs(workdir,schema,output),{cwd:workdir,env:childEnvironment(),stdio:['pipe','pipe','pipe']});
      let killTimer;
      function stop(code){if(reason)return;reason=code;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),1000);}
      const timer=setTimeout(()=>stop('model_timeout'),timeoutMs);
      child.stdout.on('data',chunk=>{
        bytes+=chunk.length;if(bytes>256_000){stop('invalid_result');return;}
        buffer+=String(chunk);let newline;
        while((newline=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
          try{
            const event=JSON.parse(line);const item=event.item;
            onEventType({event:event.type,item:item?.type,...(item?.type==='error'?{message:String(item.message||'').replace(/\b(?:sk-[\w-]+|Bearer\s+\S+)/g,'[redacted]').slice(0,800)}:{})});
            if(item?.type&&!['agent_message','reasoning','user_message','error'].includes(item.type))stop('invalid_result');
          }catch{ /* Non-JSON diagnostics are never returned to the user. */ }
        }
      });
      child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>256_000)stop('invalid_result');});
      const finish=(code)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);resolve({code,reason});};
      child.once('error',()=>{reason='model_unavailable';finish(1);});child.once('close',finish);
      child.stdin.on('error',()=>{});child.stdin.end(prompt);
    });
    if(execution.code!==0||execution.reason)return {status:'failed',errorCode:execution.reason||'model_unavailable'};
    try{
      const data=await readFile(output,'utf8');if(Buffer.byteLength(data)>48_000)throw new Error('large');
      return {status:'completed',result:validateExecutionResult(JSON.parse(data))};
    }catch{return {status:'failed',errorCode:'invalid_result'};}
  } finally {await rm(workdir,{recursive:true,force:true});}
}
export function validateSiteUrl(input,{allowLocal=false}={}) {
  const url=new URL(input);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(allowLocal&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('Use the exact HTTPS Site origin.');
  return url.origin;
}
export function workerClient(url,token,{allowLocal=false,fetchImpl=fetch}={}) {
  const origin=validateSiteUrl(url,{allowLocal});if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid device code.');
  return async body=>{
    const response=await fetchImpl(`${origin}/api/internal/execution`,{method:'POST',redirect:'error',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error(`worker_http_${response.status}`);
    const text=await response.text();if(Buffer.byteLength(text)>96_000)throw new Error('worker_response_too_large');
    return JSON.parse(text);
  };
}
export async function selfCheck(options={}) {
  return runCodex({slotId:'slot.sell',cellId:'proposal-builder',summary:'接続確認です。文書校正の提案を80文字程度で作ってください。実績や金額は未指定です。'},options);
}
export async function runWorker({url,token,allowLocal=false,once=false,signal,execute=runCodex,verify=selfCheck,log=()=>{}}) {
  const request=workerClient(url,token,{allowLocal});
  const check=await verify();
  if(check.status!=='completed'){await request({action:'heartbeat',protocol:EXECUTION_PROTOCOL,verified:false}).catch(()=>{});throw new Error(check.errorCode||'model_unavailable');}
  let healthy=true;
  const heartbeat=async()=>{try{await request({action:'heartbeat',protocol:EXECUTION_PROTOCOL,verified:healthy});}catch{healthy=false;}};
  await heartbeat();if(!healthy)throw new Error('device_unavailable');
  const interval=setInterval(heartbeat,20_000);
  try{
    do{
      if(!healthy)throw new Error('device_unavailable');
      const {job}=await request({action:'claim'});
      if(job){
        const result=await execute(job);
        if(result.status==='failed'&&result.errorCode==='model_unavailable')healthy=false;
        let sent=false;
        for(let attempt=0;attempt<3&&!sent;attempt++){
          try{await request({action:'complete',id:job.id,claimToken:job.claimToken,...result});sent=true;}
          catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,500));}
        }
        log(result.status==='completed'?'成果物を保存しました。':'処理に失敗しました。Webで状態を確認してください。');
      }
      if(!once&&!signal?.aborted)await new Promise(resolve=>setTimeout(resolve,2000));
    }while(!once&&!signal?.aborted);
  }finally{clearInterval(interval);healthy=false;await heartbeat();}
}
