CREATE TABLE `lead_download_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`asset_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`first_downloaded_at` integer,
	`download_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `marketing_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lead_download_tokens_lead` ON `lead_download_tokens` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_lead_download_tokens_expiry` ON `lead_download_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `lead_email_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`sequence_key` text NOT NULL,
	`provider_message_id` text,
	`scheduled_at` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `marketing_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lead_email_schedule_sequence` ON `lead_email_schedules` (`lead_id`,`sequence_key`);--> statement-breakpoint
CREATE INDEX `idx_lead_email_schedule_status_time` ON `lead_email_schedules` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `lead_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`event_type` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `marketing_leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_lead_events_lead_time` ON `lead_events` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_lead_events_type_time` ON `lead_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketing_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`business_type` text,
	`monthly_orders` text,
	`channels_json` text DEFAULT '[]' NOT NULL,
	`primary_bottleneck` text,
	`telegram_usage` text,
	`marketing_consent` integer NOT NULL,
	`privacy_version` text NOT NULL,
	`consent_text_hash` text NOT NULL,
	`consent_at` integer NOT NULL,
	`unsubscribe_token_hash` text NOT NULL,
	`source` text,
	`medium` text,
	`campaign` text,
	`content` text,
	`term` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`unsubscribed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketing_leads_email` ON `marketing_leads` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketing_leads_email_hash` ON `marketing_leads` (`email_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketing_leads_unsubscribe_token` ON `marketing_leads` (`unsubscribe_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_marketing_leads_status_created` ON `marketing_leads` (`status`,`created_at`);