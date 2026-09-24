import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { authenticatedMutation } from '../../../lib/api-guard';
import {
  computeCoreRoute,
  CoreConnectionError,
  readCoreMaps,
  type CoreRouteRequest,
} from '../../../lib/core-client';

function errorResponse(error: unknown) {
  if (error instanceof CoreConnectionError) {
    const messages: Record<string, string> = {
      core_not_configured: 'Cloudflare Coreの接続設定が未完了です。',
      core_unavailable: 'Cloudflare Coreへ接続できませんでした。',
      identity_not_linked: '先にavocadomini Botの本人リンクを完了してください。',
      maps_provider_unconfigured: 'Kai所有Maps専用credentialがまだ設定されていません。',
      maps_credentials_rejected: 'Maps専用credentialをGoogle Routes APIで確認できませんでした。',
      maps_provider_rejected: 'Google Routes APIが経路条件を受け付けませんでした。',
      maps_provider_unavailable: 'Google Routes APIへ接続できませんでした。',
      maps_request_conflict: '同じ再試行キーを別の経路へ使用できません。',
      maps_request_in_progress: '同じ経路を計算中です。少し待って再確認してください。',
    };
    return NextResponse.json(
      { error: messages[error.code] || 'Mapsの処理を完了できませんでした。' },
      { status: error.httpStatus, headers: { 'cache-control': 'no-store' } },
    );
  }
  console.error('[core-maps]', error);
  return NextResponse.json(
    { error: 'Mapsの処理を完了できませんでした。' },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
  try {
    return NextResponse.json(await readCoreMaps(user.userId), { headers: { 'cache-control': 'no-store' } });
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
  let route: CoreRouteRequest;
  try {
    const value = await request.json() as CoreRouteRequest;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    route = value;
  } catch {
    return NextResponse.json({ error: '経路条件が正しくありません。' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await computeCoreRoute(auth.user.userId, requestId, route),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
