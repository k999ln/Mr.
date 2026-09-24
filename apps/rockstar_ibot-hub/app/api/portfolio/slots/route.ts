import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../../lib/api-guard';
import { setSlot } from '../../../lib/portfolio-store';
import {
  jsonRecord,
  mutationKey,
  operatingErrorResponse,
} from '../../../lib/operating-response';

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (
      typeof body.slotId !== 'string' ||
      typeof body.cellId !== 'string' ||
      typeof body.enabled !== 'boolean'
    ) {
      return NextResponse.json({ error: 'サービス設定が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await setSlot(
        auth.user.userId,
        auth.writeFence,
        body.slotId,
        body.cellId,
        body.enabled,
        mutationKey(request),
      ),
    );
  } catch (error) {
    return operatingErrorResponse(error, 'サービス設定を保存できませんでした。', 'portfolio-slot');
  }
}
