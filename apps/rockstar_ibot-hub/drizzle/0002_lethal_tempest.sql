CREATE TABLE `mutation_rate_limits` (
	`owner_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mutation_rate_limits_owner_window` ON `mutation_rate_limits` (`owner_id`,`window_start`);