CREATE TABLE `data_export_rate_limits` (
	`owner_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_data_export_rate_limits_owner_window` ON `data_export_rate_limits` (`owner_id`,`window_start`);--> statement-breakpoint
CREATE TABLE `file_upload_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_file_upload_reservations_owner_status` ON `file_upload_reservations` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `owner_data_locks` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL
);
