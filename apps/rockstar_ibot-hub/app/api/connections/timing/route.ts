import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import { CoreConnectionError, readCoreTiming, syncCoreCalendar } from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      calendar_provider_unconfigured: 'Calendar providerがまだ設定されていません。',
      calendar_credentials_unconfigured: 'Calendarの接続設定がまだ完了していません。',
      calendar_connection_not_active: 'Google Calendarの本人接続をやり直してください。',
      calendar_provider_unavailable: 'Google Calendarの予定を取得できませんでした。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Timing状態を確認できませんでした。' },
      { status: error.httpStatus },
    );
  }
  console.error('[core-timing]', error);
  return NextResponse.json({ error: 'Timing状態を確認できませんでした。' }, { status: 500 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreTiming(user.userId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json(await syncCoreCalendar(auth.user.userId));
  } catch (error) {
    return errorResponse(error);
  }
}
