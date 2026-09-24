-- Revenue assurance: immutable offer/promise versions, immutable provider observations,
-- and a durable merchant-scoped webhook inbox. Raw webhook bodies, customer identity,
-- and credentials are deliberately not stored here; evidence is an exact immutable ref.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.lm_commerce_assurance_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TABLE IF NOT EXISTS public.lm_commerce_offer_versions (
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (
    merchant_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
  ),
  offer_version_ref text NOT NULL,
  offer_ref text NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
  price_minor bigint NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  terms_ref text NOT NULL CHECK (
    terms_ref ~ '^artifact://[A-Za-z0-9][A-Za-z0-9._~:/+-]{0,470}/sha256/[0-9a-f]{64}$'
  ),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz NOT NULL CHECK (effective_at >= TIMESTAMPTZ '2000-01-01 00:00:00+00'),
  supersedes_offer_version_ref text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  PRIMARY KEY (uid, merchant_ref, offer_version_ref),
  UNIQUE (uid, merchant_ref, offer_ref, version),
  CONSTRAINT lm_commerce_offer_supersedes_fk
    FOREIGN KEY (uid, merchant_ref, supersedes_offer_version_ref)
    REFERENCES public.lm_commerce_offer_versions(uid, merchant_ref, offer_version_ref)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK (offer_ref = merchant_ref || '/offer/' || split_part(offer_ref, '/offer/', 2)),
  CHECK (offer_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/offer/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'),
  CHECK (starts_with(offer_ref, merchant_ref || '/offer/')),
  CHECK (offer_version_ref = offer_ref || '/version/' || version::text),
  CHECK (supersedes_offer_version_ref IS NULL OR (
    starts_with(supersedes_offer_version_ref, offer_ref || '/version/')
    AND supersedes_offer_version_ref <> offer_version_ref
  ))
);

CREATE TABLE IF NOT EXISTS public.lm_commerce_promise_versions (
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (
    merchant_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
  ),
  promise_version_ref text NOT NULL,
  promise_ref text NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
  offer_version_ref text NOT NULL,
  promise_type text NOT NULL CHECK (promise_type IN (
    'delivery', 'access', 'entitlement', 'refund_policy', 'support', 'service_level'
  )),
  specification_ref text NOT NULL CHECK (
    specification_ref ~ '^artifact://[A-Za-z0-9][A-Za-z0-9._~:/+-]{0,470}/sha256/[0-9a-f]{64}$'
  ),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz NOT NULL CHECK (effective_at >= TIMESTAMPTZ '2000-01-01 00:00:00+00'),
  supersedes_promise_version_ref text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  PRIMARY KEY (uid, merchant_ref, promise_version_ref),
  UNIQUE (uid, merchant_ref, promise_ref, version),
  FOREIGN KEY (uid, merchant_ref, offer_version_ref)
    REFERENCES public.lm_commerce_offer_versions(uid, merchant_ref, offer_version_ref)
    ON DELETE RESTRICT,
  CONSTRAINT lm_commerce_promise_supersedes_fk
    FOREIGN KEY (uid, merchant_ref, supersedes_promise_version_ref)
    REFERENCES public.lm_commerce_promise_versions(uid, merchant_ref, promise_version_ref)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK (promise_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/promise/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'),
  CHECK (starts_with(promise_ref, merchant_ref || '/promise/')),
  CHECK (promise_version_ref = promise_ref || '/version/' || version::text),
  CHECK (supersedes_promise_version_ref IS NULL OR (
    starts_with(supersedes_promise_version_ref, promise_ref || '/version/')
    AND supersedes_promise_version_ref <> promise_version_ref
  ))
);

-- CREATE TABLE IF NOT EXISTS does not upgrade a table created by an earlier draft.
-- Add the lineage constraints explicitly so reruns converge as well as fresh installs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.lm_commerce_offer_versions'::regclass
       AND conname = 'lm_commerce_offer_supersedes_fk'
  ) THEN
    ALTER TABLE public.lm_commerce_offer_versions
      ADD CONSTRAINT lm_commerce_offer_supersedes_fk
      FOREIGN KEY (uid, merchant_ref, supersedes_offer_version_ref)
      REFERENCES public.lm_commerce_offer_versions(uid, merchant_ref, offer_version_ref)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.lm_commerce_promise_versions'::regclass
       AND conname = 'lm_commerce_promise_supersedes_fk'
  ) THEN
    ALTER TABLE public.lm_commerce_promise_versions
      ADD CONSTRAINT lm_commerce_promise_supersedes_fk
      FOREIGN KEY (uid, merchant_ref, supersedes_promise_version_ref)
      REFERENCES public.lm_commerce_promise_versions(uid, merchant_ref, promise_version_ref)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lm_commerce_webhook_inbox (
  inbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (
    merchant_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
  ),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{0,31}$'),
  provider_account_id text NOT NULL CHECK (
    provider_account_id ~ '^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$'
  ),
  provider_event_id text NOT NULL CHECK (
    provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$'
  ),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_ref text NOT NULL CHECK (
    evidence_ref ~ '^provider://[a-z][a-z0-9_-]{0,31}/[A-Za-z0-9._~:/+-]{1,900}/sha256/[0-9a-f]{64}$'
  ),
  state text NOT NULL DEFAULT 'received' CHECK (
    state IN ('received', 'processing', 'completed', 'failed')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1000000),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  completion_lease_token uuid,
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (uid, merchant_ref, provider, provider_account_id, provider_event_id),
  CHECK (evidence_ref = 'provider://' || provider || '/accounts/' || provider_account_id
    || '/events/' || provider_event_id || '/sha256/' || payload_sha256),
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

ALTER TABLE public.lm_commerce_webhook_inbox
  ADD COLUMN IF NOT EXISTS completion_lease_token uuid;

CREATE TABLE IF NOT EXISTS public.lm_commerce_observations (
  observation_ref text NOT NULL,
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE RESTRICT,
  merchant_ref text NOT NULL CHECK (
    merchant_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
  ),
  observation_type text NOT NULL CHECK (observation_type IN (
    'order', 'payment', 'refund', 'chargeback'
  )),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 0 AND 9007199254740991),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{0,31}$'),
  provider_account_id text NOT NULL CHECK (
    provider_account_id ~ '^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$'
  ),
  provider_event_id text NOT NULL CHECK (
    provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$'
  ),
  provider_payment_id text,
  reverses_observation_ref text,
  observed_at timestamptz NOT NULL CHECK (observed_at >= TIMESTAMPTZ '2000-01-01 00:00:00+00'),
  ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  offer_version_ref text NOT NULL,
  promise_version_ref text NOT NULL,
  inbox_id uuid NOT NULL,
  evidence_ref text NOT NULL CHECK (
    evidence_ref ~ '^provider://[a-z][a-z0-9_-]{0,31}/[A-Za-z0-9._~:/+-]{1,900}/sha256/[0-9a-f]{64}$'
  ),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  PRIMARY KEY (uid, merchant_ref, observation_ref),
  UNIQUE (uid, merchant_ref, provider, provider_account_id, provider_event_id, observation_type),
  UNIQUE (uid, merchant_ref, inbox_id, observation_type),
  FOREIGN KEY (uid, merchant_ref, offer_version_ref)
    REFERENCES public.lm_commerce_offer_versions(uid, merchant_ref, offer_version_ref)
    ON DELETE RESTRICT,
  FOREIGN KEY (uid, merchant_ref, promise_version_ref)
    REFERENCES public.lm_commerce_promise_versions(uid, merchant_ref, promise_version_ref)
    ON DELETE RESTRICT,
  FOREIGN KEY (inbox_id) REFERENCES public.lm_commerce_webhook_inbox(inbox_id) ON DELETE RESTRICT,
  FOREIGN KEY (uid, merchant_ref, reverses_observation_ref)
    REFERENCES public.lm_commerce_observations(uid, merchant_ref, observation_ref)
    ON DELETE RESTRICT,
  CHECK (observation_ref ~ '^commerce://merchant/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}/observation/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'),
  CHECK (starts_with(observation_ref, merchant_ref || '/observation/')),
  CHECK (provider_payment_id IS NULL OR provider_payment_id ~ '^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$'),
  CHECK ((observation_type = 'order') OR provider_payment_id IS NOT NULL),
  CHECK ((observation_type IN ('refund', 'chargeback')) = (reverses_observation_ref IS NOT NULL)),
  CHECK (starts_with(evidence_ref, 'provider://' || provider || '/accounts/'
    || provider_account_id || '/events/' || provider_event_id || '/sha256/'))
);

CREATE INDEX IF NOT EXISTS lm_commerce_offer_versions_lookup_idx
  ON public.lm_commerce_offer_versions (uid, merchant_ref, offer_ref, version DESC);
CREATE INDEX IF NOT EXISTS lm_commerce_promise_versions_lookup_idx
  ON public.lm_commerce_promise_versions (uid, merchant_ref, offer_version_ref, promise_ref, version DESC);
CREATE INDEX IF NOT EXISTS lm_commerce_observations_provider_payment_idx
  ON public.lm_commerce_observations
  (uid, merchant_ref, provider, provider_account_id, provider_payment_id, observed_at DESC)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lm_commerce_observations_reversal_idx
  ON public.lm_commerce_observations (uid, merchant_ref, reverses_observation_ref)
  WHERE reverses_observation_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS lm_commerce_observations_offer_promise_idx
  ON public.lm_commerce_observations
  (uid, merchant_ref, offer_version_ref, promise_version_ref, observed_at DESC);
CREATE INDEX IF NOT EXISTS lm_commerce_webhook_claim_idx
  ON public.lm_commerce_webhook_inbox (available_at, received_at, inbox_id)
  WHERE state IN ('received', 'failed');
CREATE INDEX IF NOT EXISTS lm_commerce_webhook_recovery_idx
  ON public.lm_commerce_webhook_inbox (lease_expires_at)
  WHERE state = 'processing';

ALTER TABLE public.lm_commerce_offer_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_commerce_promise_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_commerce_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lm_commerce_webhook_inbox ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'lm_commerce_offer_versions', 'lm_commerce_promise_versions',
    'lm_commerce_observations', 'lm_commerce_webhook_inbox'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_service_select', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO service_role USING (true)',
      v_table || '_service_select', v_table
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', v_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', v_table);
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM service_role',
      v_table
    );
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS lm_commerce_offer_versions_immutable ON public.lm_commerce_offer_versions;
CREATE TRIGGER lm_commerce_offer_versions_immutable
BEFORE UPDATE OR DELETE ON public.lm_commerce_offer_versions
FOR EACH ROW EXECUTE FUNCTION public.lm_commerce_assurance_immutable();
DROP TRIGGER IF EXISTS lm_commerce_promise_versions_immutable ON public.lm_commerce_promise_versions;
CREATE TRIGGER lm_commerce_promise_versions_immutable
BEFORE UPDATE OR DELETE ON public.lm_commerce_promise_versions
FOR EACH ROW EXECUTE FUNCTION public.lm_commerce_assurance_immutable();
DROP TRIGGER IF EXISTS lm_commerce_observations_immutable ON public.lm_commerce_observations;
CREATE TRIGGER lm_commerce_observations_immutable
BEFORE UPDATE OR DELETE ON public.lm_commerce_observations
FOR EACH ROW EXECUTE FUNCTION public.lm_commerce_assurance_immutable();

CREATE OR REPLACE FUNCTION public.lm_put_commerce_offer_version(p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.lm_commerce_offer_versions%ROWTYPE; v_hash bytea; v_created boolean;
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object'
     OR p_record - ARRAY['uid','merchant_ref','offer_version_ref','offer_ref','version','price_minor','currency','terms_ref','content_sha256','effective_at','supersedes_offer_version_ref'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_offer_version';
  END IF;
  IF p_record->>'supersedes_offer_version_ref' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lm_commerce_offer_versions prior
     WHERE prior.uid = p_record->>'uid'
       AND prior.merchant_ref = p_record->>'merchant_ref'
       AND prior.offer_version_ref = p_record->>'supersedes_offer_version_ref'
       AND prior.offer_ref = p_record->>'offer_ref'
       AND prior.version < (p_record->>'version')::integer
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_supersedes_offer_version_ref';
  END IF;
  v_hash := digest(convert_to(p_record::text, 'UTF8'), 'sha256');
  INSERT INTO public.lm_commerce_offer_versions (
    uid, merchant_ref, offer_version_ref, offer_ref, version, price_minor, currency,
    terms_ref, content_sha256, effective_at, supersedes_offer_version_ref, payload_hash
  ) VALUES (
    p_record->>'uid', p_record->>'merchant_ref', p_record->>'offer_version_ref',
    p_record->>'offer_ref', (p_record->>'version')::integer, (p_record->>'price_minor')::bigint,
    p_record->>'currency', p_record->>'terms_ref', p_record->>'content_sha256',
    (p_record->>'effective_at')::timestamptz, p_record->>'supersedes_offer_version_ref', v_hash
  ) ON CONFLICT (uid, merchant_ref, offer_version_ref) DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT offer.* INTO STRICT v_row FROM public.lm_commerce_offer_versions offer
     WHERE offer.uid = p_record->>'uid' AND offer.merchant_ref = p_record->>'merchant_ref'
       AND offer.offer_version_ref = p_record->>'offer_version_ref';
    IF v_row.payload_hash <> v_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'offer_version_collision';
    END IF;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'record', to_jsonb(v_row) - 'payload_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_put_commerce_promise_version(p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.lm_commerce_promise_versions%ROWTYPE; v_hash bytea; v_created boolean;
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object'
     OR p_record - ARRAY['uid','merchant_ref','promise_version_ref','promise_ref','version','offer_version_ref','promise_type','specification_ref','content_sha256','effective_at','supersedes_promise_version_ref'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_promise_version';
  END IF;
  IF p_record->>'supersedes_promise_version_ref' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lm_commerce_promise_versions prior
     WHERE prior.uid = p_record->>'uid'
       AND prior.merchant_ref = p_record->>'merchant_ref'
       AND prior.promise_version_ref = p_record->>'supersedes_promise_version_ref'
       AND prior.promise_ref = p_record->>'promise_ref'
       AND prior.version < (p_record->>'version')::integer
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_supersedes_promise_version_ref';
  END IF;
  v_hash := digest(convert_to(p_record::text, 'UTF8'), 'sha256');
  INSERT INTO public.lm_commerce_promise_versions (
    uid, merchant_ref, promise_version_ref, promise_ref, version, offer_version_ref,
    promise_type, specification_ref, content_sha256, effective_at,
    supersedes_promise_version_ref, payload_hash
  ) VALUES (
    p_record->>'uid', p_record->>'merchant_ref', p_record->>'promise_version_ref',
    p_record->>'promise_ref', (p_record->>'version')::integer, p_record->>'offer_version_ref',
    p_record->>'promise_type', p_record->>'specification_ref', p_record->>'content_sha256',
    (p_record->>'effective_at')::timestamptz, p_record->>'supersedes_promise_version_ref', v_hash
  ) ON CONFLICT (uid, merchant_ref, promise_version_ref) DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT promise.* INTO STRICT v_row FROM public.lm_commerce_promise_versions promise
     WHERE promise.uid = p_record->>'uid' AND promise.merchant_ref = p_record->>'merchant_ref'
       AND promise.promise_version_ref = p_record->>'promise_version_ref';
    IF v_row.payload_hash <> v_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promise_version_collision';
    END IF;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'record', to_jsonb(v_row) - 'payload_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_receive_commerce_webhook(p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.lm_commerce_webhook_inbox%ROWTYPE; v_created boolean;
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object'
     OR p_record - ARRAY['uid','merchant_ref','provider','provider_account_id','provider_event_id','payload_sha256','evidence_ref','received_at'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_webhook_envelope';
  END IF;
  INSERT INTO public.lm_commerce_webhook_inbox (
    uid, merchant_ref, provider, provider_account_id, provider_event_id,
    payload_sha256, evidence_ref, received_at
  ) VALUES (
    p_record->>'uid', p_record->>'merchant_ref', p_record->>'provider',
    p_record->>'provider_account_id', p_record->>'provider_event_id',
    p_record->>'payload_sha256', p_record->>'evidence_ref',
    COALESCE((p_record->>'received_at')::timestamptz, clock_timestamp())
  ) ON CONFLICT (uid, merchant_ref, provider, provider_account_id, provider_event_id)
    DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT inbox.* INTO STRICT v_row FROM public.lm_commerce_webhook_inbox inbox
     WHERE inbox.uid = p_record->>'uid' AND inbox.merchant_ref = p_record->>'merchant_ref'
       AND inbox.provider = p_record->>'provider'
       AND inbox.provider_account_id = p_record->>'provider_account_id'
       AND inbox.provider_event_id = p_record->>'provider_event_id';
    IF v_row.payload_sha256 <> p_record->>'payload_sha256'
       OR v_row.evidence_ref <> p_record->>'evidence_ref' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_event_collision';
    END IF;
  END IF;
  RETURN jsonb_build_object('created', v_created, 'inbox', to_jsonb(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_claim_commerce_webhooks(
  p_uid text, p_merchant_ref text, p_worker_id text, p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
) RETURNS SETOF public.lm_commerce_webhook_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_uid IS NULL OR p_merchant_ref IS NULL OR p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'
     OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_webhook_claim';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT inbox_id FROM public.lm_commerce_webhook_inbox
     WHERE uid = p_uid AND merchant_ref = p_merchant_ref
       AND ((state IN ('received','failed') AND available_at <= clock_timestamp())
         OR (state = 'processing' AND lease_expires_at <= clock_timestamp()))
     ORDER BY available_at, received_at, inbox_id
     FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.lm_commerce_webhook_inbox inbox
     SET state = 'processing', attempt_count = inbox.attempt_count + 1,
         lease_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
         completion_lease_token = NULL,
         processing_started_at = clock_timestamp(), last_error_code = NULL,
         updated_at = clock_timestamp()
    FROM candidates WHERE inbox.inbox_id = candidates.inbox_id RETURNING inbox.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.lm_finish_commerce_webhook(
  p_uid text, p_merchant_ref text, p_inbox_id uuid, p_lease_token uuid,
  p_succeeded boolean, p_error_code text DEFAULT NULL, p_retry_seconds integer DEFAULT 60
) RETURNS public.lm_commerce_webhook_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.lm_commerce_webhook_inbox%ROWTYPE;
BEGIN
  IF p_succeeded IS NULL OR (NOT p_succeeded AND (p_error_code IS NULL
      OR p_error_code !~ '^[a-z][a-z0-9_]{0,63}$'))
      OR p_retry_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_webhook_result';
  END IF;
  UPDATE public.lm_commerce_webhook_inbox
     SET state = CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
         completed_at = CASE WHEN p_succeeded THEN clock_timestamp() ELSE completed_at END,
         failed_at = CASE WHEN p_succeeded THEN failed_at ELSE clock_timestamp() END,
         last_error_code = CASE WHEN p_succeeded THEN NULL ELSE p_error_code END,
         available_at = CASE WHEN p_succeeded THEN available_at
           ELSE clock_timestamp() + make_interval(secs => p_retry_seconds) END,
         completion_lease_token = CASE WHEN p_succeeded THEN p_lease_token ELSE NULL END,
         lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE uid = p_uid AND merchant_ref = p_merchant_ref AND inbox_id = p_inbox_id
     AND state = 'processing' AND lease_token = p_lease_token
     AND lease_expires_at > clock_timestamp()
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_lease_mismatch';
  END IF;
  RETURN v_row;
END;
$$;

-- Remove the pre-fencing overload so it cannot remain an authorization bypass on a rerun.
DROP FUNCTION IF EXISTS public.lm_append_commerce_observation(jsonb);
CREATE OR REPLACE FUNCTION public.lm_append_commerce_observation(p_record jsonb, p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.lm_commerce_observations%ROWTYPE;
  v_original public.lm_commerce_observations%ROWTYPE;
  v_inbox public.lm_commerce_webhook_inbox%ROWTYPE;
  v_hash bytea;
  v_created boolean;
  v_reversed_minor numeric;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_record IS NULL OR p_lease_token IS NULL OR jsonb_typeof(p_record) <> 'object'
     OR p_record - ARRAY['observation_ref','uid','merchant_ref','observation_type','amount_minor','currency','provider','provider_account_id','provider_event_id','provider_payment_id','reverses_observation_ref','observed_at','offer_version_ref','promise_version_ref','inbox_id','evidence_ref'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_commerce_observation';
  END IF;
  v_hash := digest(convert_to(p_record::text, 'UTF8'), 'sha256');
  SELECT * INTO v_inbox FROM public.lm_commerce_webhook_inbox
   WHERE inbox_id = (p_record->>'inbox_id')::uuid AND uid = p_record->>'uid'
     AND merchant_ref = p_record->>'merchant_ref' AND provider = p_record->>'provider'
     AND provider_account_id = p_record->>'provider_account_id'
     AND provider_event_id = p_record->>'provider_event_id'
     AND evidence_ref = p_record->>'evidence_ref'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_lease_mismatch';
  END IF;

  -- Exact completed retries are read-only and preserve the original idempotent result.
  SELECT observation.* INTO v_row FROM public.lm_commerce_observations observation
   WHERE observation.uid = p_record->>'uid' AND observation.merchant_ref = p_record->>'merchant_ref'
     AND observation.provider = p_record->>'provider'
     AND observation.provider_account_id = p_record->>'provider_account_id'
     AND observation.provider_event_id = p_record->>'provider_event_id'
     AND observation.observation_type = p_record->>'observation_type';
  IF FOUND THEN
    IF NOT ((v_inbox.state = 'processing' AND v_inbox.lease_token = p_lease_token
             AND v_inbox.lease_expires_at > v_now)
        OR (v_inbox.state = 'completed' AND v_inbox.completion_lease_token = p_lease_token
            AND v_row.inbox_id = v_inbox.inbox_id)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_lease_mismatch';
    END IF;
    IF v_row.payload_hash <> v_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'observation_collision';
    END IF;
    RETURN jsonb_build_object('created', false, 'observation', to_jsonb(v_row) - 'payload_hash');
  END IF;

  IF v_inbox.state <> 'processing' OR v_inbox.lease_token <> p_lease_token
     OR v_inbox.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_lease_mismatch';
  END IF;

  IF p_record->>'observation_type' IN ('refund', 'chargeback') THEN
    SELECT original.* INTO v_original FROM public.lm_commerce_observations original
     WHERE original.uid = p_record->>'uid'
       AND original.merchant_ref = p_record->>'merchant_ref'
       AND original.observation_ref = p_record->>'reverses_observation_ref'
     FOR UPDATE;
    IF NOT FOUND OR v_original.observation_type <> 'payment'
       OR v_original.provider <> p_record->>'provider'
       OR v_original.provider_account_id <> p_record->>'provider_account_id'
       OR v_original.provider_payment_id <> p_record->>'provider_payment_id'
       OR v_original.currency <> p_record->>'currency' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_payment_reversal';
    END IF;
    -- Refunds and chargebacks consume the same budget; each observation counts once.
    SELECT COALESCE(sum(reversal.amount_minor), 0) INTO v_reversed_minor
      FROM public.lm_commerce_observations reversal
     WHERE reversal.uid = v_original.uid
       AND reversal.merchant_ref = v_original.merchant_ref
       AND reversal.reverses_observation_ref = v_original.observation_ref
       AND reversal.observation_type IN ('refund', 'chargeback');
    IF v_reversed_minor + (p_record->>'amount_minor')::bigint > v_original.amount_minor THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'payment_reversal_exceeded';
    END IF;
  END IF;

  INSERT INTO public.lm_commerce_observations (
    observation_ref, uid, merchant_ref, observation_type, amount_minor, currency,
    provider, provider_account_id, provider_event_id, provider_payment_id,
    reverses_observation_ref, observed_at, offer_version_ref, promise_version_ref,
    inbox_id, evidence_ref, payload_hash
  ) VALUES (
    p_record->>'observation_ref', p_record->>'uid', p_record->>'merchant_ref',
    p_record->>'observation_type', (p_record->>'amount_minor')::bigint, p_record->>'currency',
    p_record->>'provider', p_record->>'provider_account_id', p_record->>'provider_event_id',
    p_record->>'provider_payment_id', p_record->>'reverses_observation_ref',
    (p_record->>'observed_at')::timestamptz, p_record->>'offer_version_ref',
    p_record->>'promise_version_ref', (p_record->>'inbox_id')::uuid,
    p_record->>'evidence_ref', v_hash
  ) ON CONFLICT (uid, merchant_ref, provider, provider_account_id, provider_event_id, observation_type)
    DO NOTHING RETURNING * INTO v_row;
  v_created := FOUND;
  IF NOT v_created THEN
    SELECT observation.* INTO STRICT v_row FROM public.lm_commerce_observations observation
     WHERE observation.uid = p_record->>'uid' AND observation.merchant_ref = p_record->>'merchant_ref'
       AND observation.provider = p_record->>'provider'
       AND observation.provider_account_id = p_record->>'provider_account_id'
       AND observation.provider_event_id = p_record->>'provider_event_id'
       AND observation.observation_type = p_record->>'observation_type';
    IF v_row.payload_hash <> v_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'observation_collision';
    END IF;
  END IF;
  UPDATE public.lm_commerce_webhook_inbox
     SET state = 'completed', completed_at = clock_timestamp(), last_error_code = NULL,
         completion_lease_token = p_lease_token,
         lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE inbox_id = v_inbox.inbox_id AND state = 'processing'
     AND lease_token = p_lease_token AND lease_expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_lease_mismatch';
  END IF;
  RETURN jsonb_build_object('created', v_created, 'observation', to_jsonb(v_row) - 'payload_hash');
END;
$$;

REVOKE ALL ON FUNCTION public.lm_commerce_assurance_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_put_commerce_offer_version(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_put_commerce_promise_version(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_receive_commerce_webhook(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_claim_commerce_webhooks(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_finish_commerce_webhook(text,text,uuid,uuid,boolean,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_append_commerce_observation(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_put_commerce_offer_version(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_put_commerce_promise_version(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_receive_commerce_webhook(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_claim_commerce_webhooks(text,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_finish_commerce_webhook(text,text,uuid,uuid,boolean,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_append_commerce_observation(jsonb,uuid) TO service_role;
