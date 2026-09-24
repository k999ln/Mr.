import { NextResponse } from 'next/server';
import { authenticatedExport, authenticatedMutation } from '../../lib/api-guard';
import { eraseHubData, exportHubData } from '../../lib/data-control-store';
import { jsonRecord, operatingErrorResponse } from '../../lib/operating-response';

export async function GET() {
  const auth = await authenticatedExport();
  if ('response' in auth) return auth.response;
  const { user } = auth;
  try {
    const data = await exportHubData(user.userId);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(
      JSON.stringify(
        {
          ...data,
          account: {
            provider: 'signin-with-chatgpt',
            email: user.email,
            displayName: user.displayName,
          },
        },
        null,
        2,
      ),
      {
        headers: {
          'cache-control': 'private, no-store',
          'content-disposition': `attachment; filename="life-manager-hub-${day}.json"`,
          'content-type': 'application/json; charset=utf-8',
        },
      },
    );
  } catch (error) {
    console.error('[data:export]', error);
    return NextResponse.json({ error: '保存データを書き出せませんでした。' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticatedMutation(request, { allowDataLock: true });
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (body.confirmation !== 'DELETE MY HUB DATA') {
      return NextResponse.json({ error: '削除確認が一致しません。' }, { status: 400 });
    }
    await eraseHubData(auth.user.userId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return operatingErrorResponse(error, 'Hub保存データを削除できませんでした。', 'data-erase');
  }
}
