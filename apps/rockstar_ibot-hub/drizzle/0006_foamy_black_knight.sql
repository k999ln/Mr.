CREATE TABLE `owner_cleanup_tombstones` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`delete_before_generation` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_mutation_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_portfolio_mutation_receipts_owner_created` ON `portfolio_mutation_receipts` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `cap_portfolio_mutation_receipts_after_insert`
AFTER INSERT ON `portfolio_mutation_receipts`
BEGIN
  DELETE FROM `portfolio_mutation_receipts`
  WHERE `owner_id` = NEW.`owner_id` AND `id` IN (
    SELECT `id` FROM `portfolio_mutation_receipts`
    WHERE `owner_id` = NEW.`owner_id`
    ORDER BY `created_at` DESC, `id` DESC LIMIT -1 OFFSET 5000
  );
END;
