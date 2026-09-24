import { NextResponse } from 'next/server';
import { authenticatedMutation } from '../../../lib/api-guard';
import { saveDailyCheckin } from '../../../lib/operating-store';
import { jsonRecord, operatingErrorResponse } from '../../../lib/operating-response';

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await jsonRecord(request);
    if (
      typeof body.day !== 'string' ||
      typeof body.bodyScore !== 'number' ||
      typeof body.mindScore !== 'number' ||
      typeof body.energyScore !== 'number' ||
      typeof body.note !== 'string' ||
      typeof body.timezoneOffsetMinutes !== 'number'
    ) {
      return NextResponse.json({ error: 'チェックイン内容が正しくありません。' }, { status: 400 });
    }
    return NextResponse.json(
      await saveDailyCheckin(auth.user.userId, auth.writeFence, {
        day: body.day,
        bodyScore: body.bodyScore,
        mindScore: body.mindScore,
        energyScore: body.energyScore,
        note: body.note,
        timezoneOffsetMinutes: body.timezoneOffsetMinutes,
      }),
    );
  } catch (error) {
    return operatingErrorResponse(error, 'チェックインを保存できませんでした。', 'checkin-save');
  }
}
