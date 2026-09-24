CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_owner_created` ON `audit_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_integration_outbox_status_created` ON `integration_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `portfolio_slots` (
	`owner_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`cell_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_portfolio_slots_owner_slot` ON `portfolio_slots` (`owner_id`,`slot_id`);--> statement-breakpoint
CREATE TABLE `portfolios` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`portfolio_id` text NOT NULL,
	`connected_all` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_service_files_object_key` ON `service_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_service_files_owner` ON `service_files` (`owner_id`);--> statement-breakpoint
CREATE TABLE `service_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`cell_id` text NOT NULL,
	`input_summary` text NOT NULL,
	`file_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_service_runs_owner_created` ON `service_runs` (`owner_id`,`created_at`);