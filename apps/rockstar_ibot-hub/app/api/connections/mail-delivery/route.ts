import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import {
  CoreConnectionError,
  readCoreMailRail,
  sendCoreMail,
  type CoreMailSendRequest,
} from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      mail_delivery_provider_unconfigured: '本人所有メールの送受信設定がまだ完了していません。',
      mail_sending_domain_not_verified: 'Resend上の送信ドメインを本人所有として確認できません。',
      mail_receiving_domain_not_verified: 'Resend上の返信受信ドメインを確認できません。',
      mail_webhook_not_verified: 'Resendの署名Webhookを確認できません。',
      mail_delivery_credentials_rejected: 'Resend専用credentialを確認できません。',
      mail_delivery_request_conflict: '同じ再試行キーを別のメールに使用できません。',
      mail_delivery_request_in_progress: '同じメールを送信確認中です。少し待って再確認してください。',
      mail_delivery_uncertain: '送信結果が不明なため、自動再送を停止しました。Resendの送信履歴を確認してください。',
      mail_delivery_rejected: 'メール送信をResendが受け付けませんでした。',
    };
    return NextResponse.json(
      { error: messages[error.code] || '本人所有メールの処理を完了できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-mail-delivery]', error);
  return NextResponse.json(
    { error: '本人所有メールの処理を完了できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreMailRail(user.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  const requestId = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    return NextResponse.json({ error: '安全な再試行キーが必要です。' }, { status: 400 });
  }
  let message: CoreMailSendRequest;
  try {
    const value = await request.json() as CoreMailSendRequest;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.to !== 'string'
      || typeof value.emailSubject !== 'string'
      || typeof value.text !== 'string') throw new Error('invalid');
    message = { to: value.to, emailSubject: value.emailSubject, text: value.text };
  } catch {
    return NextResponse.json({ error: '宛先・件名・本文を確認してください。' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await sendCoreMail(auth.user.userId, requestId, message),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
