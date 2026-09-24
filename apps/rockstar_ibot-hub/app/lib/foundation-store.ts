import { env } from 'cloudflare:workers';
import {
  FOUNDATION_POLICY,
  isFoundationRequestKind,
  validateFoundationRequest,
  type FoundationRequestKind,
} from './foundation-policy';
import {
  ensureOperatingStoreSchema,
  OperatingConflictError,
  OperatingInputError,
  OperatingLimitError,
  OperatingLockedError,
} from './operating-store';
import { ensurePortfolioStoreSchema } from './portfolio-store';

export type FoundationAllocationAccount = {
  status: 'not_enrolled' | 'applicant' | 'active' | 'suspended';
  policyVersion: string;
  grantedUnits: number;
  reservedUnits: number;
  consumedUnits: number;
  availableUnits: number;
  updatedAt: string | null;
};

export type FoundationAllocationRequest = {
  id: string;
  kind: FoundationRequestKind;
  category: string;
  requestedUnits: number;
  purposeSummary: string;
  status: string;
  policyVersion: string;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FoundationAllocationLedgerEntry = {
  id: string;
  requestId: string | null;
  entryType: string;
  units: number;
  balanceAfter: number;
  actorType: string;
  policyVersion: string;
  createdAt: string;
};

export type FoundationSnapshot = {
  policy: typeof FOUNDATION_POLICY;
  account: FoundationAllocationAccount;
  requests: FoundationAllocationRequest[];
  requestCount: number;
  activeRequestCount: number;
  ledger: FoundationAllocationLedgerEntry[];
  supply: {
    intakeOpen: true;
    globalCapacityPublished: false;
    issuanceAuthority: 'foundation_steward_only';
    essentialsProcurement: 'vendor_direct_after_human_review';
  };
};

const MAX_PENDING_OUTBOX = 2_000;
const ACTIVE_REQUEST_STATUSES = [
  'requested',
  'needs_information',
  'under_review',
  'approved',
  'allocated',
] as const;
const CANCELLABLE_REQUEST_STATUSES = new Set(['requested', 'needs_information']);

let schemaReady: Promise<void> | undefined;

function database(): D1Database {
  if (!env.DB) throw new Error('財団配給用データベースに接続できません。');
  return env.DB;
}

function validMutationKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

async function deterministicId(
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

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = Promise.all([ensureOperatingStoreSchema(), ensurePortfolioStoreSchema()])
    .then(async () => {
      const db = database();
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS foundation_allocation_accounts (
          owner_id TEXT PRIMARY KEY NOT NULL,
          policy_version TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('applicant', 'active', 'suspended')),
          granted_units INTEGER NOT NULL DEFAULT 0 CHECK (granted_units >= 0),
          reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
          consumed_units INTEGER NOT NULL DEFAULT 0 CHECK (consumed_units >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (reserved_units + consumed_units <= granted_units)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS foundation_allocation_requests (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('service_access', 'ai_capacity', 'essentials_support')),
          category TEXT NOT NULL,
          requested_units INTEGER NOT NULL CHECK (requested_units >= 0),
          purpose_summary TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN (
            'requested', 'needs_information', 'under_review', 'approved',
            'allocated', 'fulfilled', 'declined', 'cancelled'
          )),
          policy_version TEXT NOT NULL,
          consent_at TEXT NOT NULL,
          reviewed_by TEXT,
          decision_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (
            (kind = 'essentials_support' AND requested_units = 0)
            OR (kind <> 'essentials_support' AND requested_units BETWEEN 1 AND 20)
          )
        )`),
        db.prepare(
          `CREATE INDEX IF NOT EXISTS idx_foundation_requests_owner_created
           ON foundation_allocation_requests(owner_id, created_at)`,
        ),
        db.prepare(
          `CREATE INDEX IF NOT EXISTS idx_foundation_requests_kind_status_created
           ON foundation_allocation_requests(kind, status, created_at)`,
        ),
        db.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS uq_foundation_requests_owner_kind_active
           ON foundation_allocation_requests(owner_id, kind)
           WHERE status IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated')`,
        ),
        db.prepare(`CREATE TABLE IF NOT EXISTS foundation_allocation_ledger (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          request_id TEXT,
          entry_type TEXT NOT NULL CHECK (entry_type IN (
            'grant', 'reserve', 'consume', 'release', 'expire', 'adjustment'
          )),
          units INTEGER NOT NULL CHECK (units >= 0),
          balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
          actor_type TEXT NOT NULL CHECK (actor_type IN ('foundation_steward', 'system')),
          actor_ref TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`),
        db.prepare(
          `CREATE INDEX IF NOT EXISTS idx_foundation_ledger_owner_created
           ON foundation_allocation_ledger(owner_id, created_at)`,
        ),
      ]);
    })
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  return schemaReady;
}

export async function ensureFoundationStoreSchema(): Promise<void> {
  await ensureSchema();
}

async function throwIfWriteBlocked(
  db: D1Database,
  ownerId: string,
  writeFence: number,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT fences.generation, locks.state AS lock_state
       FROM owner_write_fences AS fences
       LEFT JOIN owner_data_locks AS locks ON locks.owner_id = fences.owner_id
       WHERE fences.owner_id = ?`,
    )
    .bind(ownerId)
    .first<{ generation: number; lock_state: string | null }>();
  if (row?.lock_state) throw new OperatingLockedError('データ削除中のため操作を完了できません。');
  if (!row || row.generation !== writeFence) {
    throw new OperatingLockedError('データ状態が更新されたため、画面を更新して再試行してください。');
  }
}

type FoundationMutationIdentity = {
  receiptId: string;
  auditId: string;
  outboxId: string;
  claimToken: string;
  operation: string;
  payloadJson: string;
  replay: boolean;
};

async function mutationIdentity(
  db: D1Database,
  ownerId: string,
  writeFence: number,
  operation: string,
  mutationKey: string,
  payload: unknown,
): Promise<FoundationMutationIdentity> {
  if (!validMutationKey(mutationKey)) {
    throw new OperatingInputError('Idempotency-Keyが正しくありません。');
  }
  const scope = `${operation}:${writeFence}`;
  const receiptId = await deterministicId(ownerId, `${scope}.receipt`, mutationKey);
  const payloadJson = JSON.stringify(payload);
  const existing = await db
    .prepare(
      `SELECT operation, payload FROM portfolio_mutation_receipts
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(receiptId, ownerId)
    .first<{ operation: string; payload: string }>();
  if (existing && (existing.operation !== operation || existing.payload !== payloadJson)) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なる配給申請は送信できません。');
  }
  return {
    receiptId,
    auditId: await deterministicId(ownerId, `${scope}.audit`, mutationKey),
    outboxId: await deterministicId(ownerId, `${scope}.outbox`, mutationKey),
    claimToken: crypto.randomUUID(),
    operation,
    payloadJson,
    replay: Boolean(existing),
  };
}

async function storedReceipt(
  db: D1Database,
  ownerId: string,
  identity: FoundationMutationIdentity,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT operation, payload FROM portfolio_mutation_receipts
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(identity.receiptId, ownerId)
    .first<{ operation: string; payload: string }>();
  if (!row) return false;
  if (row.operation !== identity.operation || row.payload !== identity.payloadJson) {
    throw new OperatingConflictError('同じIdempotency-Keyに異なる配給申請は送信できません。');
  }
  return true;
}

async function readSnapshot(ownerId: string): Promise<FoundationSnapshot> {
  await ensureSchema();
  const db = database();
  const [account, requestResult, requestCounts, ledgerResult] = await Promise.all([
    db
      .prepare(
        `SELECT policy_version, status, granted_units, reserved_units, consumed_units, updated_at
         FROM foundation_allocation_accounts WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first<{
        policy_version: string;
        status: 'applicant' | 'active' | 'suspended';
        granted_units: number;
        reserved_units: number;
        consumed_units: number;
        updated_at: string;
      }>(),
    db
      .prepare(
        `SELECT id, kind, category, requested_units, purpose_summary, status,
                policy_version, decision_reason, created_at, updated_at
         FROM foundation_allocation_requests
         WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20`,
      )
      .bind(ownerId)
      .all<{
        id: string;
        kind: string;
        category: string;
        requested_units: number;
        purpose_summary: string;
        status: string;
        policy_version: string;
        decision_reason: string | null;
        created_at: string;
        updated_at: string;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS request_count,
          SUM(CASE WHEN status IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated')
            THEN 1 ELSE 0 END) AS active_count
         FROM foundation_allocation_requests WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first<{ request_count: number; active_count: number | null }>(),
    db
      .prepare(
        `SELECT id, request_id, entry_type, units, balance_after, actor_type,
                policy_version, created_at
         FROM foundation_allocation_ledger
         WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20`,
      )
      .bind(ownerId)
      .all<{
        id: string;
        request_id: string | null;
        entry_type: string;
        units: number;
        balance_after: number;
        actor_type: string;
        policy_version: string;
        created_at: string;
      }>(),
  ]);

  const grantedUnits = Number(account?.granted_units ?? 0);
  const reservedUnits = Number(account?.reserved_units ?? 0);
  const consumedUnits = Number(account?.consumed_units ?? 0);
  return {
    policy: FOUNDATION_POLICY,
    account: {
      status: account?.status ?? 'not_enrolled',
      policyVersion: account?.policy_version ?? FOUNDATION_POLICY.version,
      grantedUnits,
      reservedUnits,
      consumedUnits,
      availableUnits: Math.max(0, grantedUnits - reservedUnits - consumedUnits),
      updatedAt: account?.updated_at ?? null,
    },
    requests: requestResult.results.flatMap((row) =>
      isFoundationRequestKind(row.kind)
        ? [{
            id: row.id,
            kind: row.kind,
            category: row.category,
            requestedUnits: row.requested_units,
            purposeSummary: row.purpose_summary,
            status: row.status,
            policyVersion: row.policy_version,
            decisionReason: row.decision_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }]
        : [],
    ),
    requestCount: Number(requestCounts?.request_count ?? 0),
    activeRequestCount: Number(requestCounts?.active_count ?? 0),
    ledger: ledgerResult.results.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      entryType: row.entry_type,
      units: row.units,
      balanceAfter: row.balance_after,
      actorType: row.actor_type,
      policyVersion: row.policy_version,
      createdAt: row.created_at,
    })),
    supply: {
      intakeOpen: true,
      globalCapacityPublished: false,
      issuanceAuthority: 'foundation_steward_only',
      essentialsProcurement: 'vendor_direct_after_human_review',
    },
  };
}

export async function getFoundationSnapshot(ownerId: string): Promise<FoundationSnapshot> {
  return readSnapshot(ownerId);
}

export async function createFoundationRequest(
  ownerId: string,
  writeFence: number,
  input: {
    kind: string;
    category: string;
    requestedUnits: number;
    purposeSummary: string;
    attested: boolean;
  },
  mutationKey: string,
): Promise<FoundationSnapshot> {
  const validation = validateFoundationRequest(input);
  if (!validation.ok) throw new OperatingInputError(validation.error);
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);

  const now = new Date().toISOString();
  const requestId = await deterministicId(
    ownerId,
    `foundation.request:${writeFence}`,
    mutationKey,
  );
  const payload = {
    requestId,
    ...validation.value,
    policyVersion: FOUNDATION_POLICY.version,
  };
  const identity = await mutationIdentity(
    db,
    ownerId,
    writeFence,
    'foundation.request_created',
    mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readSnapshot(ownerId);
  }

  const activePlaceholders = ACTIVE_REQUEST_STATUSES.map(() => '?').join(', ');
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO portfolio_mutation_receipts
         (id, owner_id, operation, payload, claim_token, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND (SELECT COUNT(*) FROM foundation_allocation_requests WHERE owner_id = ?) < ?
           AND (SELECT COUNT(*) FROM integration_outbox WHERE owner_id = ? AND status = 'pending') < ?
           AND NOT EXISTS (
             SELECT 1 FROM foundation_allocation_requests
             WHERE owner_id = ? AND kind = ? AND status IN (${activePlaceholders})
           )`,
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
        FOUNDATION_POLICY.maxRequestsPerOwner,
        ownerId,
        MAX_PENDING_OUTBOX,
        ownerId,
        validation.value.kind,
        ...ACTIVE_REQUEST_STATUSES,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO foundation_allocation_accounts
         (owner_id, policy_version, status, granted_units, reserved_units, consumed_units, created_at, updated_at)
         SELECT ?, ?, 'applicant', 0, 0, 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        ownerId,
        FOUNDATION_POLICY.version,
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
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO foundation_allocation_requests
         (id, owner_id, kind, category, requested_units, purpose_summary, status,
          policy_version, consent_at, reviewed_by, decision_reason, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, 'requested', ?, ?, NULL, NULL, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        requestId,
        ownerId,
        validation.value.kind,
        validation.value.category,
        validation.value.requestedUnits,
        validation.value.purposeSummary,
        FOUNDATION_POLICY.version,
        now,
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
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
         SELECT ?, ?, 'foundation.request_created', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (SELECT 1 FROM foundation_allocation_requests WHERE id = ? AND owner_id = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        identity.auditId,
        ownerId,
        JSON.stringify({
          requestId,
          kind: validation.value.kind,
          category: validation.value.category,
          requestedUnits: validation.value.requestedUnits,
          policyVersion: FOUNDATION_POLICY.version,
        }),
        now,
        ownerId,
        ownerId,
        writeFence,
        requestId,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO integration_outbox
         (id, owner_id, topic, payload, status, attempts, created_at, updated_at)
         SELECT ?, ?, 'foundation.allocation_requested', ?, 'pending', 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND (SELECT COUNT(*) FROM integration_outbox WHERE owner_id = ? AND status = 'pending') < ?
           AND EXISTS (SELECT 1 FROM foundation_allocation_requests WHERE id = ? AND owner_id = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        identity.outboxId,
        ownerId,
        JSON.stringify({
          requestId,
          kind: validation.value.kind,
          category: validation.value.category,
          requestedUnits: validation.value.requestedUnits,
          policyVersion: FOUNDATION_POLICY.version,
        }),
        now,
        now,
        ownerId,
        ownerId,
        writeFence,
        ownerId,
        MAX_PENDING_OUTBOX,
        requestId,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
  ]);

  if (!(await storedReceipt(db, ownerId, identity))) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    const [counts, active, pending] = await Promise.all([
      db
        .prepare('SELECT COUNT(*) AS count FROM foundation_allocation_requests WHERE owner_id = ?')
        .bind(ownerId)
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT id FROM foundation_allocation_requests
           WHERE owner_id = ? AND kind = ?
             AND status IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated')
           LIMIT 1`,
        )
        .bind(ownerId, validation.value.kind)
        .first<{ id: string }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM integration_outbox
           WHERE owner_id = ? AND status = 'pending'`,
        )
        .bind(ownerId)
        .first<{ count: number }>(),
    ]);
    if (Number(counts?.count ?? 0) >= FOUNDATION_POLICY.maxRequestsPerOwner) {
      throw new OperatingLimitError('配給申請の保存上限50件に達しました。データを書き出してください。');
    }
    if (active) {
      throw new OperatingConflictError('同じ種類の配給申請がすでに審査中です。');
    }
    if (Number(pending?.count ?? 0) >= MAX_PENDING_OUTBOX) {
      throw new OperatingLimitError('処理待ちが上限に達しています。運営の処理後に再試行してください。');
    }
    throw new OperatingConflictError('配給申請を保存できませんでした。もう一度お試しください。');
  }
  const storedRequest = await db
    .prepare('SELECT id FROM foundation_allocation_requests WHERE id = ? AND owner_id = ?')
    .bind(requestId, ownerId)
    .first<{ id: string }>();
  if (!storedRequest) {
    throw new OperatingConflictError('配給申請の受付状態を確認できませんでした。');
  }
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}

export async function cancelFoundationRequest(
  ownerId: string,
  writeFence: number,
  requestId: string,
  mutationKey: string,
): Promise<FoundationSnapshot> {
  if (!/^[a-f0-9]{64}$/.test(requestId)) {
    throw new OperatingInputError('配給申請IDが正しくありません。');
  }
  await ensureSchema();
  const db = database();
  await throwIfWriteBlocked(db, ownerId, writeFence);
  const request = await db
    .prepare('SELECT id, kind, status FROM foundation_allocation_requests WHERE id = ? AND owner_id = ?')
    .bind(requestId, ownerId)
    .first<{ id: string; kind: string; status: string }>();
  if (!request) throw new OperatingInputError('配給申請が見つかりません。');

  const payload = { requestId, policyVersion: FOUNDATION_POLICY.version };
  const identity = await mutationIdentity(
    db,
    ownerId,
    writeFence,
    'foundation.request_cancelled',
    mutationKey,
    payload,
  );
  if (identity.replay) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    return readSnapshot(ownerId);
  }
  if (!CANCELLABLE_REQUEST_STATUSES.has(request.status)) {
    throw new OperatingConflictError('審査が進んだ申請はこの画面から取り消せません。');
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO portfolio_mutation_receipts
         (id, owner_id, operation, payload, claim_token, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM foundation_allocation_requests
             WHERE id = ? AND owner_id = ? AND status IN ('requested', 'needs_information')
           )
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
        requestId,
        ownerId,
        ownerId,
        MAX_PENDING_OUTBOX,
      ),
    db
      .prepare(
        `UPDATE foundation_allocation_requests
         SET status = 'cancelled', updated_at = ?
         WHERE id = ? AND owner_id = ? AND status IN ('requested', 'needs_information')
           AND NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        now,
        requestId,
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
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (id, owner_id, action, payload, created_at)
         SELECT ?, ?, 'foundation.request_cancelled', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND EXISTS (
             SELECT 1 FROM foundation_allocation_requests
             WHERE id = ? AND owner_id = ? AND status = 'cancelled'
           )
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        identity.auditId,
        ownerId,
        JSON.stringify({ requestId, policyVersion: FOUNDATION_POLICY.version }),
        now,
        ownerId,
        ownerId,
        writeFence,
        requestId,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO integration_outbox
         (id, owner_id, topic, payload, status, attempts, created_at, updated_at)
         SELECT ?, ?, 'foundation.allocation_cancelled', ?, 'pending', 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?)
           AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)
           AND (SELECT COUNT(*) FROM integration_outbox WHERE owner_id = ? AND status = 'pending') < ?
           AND EXISTS (
             SELECT 1 FROM foundation_allocation_requests
             WHERE id = ? AND owner_id = ? AND status = 'cancelled'
           )
           AND EXISTS (
             SELECT 1 FROM portfolio_mutation_receipts
             WHERE id = ? AND owner_id = ? AND operation = ? AND payload = ? AND claim_token = ?
           )`,
      )
      .bind(
        identity.outboxId,
        ownerId,
        JSON.stringify({ requestId, policyVersion: FOUNDATION_POLICY.version }),
        now,
        now,
        ownerId,
        ownerId,
        writeFence,
        ownerId,
        MAX_PENDING_OUTBOX,
        requestId,
        ownerId,
        identity.receiptId,
        ownerId,
        identity.operation,
        identity.payloadJson,
        identity.claimToken,
      ),
  ]);

  if (!(await storedReceipt(db, ownerId, identity))) {
    await throwIfWriteBlocked(db, ownerId, writeFence);
    throw new OperatingConflictError('配給申請を取り消せませんでした。状態を更新してください。');
  }
  const cancelled = await db
    .prepare(
      `SELECT id FROM foundation_allocation_requests
       WHERE id = ? AND owner_id = ? AND status = 'cancelled'`,
    )
    .bind(requestId, ownerId)
    .first<{ id: string }>();
  if (!cancelled) throw new OperatingConflictError('配給申請の取消状態を確認できませんでした。');
  await throwIfWriteBlocked(db, ownerId, writeFence);
  return readSnapshot(ownerId);
}
