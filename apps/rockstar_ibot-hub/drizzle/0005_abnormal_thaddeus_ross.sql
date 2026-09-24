CREATE TABLE `owner_write_fences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`generation` integer NOT NULL,
	`updated_at` text NOT NULL
);
