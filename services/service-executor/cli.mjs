#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile,writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { runWorker,selfCheck,validateSiteUrl } from './worker.mjs';

const exec=promisify(execFile),args=process.argv.slice(2),command=args[0];
const configPath=resolve('.mr-executor.json');
async function secretInput(){
  if(process.stdin.isTTY){
    process.stderr.write('Webの接続コードを貼り付けてEnter（非表示）: ');
    process.stdin.setRawMode(true);process.stdin.resume();
    return new Promise((resolveInput,reject)=>{let value='';const listener=chunk=>{for(const c of String(chunk)){if(c==='\u0003'){done();reject(new Error('cancelled'));return;}if(c==='\r'||c==='\n'){done();resolveInput(value.trim());return;}if(c==='\u007f')value=value.slice(0,-1);else if(/[a-f0-9]/.test(c)&&value.length<64)value+=c;}};const done=()=>{process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n');};process.stdin.on('data',listener);});
  }
  let value='';for await(const chunk of process.stdin){value+=String(chunk);if(value.length>100)throw new Error('invalid code');}return value.trim();
}
async function main(){
  if(command==='check'){const check=await selfCheck();if(check.status!=='completed')throw new Error(check.errorCode);console.log('Codexの成果物生成を確認しました。');return;}
  if(command==='connect'){
    if(process.platform!=='darwin')throw new Error('この接続保存はmacOS Keychain用です。');
    const url=validateSiteUrl(args[1]);const token=await secretInput();if(!/^[a-f0-9]{64}$/.test(token))throw new Error('接続コードが正しくありません。');
    const service=`com.mr.service-executor.${new URL(url).hostname}`;
    await exec('/usr/bin/security',['add-generic-password','-U','-a',userInfo().username,'-s',service,'-w',token]);
    await writeFile(configPath,JSON.stringify({url,service},null,2)+'\n',{mode:0o600});
    console.log('接続設定を保存しました。node services/service-executor/cli.mjs start で起動します。');return;
  }
  if(command==='start'){
    const config=JSON.parse(await readFile(configPath,'utf8'));const url=validateSiteUrl(config.url);
    if(config.service!==`com.mr.service-executor.${new URL(url).hostname}`)throw new Error('接続設定を確認してください。');
    const {stdout}=await exec('/usr/bin/security',['find-generic-password','-a',userInfo().username,'-s',config.service,'-w']);
    const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
    console.log('実行環境を確認しています。接続中はこの端末を起動しておいてください。');
    await runWorker({url,token:stdout.trim(),signal:controller.signal,log:console.log});return;
  }
  console.log('Mr. service executor\n  check: Codexで生成確認\n  connect HTTPS_SITE_ORIGIN: Webの接続コードをKeychainへ保存\n  start: 本人のWeb依頼だけ処理（停止はCtrl+C）');
}
main().catch(error=>{const safe=/^(model_unavailable|model_timeout|invalid_result|device_unavailable|worker_http_\d+)$/.test(error.message)?error.message:'設定・接続・Codexログインを確認してください。';console.error(`Mr.実行環境: ${safe}`);process.exitCode=1;});
