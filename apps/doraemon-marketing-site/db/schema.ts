import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const marketingLeads = sqliteTable("marketing_leads", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  emailHash: text("email_hash").notNull(),
  status: text("status", { enum: ["active", "unsubscribed"] }).notNull().default("active"),
  businessType: text("business_type"),
  monthlyOrders: text("monthly_orders"),
  channelsJson: text("channels_json").notNull().default("[]"),
  primaryBottleneck: text("primary_bottleneck"),
  telegramUsage: text("telegram_usage"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull(),
  privacyVersion: text("privacy_version").notNull(),
  consentTextHash: text("consent_text_hash").notNull(),
  consentAt: integer("consent_at", { mode: "timestamp_ms" }).notNull(),
  unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  content: text("content"),
  term: text("term"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp_ms" }),
}, (table) => [
  uniqueIndex("idx_marketing_leads_email").on(table.email),
  uniqueIndex("idx_marketing_leads_email_hash").on(table.emailHash),
  uniqueIndex("idx_marketing_leads_unsubscribe_token").on(table.unsubscribeTokenHash),
  index("idx_marketing_leads_status_created").on(table.status, table.createdAt),
]);

export const leadDownloadTokens = sqliteTable("lead_download_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  leadId: text("lead_id").notNull().references(() => marketingLeads.id, { onDelete: "cascade" }),
  assetKey: text("asset_key").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  firstDownloadedAt: integer("first_downloaded_at", { mode: "timestamp_ms" }),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_lead_download_tokens_lead").on(table.leadId),
  index("idx_lead_download_tokens_expiry").on(table.expiresAt),
]);

export const leadEmailSchedules = sqliteTable("lead_email_schedules", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => marketingLeads.id, { onDelete: "cascade" }),
  sequenceKey: text("sequence_key").notNull(),
  providerMessageId: text("provider_message_id"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["scheduled", "sent", "canceled", "failed"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_lead_email_schedule_sequence").on(table.leadId, table.sequenceKey),
  index("idx_lead_email_schedule_status_time").on(table.status, table.scheduledAt),
]);

export const leadEvents = sqliteTable("lead_events", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => marketingLeads.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_lead_events_lead_time").on(table.leadId, table.createdAt),
  index("idx_lead_events_type_time").on(table.eventType, table.createdAt),
]);
