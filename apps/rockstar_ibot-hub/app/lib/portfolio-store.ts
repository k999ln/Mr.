import { env } from 'cloudflare:workers';
import type { RunExecution } from './execution';
import {
  PORTFOLIO_ID,
  cellForSlot,
  serviceCells,
  variantAllowed,
} from './catalog';
import {
  OperatingConflictError,
  OperatingInputError,
  OperatingLimitError,
  OperatingLockedError,
} from './operating-store';

export type SlotState = {
  slotId: string;
  cellId: string;
  enabled: boolean;
};

export type RunState = {
  id: string;
  slotId: string;
  cellId: string;
  summary: string;
  status: string;
  createdAt: string;
  execution?: RunExecution | null;
};

export type PortfolioSnapshot = {
  portfolioId: string;
  connectedAll: boolean;
  connectedCount: number;
  slots: SlotState[];
  runs: RunState[];
  updatedAt: string;
};

let schemaReady: Promise<void> | undefined;
const MAX_PENDING_OUTBOX = 2_000;

function validMutationKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

async function deterministicResourceId(
  ownerId: string,
  operation: string,
  mutationKey: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${ownerId}\u0000${operation}\u0000${mutationKey}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function database(): D1Database {
  if (!env.DB) throw new Error('ポートフォリオ用データベースに接続できません。');
  return env.DB;
}

async function ensureReceiptClaimColumn(db: D1Database): Promise<void> {
  const columns = await db
    .prepare('PRAGMA table_info(portfolio_mutation_receipts)')
    .all<{ name: string }>();
  if (columns.results.some((column) => column.name === 'claim_token')) return;
  try {
    await db
      .prepare(
        "ALTER TABLE portfolio_mutation_receipts ADD COLUMN claim_token TEXT NOT NULL DEFAULT ''",
      )
      .run();
  } catch (error) {
    const refreshed = await db
      .prepare('PRAGMA table_info(portfolio_mutation_receipts)')
      .all<{ name: string }>();
    if (!refreshed.results.some((column) => column.name === 'claim_token')) throw error;
  }
}

async function throwIfWriteBlocked(
  db: D1Database,
  ownerId: string,
  writeFence?: number,
): Promise<void> {
  const lock = await db
    .prepare('SELECT 1 AS locked FROM owner_data_locks WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ locked: number }>();
  if (lock) throw new OperatingLockedError('データ削除中のため操作を完了できません。');
  if (writeFence !== undefined) {
    const fence = await db
      .prepare('SELECT generation FROM owner_write_fences WHERE owner_id = ?')
      .bind(ownerId)
      .first<{ generation: number }>();
    if (!fence || fence.generation !== writeFence) {
      throw new OperatingLockedError('データ状態が更新されたため、画面を更新して再試行してください。');
    }
  }
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const db = database();
  schemaReady = db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS owner_data_locks (
        owner_id TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS owner_write_fences (
        owner_id TEXT PRIMARY KEY NOT NULL,
        generation INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS owner_cleanup_tombstones (
        owner_id TEXT PRIMARY KEY NOT NULL,
        delete_before_generation INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS portfolios (
        owner_id TEXT PRIMARY KEY NOT NULL,
        portfolio_id TEXT NOT NULL,
        connected_all INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS portfolio_slots (
        owner_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        cell_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_slots_owner_slot ON portfolio_slots(owner_id, slot_id)',
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS service_runs (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        cell_id TEXT NOT NULL,
        input_summary TEXT NOT NULL,
        file_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_service_runs_owner_created ON service_runs(owner_id, created_at)',
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS service_files (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_service_files_object_key ON service_files(object_key)',
      ),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_service_files_owner ON service_files(owner_id)',
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS file_upload_reservations (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        content_sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_file_upload_reservations_owner_status ON file_upload_reservations(owner_id, status)',
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_audit_events_owner_created ON audit_events(owner_id, created_at)',
      ),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS cap_audit_events_after_insert
        AFTER INSERT ON audit_events
        BEGIN
          DELETE FROM audit_events
          WHERE owner_id = NEW.owner_id AND id IN (
            SELECT id FROM audit_events WHERE owner_id = NEW.owner_id
            ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 5000
          );
        END`),
      db.prepare(`CREATE TABLE IF NOT EXISTS integration_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS portfolio_mutation_receipts (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        claim_token TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_portfolio_mutation_receipts_owner_created ON portfolio_mutation_receipts(owner_id, created_at)',
      ),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS cap_portfolio_mutation_receipts_after_insert
        AFTER INSERT ON portfolio_mutation_receipts
        BEGIN
          DELETE FROM portfolio_mutation_receipts
          WHERE owner_id = NEW.owner_id AND id IN (
            SELECT id FROM portfolio_mutation_receipts WHERE owner_id = NEW.owner_id
            ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 5000
          );
        END`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_integration_outbox_status_created ON integration_outbox(status, created_at)',
      ),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_integration_outbox_owner_status_created ON integration_outbox(owner_id, status, created_at)',
      ),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS cap_processed_outbox_after_update
        AFTER UPDATE OF status ON integration_outbox
        WHEN NEW.status <> 'pending'
        BEGIN
          DELETE FROM integration_outbox
          WHERE owner_id = NEW.owner_id AND status <> 'pending' AND id IN (
            SELECT id FROM integration_outbox
            WHERE owner_id = NEW.owner_id AND status <> 'pending'
            ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 5000
          );
        END`),
    ])
    .then(async () => ensureReceiptClaimColumn(db))
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  return schemaReady;
}

export async function ensurePortfolioStoreSchema(): Promise<void> {
  await ensureSchema();
}

type PortfolioMutationIdentity = {
  receiptId: string;
  auditId: string;
  outboxId: string;
  claimToken: string;
  operation: string;
  payloadJson: string;
};

async function portfolioMutationIdentity(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  operation: string,
  mutationKey: string,
  payload: unknown,
): Promise<PortfolioMutationIdentity & { replay: boolean }> {
  if (!validMutationKey(mutationKey)) {
    throw new OperatingInputError('Idempotency-Keyが正しくありません。');
  }
  const scopedOperation = `${operation}:${writeFence}`;
  const receiptId = await deterministicResourceId(ownerId, scopedOperation, mutationKey);
  const payloadJson = JSON.stringify(payload);
  const existing = await db
    .prepare(
      `SELECT operation, payload FROM portfolio_mutation_receipts
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(receiptId, ownerId)
    .first<{ operation: string; payload: string }>();
  if (existing && (existing.operation !== operation || existing.payload !== payloadJson)) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なるサービス設定は送信できません。');
  }
  return {
    receiptId,
    auditId: await deterministicResourceId(ownerId, `${scopedOperation}.audit`, mutationKey),
    outboxId: await deterministicResourceId(ownerId, `${scopedOperation}.outbox`, mutationKey),
    claimToken: crypto.randomUUID(),
    operation,
    payloadJson,
    replay: Boolean(existing),
  };
}

function receiptStatement(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  identity: PortfolioMutationIdentity,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO portfolio_mutation_receipts
       (id, owner_id, operation, payload, claim_token, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
         AND (SELECT COUNT(*) FROM integration_outbox WHERE owner_id = ? AND status = 'pending') < ?`,
    )
    .bind(
      identity.receiptId,
      ownerId,
      identity.operation,
      identity.payloadJson,
      identity.claimToken,
      now,
      ownerId,
      ownerId,
      writeFence,
      ownerId,
      MAX_PENDING_OUTBOX,
    );
}

function portfolioEventStatement(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  action: string,
  identity: PortfolioMutationIdentity,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
         AND EXISTS (
           SELECT 1 FROM portfolio_mutation_receipts
           WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
         )`,
    )
    .bind(
      identity.auditId,
      ownerId,
      action,
      identity.payloadJson,
      now,
      ownerId,
      ownerId,
      writeFence,
      identity.receiptId,
      ownerId,
      identity.operation,
      identity.payloadJson,
      identity.claimToken,
    );
}

function portfolioOutboxStatement(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  topic: string,
  identity: PortfolioMutationIdentity,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO integration_outbox
       (id, owner_id, topic, payload, status, attempts, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'pending', 0, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
         AND EXISTS (
           SELECT 1 FROM portfolio_mutation_receipts
           WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
         )`,
    )
    .bind(
      identity.outboxId,
      ownerId,
      topic,
      identity.payloadJson,
      now,
      now,
      ownerId,
      ownerId,
      writeFence,
      identity.receiptId,
      ownerId,
      identity.operation,
      identity.payloadJson,
      identity.claimToken,
    );
}

async function verifyPortfolioReceipt(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  identity: PortfolioMutationIdentity,
): Promise<void> {
  const receipt = await db
    .prepare(
      `SELECT operation, payload FROM portfolio_mutation_receipts
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(identity.receiptId, ownerId)
    .first<{ operation: string; payload: string }>();
  if (!receipt) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    await ensureOutboxCapacity(db, ownerId);
    throw new OperatingConflictError('サービス設定を同期できませんでした。もう一度お試しください。');
  }
  if (receipt.operation !== identity.operation || receipt.payload !== identity.payloadJson) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なるサービス設定は送信できません。');
  }
  await throwIfWriteBlocked(db, ownerId, writeFence);
}

async function ensureOutboxCapacity(db: D1Database, ownerId: string): Promise<void> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM integration_outbox
       WHERE owner_id = ? AND status = 'pending'`,
    )
    .bind(ownerId)
    .first<{ count: number }>();
  if (Number(row?.count ?? 0) >= MAX_PENDING_OUTBOX) {
    throw new OperatingLimitError('連携キューが混雑しています。処理が進んでから再試行してください。');
  }
}

export async function getOrCreatePortfolio(
  ownerId: string,
  writeFence?: number,
): Promise<PortfolioSnapshot> {
  await ensureSchema();
  const db = database();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO owner_write_fences (owner_id, generation, updated_at)
       VALUES (?, 0, ?)`,
    )
    .bind(ownerId, now)
    .run();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const fenceValue = writeFence ?? null;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO portfolios
         (owner_id, portfolio_id, connected_all, created_at, updated_at)
         SELECT ?, ?, 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?
           ))`,
      )
      .bind(ownerId, PORTFOLIO_ID, now, now, ownerId, fenceValue, ownerId, fenceValue),
  ];
  for (const cell of serviceCells) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO portfolio_slots
           (owner_id, slot_id, cell_id, enabled, updated_at)
           SELECT ?, ?, ?, 0, ?
           WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
             AND (? IS NULL OR EXISTS (
               SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?
             ))`,
        )
        .bind(
          ownerId,
          cell.slotId,
          cell.defaultCellId,
          now,
          ownerId,
          fenceValue,
          ownerId,
          fenceValue,
        ),
    );
  }
  await db.batch(statements);
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readPortfolio(ownerId);
}

async function readPortfolio(ownerId: string): Promise<PortfolioSnapshot> {
  await ensureSchema();
  const db = database();
  const [portfolio, slotsResult, runsResult] = await Promise.all([
    db
      .prepare(
        'SELECT portfolio_id, connected_all, updated_at FROM portfolios WHERE owner_id = ?',
      )
      .bind(ownerId)
      .first<{ portfolio_id: string; connected_all: number; updated_at: string }>(),
    db
      .prepare(
        'SELECT slot_id, cell_id, enabled FROM portfolio_slots WHERE owner_id = ? ORDER BY slot_id',
      )
      .bind(ownerId)
      .all<{ slot_id: string; cell_id: string; enabled: number }>(),
    db
      .prepare(
        `SELECT id, slot_id, cell_id, input_summary, status, created_at
         FROM service_runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 12`,
      )
      .bind(ownerId)
      .all<{
        id: string;
        slot_id: string;
        cell_id: string;
        input_summary: string;
        status: string;
        created_at: string;
      }>(),
  ]);
  if (!portfolio) {
    await throwIfWriteBlocked(db, ownerId);
    throw new Error('ポートフォリオが見つかりません。');
  }

  const slots = slotsResult.results.map((row) => ({
    slotId: row.slot_id,
    cellId: row.cell_id,
    enabled: Boolean(row.enabled),
  }));
  return {
    portfolioId: portfolio.portfolio_id,
    connectedAll: Boolean(portfolio.connected_all),
    connectedCount: slots.filter((slot) => slot.enabled).length,
    slots,
    runs: runsResult.results.map((row) => ({
      id: row.id,
      slotId: row.slot_id,
      cellId: row.cell_id,
      summary: row.input_summary,
      status: row.status,
      createdAt: row.created_at,
    })),
    updatedAt: portfolio.updated_at,
  };
}

export async function connectAll(
  ownerId: string,
  writeFence: number,
  mutationKey: string,
): Promise<PortfolioSnapshot> {
  await getOrCreatePortfolio(ownerId, writeFence);
  const db = database();
  const now = new Date().toISOString();
  const payload = { portfolioId: PORTFOLIO_ID, slots: serviceCells.map((cell) => cell.slotId) };
  const identity = await portfolioMutationIdentity(
    db,
    ownerId,
    writeFence,
    'portfolio.connected_all',
    mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readPortfolio(ownerId);
  }
  await ensureOutboxCapacity(db, ownerId);
  const statements: D1PreparedStatement[] = [
    receiptStatement(db, ownerId, writeFence, identity, now),
    db
      .prepare(
        `UPDATE portfolios SET connected_all = 1, updated_at = ? WHERE owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
         AND EXISTS (
           SELECT 1 FROM portfolio_mutation_receipts
           WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
         )`,
      )
      .bind(
        now,
        ownerId,
        ownerId,
        ownerId,
        writeFence,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
  ];
  for (const cell of serviceCells) {
    statements.push(
      db
        .prepare(
          `INSERT INTO portfolio_slots (owner_id, slot_id, cell_id, enabled, updated_at)
           SELECT ?, ?, ?, 1, ?
           WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
             AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
             AND EXISTS (
               SELECT 1 FROM portfolio_mutation_receipts
               WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
             )
           ON CONFLICT(owner_id, slot_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at
           WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = excluded.owner_id)
             AND EXISTS (
               SELECT 1 FROM owner_write_fences
               WHERE owner_id = excluded.owner_id AND generation = ?
             )`,
        )
        .bind(
          ownerId,
          cell.slotId,
          cell.defaultCellId,
          now,
          ownerId,
          ownerId,
          writeFence,
          identity.receiptId,
          ownerId,
          identity.operation,
          identity.payloadJson,
          identity.claimToken,
          writeFence,
        ),
    );
  }
  statements.push(
    portfolioEventStatement(db, ownerId, writeFence, 'portfolio.connected_all', identity, now),
  );
  statements.push(
    portfolioOutboxStatement(db, ownerId, writeFence, 'portfolio.connected', identity, now),
  );
  await db.batch(statements);
  await verifyPortfolioReceipt(db, ownerId, writeFence, identity);
  return readPortfolio(ownerId);
}

export async function setSlot(
  ownerId: string,
  writeFence: number,
  slotId: string,
  cellId: string,
  enabled: boolean,
  mutationKey: string,
): Promise<PortfolioSnapshot> {
  const cell = cellForSlot(slotId);
  if (!cell || !variantAllowed(slotId, cellId)) {
    throw new OperatingInputError('選択したサービスは利用できません。');
  }
  await getOrCreatePortfolio(ownerId, writeFence);
  const db = database();
  const now = new Date().toISOString();
  const payload = { slotId, cellId, enabled };
  const identity = await portfolioMutationIdentity(
    db,
    ownerId,
    writeFence,
    'portfolio.slot_changed',
    mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readPortfolio(ownerId);
  }
  await ensureOutboxCapacity(db, ownerId);
  await db.batch([
    receiptStatement(db, ownerId, writeFence, identity, now),
    db
      .prepare(
        `INSERT INTO portfolio_slots (owner_id, slot_id, cell_id, enabled, updated_at)
         SELECT ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )
         ON CONFLICT(owner_id, slot_id) DO UPDATE SET
         cell_id = excluded.cell_id, enabled = excluded.enabled, updated_at = excluded.updated_at
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = excluded.owner_id)
           AND EXISTS (
             SELECT 1 FROM owner_write_fences
             WHERE owner_id = excluded.owner_id AND generation = ?
           )`,
      )
      .bind(
        ownerId,
        slotId,
        cellId,
        enabled ? 1 : 0,
        now,
        ownerId,
        ownerId,
        writeFence,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
        writeFence,
      ),
    db
      .prepare(
        `UPDATE portfolios SET connected_all = CASE
           WHEN (SELECT COUNT(*) FROM portfolio_slots WHERE owner_id = ?) = ?
            AND (SELECT COALESCE(SUM(enabled), 0) FROM portfolio_slots WHERE owner_id = ?) = ?
           THEN 1 ELSE 0 END,
         updated_at = ? WHERE owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
         AND EXISTS (
           SELECT 1 FROM portfolio_mutation_receipts
           WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
         )`,
      )
      .bind(
        ownerId,
        serviceCells.length,
        ownerId,
        serviceCells.length,
        now,
        ownerId,
        ownerId,
        ownerId,
        writeFence,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
    portfolioEventStatement(db, ownerId, writeFence, 'portfolio.slot_changed', identity, now),
    portfolioOutboxStatement(db, ownerId, writeFence, 'portfolio.slot_changed', identity, now),
  ]);
  await verifyPortfolioReceipt(db, ownerId, writeFence, identity);
  return readPortfolio(ownerId);
}

export async function resetPortfolio(
  ownerId: string,
  writeFence: number,
  mutationKey: string,
): Promise<PortfolioSnapshot> {
  await getOrCreatePortfolio(ownerId, writeFence);
  const db = database();
  const now = new Date().toISOString();
  const payload = { portfolioId: PORTFOLIO_ID };
  const identity = await portfolioMutationIdentity(
    db,
    ownerId,
    writeFence,
    'portfolio.reset',
    mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readPortfolio(ownerId);
  }
  await ensureOutboxCapacity(db, ownerId);
  const statements: D1PreparedStatement[] = [
    receiptStatement(db, ownerId, writeFence, identity, now),
    db
      .prepare(
        `UPDATE portfolios SET connected_all = 0, updated_at = ? WHERE owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
         AND EXISTS (
           SELECT 1 FROM portfolio_mutation_receipts
           WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
         )`,
      )
      .bind(
        now,
        ownerId,
        ownerId,
        ownerId,
        writeFence,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
  ];
  for (const cell of serviceCells) {
    statements.push(
      db
        .prepare(
          `UPDATE portfolio_slots SET cell_id = ?, enabled = 0, updated_at = ?
           WHERE owner_id = ? AND slot_id = ?
           AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
        )
        .bind(
          cell.defaultCellId,
          now,
          ownerId,
          cell.slotId,
          ownerId,
          ownerId,
          writeFence,
          identity.receiptId,
          ownerId,
          identity.operation,
          identity.payloadJson,
          identity.claimToken,
        ),
    );
  }
  statements.push(
    portfolioEventStatement(db, ownerId, writeFence, 'portfolio.reset', identity, now),
  );
  statements.push(
    portfolioOutboxStatement(db, ownerId, writeFence, 'portfolio.reset', identity, now),
  );
  await db.batch(statements);
  await verifyPortfolioReceipt(db, ownerId, writeFence, identity);
  return readPortfolio(ownerId);
}

export const serviceRunId = (ownerId: string, key: string) => deterministicResourceId(ownerId, 'service.run', key);

export async function createRun(
  ownerId: string,
  writeFence: number,
  slotId: string,
  expectedCellId: string,
  summary: string,
  fileId?: string,
  mutationKey?: string,
): Promise<PortfolioSnapshot> {
  const cleanSummary = summary.trim();
  if (cleanSummary.length < 3 || cleanSummary.length > 5000) {
    throw new OperatingInputError('依頼内容は3〜5,000文字で入力してください。');
  }
  if (!mutationKey || !validMutationKey(mutationKey)) {
    throw new OperatingInputError('Idempotency-Keyが正しくありません。');
  }
  if (!cellForSlot(slotId) || !variantAllowed(slotId, expectedCellId)) {
    throw new OperatingInputError('選択したサービスは利用できません。');
  }
  await getOrCreatePortfolio(ownerId, writeFence);
  const db = database();
  const runId = await serviceRunId(ownerId, mutationKey);
  const existing = await db
    .prepare(
      `SELECT slot_id, cell_id, input_summary, file_id
       FROM service_runs WHERE id = ? AND owner_id = ?`,
    )
    .bind(runId, ownerId)
    .first<{ slot_id: string; cell_id: string; input_summary: string; file_id: string | null }>();
  if (existing) {
    if (
      existing.slot_id !== slotId ||
      existing.cell_id !== expectedCellId ||
      existing.input_summary !== cleanSummary ||
      existing.file_id !== (fileId ?? null)
    ) {
      throw new OperatingConflictError('同じIdempotency-Keyに異なる依頼は送信できません。');
    }
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readPortfolio(ownerId);
  }
  if (fileId) {
    const file = await db
      .prepare('SELECT id FROM service_files WHERE id = ? AND owner_id = ?')
      .bind(fileId, ownerId)
      .first<{ id: string }>();
    if (!file) throw new OperatingInputError('添付ファイルを確認できません。');
  }

  await ensureOutboxCapacity(db, ownerId);

  const now = new Date().toISOString();
  const payload = {
    runId,
    slotId,
    cellId: expectedCellId,
    summary: cleanSummary,
    fileId: fileId ?? null,
  };
  const auditId = await deterministicResourceId(ownerId, 'service.run.audit', mutationKey);
  const outboxId = await deterministicResourceId(ownerId, 'service.run.outbox', mutationKey);
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO service_runs
         (id, owner_id, slot_id, cell_id, input_summary, file_id, status, created_at, updated_at)
         SELECT ?, ?, slots.slot_id, slots.cell_id, ?, ?, 'queued', ?, ?
         FROM portfolio_slots AS slots
         WHERE slots.owner_id = ? AND slots.slot_id = ? AND slots.cell_id = ? AND slots.enabled = 1
           AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND (SELECT COUNT(*) FROM service_runs WHERE owner_id = ?) < 500
           AND (SELECT COUNT(*) FROM integration_outbox WHERE owner_id = ? AND status = 'pending') < ?`,
      )
      .bind(
        runId,
        ownerId,
        cleanSummary,
        fileId ?? null,
        now,
        now,
        ownerId,
        slotId,
        expectedCellId,
        ownerId,
        ownerId,
        writeFence,
        ownerId,
        ownerId,
        MAX_PENDING_OUTBOX,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
         SELECT ?, ?, 'service.run_queued', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (SELECT 1 FROM service_runs WHERE id = ? AND owner_id = ?)`,
      )
      .bind(
        auditId,
        ownerId,
        JSON.stringify(payload),
        now,
        ownerId,
        ownerId,
        writeFence,
        runId,
        ownerId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO integration_outbox
         (id, owner_id, topic, payload, status, attempts, created_at, updated_at)
         SELECT ?, ?, 'service.run_requested', ?, 'pending', 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (SELECT 1 FROM service_runs WHERE id = ? AND owner_id = ?)
           AND (SELECT COUNT(*) FROM integration_outbox WHERE owner_id = ? AND status = 'pending') < ?`,
      )
      .bind(
        outboxId,
        ownerId,
        JSON.stringify(payload),
        now,
        now,
        ownerId,
        ownerId,
        writeFence,
        runId,
        ownerId,
        ownerId,
        MAX_PENDING_OUTBOX,
      ),
  ]);
  const stored = await db
    .prepare(
      `SELECT slot_id, cell_id, input_summary, file_id
       FROM service_runs WHERE id = ? AND owner_id = ?`,
    )
    .bind(runId, ownerId)
    .first<{ slot_id: string; cell_id: string; input_summary: string; file_id: string | null }>();
  if (
    !stored ||
    stored.slot_id !== slotId ||
    stored.cell_id !== expectedCellId ||
    stored.input_summary !== cleanSummary ||
    stored.file_id !== (fileId ?? null)
  ) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM service_runs WHERE owner_id = ?')
      .bind(ownerId)
      .first<{ count: number }>();
    if (!stored && Number(count?.count ?? 0) >= 500) {
      throw new OperatingLimitError('サービス受付の上限500件に達しました。データを書き出して整理してください。');
    }
    const currentSlot = await db
      .prepare(
        `SELECT cell_id, enabled FROM portfolio_slots
         WHERE owner_id = ? AND slot_id = ?`,
      )
      .bind(ownerId, slotId)
      .first<{ cell_id: string; enabled: number }>();
    if (!currentSlot?.enabled || currentSlot.cell_id !== expectedCellId) {
      throw new OperatingConflictError(
        'サービス設定が更新されました。画面を更新して再試行してください。',
      );
    }
    await ensureOutboxCapacity(db, ownerId);
    throw new OperatingConflictError('同じIdempotency-Keyに異なる依頼は送信できません。');
  }
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readPortfolio(ownerId);
}

export async function ownerObjectPrefix(ownerId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ownerId));
  const hash = Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `owners/${hash}/`;
}

export async function reserveFileUpload(input: {
  ownerId: string;
  writeFence: number;
  mutationKey: string;
  filename: string;
  contentType: string;
  byteSize: number;
  contentSha256: string;
}): Promise<{
  id: string;
  objectKey: string;
  filename: string;
  byteSize: number;
  complete: boolean;
}> {
  if (!validMutationKey(input.mutationKey)) {
    throw new OperatingInputError('Idempotency-Keyが正しくありません。');
  }
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, input.ownerId, input.writeFence);
  const id = await deterministicResourceId(
    input.ownerId,
    `file.upload:${input.writeFence}`,
    input.mutationKey,
  );
  const objectKey = `${await ownerObjectPrefix(input.ownerId)}generations/${input.writeFence}/${id}/${input.filename}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO file_upload_reservations
       (id, owner_id, object_key, filename, content_type, byte_size, content_sha256, status, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
       WHERE
         (SELECT COUNT(*) FROM service_files WHERE owner_id = ?) +
         (SELECT COUNT(*) FROM file_upload_reservations WHERE owner_id = ? AND status = 'pending') < 100
       AND
         (SELECT COALESCE(SUM(byte_size), 0) FROM service_files WHERE owner_id = ?) +
         (SELECT COALESCE(SUM(byte_size), 0) FROM file_upload_reservations WHERE owner_id = ? AND status = 'pending') + ? <= ?
       AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
       AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)`,
    )
    .bind(
      id,
      input.ownerId,
      objectKey,
      input.filename,
      input.contentType,
      input.byteSize,
      input.contentSha256,
      now,
      now,
      input.ownerId,
      input.ownerId,
      input.ownerId,
      input.ownerId,
      input.byteSize,
      250 * 1024 * 1024,
      input.ownerId,
      input.ownerId,
      input.writeFence,
    )
    .run();
  const reservation = await db
    .prepare(
      `SELECT object_key, filename, content_type, byte_size, content_sha256, status
       FROM file_upload_reservations WHERE id = ? AND owner_id = ?`,
    )
    .bind(id, input.ownerId)
    .first<{
      object_key: string;
      filename: string;
      content_type: string;
      byte_size: number;
      content_sha256: string;
      status: string;
    }>();
  if (!reservation) {
    await throwIfWriteBlocked(db, input.ownerId, input.writeFence);
    throw new OperatingLimitError('添付は1人100件・合計250MBまでです。不要なデータを整理してください。');
  }
  await throwIfWriteBlocked(db, input.ownerId, input.writeFence);
  if (
    reservation.object_key !== objectKey ||
    reservation.filename !== input.filename ||
    reservation.content_type !== input.contentType ||
    reservation.byte_size !== input.byteSize ||
    reservation.content_sha256 !== input.contentSha256
  ) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なる添付は送信できません。');
  }
  return {
    id,
    objectKey,
    filename: reservation.filename,
    byteSize: reservation.byte_size,
    complete: reservation.status === 'complete',
  };
}

export async function completeFileUpload(
  ownerId: string,
  writeFence: number,
  fileId: string,
): Promise<boolean> {
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const reservation = await db
    .prepare(
      `SELECT object_key, filename, content_type, byte_size, status
       FROM file_upload_reservations WHERE id = ? AND owner_id = ?`,
    )
    .bind(fileId, ownerId)
    .first<{
      object_key: string;
      filename: string;
      content_type: string;
      byte_size: number;
      status: string;
    }>();
  if (!reservation) return false;
  if (reservation.status === 'complete') return true;
  const now = new Date().toISOString();
  const auditId = await deterministicResourceId(ownerId, 'file.upload.audit', fileId);
  const payload = {
    fileId,
    filename: reservation.filename,
    byteSize: reservation.byte_size,
  };
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO service_files
         (id, owner_id, object_key, filename, content_type, byte_size, created_at)
         SELECT id, owner_id, object_key, filename, content_type, byte_size, ?
         FROM file_upload_reservations
         WHERE id = ? AND owner_id = ? AND status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)`,
      )
      .bind(now, fileId, ownerId, ownerId, ownerId, writeFence),
    db
      .prepare(
        `UPDATE file_upload_reservations SET status = 'complete', updated_at = ?
         WHERE id = ? AND owner_id = ? AND status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)`,
      )
      .bind(now, fileId, ownerId, ownerId, ownerId, writeFence),
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
         SELECT ?, ?, 'file.uploaded', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (SELECT 1 FROM service_files WHERE id = ? AND owner_id = ?)`,
      )
      .bind(
        auditId,
        ownerId,
        JSON.stringify(payload),
        now,
        ownerId,
        ownerId,
        writeFence,
        fileId,
        ownerId,
      ),
  ]);
  const completed = await db
    .prepare(
      `SELECT 1 AS complete FROM file_upload_reservations
       WHERE id = ? AND owner_id = ? AND status = 'complete'`,
    )
    .bind(fileId, ownerId)
    .first<{ complete: number }>();
  if (!completed) return false;
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return true;
}
