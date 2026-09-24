-- DORAEMON-JOB-1: attach the ten avocadomini rooms to the durable local-Codex queue.
-- User-facing feature jobs are always read-only drafts. External effects use separate adapters,
-- per-invocation approval, and provider receipts.

ALTER TABLE public.lm_codex_jobs
  ADD COLUMN IF NOT EXISTS job_kind text NOT NULL DEFAULT 'owner_command'
    CHECK (job_kind IN ('owner_command', 'doraemon_feature', 'doraemon_command')),
  ADD COLUMN IF NOT EXISTS feature_key text
    CHECK (feature_key IS NULL OR feature_key IN (
      'request','course','check','store','promote','nurture','pay','deliver','measure','split'
    )),
  ADD COLUMN IF NOT EXISTS request_text text
    CHECK (request_text IS NULL OR char_length(request_text) BETWEEN 1 AND 9000),
  ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES public.lm_codex_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Re-running this migration after an earlier draft must also widen the generated column check.
ALTER TABLE public.lm_codex_jobs
  DROP CONSTRAINT IF EXISTS lm_codex_jobs_job_kind_check;
ALTER TABLE public.lm_codex_jobs
  ADD CONSTRAINT lm_codex_jobs_job_kind_check
  CHECK (job_kind IN ('owner_command', 'doraemon_feature', 'doraemon_command'));

ALTER TABLE public.lm_codex_jobs
  DROP CONSTRAINT IF EXISTS lm_codex_jobs_kind_shape_check,
  DROP CONSTRAINT IF EXISTS lm_codex_jobs_acceptance_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lm_codex_jobs'::regclass
      AND conname = 'lm_codex_jobs_kind_shape_check'
  ) THEN
    ALTER TABLE public.lm_codex_jobs
      ADD CONSTRAINT lm_codex_jobs_kind_shape_check CHECK (
        (job_kind = 'owner_command' AND feature_key IS NULL AND request_text IS NULL AND parent_job_id IS NULL)
        OR
        (job_kind = 'doraemon_feature' AND uid IS NOT NULL AND mode = 'read-only'
          AND feature_key IS NOT NULL AND request_text IS NOT NULL)
        OR
        (job_kind = 'doraemon_command' AND uid IS NOT NULL AND mode = 'read-only'
          AND feature_key IS NULL AND request_text IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lm_codex_jobs'::regclass
      AND conname = 'lm_codex_jobs_acceptance_check'
  ) THEN
    ALTER TABLE public.lm_codex_jobs
      ADD CONSTRAINT lm_codex_jobs_acceptance_check CHECK (
        accepted_at IS NULL
        OR (job_kind IN ('doraemon_feature', 'doraemon_command') AND status = 'completed'
          AND telegram_result_message_id IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS lm_codex_jobs_uid_recent_idx
  ON public.lm_codex_jobs (uid, created_at DESC)
  WHERE job_kind IN ('doraemon_feature', 'doraemon_command');

CREATE INDEX IF NOT EXISTS lm_codex_jobs_parent_idx
  ON public.lm_codex_jobs (parent_job_id)
  WHERE parent_job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_lm_doraemon_job(
  p_uid text,
  p_telegram_chat_id text,
  p_telegram_user_id text,
  p_telegram_message_id text,
  p_telegram_update_id text,
  p_prompt text,
  p_job_kind text,
  p_feature_key text,
  p_request_text text,
  p_parent_job_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_job public.lm_codex_jobs%ROWTYPE;
BEGIN
  IF p_job_kind NOT IN ('doraemon_feature', 'doraemon_command')
     OR p_uid IS NULL OR char_length(p_uid) NOT BETWEEN 1 AND 200
     OR p_telegram_chat_id IS NULL OR char_length(p_telegram_chat_id) NOT BETWEEN 1 AND 100
     OR p_telegram_user_id IS NULL OR char_length(p_telegram_user_id) NOT BETWEEN 1 AND 100
     OR p_telegram_message_id IS NULL OR char_length(p_telegram_message_id) NOT BETWEEN 1 AND 100
     OR p_telegram_update_id IS NULL OR char_length(p_telegram_update_id) NOT BETWEEN 1 AND 100
     OR p_prompt IS NULL OR char_length(p_prompt) NOT BETWEEN 1 AND 12000
     OR p_request_text IS NULL OR char_length(p_request_text) NOT BETWEEN 1 AND 9000
     OR (p_job_kind = 'doraemon_feature' AND (
       p_feature_key IS NULL OR p_feature_key NOT IN (
         'request','course','check','store','promote','nurture','pay','deliver','measure','split'
       )
     ))
     OR (p_job_kind = 'doraemon_command' AND p_feature_key IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid doraemon job';
  END IF;

  -- One lock per chat closes the race between duplicate detection, rate counting, and INSERT.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_telegram_chat_id, 0));

  SELECT * INTO v_job
  FROM public.lm_codex_jobs
  WHERE telegram_chat_id = p_telegram_chat_id
    AND telegram_message_id = p_telegram_message_id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'duplicate', 'job', to_jsonb(v_job));
  END IF;

  IF (
    SELECT count(*)
    FROM public.lm_codex_jobs
    WHERE telegram_chat_id = p_telegram_chat_id
      AND job_kind IN ('doraemon_feature', 'doraemon_command')
      AND created_at >= clock_timestamp() - interval '1 hour'
  ) >= 10 THEN
    RETURN jsonb_build_object('outcome', 'rate_limited');
  END IF;

  IF p_parent_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lm_codex_jobs parent
    WHERE parent.id = p_parent_job_id
      AND parent.uid = p_uid
      AND parent.telegram_chat_id = p_telegram_chat_id
      AND parent.status IN ('completed', 'failed')
      AND (
        (p_job_kind = 'doraemon_command' AND parent.job_kind = 'doraemon_command')
        OR
        (p_job_kind = 'doraemon_feature' AND parent.job_kind = 'doraemon_feature'
          AND parent.feature_key = p_feature_key)
      )
  ) THEN
    RAISE EXCEPTION 'invalid doraemon parent job';
  END IF;

  INSERT INTO public.lm_codex_jobs (
    uid, telegram_chat_id, telegram_user_id, telegram_message_id, telegram_update_id,
    prompt, mode, status, job_kind, feature_key, request_text, parent_job_id
  ) VALUES (
    p_uid, p_telegram_chat_id, p_telegram_user_id, p_telegram_message_id, p_telegram_update_id,
    p_prompt, 'read-only', 'queued', p_job_kind, p_feature_key, p_request_text, p_parent_job_id
  ) RETURNING * INTO v_job;

  RETURN jsonb_build_object('outcome', 'created', 'job', to_jsonb(v_job));
END
$$;

CREATE OR REPLACE FUNCTION public.accept_lm_doraemon_job(
  p_job_id uuid,
  p_telegram_chat_id text
) RETURNS SETOF public.lm_codex_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_job_id IS NULL OR p_telegram_chat_id IS NULL
     OR char_length(p_telegram_chat_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid doraemon job acceptance';
  END IF;

  RETURN QUERY
  UPDATE public.lm_codex_jobs
  SET accepted_at = COALESCE(accepted_at, clock_timestamp()),
      updated_at = clock_timestamp()
  WHERE id = p_job_id
    AND telegram_chat_id = p_telegram_chat_id
    AND job_kind IN ('doraemon_feature', 'doraemon_command')
    AND status = 'completed'
    AND telegram_result_message_id IS NOT NULL
    AND accepted_at IS NULL
  RETURNING *;
END
$$;

REVOKE ALL ON FUNCTION public.accept_lm_doraemon_job(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_lm_doraemon_job(text, text, text, text, text, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_lm_doraemon_job(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_lm_doraemon_job(text, text, text, text, text, text, text, text, text, uuid)
  TO service_role;
