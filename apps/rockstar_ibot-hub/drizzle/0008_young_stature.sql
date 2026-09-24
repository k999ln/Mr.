CREATE TABLE `foundation_allocation_accounts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`policy_version` text NOT NULL,
	`status` text NOT NULL,
	`granted_units` integer DEFAULT 0 NOT NULL,
	`reserved_units` integer DEFAULT 0 NOT NULL,
	`consumed_units` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "foundation_account_status" CHECK("foundation_allocation_accounts"."status" IN ('applicant', 'active', 'suspended')),
	CONSTRAINT "foundation_account_non_negative" CHECK("foundation_allocation_accounts"."granted_units" >= 0 AND "foundation_allocation_accounts"."reserved_units" >= 0 AND "foundation_allocation_accounts"."consumed_units" >= 0),
	CONSTRAINT "foundation_account_within_grant" CHECK("foundation_allocation_accounts"."reserved_units" + "foundation_allocation_accounts"."consumed_units" <= "foundation_allocation_accounts"."granted_units")
);
--> statement-breakpoint
CREATE TABLE `foundation_allocation_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`request_id` text,
	`entry_type` text NOT NULL,
	`units` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`actor_type` text NOT NULL,
	`actor_ref` text NOT NULL,
	`policy_version` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "foundation_ledger_entry_type" CHECK("foundation_allocation_ledger"."entry_type" IN ('grant', 'reserve', 'consume', 'release', 'expire', 'adjustment')),
	CONSTRAINT "foundation_ledger_non_negative" CHECK("foundation_allocation_ledger"."units" >= 0 AND "foundation_allocation_ledger"."balance_after" >= 0),
	CONSTRAINT "foundation_ledger_actor_type" CHECK("foundation_allocation_ledger"."actor_type" IN ('foundation_steward', 'system'))
);
--> statement-breakpoint
CREATE INDEX `idx_foundation_ledger_owner_created` ON `foundation_allocation_ledger` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `foundation_allocation_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`requested_units` integer NOT NULL,
	`purpose_summary` text NOT NULL,
	`status` text NOT NULL,
	`policy_version` text NOT NULL,
	`consent_at` text NOT NULL,
	`reviewed_by` text,
	`decision_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "foundation_request_kind" CHECK("foundation_allocation_requests"."kind" IN ('service_access', 'ai_capacity', 'essentials_support')),
	CONSTRAINT "foundation_request_status" CHECK("foundation_allocation_requests"."status" IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated', 'fulfilled', 'declined', 'cancelled')),
	CONSTRAINT "foundation_request_units" CHECK(("foundation_allocation_requests"."kind" = 'essentials_support' AND "foundation_allocation_requests"."requested_units" = 0) OR ("foundation_allocation_requests"."kind" <> 'essentials_support' AND "foundation_allocation_requests"."requested_units" BETWEEN 1 AND 20))
);
--> statement-breakpoint
CREATE INDEX `idx_foundation_requests_owner_created` ON `foundation_allocation_requests` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_foundation_requests_kind_status_created` ON `foundation_allocation_requests` (`kind`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundation_requests_owner_kind_active` ON `foundation_allocation_requests` (`owner_id`,`kind`) WHERE "foundation_allocation_requests"."status" IN ('requested', 'needs_information', 'under_review', 'approved', 'allocated');