import { env } from 'cloudflare:workers';
import {
  ensureFoundationStoreSchema,
  getFoundationSnapshot,
} from './foundation-store';
import {
  ensureOperatingStoreSchema,
  getOperatingSnapshot,
  OperatingLockedError,
} from './operating-store';
import {
  ensurePortfolioStoreSchema,
  getOrCreatePortfolio,
  ownerObjectPrefix,
} from './portfolio-store';

type ExportRow = Record<string, unknown>;

const EXPORT_EVENT_LIMIT = 5_000;
const DELETE_LOCK_LEASE_MS = 5 * 60_000;

function database(): D1Database {
  if (!env.DB) throw new Error('avocadominiのデータベースに接続できません。');
  return env.DB;
}

async function ensureHubSchema(ownerId: string): Promise<void> {
  await Promise.all([
    getOrCreatePortfolio(ownerId),
    getOperatingSnapshot(ownerId),
    getFoundationSnapshot(ownerId),
  ]);
}

async function ensureDeletionSchema(): Promise<void> {
  await Promise.all([
    ensurePortfolioStoreSchema(),
    ensureOperatingStoreSchema(),
    ensureFoundationStoreSchema(),
  ]);
}

function resultRows(results: D1Result<unknown>[], index: number): ExportRow[] {
  return (results[index]?.results ?? []) as ExportRow[];
}

export async function exportHubData(ownerId: string) {
  await ensureHubSchema(ownerId);
  const db = database();
  const results = await db.batch([
    db
      .prepare(
        'SELECT portfolio_id, connected_all, created_at, updated_at FROM portfolios WHERE owner_id = ?',
      )
      .bind(ownerId),
    db
      .prepare(
        'SELECT slot_id, cell_id, enabled, updated_at FROM portfolio_slots WHERE owner_id = ? ORDER BY slot_id',
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, slot_id, cell_id, input_summary, file_id, status, created_at, updated_at
         FROM service_runs WHERE owner_id = ? ORDER BY created_at`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, filename, content_type, byte_size, created_at
         FROM service_files WHERE owner_id = ? ORDER BY created_at`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, domain, title, status, due_at, created_at, updated_at
         FROM life_tasks WHERE owner_id = ? ORDER BY created_at`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT day, body_score, mind_score, energy_score, note, created_at, updated_at
         FROM daily_checkins WHERE owner_id = ? ORDER BY day`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, direction, amount_minor, currency, category, note, occurred_at, created_at
         FROM money_entries WHERE owner_id = ? ORDER BY occurred_at, created_at`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT policy_version, status, granted_units, reserved_units, consumed_units,
                created_at, updated_at
         FROM foundation_allocation_accounts WHERE owner_id = ?`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, kind, category, requested_units, purpose_summary, status,
                policy_version, consent_at, decision_reason, created_at, updated_at
         FROM foundation_allocation_requests WHERE owner_id = ? ORDER BY created_at`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, request_id, entry_type, units, balance_after, actor_type,
                policy_version, created_at
         FROM foundation_allocation_ledger WHERE owner_id = ? ORDER BY created_at`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT id, action, payload, created_at FROM audit_events
         WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(ownerId, EXPORT_EVENT_LIMIT + 1),
    db
      .prepare(
        `SELECT id, topic, payload, status, attempts, created_at, updated_at
         FROM integration_outbox WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(ownerId, EXPORT_EVENT_LIMIT + 1),
    db
      .prepare(
        `SELECT id, operation, payload, created_at
         FROM portfolio_mutation_receipts
         WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(ownerId, EXPORT_EVENT_LIMIT + 1),
    db.prepare('SELECT run_id,result_json,error_code,finished_at FROM service_executions WHERE owner_id=? ORDER BY run_id').bind(ownerId),
  ]);

  const auditRows = resultRows(results, 10);
  const outboxRows = resultRows(results, 11);
  const receiptRows = resultRows(results, 12);

  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    scope: 'life-manager-hub',
    portfolio: resultRows(results, 0)[0] ?? null,
    slots: resultRows(results, 1),
    serviceRuns: resultRows(results, 2),
    serviceResults: resultRows(results, 13),
    fileManifest: resultRows(results, 3),
    tasks: resultRows(results, 4),
    dailyCheckins: resultRows(results, 5),
    moneyEntries: resultRows(results, 6),
    foundationDistribution: {
      account: resultRows(results, 7)[0] ?? null,
      requests: resultRows(results, 8),
      allocationLedger: resultRows(results, 9),
    },
    auditEvents: auditRows.slice(0, EXPORT_EVENT_LIMIT).reverse(),
    integrationOutbox: outboxRows.slice(0, EXPORT_EVENT_LIMIT).reverse(),
    mutationReceipts: receiptRows.slice(0, EXPORT_EVENT_LIMIT).reverse(),
    exportLimits: {
      eventRowsPerCollection: EXPORT_EVENT_LIMIT,
      auditEventsTruncated: auditRows.length > EXPORT_EVENT_LIMIT,
      integrationOutboxTruncated: outboxRows.length > EXPORT_EVENT_LIMIT,
      mutationReceiptsTruncated: receiptRows.length > EXPORT_EVENT_LIMIT,
      fileContentIncluded: false,
      internalClaimTokensIncluded: false,
    },
  };
}

type DeleteLease = {
  token: string;
  deleteBeforeGeneration: number;
};

async function acquireDeleteLock(db: D1Database, ownerId: string): Promise<DeleteLease> {
  const token = `deleting:${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - DELETE_LOCK_LEASE_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO owner_data_locks (owner_id, state, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
       WHERE owner_data_locks.state = 'delete_failed'
          OR (owner_data_locks.state LIKE 'deleting:%' AND owner_data_locks.updated_at < ?)`,
    )
    .bind(ownerId, token, now, staleBefore)
    .run();
  const lock = await db
    .prepare('SELECT state FROM owner_data_locks WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ state: string }>();
  if (lock?.state !== token) {
    throw new OperatingLockedError('データ削除はすでに処理中です。完了後に再試行してください。');
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO owner_write_fences (owner_id, generation, updated_at)
       VALUES (?, 0, ?)`,
    )
    .bind(ownerId, now)
    .run();
  const fence = await db
    .prepare(
      `UPDATE owner_write_fences
       SET generation = generation + 1, updated_at = ?
       WHERE owner_id = ?
         AND EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ? AND state = ?)
       RETURNING generation`,
    )
    .bind(now, ownerId, ownerId, token)
    .first<{ generation: number }>();
  if (!fence || !Number.isSafeInteger(fence.generation) || fence.generation < 1) {
    throw new OperatingLockedError('データ削除の処理権限が更新されました。もう一度お試しください。');
  }
  await db
    .prepare(
      `INSERT INTO owner_cleanup_tombstones
       (owner_id, delete_before_generation, updated_at)
       SELECT ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ? AND state = ?)
       ON CONFLICT(owner_id) DO UPDATE SET
         delete_before_generation = MAX(
           owner_cleanup_tombstones.delete_before_generation,
           excluded.delete_before_generation
         ),
         updated_at = excluded.updated_at`,
    )
    .bind(ownerId, fence.generation, now, ownerId, token)
    .run();
  return { token, deleteBeforeGeneration: fence.generation };
}

async function heartbeatDeleteLock(
  db: D1Database,
  ownerId: string,
  token: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE owner_data_locks SET updated_at = ? WHERE owner_id = ? AND state = ?')
    .bind(now, ownerId, token)
    .run();
  const lock = await db
    .prepare('SELECT state FROM owner_data_locks WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ state: string }>();
  if (lock?.state !== token) {
    throw new OperatingLockedError('データ削除の処理権限が更新されました。もう一度お試しください。');
  }
}

async function deleteOwnerObjects(
  prefix: string,
  deleteBeforeGeneration: number,
  heartbeat: () => Promise<void>,
): Promise<void> {
  if (!env.FILES) throw new Error('添付ファイル保存先に接続できません。');
  let scannedPages = 0;
  // A completed pass with no deletes proves that only the current/newer
  // generations remain. Repeating after a deleting pass avoids cursor gaps.
  for (let sweep = 0; sweep < 10_000; sweep += 1) {
    let cursor: string | undefined;
    let deletedInSweep = 0;
    do {
      scannedPages += 1;
      if (scannedPages > 10_000) {
        throw new Error('添付ファイルの削除件数が安全上限を超えました。');
      }
      await heartbeat();
      const listed = await env.FILES.list({ prefix, limit: 1_000, cursor });
      const keys = listed.objects
        .filter((object) => {
          const relativeKey = object.key.slice(prefix.length);
          const match = /^generations\/(\d+)\//.exec(relativeKey);
          if (!match) return true;
          const generation = Number(match[1]);
          return !Number.isSafeInteger(generation) || generation < deleteBeforeGeneration;
        })
        .map((object) => object.key);
      if (keys.length > 0) {
        // The lease is rechecked immediately before the destructive R2 call.
        // Generation filtering also makes a stale deleter harmless to new data.
        await heartbeat();
        await env.FILES.delete(keys);
        deletedInSweep += keys.length;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    if (deletedInSweep === 0) return;
  }
  throw new Error('添付ファイルの削除件数が安全上限を超えました。');
}

function deleteOwnerRows(
  db: D1Database,
  table: string,
  ownerId: string,
  lockToken: string,
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM ${table} WHERE owner_id = ?
       AND EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ? AND state = ?)`,
    )
    .bind(ownerId, ownerId, lockToken);
}

export async function eraseHubData(ownerId: string): Promise<void> {
  await ensureDeletionSchema();
  const db = database();
  const lease = await acquireDeleteLock(db, ownerId);
  const lockToken = lease.token;
  const prefix = await ownerObjectPrefix(ownerId);
  const heartbeat = () => heartbeatDeleteLock(db, ownerId, lockToken);

  try {
    await deleteOwnerObjects(prefix, lease.deleteBeforeGeneration, heartbeat);
    await heartbeat();
    await db.batch([
      deleteOwnerRows(db, 'execution_devices', ownerId, lockToken),
      deleteOwnerRows(db, 'service_executions', ownerId, lockToken),
      deleteOwnerRows(db, 'integration_outbox', ownerId, lockToken),
      deleteOwnerRows(db, 'portfolio_mutation_receipts', ownerId, lockToken),
      deleteOwnerRows(db, 'foundation_allocation_ledger', ownerId, lockToken),
      deleteOwnerRows(db, 'foundation_allocation_requests', ownerId, lockToken),
      deleteOwnerRows(db, 'foundation_allocation_accounts', ownerId, lockToken),
      deleteOwnerRows(db, 'service_runs', ownerId, lockToken),
      deleteOwnerRows(db, 'service_files', ownerId, lockToken),
      deleteOwnerRows(db, 'file_upload_reservations', ownerId, lockToken),
      deleteOwnerRows(db, 'portfolio_slots', ownerId, lockToken),
      deleteOwnerRows(db, 'portfolios', ownerId, lockToken),
      deleteOwnerRows(db, 'life_tasks', ownerId, lockToken),
      deleteOwnerRows(db, 'daily_checkins', ownerId, lockToken),
      deleteOwnerRows(db, 'money_entries', ownerId, lockToken),
      deleteOwnerRows(db, 'audit_events', ownerId, lockToken),
      deleteOwnerRows(db, 'mutation_rate_limits', ownerId, lockToken),
      deleteOwnerRows(db, 'data_export_rate_limits', ownerId, lockToken),
    ]);
    await heartbeat();
    await deleteOwnerObjects(prefix, lease.deleteBeforeGeneration, heartbeat);
    await heartbeat();
    const unlocked = await db
      .prepare('DELETE FROM owner_data_locks WHERE owner_id = ? AND state = ?')
      .bind(ownerId, lockToken)
      .run();
    if (Number(unlocked.meta.changes ?? 0) !== 1) {
      throw new OperatingLockedError('データ削除の処理権限が更新されました。もう一度お試しください。');
    }
  } catch (error) {
    try {
      await db
        .prepare(
          `UPDATE owner_data_locks SET state = 'delete_failed', updated_at = ?
           WHERE owner_id = ? AND state = ?`,
        )
        .bind(new Date().toISOString(), ownerId, lockToken)
        .run();
    } catch (lockError) {
      console.error('[data-erase:mark-failed]', lockError);
    }
    throw error;
  }
}
