-- CODEX-BRIDGE-1: private durable queue between the owner's Telegram bot and the owner's
-- local Codex session. The table is service-role-only and is not a public user data API.

CREATE TABLE IF NOT EXISTS public.lm_codex_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text,
  telegram_chat_id text NOT NULL CHECK (char_length(telegram_chat_id) BETWEEN 1 AND 100),
  telegram_user_id text NOT NULL CHECK (char_length(telegram_user_id) BETWEEN 1 AND 100),
  telegram_message_id text NOT NULL CHECK (char_length(telegram_message_id) BETWEEN 1 AND 100),
  telegram_update_id text NOT NULL CHECK (char_length(telegram_update_id) BETWEEN 1 AND 100),
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 12000),
  mode text NOT NULL CHECK (mode IN ('read-only', 'workspace-write')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'completed', 'failed')),
  result text CHECK (result IS NULL OR char_length(result) BETWEEN 1 AND 16000),
  exit_code integer CHECK (exit_code IS NULL OR exit_code BETWEEN -255 AND 255),
  codex_session_id text CHECK (codex_session_id IS NULL OR char_length(codex_session_id) BETWEEN 1 AND 200),
  telegram_result_message_id bigint CHECK (telegram_result_message_id IS NULL OR telegram_result_message_id > 0),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (telegram_chat_id, telegram_message_id),
  CHECK (
    (status = 'queued' AND claimed_at IS NULL AND lease_expires_at IS NULL AND finished_at IS NULL)
    OR (status = 'claimed' AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('completed', 'failed') AND claimed_at IS NOT NULL AND finished_at IS NOT NULL)
  )
);

ALTER TABLE public.lm_codex_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lm_codex_jobs_claim_idx
  ON public.lm_codex_jobs (status, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS lm_codex_jobs_chat_recent_idx
  ON public.lm_codex_jobs (telegram_chat_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_lm_codex_job(
  p_lease_seconds integer DEFAULT 900
) RETURNS SETOF public.lm_codex_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'codex job lease out of bounds';
  END IF;

  SELECT id INTO v_id
  FROM public.lm_codex_jobs
  WHERE status = 'queued'
     OR (status = 'claimed' AND lease_expires_at <= clock_timestamp())
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  UPDATE public.lm_codex_jobs
  SET status = 'claimed',
      claimed_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE id = v_id
  RETURNING *;
END
$$;

CREATE OR REPLACE FUNCTION public.finish_lm_codex_job(
  p_job_id uuid,
  p_status text,
  p_result text,
  p_exit_code integer DEFAULT NULL,
  p_codex_session_id text DEFAULT NULL
) RETURNS SETOF public.lm_codex_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed')
     OR p_result IS NULL OR char_length(p_result) < 1 OR char_length(p_result) > 16000
     OR p_exit_code IS NOT NULL AND (p_exit_code < -255 OR p_exit_code > 255)
     OR p_codex_session_id IS NOT NULL AND char_length(p_codex_session_id) > 200 THEN
    RAISE EXCEPTION 'invalid codex job result';
  END IF;

  RETURN QUERY
  UPDATE public.lm_codex_jobs
  SET status = p_status,
      result = p_result,
      exit_code = p_exit_code,
      codex_session_id = p_codex_session_id,
      lease_expires_at = NULL,
      finished_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_job_id AND status = 'claimed'
  RETURNING *;
END
$$;

CREATE OR REPLACE FUNCTION public.mark_lm_codex_job_telegram_sent(
  p_job_id uuid,
  p_telegram_message_id bigint
) RETURNS SETOF public.lm_codex_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_telegram_message_id IS NULL OR p_telegram_message_id <= 0 THEN
    RAISE EXCEPTION 'invalid Telegram result message id';
  END IF;

  RETURN QUERY
  UPDATE public.lm_codex_jobs
  SET telegram_result_message_id = p_telegram_message_id,
      updated_at = clock_timestamp()
  WHERE id = p_job_id AND status IN ('completed', 'failed')
  RETURNING *;
END
$$;

REVOKE ALL ON TABLE public.lm_codex_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_lm_codex_job(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_lm_codex_job(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_lm_codex_job_telegram_sent(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lm_codex_jobs TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_lm_codex_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_lm_codex_job(uuid, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_lm_codex_job_telegram_sent(uuid, bigint) TO service_role;
