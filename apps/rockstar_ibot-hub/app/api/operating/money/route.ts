import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../../lib/api-guard';
import { createMoneyEntry, deleteMoneyEntry } from '../../../lib/operating-store';
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
      typeof body.direction !== 'string' ||
      typeof body.amountMinor !== 'number' ||
      typeof body.currency !== 'string' ||
      typeof body.category !== 'string' ||
      typeof body.note !== 'string' ||
      typeof body.occurredAt !== 'string'
    ) {
      return NextResponse.json({ error: '収支内容が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await createMoneyEntry(auth.user.userId, auth.writeFence, {
        direction: body.direction,
        amountMinor: body.amountMinor,
        currency: body.currency,
        category: body.category,
        note: body.note,
        occurredAt: body.occurredAt,
        mutationKey: mutationKey(request),
      }),
    );
  } catch (error) {
    return operatingErrorResponse(error, '収支を保存できませんでした。', 'money-create');
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (typeof body.entryId !== 'string') {
      return NextResponse.json({ error: '収支記録が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await deleteMoneyEntry(auth.user.userId, auth.writeFence, body.entryId),
    );
  } catch (error) {
    return operatingErrorResponse(error, '収支を削除できませんでした。', 'money-delete');
  }
}
