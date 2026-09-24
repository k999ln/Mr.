import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { CoreConnectionError, readCoreVoice } from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      voice_provider_unconfigured: 'Kai所有Telnyxの設定がまだ完了していません。',
      voice_provider_unauthorized: 'Telnyx API keyで所有リソースを確認できませんでした。',
      voice_provider_unavailable: 'Telnyxの所有状態を確認できませんでした。',
      voice_provider_invalid_response: 'Telnyxの応答を安全に確認できませんでした。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Telnyxの状態を確認できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-voice]', error);
  return NextResponse.json(
    { error: 'Telnyxの状態を確認できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreVoice(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
