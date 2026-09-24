import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { CoreConnectionError, readCoreVendorBank } from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      vendor_bank_provider_unconfigured: '本人法人口座の読み取り設定がまだ完了していません。',
      vendor_bank_credentials_rejected: '銀行API credentialで本人法人口座を確認できませんでした。',
      vendor_bank_provider_unavailable: '銀行APIの所有状態を確認できませんでした。',
      vendor_bank_provider_invalid_response: '銀行APIの応答を安全に確認できませんでした。',
      vendor_bank_provider_response_too_large: '銀行APIの応答が許容サイズを超えました。',
    };
    return NextResponse.json(
      { error: messages[error.code] || '本人法人口座の状態を確認できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-vendor-bank]', error);
  return NextResponse.json(
    { error: '本人法人口座の状態を確認できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreVendorBank(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
