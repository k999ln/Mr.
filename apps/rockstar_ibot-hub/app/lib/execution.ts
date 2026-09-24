import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { createExecutionStore, ExecutionError } from './execution-store.mjs';
import { getOrCreatePortfolio, type PortfolioSnapshot } from './portfolio-store';
import type { ExecutionResult } from './execution-contract.mjs';

export const executionStore = () => createExecutionStore(env.DB);
export type ExecutionSnapshot = PortfolioSnapshot & { executionDevice: { paired: boolean; ready: boolean; lastSeenAt: string|null } };
export async function executionSnapshot(owner: string): Promise<ExecutionSnapshot> {
  const store = executionStore();
  const executions = await store.list(owner);
  const [snapshot, executionDevice] = await Promise.all([getOrCreatePortfolio(owner),store.device(owner)]);
  const byId = new Map(executions.map(item=>[item.id,item]));
  return {...snapshot,executionDevice,runs:snapshot.runs.map(run=>({...run,execution:byId.get(run.id)||null}))};
}
export type RunExecution = {id: string; result: ExecutionResult|null; errorCode: string|null; finishedAt: string|null};

export async function boundedJson(request: Request): Promise<Record<string,unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ExecutionError('invalid_request',400);
  const reader=request.body?.getReader();
  if (!reader) throw new ExecutionError('invalid_request',400);
  const chunks: Uint8Array[]=[]; let bytes=0;
  try {
    while(true) { const chunk=await reader.read(); if(chunk.done) break; bytes+=chunk.value.byteLength; if(bytes>65_536) { await reader.cancel(); throw new ExecutionError('request_too_large',413); } chunks.push(chunk.value); }
    const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
    if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('invalid');
    return value;
  } catch(error) {if(error instanceof ExecutionError)throw error;throw new ExecutionError('invalid_request',400);}
}
export function executionErrorResponse(error: unknown) {
  const messages: Record<string,string> = {
    executor_offline:'実行環境が未接続、または停止しています。接続後にもう一度お試しください。',
    execution_limit:'同時受付は3件、実行受付は1時間10件までです。完了を待ってください。',
    data_locked:'データ状態が変わりました。画面を更新してください。',
    invalid_request:'入力内容を確認してください。',request_too_large:'入力が大きすぎます。',
    unsupported_attachment:'この実行では16,000文字・64KB以内のUTF-8テキスト添付（txt・md・json）だけを読めます。',
  };
  if(error instanceof ExecutionError)return NextResponse.json({error:messages[error.code]||'実行の認証・状態を確認できませんでした。',code:error.code},{status:error.status,headers:{'Cache-Control':'no-store'}});
  console.error('[execution] operation failed');
  return NextResponse.json({error:'実行基盤へ接続できませんでした。'},{status:503});
}
export async function attachmentText(owner: string,fileId?: string) {
  if(!fileId)return null;
  const file=await env.DB.prepare('SELECT object_key,filename,byte_size FROM service_files WHERE id=? AND owner_id=?').bind(fileId,owner).first<{object_key:string;filename:string;byte_size:number}>();
  if(!file||! /\.(txt|md|json)$/i.test(file.filename)||file.byte_size>65_536)throw new ExecutionError('unsupported_attachment',400);
  const object=await env.FILES.get(file.object_key);
  if(!object||object.size>65_536)throw new ExecutionError('unsupported_attachment',400);
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await object.arrayBuffer());}catch{throw new ExecutionError('unsupported_attachment',400);}
  if(text.length>16_000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))throw new ExecutionError('unsupported_attachment',400);
  return text;
}
