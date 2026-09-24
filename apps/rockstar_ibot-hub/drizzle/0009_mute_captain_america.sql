CREATE TABLE `core_identity_links` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`core_account_ref` text,
	`bot_username` text NOT NULL,
	`requested_at` text,
	`linked_at` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "core_identity_link_status" CHECK("core_identity_links"."status" IN ('unlinked', 'pending', 'linked'))
);
--> statement-breakpoint
CREATE INDEX `idx_core_identity_links_status_updated` ON `core_identity_links` (`status`,`updated_at`);