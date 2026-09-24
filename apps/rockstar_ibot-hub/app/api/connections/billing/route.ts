import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import {
  CoreConnectionError,
  createCoreBillingCheckout,
  readCoreBilling,
} from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      stripe_provider_unconfigured: 'Kai所有StripeのPayment LinkとWebhookがまだ設定されていません。',
      stripe_checkout_reference_expired: '決済リンクの期限が切れました。もう一度開始してください。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Stripeの状態を確認できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-billing]', error);
  return NextResponse.json(
    { error: 'Stripeの状態を確認できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreBilling(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  const requestId = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    return NextResponse.json(
      { error: '安全な再試行キーが必要です。' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  }
  try {
    return NextResponse.json(
      await createCoreBillingCheckout(auth.user.userId, requestId),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
