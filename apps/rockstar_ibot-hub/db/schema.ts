import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const portfolios = sqliteTable('portfolios', {
  ownerId: text('owner_id').primaryKey(),
  portfolioId: text('portfolio_id').notNull(),
  connectedAll: integer('connected_all', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const portfolioSlots = sqliteTable(
  'portfolio_slots',
  {
    ownerId: text('owner_id').notNull(),
    slotId: text('slot_id').notNull(),
    cellId: text('cell_id').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('uq_portfolio_slots_owner_slot').on(table.ownerId, table.slotId)],
);

export const serviceRuns = sqliteTable(
  'service_runs',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    slotId: text('slot_id').notNull(),
    cellId: text('cell_id').notNull(),
    inputSummary: text('input_summary').notNull(),
    fileId: text('file_id'),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_service_runs_owner_created').on(table.ownerId, table.createdAt)],
);

export const executionDevices = sqliteTable('execution_devices', {
  ownerId: text('owner_id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  writeGeneration: integer('write_generation').notNull(),
  protocol: text('protocol').notNull().default(''),
  verified: integer('verified').notNull().default(0),
  heartbeatAt: integer('heartbeat_at').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('uq_execution_devices_token_hash').on(table.tokenHash)]);

export const serviceExecutions = sqliteTable('service_executions', {
  runId: text('run_id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  writeGeneration: integer('write_generation').notNull(),
  attachmentText: text('attachment_text'),
  claimToken: text('claim_token'),
  leaseUntil: integer('lease_until').notNull().default(0),
  resultJson: text('result_json'),
  errorCode: text('error_code'),
  finishedAt: text('finished_at'),
}, table => [index('idx_service_executions_owner').on(table.ownerId)]);

export const serviceFiles = sqliteTable(
  'service_files',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_service_files_object_key').on(table.objectKey),
    index('idx_service_files_owner').on(table.ownerId),
  ],
);

export const fileUploadReservations = sqliteTable(
  'file_upload_reservations',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    contentSha256: text('content_sha256').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_file_upload_reservations_owner_status').on(table.ownerId, table.status),
  ],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    action: text('action').notNull(),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_audit_events_owner_created').on(table.ownerId, table.createdAt)],
);

export const integrationOutbox = sqliteTable(
  'integration_outbox',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    topic: text('topic').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_integration_outbox_status_created').on(table.status, table.createdAt),
    index('idx_integration_outbox_owner_status_created').on(
      table.ownerId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const coreIdentityLinks = sqliteTable(
  'core_identity_links',
  {
    ownerId: text('owner_id').primaryKey(),
    status: text('status').notNull(),
    coreAccountRef: text('core_account_ref'),
    botUsername: text('bot_username').notNull(),
    requestedAt: text('requested_at'),
    linkedAt: text('linked_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('core_identity_link_status', sql`${table.status} IN ('unlinked', 'pending', 'linked')`),
    index('idx_core_identity_links_status_updated').on(table.status, table.updatedAt),
  ],
);

export const portfolioMutationReceipts = sqliteTable(
  'portfolio_mutation_receipts',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    operation: text('operation').notNull(),
    payload: text('payload').notNull(),
    claimToken: text('claim_token').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_portfolio_mutation_receipts_owner_created').on(table.ownerId, table.createdAt),
  ],
);

export const lifeTasks = sqliteTable(
  'life_tasks',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    domain: text('domain').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    dueAt: text('due_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_life_tasks_owner_status_created').on(table.ownerId, table.status, table.createdAt),
  ],
);

export const dailyCheckins = sqliteTable(
  'daily_checkins',
  {
    ownerId: text('owner_id').notNull(),
    day: text('day').notNull(),
    bodyScore: integer('body_score').notNull(),
    mindScore: integer('mind_score').notNull(),
    energyScore: integer('energy_score').notNull(),
    note: text('note').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('uq_daily_checkins_owner_day').on(table.ownerId, table.day)],
);

export const moneyEntries = sqliteTable(
  'money_entries',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    direction: text('direction').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    category: text('category').notNull(),
    note: text('note').notNull(),
    occurredAt: text('occurred_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_money_entries_owner_occurred').on(table.ownerId, table.occurredAt)],
);

export const foundationAllocationAccounts = sqliteTable(
  'foundation_allocation_accounts',
  {
    ownerId: text('owner_id').primaryKey(),
    policyVersion: text('policy_version').notNull(),
    status: text('status').notNull(),
    grantedUnits: integer('granted_units').notNull().default(0),
    reservedUnits: integer('reserved_units').notNull().default(0),
    consumedUnits: integer('consumed_units').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check(
      'foundation_account_status',
      sql`${table.status} IN ('applicant', 'active', 'suspended')`,
    ),
    check(
      'foundation_account_non_negative',
      sql`${table.grantedUnits} >= 0 AND ${table.reservedUnits} >= 0 AND ${table.consumedUnits} >= 0`,
    ),
    check(
      'foundation_account_within_grant',
      sql`${table.reservedUnits} + ${table.consumedUnits} <= ${table.grantedUnits}`,
    ),
  ],
);

export const foundationAllocationRequests = sqliteTable(
  'foundation_allocation_requests',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    kind: text('kind').notNull(),
    category: text('category').notNull(),
    requestedUnits: integer('requested_units').notNull(),
    purposeSummary: text('purpose_summary').notNull(),
    status: text('status').notNull(),
    policyVersion: text('policy_version').notNull(),
    consentAt: text('consent_at').notNull(),
    reviewedBy: text('reviewed_by'),
    decisionReason: text('decision_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_foundation_requests_owner_created').on(table.ownerId, table.createdAt),
    index('idx_foundation_requests_kind_status_created').on(
      table.kind,
      table.status,
      table.createdAt,
    ),
    uniqueIndex('uq_foundation_requests_owner_kind_active')
      .on(table.ownerId, table.kind)
      .where(
        sql`${table.status} IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated')`,
      ),
    check(
      'foundation_request_kind',
      sql`${table.kind} IN ('service_access', 'ai_capacity', 'essentials_support')`,
    ),
    check(
      'foundation_request_status',
      sql`${table.status} IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated', 'fulfilled', 'declined', 'cancelled')`,
    ),
    check(
      'foundation_request_units',
      sql`(${table.kind} = 'essentials_support' AND ${table.requestedUnits} = 0) OR (${table.kind} <> 'essentials_support' AND ${table.requestedUnits} BETWEEN 1 AND 20)`,
    ),
  ],
);

export const foundationAllocationLedger = sqliteTable(
  'foundation_allocation_ledger',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    requestId: text('request_id'),
    entryType: text('entry_type').notNull(),
    units: integer('units').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    actorType: text('actor_type').notNull(),
    actorRef: text('actor_ref').notNull(),
    policyVersion: text('policy_version').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_foundation_ledger_owner_created').on(table.ownerId, table.createdAt),
    check(
      'foundation_ledger_entry_type',
      sql`${table.entryType} IN ('grant', 'reserve', 'consume', 'release', 'expire', 'adjustment')`,
    ),
    check(
      'foundation_ledger_non_negative',
      sql`${table.units} >= 0 AND ${table.balanceAfter} >= 0`,
    ),
    check(
      'foundation_ledger_actor_type',
      sql`${table.actorType} IN ('foundation_steward', 'system')`,
    ),
  ],
);

export const mutationRateLimits = sqliteTable(
  'mutation_rate_limits',
  {
    ownerId: text('owner_id').notNull(),
    windowStart: integer('window_start').notNull(),
    requestCount: integer('request_count').notNull(),
  },
  (table) => [uniqueIndex('uq_mutation_rate_limits_owner_window').on(table.ownerId, table.windowStart)],
);

export const dataExportRateLimits = sqliteTable(
  'data_export_rate_limits',
  {
    ownerId: text('owner_id').notNull(),
    windowStart: integer('window_start').notNull(),
    requestCount: integer('request_count').notNull(),
  },
  (table) => [
    uniqueIndex('uq_data_export_rate_limits_owner_window').on(table.ownerId, table.windowStart),
  ],
);

export const ownerDataLocks = sqliteTable('owner_data_locks', {
  ownerId: text('owner_id').primaryKey(),
  state: text('state').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ownerWriteFences = sqliteTable('owner_write_fences', {
  ownerId: text('owner_id').primaryKey(),
  generation: integer('generation').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ownerCleanupTombstones = sqliteTable('owner_cleanup_tombstones', {
  ownerId: text('owner_id').primaryKey(),
  deleteBeforeGeneration: integer('delete_before_generation').notNull(),
  updatedAt: text('updated_at').notNull(),
});
