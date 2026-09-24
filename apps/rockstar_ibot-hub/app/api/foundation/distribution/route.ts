import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import {
  cancelFoundationRequest,
  createFoundationRequest,
  getFoundationSnapshot,
} from '../../../lib/foundation-store';
import {
  jsonRecord,
  mutationKey,
  operatingErrorResponse,
} from '../../../lib/operating-response';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getFoundationSnapshot(user.userId), {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    return operatingErrorResponse(error, '配給状況を読み込めませんでした。', 'foundation-read');
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (
      typeof body.kind !== 'string' ||
      typeof body.category !== 'string' ||
      typeof body.requestedUnits !== 'number' ||
      typeof body.purposeSummary !== 'string' ||
      typeof body.attested !== 'boolean'
    ) {
      return NextResponse.json({ error: '配給申請の内容が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await createFoundationRequest(
        auth.user.userId,
        auth.writeFence,
        {
          kind: body.kind,
          category: body.category,
          requestedUnits: body.requestedUnits,
          purposeSummary: body.purposeSummary,
          attested: body.attested,
        },
        mutationKey(request),
      ),
    );
  } catch (error) {
    return operatingErrorResponse(error, '配給申請を保存できませんでした。', 'foundation-create');
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (typeof body.requestId !== 'string' || body.action !== 'cancel') {
      return NextResponse.json({ error: '取消内容が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await cancelFoundationRequest(
        auth.user.userId,
        auth.writeFence,
        body.requestId,
        mutationKey(request),
      ),
    );
  } catch (error) {
    return operatingErrorResponse(error, '配給申請を取り消せませんでした。', 'foundation-cancel');
  }
}
