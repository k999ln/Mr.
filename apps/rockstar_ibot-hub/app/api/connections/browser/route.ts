import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { CoreConnectionError, readCoreBrowser } from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      browser_provider_unconfigured: 'Cloudflare Browserの本人設定がまだ完了していません。',
      browser_credentials_rejected: 'Cloudflare Browser専用tokenで本人accountを確認できませんでした。',
      browser_provider_unavailable: 'Cloudflare Browserの状態を確認できませんでした。',
      browser_provider_invalid_response: 'Cloudflare Browserの応答を安全に確認できませんでした。',
      browser_provider_response_too_large: 'Cloudflare Browserの応答が許容サイズを超えました。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Cloudflare Browserの状態を確認できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-browser]', error);
  return NextResponse.json(
    { error: 'Cloudflare Browserの状態を確認できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreBrowser(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
