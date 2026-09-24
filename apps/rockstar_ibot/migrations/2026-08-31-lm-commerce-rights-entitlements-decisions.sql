-- Merchant-local commerce rights, purchaser entitlement evidence, and decision evidence.
-- References are opaque within (uid, merchant_ref); this schema intentionally stores no global identity.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.lm_commerce_local_ref_valid(p_value text, p_max integer DEFAULT 256)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_value IS NOT NULL
     AND char_length(p_value) BETWEEN 1 AND p_max
     AND p_value ~ '^[A-Za-z0-9][A-Za-z0-9._:/+~-]*$'
$$;

CREATE TABLE IF NOT EXISTS public.lm_commerce_purchaser_entitlements (
  entitlement_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(merchant_ref)),
  purchaser_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(purchaser_ref)),
  entitlement_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(entitlement_ref)),
  event_kind text NOT NULL CHECK (event_kind IN ('desired', 'observed', 'reconciliation')),
  desired_state text CHECK (desired_state IN ('granted', 'revoked', 'suspended', 'expired')),
  observed_state text CHECK (observed_state IN ('granted', 'revoked', 'suspended', 'expired')),
  provider_ref text CHECK (provider_ref IS NULL OR public.lm_commerce_local_ref_valid(provider_ref)),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  source_order_ref text CHECK (source_order_ref IS NULL OR public.lm_commerce_local_ref_valid(source_order_ref)),
  source_refund_ref text CHECK (source_refund_ref IS NULL OR public.lm_commerce_local_ref_valid(source_refund_ref)),
  evidence_reference text NOT NULL CHECK (public.lm_commerce_local_ref_valid(evidence_reference, 512)),
  discrepancy boolean NOT NULL DEFAULT false,
  reconciliation_case_ref text CHECK (reconciliation_case_ref IS NULL OR public.lm_commerce_local_ref_valid(reconciliation_case_ref)),
  idempotency_key text NOT NULL CHECK (public.lm_commerce_local_ref_valid(idempotency_key)),
  revision_key text NOT NULL CHECK (public.lm_commerce_local_ref_valid(revision_key)),
  recorded_at timestamptz NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  CONSTRAINT lm_commerce_purchaser_entitlements_interval CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT lm_commerce_purchaser_entitlements_shape CHECK (
    (event_kind = 'desired' AND desired_state IS NOT NULL AND observed_state IS NULL AND provider_ref IS NULL AND NOT discrepancy)
    OR (event_kind = 'observed' AND observed_state IS NOT NULL AND desired_state IS NULL AND provider_ref IS NOT NULL AND NOT discrepancy)
    OR (event_kind = 'reconciliation' AND desired_state IS NOT NULL AND observed_state IS NOT NULL
      AND provider_ref IS NOT NULL
      AND discrepancy = (desired_state <> observed_state)
      AND (NOT discrepancy OR reconciliation_case_ref IS NOT NULL))
  ),
  UNIQUE (uid, merchant_ref, idempotency_key, revision_key)
);

CREATE INDEX IF NOT EXISTS lm_commerce_purchaser_entitlements_history_idx
  ON public.lm_commerce_purchaser_entitlements
  (uid, merchant_ref, purchaser_ref, entitlement_ref, recorded_at DESC);
CREATE INDEX IF NOT EXISTS lm_commerce_purchaser_entitlements_reconciliation_idx
  ON public.lm_commerce_purchaser_entitlements
  (uid, merchant_ref, reconciliation_case_ref, recorded_at DESC)
  WHERE discrepancy;

CREATE TABLE IF NOT EXISTS public.lm_commerce_consent_rights (
  consent_right_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(merchant_ref)),
  subject_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(subject_ref)),
  purpose text NOT NULL CHECK (public.lm_commerce_local_ref_valid(purpose)),
  scope text NOT NULL CHECK (public.lm_commerce_local_ref_valid(scope)),
  channel text NOT NULL CHECK (public.lm_commerce_local_ref_valid(channel)),
  right_state text NOT NULL CHECK (right_state IN ('granted', 'denied', 'withdrawn', 'expired')),
  notice_version text NOT NULL CHECK (public.lm_commerce_local_ref_valid(notice_version)),
  policy_version text NOT NULL CHECK (public.lm_commerce_local_ref_valid(policy_version)),
  evidence_reference text NOT NULL CHECK (public.lm_commerce_local_ref_valid(evidence_reference, 512)),
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  reason_code text NOT NULL CHECK (public.lm_commerce_local_ref_valid(reason_code)),
  idempotency_key text NOT NULL CHECK (public.lm_commerce_local_ref_valid(idempotency_key)),
  revision_key text NOT NULL CHECK (public.lm_commerce_local_ref_valid(revision_key)),
  recorded_at timestamptz NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  CONSTRAINT lm_commerce_consent_rights_interval CHECK (expires_at IS NULL OR expires_at > effective_at),
  CONSTRAINT lm_commerce_consent_rights_withdrawal CHECK (
    (right_state = 'withdrawn' AND withdrawn_at IS NOT NULL AND withdrawn_at >= effective_at)
    OR (right_state <> 'withdrawn' AND withdrawn_at IS NULL)
  ),
  UNIQUE (uid, merchant_ref, idempotency_key, revision_key)
);

CREATE INDEX IF NOT EXISTS lm_commerce_consent_rights_history_idx
  ON public.lm_commerce_consent_rights
  (uid, merchant_ref, subject_ref, purpose, scope, channel, effective_at DESC, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.lm_commerce_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(merchant_ref)),
  opportunity_ref text NOT NULL CHECK (public.lm_commerce_local_ref_valid(opportunity_ref)),
  state_snapshot_reference text NOT NULL CHECK (public.lm_commerce_local_ref_valid(state_snapshot_reference, 512)),
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) BETWEEN 1 AND 100),
  policy_version text NOT NULL CHECK (public.lm_commerce_local_ref_valid(policy_version)),
  model_version text NOT NULL CHECK (public.lm_commerce_local_ref_valid(model_version)),
  approval_reference text CHECK (approval_reference IS NULL OR public.lm_commerce_local_ref_valid(approval_reference, 512)),
  experiment_ref text CHECK (experiment_ref IS NULL OR public.lm_commerce_local_ref_valid(experiment_ref)),
  experiment_assignment text CHECK (experiment_assignment IS NULL OR public.lm_commerce_local_ref_valid(experiment_assignment)),
  holdout boolean NOT NULL DEFAULT false,
  outcome_state text NOT NULL CHECK (outcome_state IN ('pending', 'unknown', 'succeeded', 'failed', 'cancelled')),
  outcome_reference text CHECK (outcome_reference IS NULL OR public.lm_commerce_local_ref_valid(outcome_reference, 512)),
  net_economics_references jsonb NOT NULL CHECK (jsonb_typeof(net_economics_references) = 'array' AND jsonb_array_length(net_economics_references) BETWEEN 1 AND 20),
  idempotency_key text NOT NULL CHECK (public.lm_commerce_local_ref_valid(idempotency_key)),
  revision_key text NOT NULL CHECK (public.lm_commerce_local_ref_valid(revision_key)),
  decided_at timestamptz NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  CONSTRAINT lm_commerce_decisions_experiment_shape CHECK ((experiment_ref IS NULL) = (experiment_assignment IS NULL)),
  UNIQUE (uid, merchant_ref, idempotency_key, revision_key)
);

CREATE INDEX IF NOT EXISTS lm_commerce_decisions_opportunity_idx
  ON public.lm_commerce_decisions (uid, merchant_ref, opportunity_ref, decided_at DESC);

ALTER TABLE public.lm_commerce_purchaser_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_commerce_consent_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_commerce_decisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lm_commerce_purchaser_entitlements' AND policyname = 'lm_commerce_purchaser_entitlements_service_select') THEN
    CREATE POLICY lm_commerce_purchaser_entitlements_service_select ON public.lm_commerce_purchaser_entitlements FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lm_commerce_consent_rights' AND policyname = 'lm_commerce_consent_rights_service_select') THEN
    CREATE POLICY lm_commerce_consent_rights_service_select ON public.lm_commerce_consent_rights FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lm_commerce_decisions' AND policyname = 'lm_commerce_decisions_service_select') THEN
    CREATE POLICY lm_commerce_decisions_service_select ON public.lm_commerce_decisions FOR SELECT TO service_role USING (true);
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.lm_commerce_purchaser_entitlements FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.lm_commerce_consent_rights FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.lm_commerce_decisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.lm_commerce_purchaser_entitlements TO service_role;
GRANT SELECT ON TABLE public.lm_commerce_consent_rights TO service_role;
GRANT SELECT ON TABLE public.lm_commerce_decisions TO service_role;

CREATE OR REPLACE FUNCTION public.reject_lm_commerce_assurance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

-- lm_commerce_purchaser_entitlements is append-only.
-- lm_commerce_consent_rights is append-only.
-- lm_commerce_decisions is append-only.
DROP TRIGGER IF EXISTS lm_commerce_purchaser_entitlements_append_only ON public.lm_commerce_purchaser_entitlements;
CREATE TRIGGER lm_commerce_purchaser_entitlements_append_only BEFORE UPDATE OR DELETE ON public.lm_commerce_purchaser_entitlements FOR EACH ROW EXECUTE FUNCTION public.reject_lm_commerce_assurance_mutation();
DROP TRIGGER IF EXISTS lm_commerce_consent_rights_append_only ON public.lm_commerce_consent_rights;
CREATE TRIGGER lm_commerce_consent_rights_append_only BEFORE UPDATE OR DELETE ON public.lm_commerce_consent_rights FOR EACH ROW EXECUTE FUNCTION public.reject_lm_commerce_assurance_mutation();
DROP TRIGGER IF EXISTS lm_commerce_decisions_append_only ON public.lm_commerce_decisions;
CREATE TRIGGER lm_commerce_decisions_append_only BEFORE UPDATE OR DELETE ON public.lm_commerce_decisions FOR EACH ROW EXECUTE FUNCTION public.reject_lm_commerce_assurance_mutation();

CREATE OR REPLACE FUNCTION public.lm_append_commerce_purchaser_entitlement(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash bytea;
  v_row public.lm_commerce_purchaser_entitlements%ROWTYPE;
  v_created boolean;
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object'
    OR p_event - ARRAY['uid','merchant_ref','purchaser_ref','entitlement_ref','event_kind','desired_state','observed_state','provider_ref','effective_from','effective_until','source_order_ref','source_refund_ref','evidence_reference','discrepancy','reconciliation_case_ref','idempotency_key','revision_key','recorded_at'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_entitlement_event';
  END IF;
  v_hash := digest(convert_to(p_event::text, 'UTF8'), 'sha256');
  INSERT INTO public.lm_commerce_purchaser_entitlements (
    uid, merchant_ref, purchaser_ref, entitlement_ref, event_kind, desired_state, observed_state, provider_ref,
    effective_from, effective_until, source_order_ref, source_refund_ref, evidence_reference,
    discrepancy, reconciliation_case_ref, idempotency_key, revision_key, recorded_at, payload_hash
  ) VALUES (
    p_event->>'uid', p_event->>'merchant_ref', p_event->>'purchaser_ref', p_event->>'entitlement_ref', p_event->>'event_kind',
    p_event->>'desired_state', p_event->>'observed_state', p_event->>'provider_ref', (p_event->>'effective_from')::timestamptz,
    (p_event->>'effective_until')::timestamptz, p_event->>'source_order_ref', p_event->>'source_refund_ref',
    p_event->>'evidence_reference', (p_event->>'discrepancy')::boolean, p_event->>'reconciliation_case_ref',
    p_event->>'idempotency_key', p_event->>'revision_key', (p_event->>'recorded_at')::timestamptz, v_hash
  ) ON CONFLICT (uid, merchant_ref, idempotency_key, revision_key) DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT * INTO STRICT v_row FROM public.lm_commerce_purchaser_entitlements
      WHERE uid = p_event->>'uid' AND merchant_ref = p_event->>'merchant_ref'
        AND idempotency_key = p_event->>'idempotency_key' AND revision_key = p_event->>'revision_key';
    IF v_row.payload_hash <> v_hash THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_collision'; END IF;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'event', to_jsonb(v_row) - 'payload_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_append_commerce_consent_right(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash bytea;
  v_row public.lm_commerce_consent_rights%ROWTYPE;
  v_created boolean;
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object'
    OR p_event - ARRAY['uid','merchant_ref','subject_ref','purpose','scope','channel','right_state','notice_version','policy_version','evidence_reference','effective_at','expires_at','withdrawn_at','reason_code','idempotency_key','revision_key','recorded_at'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_consent_right_event';
  END IF;
  v_hash := digest(convert_to(p_event::text, 'UTF8'), 'sha256');
  INSERT INTO public.lm_commerce_consent_rights (
    uid, merchant_ref, subject_ref, purpose, scope, channel, right_state, notice_version, policy_version,
    evidence_reference, effective_at, expires_at, withdrawn_at, reason_code, idempotency_key, revision_key, recorded_at, payload_hash
  ) VALUES (
    p_event->>'uid', p_event->>'merchant_ref', p_event->>'subject_ref', p_event->>'purpose', p_event->>'scope', p_event->>'channel',
    p_event->>'right_state', p_event->>'notice_version', p_event->>'policy_version', p_event->>'evidence_reference',
    (p_event->>'effective_at')::timestamptz, (p_event->>'expires_at')::timestamptz, (p_event->>'withdrawn_at')::timestamptz,
    p_event->>'reason_code', p_event->>'idempotency_key', p_event->>'revision_key', (p_event->>'recorded_at')::timestamptz, v_hash
  ) ON CONFLICT (uid, merchant_ref, idempotency_key, revision_key) DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT * INTO STRICT v_row FROM public.lm_commerce_consent_rights
      WHERE uid = p_event->>'uid' AND merchant_ref = p_event->>'merchant_ref'
        AND idempotency_key = p_event->>'idempotency_key' AND revision_key = p_event->>'revision_key';
    IF v_row.payload_hash <> v_hash THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_collision'; END IF;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'event', to_jsonb(v_row) - 'payload_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_commerce_contact_permission(
  p_uid text, p_merchant_ref text, p_subject_ref text, p_purpose text,
  p_scope text, p_channel text, p_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.lm_commerce_consent_rights%ROWTYPE;
BEGIN
  SELECT rights.* INTO v_row
    FROM public.lm_commerce_consent_rights AS rights
   WHERE rights.uid = p_uid AND rights.merchant_ref = p_merchant_ref
     AND rights.subject_ref = p_subject_ref AND rights.purpose = p_purpose
     AND rights.scope = p_scope AND rights.channel = p_channel
     AND CASE WHEN rights.right_state = 'withdrawn' THEN rights.withdrawn_at ELSE rights.effective_at END <= p_at
   ORDER BY CASE WHEN rights.right_state = 'withdrawn' THEN rights.withdrawn_at ELSE rights.effective_at END DESC,
     rights.recorded_at DESC, rights.consent_right_event_id DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('permitted', false, 'reason_code', 'right_missing'); END IF;
  IF v_row.right_state = 'granted' AND (v_row.expires_at IS NULL OR v_row.expires_at > p_at) THEN
    RETURN jsonb_build_object('permitted', true, 'reason_code', 'granted', 'evidence_reference', v_row.evidence_reference);
  END IF;
  RETURN jsonb_build_object(
    'permitted', false,
    'reason_code', CASE WHEN v_row.right_state = 'granted' THEN 'expired' ELSE v_row.right_state END,
    'evidence_reference', v_row.evidence_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_append_commerce_decision(p_decision jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash bytea;
  v_row public.lm_commerce_decisions%ROWTYPE;
  v_created boolean;
  v_candidate jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_selected integer := 0;
  v_probability numeric := 0;
  v_ref jsonb;
BEGIN
  IF p_decision IS NULL OR jsonb_typeof(p_decision) <> 'object'
    OR p_decision - ARRAY['uid','merchant_ref','opportunity_ref','state_snapshot_reference','candidates','policy_version','model_version','approval_reference','experiment_ref','experiment_assignment','holdout','outcome_state','outcome_reference','net_economics_references','idempotency_key','revision_key','decided_at'] <> '{}'::jsonb
    OR jsonb_typeof(p_decision->'candidates') <> 'array'
    OR jsonb_array_length(p_decision->'candidates') NOT BETWEEN 1 AND 100
    OR jsonb_typeof(p_decision->'net_economics_references') <> 'array'
    OR jsonb_array_length(p_decision->'net_economics_references') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_commerce_decision';
  END IF;
  FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_decision->'candidates') LOOP
    IF jsonb_typeof(v_candidate) <> 'object'
      OR v_candidate - ARRAY['action_ref','action_kind','disposition','reason_code','selection_probability'] <> '{}'::jsonb
      OR NOT public.lm_commerce_local_ref_valid(v_candidate->>'action_ref')
      OR NOT public.lm_commerce_local_ref_valid(v_candidate->>'action_kind')
      OR NOT public.lm_commerce_local_ref_valid(v_candidate->>'reason_code')
      OR v_candidate->>'disposition' NOT IN ('selected','rejected')
      OR (v_candidate->>'selection_probability')::numeric < 0
      OR (v_candidate->>'selection_probability')::numeric > 1
      OR v_candidate->>'action_ref' = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_decision_candidates';
    END IF;
    v_seen := array_append(v_seen, v_candidate->>'action_ref');
    v_selected := v_selected + CASE WHEN v_candidate->>'disposition' = 'selected' THEN 1 ELSE 0 END;
    v_probability := v_probability + (v_candidate->>'selection_probability')::numeric;
  END LOOP;
  IF v_selected <> 1 OR abs(v_probability - 1) > 0.000000001 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_candidate_probabilities';
  END IF;
  v_seen := ARRAY[]::text[];
  FOR v_ref IN SELECT value FROM jsonb_array_elements(p_decision->'net_economics_references') LOOP
    IF jsonb_typeof(v_ref) <> 'string' OR NOT public.lm_commerce_local_ref_valid(v_ref #>> '{}', 512) OR (v_ref #>> '{}') = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_net_economics_references';
    END IF;
    v_seen := array_append(v_seen, v_ref #>> '{}');
  END LOOP;
  v_hash := digest(convert_to(p_decision::text, 'UTF8'), 'sha256');
  INSERT INTO public.lm_commerce_decisions (
    uid, merchant_ref, opportunity_ref, state_snapshot_reference, candidates, policy_version, model_version,
    approval_reference, experiment_ref, experiment_assignment, holdout, outcome_state, outcome_reference,
    net_economics_references, idempotency_key, revision_key, decided_at, payload_hash
  ) VALUES (
    p_decision->>'uid', p_decision->>'merchant_ref', p_decision->>'opportunity_ref', p_decision->>'state_snapshot_reference', p_decision->'candidates',
    p_decision->>'policy_version', p_decision->>'model_version', p_decision->>'approval_reference', p_decision->>'experiment_ref',
    p_decision->>'experiment_assignment', (p_decision->>'holdout')::boolean, p_decision->>'outcome_state', p_decision->>'outcome_reference',
    p_decision->'net_economics_references', p_decision->>'idempotency_key', p_decision->>'revision_key', (p_decision->>'decided_at')::timestamptz, v_hash
  ) ON CONFLICT (uid, merchant_ref, idempotency_key, revision_key) DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT * INTO STRICT v_row FROM public.lm_commerce_decisions
      WHERE uid = p_decision->>'uid' AND merchant_ref = p_decision->>'merchant_ref'
        AND idempotency_key = p_decision->>'idempotency_key' AND revision_key = p_decision->>'revision_key';
    IF v_row.payload_hash <> v_hash THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_collision'; END IF;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'decision', to_jsonb(v_row) - 'payload_hash');
END;
$$;

REVOKE ALL ON FUNCTION public.lm_commerce_local_ref_valid(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_lm_commerce_assurance_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_append_commerce_purchaser_entitlement(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_append_commerce_consent_right(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_commerce_contact_permission(text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_append_commerce_decision(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_append_commerce_purchaser_entitlement(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_append_commerce_consent_right(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_commerce_contact_permission(text, text, text, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_append_commerce_decision(jsonb) TO service_role;
