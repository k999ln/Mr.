import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { authenticatedMutation } from '../../lib/api-guard';
import { createRun, serviceRunId } from '../../lib/portfolio-store';
import { mutationKey, operatingErrorResponse } from '../../lib/operating-response';
import { boundedJson,executionStore,executionSnapshot,executionErrorResponse,attachmentText } from '../../lib/execution';
import { ExecutionError } from '../../lib/execution-store.mjs';

export async function GET() {
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'認証が必要です。'},{status:401});
  try{return NextResponse.json(await executionSnapshot(user.userId),{headers:{'Cache-Control':'no-store'}});}catch(error){return executionErrorResponse(error);}
}
export async function PATCH(request:Request) {
  const auth=await authenticatedMutation(request);if('response' in auth)return auth.response;
  try{
    const body=await boundedJson(request);if(body.action!=='cancel'||typeof body.id!=='string')throw new ExecutionError('invalid_request',400);
    await executionStore().cancel(auth.user.userId,auth.writeFence,body.id);
    return NextResponse.json(await executionSnapshot(auth.user.userId),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return executionErrorResponse(error);}
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await boundedJson(request);
    if(body.executionConsent!==true)throw new ExecutionError('invalid_request',400);
    if (
      typeof body.slotId !== 'string' ||
      typeof body.cellId !== 'string' ||
      typeof body.summary !== 'string'
    ) {
      return NextResponse.json({ error: '依頼内容が正しくありません。' }, { status: 400 });
    }
    const fileId = typeof body.fileId === 'string' ? body.fileId : undefined;
    const store=executionStore();
    if(!(await store.device(auth.user.userId)).ready)throw new ExecutionError('executor_offline',503);
    const text=await attachmentText(auth.user.userId,fileId);
    await createRun(
        auth.user.userId,
        auth.writeFence,
        body.slotId,
        body.cellId,
        body.summary,
        fileId,
        mutationKey(request),
      );
    await store.enqueue(auth.user.userId,auth.writeFence,await serviceRunId(auth.user.userId,mutationKey(request)),text);
    return NextResponse.json(await executionSnapshot(auth.user.userId),{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if(error instanceof ExecutionError)return executionErrorResponse(error);
    return operatingErrorResponse(error, '実行を受け付けられませんでした。', 'service-run');
  }
}
