CREATE TABLE `execution_devices` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`write_generation` integer NOT NULL,
	`protocol` text DEFAULT '' NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`heartbeat_at` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_execution_devices_token_hash` ON `execution_devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `service_executions` (
	`run_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`write_generation` integer NOT NULL,
	`attachment_text` text,
	`claim_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`result_json` text,
	`error_code` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_service_executions_owner` ON `service_executions` (`owner_id`);