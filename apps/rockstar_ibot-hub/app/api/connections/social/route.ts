import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { CoreConnectionError, readCoreSocial } from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      social_provider_unconfigured: 'Kai所有Postizの設定がまだ完了していません。',
      social_credentials_rejected: 'Postiz API keyで所有リソースを確認できませんでした。',
      social_provider_unavailable: 'Postizの所有状態を確認できませんでした。',
      social_provider_invalid_response: 'Postizの応答を安全に確認できませんでした。',
      social_provider_response_too_large: 'Postizの応答が許容サイズを超えました。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'SNSの状態を確認できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-social]', error);
  return NextResponse.json(
    { error: 'SNSの状態を確認できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreSocial(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
