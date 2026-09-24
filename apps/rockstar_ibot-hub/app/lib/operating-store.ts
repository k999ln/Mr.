import { env } from 'cloudflare:workers';
import { taskDomains, type TaskDomain } from './operating-catalog';

export type LifeTask = {
  id: string;
  domain: TaskDomain;
  title: string;
  completed: boolean;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyCheckin = {
  day: string;
  bodyScore: number;
  mindScore: number;
  energyScore: number;
  note: string;
  updatedAt: string;
};

export type MoneyEntry = {
  id: string;
  direction: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  category: string;
  note: string;
  occurredAt: string;
  createdAt: string;
};

export type MoneyTotal = {
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
};

export type AuditEvent = {
  id: string;
  action: string;
  createdAt: string;
};

export type OperatingSnapshot = {
  tasks: LifeTask[];
  openTaskCount: number;
  openWorkTaskCount: number;
  checkin: DailyCheckin | null;
  moneyEntries: MoneyEntry[];
  moneyTotals: MoneyTotal[];
  auditEvents: AuditEvent[];
};

export class OperatingInputError extends Error {}
export class OperatingConflictError extends Error {}
export class OperatingLimitError extends Error {}
export class OperatingLockedError extends Error {}

const SUPPORTED_CURRENCIES = new Set(['JPY', 'USD', 'EUR', 'GBP']);
const MAX_MONEY_AMOUNT_MINOR = 1_000_000_000_000;
const DAY_MS = 86_400_000;
const MIN_LEDGER_DAY = Date.UTC(1900, 0, 1);
const MAX_TASK_DAY = Date.UTC(2100, 11, 31);

function calendarDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function validObservedDay(value: string): boolean {
  const timestamp = calendarDay(value);
  const todayUtc = new Date();
  const today = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());
  return timestamp !== null && timestamp >= MIN_LEDGER_DAY && timestamp <= today + 2 * DAY_MS;
}

function validTaskDay(value: string): boolean {
  const timestamp = calendarDay(value);
  return timestamp !== null && timestamp >= Date.UTC(2000, 0, 1) && timestamp <= MAX_TASK_DAY;
}

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

let schemaReady: Promise<void> | undefined;

function database(): D1Database {
  if (!env.DB) throw new Error('avocadominiのデータベースに接続できません。');
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
      db.prepare(`CREATE TABLE IF NOT EXISTS life_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        due_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_life_tasks_owner_status_created ON life_tasks(owner_id, status, created_at)',
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS daily_checkins (
        owner_id TEXT NOT NULL,
        day TEXT NOT NULL,
        body_score INTEGER NOT NULL,
        mind_score INTEGER NOT NULL,
        energy_score INTEGER NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_checkins_owner_day ON daily_checkins(owner_id, day)',
      ),
      db.prepare(`CREATE TABLE IF NOT EXISTS money_entries (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        category TEXT NOT NULL,
        note TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_money_entries_owner_occurred ON money_entries(owner_id, occurred_at)',
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
    ])
    .then(async () => ensureReceiptClaimColumn(db))
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  return schemaReady;
}

export async function ensureOperatingStoreSchema(): Promise<void> {
  await ensureSchema();
}

type OperatingMutationIdentity = {
  receiptId: string;
  auditId: string;
  claimToken: string;
  operation: string;
  payloadJson: string;
  replay: boolean;
};

async function operatingMutationIdentity(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  operation: string,
  mutationKey: string,
  payload: unknown,
): Promise<OperatingMutationIdentity> {
  const receiptId = await deterministicResourceId(
    ownerId,
    `${operation}.receipt:${writeFence}`,
    mutationKey,
  );
  const auditId = await deterministicResourceId(ownerId, `${operation}.audit`, mutationKey);
  const payloadJson = JSON.stringify(payload);
  const existing = await db
    .prepare(
      `SELECT operation, payload FROM portfolio_mutation_receipts
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(receiptId, ownerId)
    .first<{ operation: string; payload: string }>();
  if (existing && (existing.operation !== operation || existing.payload !== payloadJson)) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なる内容は送信できません。');
  }
  return {
    receiptId,
    auditId,
    claimToken: crypto.randomUUID(),
    operation,
    payloadJson,
    replay: Boolean(existing),
  };
}

async function storedOperatingReceipt(
  db: D1Database,
  ownerId: string,
  identity: OperatingMutationIdentity,
): Promise<boolean> {
  const receipt = await db
    .prepare(
      `SELECT operation, payload FROM portfolio_mutation_receipts
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(identity.receiptId, ownerId)
    .first<{ operation: string; payload: string }>();
  if (!receipt) return false;
  if (receipt.operation !== identity.operation || receipt.payload !== identity.payloadJson) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なる内容は送信できません。');
  }
  return true;
}

function auditAfterChangedStatement(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  action: string,
  payload: unknown,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (id, owner_id, action, payload, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE changes() > 0
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (
           SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?
         )`,
    )
    .bind(
      crypto.randomUUID(),
      ownerId,
      action,
      JSON.stringify(payload),
      now,
      ownerId,
      ownerId,
      writeFence,
    );
}

async function ownerIsLocked(db: D1Database, ownerId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS locked FROM owner_data_locks WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ locked: number }>();
  return Boolean(row);
}

async function throwIfWriteBlocked(
  db: D1Database,
  ownerId: string,
  writeFence: number,
): Promise<void> {
  if (await ownerIsLocked(db, ownerId)) {
    throw new OperatingLockedError('データ削除中のため操作を完了できません。');
  }
  const row = await db
    .prepare('SELECT generation FROM owner_write_fences WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ generation: number }>();
  if (!row || row.generation !== writeFence) {
    throw new OperatingLockedError('データ状態が更新されたため、画面を更新して再試行してください。');
  }
}

function validDomain(value: string): value is TaskDomain {
  return taskDomains.some((domain) => domain === value);
}

async function readSnapshot(ownerId: string): Promise<OperatingSnapshot> {
  await ensureSchema();
  const db = database();
  const [taskResult, taskCounts, checkin, moneyResult, totalResult, auditResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, domain, title, status, due_at, created_at, updated_at
         FROM life_tasks WHERE owner_id = ?
         ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 60`,
      )
      .bind(ownerId)
      .all<{
        id: string;
        domain: string;
        title: string;
        status: string;
        due_at: string | null;
        created_at: string;
        updated_at: string;
      }>(),
    db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
          SUM(CASE WHEN status = 'open' AND domain = 'work' THEN 1 ELSE 0 END) AS open_work_count
         FROM life_tasks WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first<{ open_count: number | null; open_work_count: number | null }>(),
    db
      .prepare(
        `SELECT day, body_score, mind_score, energy_score, note, updated_at
         FROM daily_checkins WHERE owner_id = ? ORDER BY day DESC LIMIT 1`,
      )
      .bind(ownerId)
      .first<{
        day: string;
        body_score: number;
        mind_score: number;
        energy_score: number;
        note: string;
        updated_at: string;
      }>(),
    db
      .prepare(
        `SELECT id, direction, amount_minor, currency, category, note, occurred_at, created_at
         FROM money_entries WHERE owner_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 40`,
      )
      .bind(ownerId)
      .all<{
        id: string;
        direction: string;
        amount_minor: number;
        currency: string;
        category: string;
        note: string;
        occurred_at: string;
        created_at: string;
      }>(),
    db
      .prepare(
        `SELECT currency,
          SUM(CASE WHEN direction = 'income' THEN amount_minor ELSE 0 END) AS income_minor,
          SUM(CASE WHEN direction = 'expense' THEN amount_minor ELSE 0 END) AS expense_minor
         FROM money_entries WHERE owner_id = ? GROUP BY currency ORDER BY currency`,
      )
      .bind(ownerId)
      .all<{ currency: string; income_minor: number | null; expense_minor: number | null }>(),
    db
      .prepare(
        'SELECT id, action, created_at FROM audit_events WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20',
      )
      .bind(ownerId)
      .all<{ id: string; action: string; created_at: string }>(),
  ]);

  return {
    tasks: taskResult.results.flatMap((row) =>
      validDomain(row.domain)
        ? [{
            id: row.id,
            domain: row.domain,
            title: row.title,
            completed: row.status === 'done',
            dueAt: row.due_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }]
        : [],
    ),
    openTaskCount: Number(taskCounts?.open_count ?? 0),
    openWorkTaskCount: Number(taskCounts?.open_work_count ?? 0),
    checkin: checkin
      ? {
          day: checkin.day,
          bodyScore: checkin.body_score,
          mindScore: checkin.mind_score,
          energyScore: checkin.energy_score,
          note: checkin.note,
          updatedAt: checkin.updated_at,
        }
      : null,
    moneyEntries: moneyResult.results.flatMap((row) =>
      row.direction === 'income' || row.direction === 'expense'
        ? [{
            id: row.id,
            direction: row.direction,
            amountMinor: row.amount_minor,
            currency: row.currency,
            category: row.category,
            note: row.note,
            occurredAt: row.occurred_at,
            createdAt: row.created_at,
          }]
        : [],
    ),
    moneyTotals: totalResult.results.map((row) => {
      const incomeMinor = Number(row.income_minor ?? 0);
      const expenseMinor = Number(row.expense_minor ?? 0);
      return {
        currency: row.currency,
        incomeMinor,
        expenseMinor,
        netMinor: incomeMinor - expenseMinor,
      };
    }),
    auditEvents: auditResult.results.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.created_at,
    })),
  };
}

export async function getOperatingSnapshot(ownerId: string): Promise<OperatingSnapshot> {
  return readSnapshot(ownerId);
}

export async function createTask(
  ownerId: string,
  writeFence: number,
  domain: string,
  title: string,
  dueAt?: string,
  mutationKey?: string,
): Promise<OperatingSnapshot> {
  if (!validDomain(domain)) throw new OperatingInputError('タスクの領域が正しくありません。');
  const cleanTitle = title.trim();
  if (cleanTitle.length < 2 || cleanTitle.length > 240) {
    throw new OperatingInputError('タスクは2〜240文字で入力してください。');
  }
  const cleanDueAt = dueAt?.trim() || null;
  if (cleanDueAt && !validTaskDay(cleanDueAt)) {
    throw new OperatingInputError('期限が正しくありません。');
  }
  if (!mutationKey || !validMutationKey(mutationKey)) {
    throw new OperatingInputError('Idempotency-Keyが正しくありません。');
  }
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const now = new Date().toISOString();
  const id = await deterministicResourceId(ownerId, 'task.create', mutationKey);
  const payload = { id, domain, title: cleanTitle, dueAt: cleanDueAt };
  const identity = await operatingMutationIdentity(
    db,
    ownerId,
    writeFence,
    'task.create',
    mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readSnapshot(ownerId);
  }
  const existing = await db
    .prepare('SELECT domain, title, due_at FROM life_tasks WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .first<{ domain: string; title: string; due_at: string | null }>();
  if (existing) {
    if (existing.domain !== domain || existing.title !== cleanTitle || existing.due_at !== cleanDueAt) {
      throw new OperatingConflictError('同じIdempotency-Keyに異なる内容は送信できません。');
    }
  }
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO portfolio_mutation_receipts
         (id, owner_id, operation, payload, claim_token, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND ((SELECT COUNT(*) FROM life_tasks WHERE owner_id = ?) < 500
             OR EXISTS (SELECT 1 FROM life_tasks WHERE id = ? AND owner_id = ?))`,
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
        id,
        ownerId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO life_tasks
         (id, owner_id, domain, title, status, due_at, created_at, updated_at)
         SELECT ?, ?, ?, ?, 'open', ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND (SELECT COUNT(*) FROM life_tasks WHERE owner_id = ?) < 500
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        id,
        ownerId,
        domain,
        cleanTitle,
        cleanDueAt,
        now,
        now,
        ownerId,
        ownerId,
        writeFence,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
         SELECT ?, ?, 'task.created', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (SELECT 1 FROM life_tasks WHERE id = ? AND owner_id = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        identity.auditId,
        ownerId,
        identity.payloadJson,
        now,
        ownerId,
        ownerId,
        writeFence,
        id,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
  ]);
  if (!(await storedOperatingReceipt(db, ownerId, identity))) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM life_tasks WHERE owner_id = ?')
      .bind(ownerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= 500) {
      throw new OperatingLimitError('タスク上限500件に達しました。完了済みを削除してください。');
    }
    throw new OperatingConflictError('同じIdempotency-Keyに異なる内容は送信できません。');
  }
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}

export async function setTaskCompleted(
  ownerId: string,
  writeFence: number,
  taskId: string,
  completed: boolean,
): Promise<OperatingSnapshot> {
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const existing = await db
    .prepare('SELECT id FROM life_tasks WHERE id = ? AND owner_id = ?')
    .bind(taskId, ownerId)
    .first<{ id: string }>();
  if (!existing) throw new OperatingInputError('タスクが見つかりません。');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE life_tasks SET status = ?, updated_at = ? WHERE id = ? AND owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)`,
      )
      .bind(completed ? 'done' : 'open', now, taskId, ownerId, ownerId, ownerId, writeFence),
    auditAfterChangedStatement(
      db,
      ownerId,
      writeFence,
      'task.status_changed',
      { taskId, completed },
      now,
    ),
  ]);
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}

export async function deleteTask(
  ownerId: string,
  writeFence: number,
  taskId: string,
): Promise<OperatingSnapshot> {
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const existing = await db
    .prepare('SELECT id FROM life_tasks WHERE id = ? AND owner_id = ?')
    .bind(taskId, ownerId)
    .first<{ id: string }>();
  if (!existing) throw new OperatingInputError('タスクが見つかりません。');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `DELETE FROM life_tasks WHERE id = ? AND owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)`,
      )
      .bind(taskId, ownerId, ownerId, ownerId, writeFence),
    auditAfterChangedStatement(db, ownerId, writeFence, 'task.deleted', { taskId }, now),
  ]);
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}

export async function saveDailyCheckin(
  ownerId: string,
  writeFence: number,
  input: {
    day: string;
    bodyScore: number;
    mindScore: number;
    energyScore: number;
    note: string;
    timezoneOffsetMinutes: number;
  },
): Promise<OperatingSnapshot> {
  if (
    !Number.isInteger(input.timezoneOffsetMinutes) ||
    input.timezoneOffsetMinutes < -14 * 60 ||
    input.timezoneOffsetMinutes > 14 * 60
  ) {
    throw new OperatingInputError('タイムゾーンが正しくありません。');
  }
  const localToday = new Date(Date.now() - input.timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
  if (input.day !== localToday) {
    throw new OperatingInputError('チェックインは現在の日付だけ保存できます。画面を更新してください。');
  }
  for (const score of [input.bodyScore, input.mindScore, input.energyScore]) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new OperatingInputError('スコアは1〜5で入力してください。');
    }
  }
  const note = input.note.trim();
  if (note.length > 500) throw new OperatingInputError('メモは500文字以下にしてください。');
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO daily_checkins
         (owner_id, day, body_score, mind_score, energy_score, note, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND ((SELECT COUNT(*) FROM daily_checkins WHERE owner_id = ?) < 2000
             OR EXISTS (SELECT 1 FROM daily_checkins WHERE owner_id = ? AND day = ?))
         ON CONFLICT(owner_id, day) DO UPDATE SET
           body_score = excluded.body_score,
           mind_score = excluded.mind_score,
           energy_score = excluded.energy_score,
           note = excluded.note,
           updated_at = excluded.updated_at
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = excluded.owner_id)
           AND EXISTS (
             SELECT 1 FROM owner_write_fences
             WHERE owner_id = excluded.owner_id AND generation = ?
           )`,
      )
      .bind(
        ownerId,
        input.day,
        input.bodyScore,
        input.mindScore,
        input.energyScore,
        note,
        now,
        now,
        ownerId,
        ownerId,
        writeFence,
        ownerId,
        ownerId,
        input.day,
        writeFence,
      ),
    auditAfterChangedStatement(db, ownerId, writeFence, 'checkin.saved', { day: input.day }, now),
  ]);
  const saved = await db
    .prepare(
      `SELECT body_score, mind_score, energy_score, note FROM daily_checkins
       WHERE owner_id = ? AND day = ?`,
    )
    .bind(ownerId, input.day)
    .first<{ body_score: number; mind_score: number; energy_score: number; note: string }>();
  if (
    !saved ||
    saved.body_score !== input.bodyScore ||
    saved.mind_score !== input.mindScore ||
    saved.energy_score !== input.energyScore ||
    saved.note !== note
  ) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM daily_checkins WHERE owner_id = ?')
      .bind(ownerId)
      .first<{ count: number }>();
    if (!saved && Number(count?.count ?? 0) >= 2000) {
      throw new OperatingLimitError('チェックイン上限2,000日分に達しました。データを書き出して整理してください。');
    }
    throw new OperatingConflictError('チェックインを保存できませんでした。もう一度お試しください。');
  }
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}

export async function createMoneyEntry(
  ownerId: string,
  writeFence: number,
  input: {
    direction: string;
    amountMinor: number;
    currency: string;
    category: string;
    note: string;
    occurredAt: string;
    mutationKey?: string;
  },
): Promise<OperatingSnapshot> {
  if (input.direction !== 'income' && input.direction !== 'expense') {
    throw new OperatingInputError('収入または支出を選んでください。');
  }
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    input.amountMinor > MAX_MONEY_AMOUNT_MINOR
  ) {
    throw new OperatingInputError('金額を正しく入力してください。');
  }
  const currency = input.currency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new OperatingInputError('この通貨にはまだ対応していません。');
  }
  const category = input.category.trim();
  const note = input.note.trim();
  if (category.length < 1 || category.length > 80 || note.length > 240) {
    throw new OperatingInputError('分類またはメモが長すぎます。');
  }
  if (!validObservedDay(input.occurredAt)) throw new OperatingInputError('日付が正しくありません。');
  if (!input.mutationKey || !validMutationKey(input.mutationKey)) {
    throw new OperatingInputError('Idempotency-Keyが正しくありません。');
  }
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const now = new Date().toISOString();
  const id = await deterministicResourceId(ownerId, 'money.create', input.mutationKey);
  const payload = {
    id,
    direction: input.direction,
    amountMinor: input.amountMinor,
    currency,
    category,
    note,
    occurredAt: input.occurredAt,
  };
  const identity = await operatingMutationIdentity(
    db,
    ownerId,
    writeFence,
    'money.create',
    input.mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readSnapshot(ownerId);
  }
  const existing = await db
    .prepare(
      `SELECT direction, amount_minor, currency, category, note, occurred_at
       FROM money_entries WHERE id = ? AND owner_id = ?`,
    )
    .bind(id, ownerId)
    .first<{
      direction: string;
      amount_minor: number;
      currency: string;
      category: string;
      note: string;
      occurred_at: string;
    }>();
  if (existing) {
    if (
      existing.direction !== input.direction ||
      existing.amount_minor !== input.amountMinor ||
      existing.currency !== currency ||
      existing.category !== category ||
      existing.note !== note ||
      existing.occurred_at !== input.occurredAt
    ) {
      throw new OperatingConflictError('同じIdempotency-Keyに異なる内容は送信できません。');
    }
  }
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO portfolio_mutation_receipts
         (id, owner_id, operation, payload, claim_token, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND ((SELECT COUNT(*) FROM money_entries WHERE owner_id = ?) < 2000
             OR EXISTS (SELECT 1 FROM money_entries WHERE id = ? AND owner_id = ?))`,
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
        id,
        ownerId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO money_entries
         (id, owner_id, direction, amount_minor, currency, category, note, occurred_at, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND (SELECT COUNT(*) FROM money_entries WHERE owner_id = ?) < 2000
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        id,
        ownerId,
        input.direction,
        input.amountMinor,
        currency,
        category,
        note,
        input.occurredAt,
        now,
        ownerId,
        ownerId,
        writeFence,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
         SELECT ?, ?, 'money.entry_created', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (SELECT 1 FROM money_entries WHERE id = ? AND owner_id = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        identity.auditId,
        ownerId,
        identity.payloadJson,
        now,
        ownerId,
        ownerId,
        writeFence,
        id,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
  ]);
  if (!(await storedOperatingReceipt(db, ownerId, identity))) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM money_entries WHERE owner_id = ?')
      .bind(ownerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= 2000) {
      throw new OperatingLimitError('収支記録の上限2,000件に達しました。データを書き出して整理してください。');
    }
    throw new OperatingConflictError('同じIdempotency-Keyに異なる内容は送信できません。');
  }
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}

export async function deleteMoneyEntry(
  ownerId: string,
  writeFence: number,
  entryId: string,
): Promise<OperatingSnapshot> {
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const existing = await db
    .prepare('SELECT id FROM money_entries WHERE id = ? AND owner_id = ?')
    .bind(entryId, ownerId)
    .first<{ id: string }>();
  if (!existing) throw new OperatingInputError('収支記録が見つかりません。');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `DELETE FROM money_entries WHERE id = ? AND owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
         AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)`,
      )
      .bind(entryId, ownerId, ownerId, ownerId, writeFence),
    auditAfterChangedStatement(db, ownerId, writeFence, 'money.entry_deleted', { entryId }, now),
  ]);
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}
