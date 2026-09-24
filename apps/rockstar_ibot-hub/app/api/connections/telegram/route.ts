import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import {
  CoreConnectionError,
  createCoreLinkChallenge,
  patchCorePreferences,
  publicCoreConnection,
  readCoreConnection,
} from '../../../lib/core-client';
import { persistCoreConnection } from '../../../lib/core-connection-store';

function responseForError(error: unknown): NextResponse {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にTelegram本人リンクを完了してください。',
      invalid_preferences: '設定内容が正しくありません。',
      invalid_time_zone: 'タイムゾーンが正しくありません。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Coreとの連携を完了できませんでした。' },
      { status: error.httpStatus },
    );
  }
  console.error('[core-connection]', error);
  return NextResponse.json({ error: 'Coreとの連携を完了できませんでした。' }, { status: 500 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    const snapshot = await readCoreConnection(user.userId);
    await persistCoreConnection(user.userId, snapshot);
    return NextResponse.json(publicCoreConnection(snapshot));
  } catch (error) {
    return responseForError(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  const requestId = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    return NextResponse.json({ error: '安全な再試行キーが必要です。' }, { status: 400 });
  }
  try {
    const snapshot = await createCoreLinkChallenge(auth.user.userId, requestId);
    await persistCoreConnection(auth.user.userId, snapshot);
    return NextResponse.json(publicCoreConnection(snapshot));
  } catch (error) {
    return responseForError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticatedMutation(request);
  if ('response' in auth) return auth.response;
  let preferences: Record<string, unknown>;
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    preferences = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '設定内容が正しくありません。' }, { status: 400 });
  }
  try {
    const snapshot = await patchCorePreferences(auth.user.userId, preferences);
    await persistCoreConnection(auth.user.userId, snapshot);
    return NextResponse.json(publicCoreConnection(snapshot));
  } catch (error) {
    return responseForError(error);
  }
}
