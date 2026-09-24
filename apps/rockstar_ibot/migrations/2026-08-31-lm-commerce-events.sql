-- Tenant-scoped, bounded evidence for Commerce decisions, actions, and outcomes.
-- Writes go through one atomic RPC so an exact retry returns the original event while
-- reuse of the same idempotency/revision identity for another payload fails closed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.lm_commerce_reference_metadata_valid(p_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_key text;
  v_value jsonb;
  v_ref text;
BEGIN
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_metadata)) > 32
     OR octet_length(p_metadata::text) > 8192 THEN
    RETURN false;
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_metadata)
  LOOP
    IF v_key !~ '^[a-z][a-z0-9_]{0,62}_ref$'
       OR v_key ~ '(email|message|body|raw|secret|token|credential|password|api_key|private_key|customer|person|contact|identity|profile|user|account)'
       OR jsonb_typeof(v_value) <> 'string' THEN
      RETURN false;
    END IF;
    v_ref := v_value #>> '{}';
    IF char_length(v_ref) NOT BETWEEN 4 AND 512
       OR v_ref !~ '^(commerce|artifact|provider|receipt|decision|action)://[A-Za-z0-9][A-Za-z0-9._~:/+-]{0,510}$'
       OR v_ref ~* '(^|[/:._~-])(email|secret|token|credential|password|api[_-]?key|private[_-]?key|customer|person|contact|identity|profile|user|account)([/:._~-]|$)' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lm_commerce_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT
    CHECK (char_length(uid) BETWEEN 1 AND 256 AND uid = btrim(uid) AND uid !~ '[[:cntrl:]]'),
  merchant_ref text NOT NULL CHECK (
    merchant_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
  ),
  event_kind text NOT NULL CHECK (event_kind IN (
    'decision_proposed',
    'decision_approved',
    'action_enqueued',
    'exposure_eligible',
    'exposure_delivered',
    'provider_readback',
    'outcome_observed',
    'experiment_assignment',
    'consent_recorded'
  )),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  occurred_at timestamptz NOT NULL CHECK (occurred_at >= TIMESTAMPTZ '2000-01-01 00:00:00+00'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 1 AND 256
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,255}$'
  ),
  revision_key text NOT NULL CHECK (
    char_length(revision_key) BETWEEN 1 AND 128
    AND revision_key ~ '^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
  ),
  target_ref text,
  workflow_ref text,
  plan_ref text,
  step_ref text,
  campaign_ref text,
  experiment_ref text,
  customer_ref text,
  result_label text CHECK (result_label IS NULL OR result_label IN (
    'approved', 'enqueued', 'eligible', 'ineligible', 'delivered', 'read',
    'purchase', 'renew', 'refund', 'cancel', 'fail', 'success', 'no_action',
    'assigned', 'consented', 'declined'
  )),
  value_minor bigint CHECK (value_minor IS NULL OR value_minor BETWEEN 0 AND 9007199254740991),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (public.lm_commerce_reference_metadata_valid(metadata)),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  CONSTRAINT lm_commerce_events_idempotency UNIQUE (
    uid, merchant_ref, idempotency_key, revision_key
  ),
  CONSTRAINT lm_commerce_events_value_pair CHECK (
    (value_minor IS NULL AND currency IS NULL)
    OR (value_minor IS NOT NULL AND currency IS NOT NULL
        AND result_label IN ('purchase', 'renew', 'refund'))
  ),
  CONSTRAINT lm_commerce_events_target_ref CHECK (
    target_ref IS NULL OR (
      target_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/target/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
      AND starts_with(target_ref, merchant_ref || '/target/')
    )
  ),
  CONSTRAINT lm_commerce_events_workflow_ref CHECK (
    workflow_ref IS NULL OR (
      workflow_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/workflow/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
      AND starts_with(workflow_ref, merchant_ref || '/workflow/')
    )
  ),
  CONSTRAINT lm_commerce_events_plan_ref CHECK (
    plan_ref IS NULL OR (
      plan_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/plan/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
      AND starts_with(plan_ref, merchant_ref || '/plan/')
    )
  ),
  CONSTRAINT lm_commerce_events_step_ref CHECK (
    step_ref IS NULL OR (
      step_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/step/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
      AND starts_with(step_ref, merchant_ref || '/step/')
    )
  ),
  CONSTRAINT lm_commerce_events_campaign_ref CHECK (
    campaign_ref IS NULL OR (
      campaign_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/campaign/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
      AND starts_with(campaign_ref, merchant_ref || '/campaign/')
    )
  ),
  CONSTRAINT lm_commerce_events_experiment_ref CHECK (
    experiment_ref IS NULL OR (
      experiment_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/experiment/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
      AND starts_with(experiment_ref, merchant_ref || '/experiment/')
    )
  ),
  CONSTRAINT lm_commerce_events_customer_ref CHECK (
    customer_ref IS NULL OR (
      customer_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/customer/psn_[A-Za-z0-9][A-Za-z0-9._~-]{0,119}$'
      AND starts_with(customer_ref, merchant_ref || '/customer/psn_')
    )
  ),
  CONSTRAINT lm_commerce_events_kind_refs CHECK (
    (event_kind IN ('decision_proposed', 'decision_approved')
      AND target_ref IS NOT NULL AND workflow_ref IS NOT NULL AND plan_ref IS NOT NULL)
    OR (event_kind = 'action_enqueued'
      AND target_ref IS NOT NULL AND workflow_ref IS NOT NULL
      AND plan_ref IS NOT NULL AND step_ref IS NOT NULL)
    OR (event_kind IN ('exposure_eligible', 'exposure_delivered', 'provider_readback')
      AND target_ref IS NOT NULL AND campaign_ref IS NOT NULL AND customer_ref IS NOT NULL)
    OR (event_kind = 'outcome_observed'
      AND target_ref IS NOT NULL AND customer_ref IS NOT NULL AND result_label IS NOT NULL)
    OR (event_kind = 'experiment_assignment'
      AND target_ref IS NOT NULL AND experiment_ref IS NOT NULL AND customer_ref IS NOT NULL)
    OR (event_kind = 'consent_recorded' AND customer_ref IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS lm_commerce_events_tenant_time_idx
  ON public.lm_commerce_events (uid, merchant_ref, occurred_at DESC, event_id);
CREATE INDEX IF NOT EXISTS lm_commerce_events_workflow_idx
  ON public.lm_commerce_events (uid, merchant_ref, workflow_ref, occurred_at)
  WHERE workflow_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS lm_commerce_events_customer_idx
  ON public.lm_commerce_events (uid, merchant_ref, customer_ref, occurred_at)
  WHERE customer_ref IS NOT NULL;

ALTER TABLE public.lm_commerce_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'lm_commerce_events'
       AND policyname = 'lm_commerce_events_service_select'
  ) THEN
    CREATE POLICY lm_commerce_events_service_select
      ON public.lm_commerce_events FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'lm_commerce_events'
       AND policyname = 'lm_commerce_events_service_insert'
  ) THEN
    CREATE POLICY lm_commerce_events_service_insert
      ON public.lm_commerce_events FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.lm_commerce_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.lm_commerce_events TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lm_commerce_events FROM service_role;

CREATE OR REPLACE FUNCTION public.reject_lm_commerce_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'lm_commerce_events is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS lm_commerce_events_append_only ON public.lm_commerce_events;
CREATE TRIGGER lm_commerce_events_append_only
BEFORE UPDATE OR DELETE ON public.lm_commerce_events
FOR EACH ROW EXECUTE FUNCTION public.reject_lm_commerce_events_mutation();

CREATE OR REPLACE FUNCTION public.lm_append_commerce_event(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
  v_payload_hash bytea;
  v_row public.lm_commerce_events%ROWTYPE;
  v_created boolean;
  v_value_minor bigint;
  v_occurred_at timestamptz;
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_commerce_event';
  END IF;
  IF p_event - ARRAY[
    'uid', 'merchant_ref', 'event_kind', 'reason_code', 'occurred_at',
    'idempotency_key', 'revision_key', 'target_ref', 'workflow_ref', 'plan_ref',
    'step_ref', 'campaign_ref', 'experiment_ref', 'customer_ref', 'result_label',
    'value_minor', 'currency', 'metadata'
  ] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_commerce_event_fields';
  END IF;

  v_value_minor := CASE WHEN p_event->'value_minor' IS NULL
    OR p_event->'value_minor' = 'null'::jsonb THEN NULL
    ELSE (p_event->>'value_minor')::bigint END;
  v_occurred_at := (p_event->>'occurred_at')::timestamptz;
  IF v_occurred_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'commerce_event_time_in_future';
  END IF;

  v_payload := jsonb_build_object(
    'uid', p_event->>'uid',
    'merchant_ref', p_event->>'merchant_ref',
    'event_kind', p_event->>'event_kind',
    'reason_code', p_event->>'reason_code',
    'occurred_at', to_char(v_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'idempotency_key', p_event->>'idempotency_key',
    'revision_key', p_event->>'revision_key',
    'target_ref', p_event->>'target_ref',
    'workflow_ref', p_event->>'workflow_ref',
    'plan_ref', p_event->>'plan_ref',
    'step_ref', p_event->>'step_ref',
    'campaign_ref', p_event->>'campaign_ref',
    'experiment_ref', p_event->>'experiment_ref',
    'customer_ref', p_event->>'customer_ref',
    'result_label', p_event->>'result_label',
    'value_minor', v_value_minor,
    'currency', p_event->>'currency',
    'metadata', COALESCE(p_event->'metadata', '{}'::jsonb)
  );
  v_payload_hash := digest(convert_to(v_payload::text, 'UTF8'), 'sha256');

  INSERT INTO public.lm_commerce_events (
    uid, merchant_ref, event_kind, reason_code, occurred_at,
    idempotency_key, revision_key, target_ref, workflow_ref, plan_ref, step_ref,
    campaign_ref, experiment_ref, customer_ref, result_label, value_minor,
    currency, metadata, payload_hash
  ) VALUES (
    p_event->>'uid', p_event->>'merchant_ref', p_event->>'event_kind',
    p_event->>'reason_code', v_occurred_at, p_event->>'idempotency_key',
    p_event->>'revision_key', p_event->>'target_ref', p_event->>'workflow_ref',
    p_event->>'plan_ref', p_event->>'step_ref', p_event->>'campaign_ref',
    p_event->>'experiment_ref', p_event->>'customer_ref', p_event->>'result_label',
    v_value_minor, p_event->>'currency', COALESCE(p_event->'metadata', '{}'::jsonb),
    v_payload_hash
  )
  ON CONFLICT (uid, merchant_ref, idempotency_key, revision_key) DO NOTHING
  RETURNING * INTO v_row;

  v_created := FOUND;
  IF NOT v_created THEN
    SELECT event.* INTO STRICT v_row
      FROM public.lm_commerce_events AS event
     WHERE event.uid = p_event->>'uid'
       AND event.merchant_ref = p_event->>'merchant_ref'
       AND event.idempotency_key = p_event->>'idempotency_key'
       AND event.revision_key = p_event->>'revision_key';
    IF v_row.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_collision';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'created', v_created,
    'event', to_jsonb(v_row) - 'payload_hash'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lm_commerce_reference_metadata_valid(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_lm_commerce_events_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_append_commerce_event(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_append_commerce_event(jsonb) TO service_role;
