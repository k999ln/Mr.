import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../chatgpt-auth';

const MUTATION_LIMIT_PER_MINUTE = 90;
const EXPORT_LIMIT_PER_MINUTE = 6;
let rateSchemaReady: Promise<void> | undefined;

async function ensureRateSchema(): Promise<void> {
  if (rateSchemaReady) return rateSchemaReady;
  if (!env.DB) throw new Error('rate-limit database unavailable');
  rateSchemaReady = env.DB
    .batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS mutation_rate_limits (
        owner_id TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        PRIMARY KEY (owner_id, window_start)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS data_export_rate_limits (
        owner_id TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        PRIMARY KEY (owner_id, window_start)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS owner_data_locks (
        owner_id TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS owner_write_fences (
        owner_id TEXT PRIMARY KEY NOT NULL,
        generation INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    ])
    .then(() => undefined)
    .catch((error) => {
      rateSchemaReady = undefined;
      throw error;
    });
  return rateSchemaReady;
}

async function consumeMutationBudget(ownerId: string): Promise<number> {
  await ensureRateSchema();
  if (!env.DB) throw new Error('rate-limit database unavailable');
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const row = await env.DB
    .prepare(
      `INSERT INTO mutation_rate_limits (owner_id, window_start, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(owner_id, window_start) DO UPDATE SET
         request_count = mutation_rate_limits.request_count + 1
       RETURNING request_count`,
    )
    .bind(ownerId, windowStart)
    .first<{ request_count: number }>();
  if (!row) throw new Error('rate-limit counter unavailable');
  if (row.request_count === 1) {
    await env.DB
      .prepare('DELETE FROM mutation_rate_limits WHERE owner_id = ? AND window_start < ?')
      .bind(ownerId, windowStart - 86_400_000)
      .run();
  }
  return row.request_count;
}

async function consumeExportBudget(ownerId: string): Promise<number> {
  await ensureRateSchema();
  if (!env.DB) throw new Error('rate-limit database unavailable');
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const row = await env.DB
    .prepare(
      `INSERT INTO data_export_rate_limits (owner_id, window_start, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(owner_id, window_start) DO UPDATE SET
         request_count = data_export_rate_limits.request_count + 1
       RETURNING request_count`,
    )
    .bind(ownerId, windowStart)
    .first<{ request_count: number }>();
  if (!row) throw new Error('export rate-limit counter unavailable');
  if (row.request_count === 1) {
    await env.DB
      .prepare('DELETE FROM data_export_rate_limits WHERE owner_id = ? AND window_start < ?')
      .bind(ownerId, windowStart - 86_400_000)
      .run();
  }
  return row.request_count;
}

export async function authenticatedExport() {
  const user = await getChatGPTUser();
  if (!user) {
    return { response: NextResponse.json({ error: '認証が必要です。' }, { status: 401 }) };
  }
  try {
    await ensureRateSchema();
    if (!env.DB) throw new Error('rate-limit database unavailable');
    const lock = await env.DB
      .prepare('SELECT state FROM owner_data_locks WHERE owner_id = ?')
      .bind(user.userId)
      .first<{ state: string }>();
    if (lock) {
      return {
        response: NextResponse.json(
          { error: 'データ削除を処理中です。完了後に再試行してください。' },
          { status: 423 },
        ),
      };
    }
    const requestCount = await consumeExportBudget(user.userId);
    if (requestCount > EXPORT_LIMIT_PER_MINUTE) {
      const retryAfter = Math.max(1, 60 - new Date().getUTCSeconds());
      return {
        response: NextResponse.json(
          { error: '書き出し回数が多すぎます。少し待ってから再試行してください。' },
          { status: 429, headers: { 'retry-after': String(retryAfter) } },
        ),
      };
    }
  } catch (error) {
    console.error('[api-guard:export-rate-limit]', error);
    return {
      response: NextResponse.json(
        { error: '書き出しを安全に受け付けられませんでした。' },
        { status: 503 },
      ),
    };
  }
  return { user };
}

export async function authenticatedMutation(
  request: Request,
  options: { allowDataLock?: boolean } = {},
) {
  const user = await getChatGPTUser();
  if (!user) {
    return { response: NextResponse.json({ error: '認証が必要です。' }, { status: 401 }) };
  }

  const origin = request.headers.get('origin');
  const expectedOrigin = new URL(request.url).origin;
  const fetchSite = request.headers.get('sec-fetch-site');
  if (
    (origin ? origin !== expectedOrigin : fetchSite !== 'same-origin') ||
    (fetchSite !== null && fetchSite !== 'same-origin')
  ) {
    return { response: NextResponse.json({ error: '無効な送信元です。' }, { status: 403 }) };
  }

  let writeFence: number | undefined;
  try {
    await ensureRateSchema();
    if (!env.DB) throw new Error('rate-limit database unavailable');
    const now = new Date().toISOString();
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO owner_write_fences (owner_id, generation, updated_at)
         VALUES (?, 0, ?)`,
      )
      .bind(user.userId, now)
      .run();
    const fence = await env.DB
      .prepare(
        `SELECT fences.generation, locks.state AS lock_state
         FROM owner_write_fences AS fences
         LEFT JOIN owner_data_locks AS locks ON locks.owner_id = fences.owner_id
         WHERE fences.owner_id = ?`,
      )
      .bind(user.userId)
      .first<{ generation: number; lock_state: string | null }>();
    if (!fence || !Number.isSafeInteger(fence.generation)) {
      throw new Error('owner write fence unavailable');
    }
    if (!options.allowDataLock && fence.lock_state) {
      return {
        response: NextResponse.json(
          { error: 'データ削除を処理中です。完了後に再試行してください。' },
          { status: 423 },
        ),
      };
    }
    writeFence = fence.generation;
    const requestCount = await consumeMutationBudget(user.userId);
    if (requestCount > MUTATION_LIMIT_PER_MINUTE) {
      const retryAfter = Math.max(1, 60 - new Date().getUTCSeconds());
      return {
        response: NextResponse.json(
          { error: '操作が多すぎます。少し待ってから再試行してください。' },
          { status: 429, headers: { 'retry-after': String(retryAfter) } },
        ),
      };
    }
  } catch (error) {
    console.error('[api-guard:rate-limit]', error);
    return {
      response: NextResponse.json(
        { error: '操作を安全に受け付けられませんでした。' },
        { status: 503 },
      ),
    };
  }

  if (writeFence === undefined) {
    return {
      response: NextResponse.json(
        { error: '操作を安全に受け付けられませんでした。' },
        { status: 503 },
      ),
    };
  }
  return { user, writeFence };
}
