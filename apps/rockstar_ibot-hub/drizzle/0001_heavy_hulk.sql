CREATE TABLE `daily_checkins` (
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`body_score` integer NOT NULL,
	`mind_score` integer NOT NULL,
	`energy_score` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_checkins_owner_day` ON `daily_checkins` (`owner_id`,`day`);--> statement-breakpoint
CREATE TABLE `life_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`domain` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_life_tasks_owner_status_created` ON `life_tasks` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `money_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`category` text NOT NULL,
	`note` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_money_entries_owner_occurred` ON `money_entries` (`owner_id`,`occurred_at`);