import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import { createTask, getOperatingSnapshot, OperatingInputError } from '../../../lib/operating-store';
import { jsonRecord, mutationKey, operatingErrorResponse } from '../../../lib/operating-response';
import { toolRequestTitle } from '../../../lib/tool-request.mjs';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    const snapshot = await getOperatingSnapshot(user.userId);
    return NextResponse.json({ requests: snapshot.tasks.filter(task => task.title.startsWith('[ツール導入確認・')) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return operatingErrorResponse(error, '導入候補を読み込めませんでした。', 'automation-request-list');
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    let title: string;
    try { title = toolRequestTitle(body); } catch (error) {
      if (error instanceof TypeError) throw new OperatingInputError(error.message);
      throw error;
    }
    await createTask(auth.user.userId, auth.writeFence, 'work', title, undefined, mutationKey(request));
    return NextResponse.json({ status: 'review_requested', message: '導入確認を仕事の一覧に保存しました。' }, { status: 201 });
  } catch (error) {
    return operatingErrorResponse(error, '導入確認を保存できませんでした。', 'automation-request');
  }
}
