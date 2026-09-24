CREATE INDEX `idx_integration_outbox_owner_status_created` ON `integration_outbox` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS cap_audit_events_after_insert
AFTER INSERT ON audit_events
BEGIN
  DELETE FROM audit_events
  WHERE owner_id = NEW.owner_id AND id IN (
    SELECT id FROM audit_events WHERE owner_id = NEW.owner_id
    ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 5000
  );
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS cap_processed_outbox_after_update
AFTER UPDATE OF status ON integration_outbox
WHEN NEW.status <> 'pending'
BEGIN
  DELETE FROM integration_outbox
  WHERE owner_id = NEW.owner_id AND status <> 'pending' AND id IN (
    SELECT id FROM integration_outbox
    WHERE owner_id = NEW.owner_id AND status <> 'pending'
    ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 5000
  );
END;
