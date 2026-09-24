import { env } from 'cloudflare:workers';
import type { CoreConnectionSnapshot } from './core-client';

let schemaReady: Promise<void> | undefined;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS core_identity_links (
      owner_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('unlinked', 'pending', 'linked')),
      core_account_ref TEXT,
      bot_username TEXT NOT NULL,
      requested_at TEXT,
      linked_at TEXT,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_core_identity_links_status_updated ON core_identity_links(status, updated_at)',
    ),
  ]).then(() => undefined).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export async function persistCoreConnection(
  ownerId: string,
  snapshot: CoreConnectionSnapshot,
): Promise<void> {
  if (!['unlinked', 'pending', 'linked'].includes(snapshot.status)) return;
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO core_identity_links
      (owner_id, status, core_account_ref, bot_username, requested_at, linked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       status = excluded.status,
       core_account_ref = COALESCE(excluded.core_account_ref, core_identity_links.core_account_ref),
       bot_username = excluded.bot_username,
       requested_at = COALESCE(excluded.requested_at, core_identity_links.requested_at),
       linked_at = COALESCE(excluded.linked_at, core_identity_links.linked_at),
       updated_at = excluded.updated_at`,
  ).bind(
    ownerId,
    snapshot.status,
    snapshot.accountRef || null,
    snapshot.botUsername,
    snapshot.status === 'pending' ? now : null,
    snapshot.linkedAt || null,
    now,
  ).run();
}
