import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { authenticatedMutation } from '../../lib/api-guard';
import { boundedJson,executionStore,executionErrorResponse } from '../../lib/execution';
import { ExecutionError } from '../../lib/execution-store.mjs';

export async function GET() {
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'認証が必要です。'},{status:401});
  try{return NextResponse.json(await executionStore().device(user.userId),{headers:{'Cache-Control':'no-store'}});}catch(error){return executionErrorResponse(error);}
}
export async function POST(request:Request) {
  const auth=await authenticatedMutation(request);if('response' in auth)return auth.response;
  try{
    const body=await boundedJson(request);if(Object.keys(body).join()!=='action'||!['pair','revoke'].includes(String(body.action)))throw new ExecutionError('invalid_request',400);
    const store=executionStore();
    const result=body.action==='pair'?await store.pair(auth.user.userId,auth.writeFence):await store.revoke(auth.user.userId,auth.writeFence);
    return NextResponse.json(result||{revoked:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return executionErrorResponse(error);}
}
