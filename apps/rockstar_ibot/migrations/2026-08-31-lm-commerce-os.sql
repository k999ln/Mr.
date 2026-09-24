-- Mr. Commerce: tenant-scoped product, job, order, customer and setting records.
-- External effects remain queued until a separately authorized adapter returns a receipt.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.lm_commerce_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'product', 'job', 'workflow', 'order', 'customer', 'setting'
  )),
  status text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lm_commerce_objects_uid_kind_created_idx
  ON public.lm_commerce_objects (uid, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS lm_commerce_objects_uid_status_idx
  ON public.lm_commerce_objects (uid, status);

ALTER TABLE public.lm_commerce_objects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lm_commerce_objects FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.lm_commerce_objects TO service_role;

COMMENT ON TABLE public.lm_commerce_objects IS
  'Tenant-scoped Mr. Commerce objects. queued means authorized for an adapter, never provider-completed.';

-- Reuse the Rockstar_ibot queue, but make the latest tenant-scoped Commerce pause setting an
-- execution boundary. Already-running provider calls still reconcile normally; queued Commerce
-- jobs remain durable and become claimable again only after the tenant resumes.
CREATE OR REPLACE FUNCTION public.claim_lm_runtime_jobs(
  p_worker_id text,
  p_capabilities text[],
  p_tenant_id text DEFAULT NULL,
  p_limit integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 180
) RETURNS SETOF public.lm_runtime_jobs
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_worker_id IS NULL OR char_length(p_worker_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'runtime worker id invalid';
  END IF;
  IF p_capabilities IS NULL OR cardinality(p_capabilities) < 1 THEN
    RAISE EXCEPTION 'runtime capabilities invalid';
  END IF;
  IF p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'runtime claim limit invalid';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'runtime lease invalid';
  END IF;

  UPDATE public.lm_runtime_jobs
  SET status = 'reconciling',
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = 'LEASE_EXPIRED_EFFECT_UNKNOWN',
      updated_at = clock_timestamp()
  WHERE status = 'running'
    AND lease_expires_at <= clock_timestamp()
    AND effect_class IN ('publish', 'message', 'money')
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.job_id
    FROM public.lm_runtime_jobs AS jobs
    WHERE jobs.capability = ANY (p_capabilities)
      AND (p_tenant_id IS NULL OR jobs.tenant_id = p_tenant_id)
      AND jobs.available_at <= clock_timestamp()
      AND jobs.attempt < jobs.max_attempts
      AND (
        jobs.loop_id NOT LIKE 'commerce.workflow.%'
        OR EXISTS (
          SELECT 1
          FROM public.lm_commerce_objects AS workflow
          WHERE workflow.uid = jobs.tenant_id
            AND workflow.kind = 'workflow'
            AND workflow.id::text = regexp_replace(
              jobs.input_refs->>'workflow_ref',
              '^commerce-object://workflow/',
              ''
            )
            AND workflow.status = 'queued'
            AND workflow.data->>'approvalRef' = jobs.input_refs->>'approval_ref'
        )
      )
      AND NOT (
        jobs.loop_id LIKE 'commerce.workflow.%'
        AND COALESCE((
          SELECT (settings.data->>'paused') = 'true'
          FROM public.lm_commerce_objects AS settings
          WHERE settings.uid = jobs.tenant_id
            AND settings.kind = 'setting'
          ORDER BY settings.created_at DESC, settings.id DESC
          LIMIT 1
        ), false)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(jobs.input_refs->'dependency_job_refs', '[]'::jsonb)
        ) AS dependency(ref)
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.lm_runtime_jobs AS predecessor
          WHERE predecessor.tenant_id = jobs.tenant_id
            AND predecessor.job_id = regexp_replace(
              dependency.ref,
              '^runtime-job://',
              ''
            )
            AND predecessor.status = 'completed'
        )
      )
      AND (
        jobs.status = 'queued'
        OR (
          jobs.status = 'running'
          AND jobs.effect_class = 'none'
          AND jobs.lease_expires_at <= clock_timestamp()
        )
      )
    ORDER BY jobs.available_at, jobs.created_at, jobs.job_id
    FOR UPDATE OF jobs SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.lm_runtime_jobs AS jobs
  SET status = 'running',
      attempt = jobs.attempt + 1,
      lease_owner = p_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_error_code = NULL,
      updated_at = clock_timestamp()
  FROM candidates
  WHERE jobs.job_id = candidates.job_id
    AND jobs.attempt < jobs.max_attempts
  RETURNING jobs.*;
END
$$;
