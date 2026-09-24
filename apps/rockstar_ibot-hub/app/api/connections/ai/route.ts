import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { CoreConnectionError, readCoreAi } from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      gemini_provider_unconfigured: 'Kai所有Geminiの設定がまだ完了していません。',
      gemini_credentials_rejected: 'Gemini credentialをGoogle APIで確認できませんでした。',
      gemini_provider_unavailable: 'Gemini APIの状態を確認できませんでした。',
      gemini_provider_invalid_response: 'Gemini APIの応答を安全に確認できませんでした。',
      gemini_model_mismatch: '設定したGeminiモデルとGoogle APIのreadbackが一致しません。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Geminiの状態を確認できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-ai]', error);
  return NextResponse.json(
    { error: 'Geminiの状態を確認できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreAi(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
