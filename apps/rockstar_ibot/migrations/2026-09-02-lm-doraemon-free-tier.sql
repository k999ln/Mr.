-- avocadomini free-first onboarding.
-- The free tier needs only the Telegram identity required to operate the bot. It records the exact
-- notice version accepted before allowing three concurrent tool selections.

CREATE TABLE IF NOT EXISTS public.lm_doraemon_tier_consents (
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE CASCADE,
  telegram_user_id text NOT NULL CHECK (telegram_user_id ~ '^[1-9][0-9]{0,19}$'),
  telegram_chat_id text NOT NULL CHECK (telegram_chat_id = telegram_user_id),
  terms_version text NOT NULL CHECK (terms_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_user_id, terms_version)
);

ALTER TABLE public.lm_doraemon_tier_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lm_doraemon_tier_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lm_doraemon_tier_consents TO service_role;

CREATE OR REPLACE FUNCTION public.lm_start_doraemon_free_tier(
  p_user_id text,
  p_chat_id text,
  p_profile_name text,
  p_terms_version text
) RETURNS TABLE(status text, uid text, paid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_uid text;
  existing_paid boolean := false;
  inserted_count integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_user_id !~ '^[1-9][0-9]{0,19}$'
     OR p_chat_id IS NULL OR p_chat_id <> p_user_id
     OR p_terms_version IS NULL OR p_terms_version !~ '^[A-Za-z0-9._-]{1,64}$'
     OR (p_profile_name IS NOT NULL AND length(p_profile_name) > 160) THEN
    RAISE EXCEPTION 'invalid_free_tier_consent';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('doraemon-free:' || p_chat_id));
  SELECT u.uid, COALESCE(u.paid, false)
    INTO target_uid, existing_paid
    FROM public.lm_users u
   WHERE u.telegram_chat_id::text = p_chat_id
   ORDER BY u.uid
   LIMIT 1
   FOR UPDATE;

  IF target_uid IS NULL THEN
    target_uid := 'lm_tg_' || md5(p_chat_id);
    INSERT INTO public.lm_users(uid, telegram_chat_id, name, tg_onboard_stage, paid, plan_status)
      VALUES (target_uid, p_chat_id, nullif(btrim(p_profile_name), ''), 'done', false, 'free')
      ON CONFLICT ON CONSTRAINT lm_users_pkey DO UPDATE SET
        telegram_chat_id = EXCLUDED.telegram_chat_id,
        name = COALESCE(NULLIF(public.lm_users.name, ''), EXCLUDED.name),
        tg_onboard_stage = COALESCE(public.lm_users.tg_onboard_stage, 'done'),
        updated_at = now();
    SELECT COALESCE(u.paid, false) INTO existing_paid
      FROM public.lm_users u WHERE u.uid = target_uid;
  ELSE
    UPDATE public.lm_users u SET
      name = COALESCE(NULLIF(u.name, ''), nullif(btrim(p_profile_name), '')),
      tg_onboard_stage = COALESCE(u.tg_onboard_stage, 'done'),
      plan_status = CASE WHEN existing_paid THEN u.plan_status ELSE 'free' END,
      updated_at = now()
      WHERE u.uid = target_uid;
  END IF;

  INSERT INTO public.lm_doraemon_tier_consents(
    uid, telegram_user_id, telegram_chat_id, terms_version
  ) VALUES (target_uid, p_user_id, p_chat_id, p_terms_version)
  ON CONFLICT (telegram_user_id, terms_version) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN QUERY SELECT
    CASE
      WHEN existing_paid THEN 'already_paid'::text
      WHEN inserted_count = 1 THEN 'started'::text
      ELSE 'already_started'::text
    END,
    target_uid,
    existing_paid;
END;
$$;

REVOKE ALL ON FUNCTION public.lm_start_doraemon_free_tier(text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_start_doraemon_free_tier(text,text,text,text)
  TO service_role;
