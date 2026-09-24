-- ドラえもん: Stripe Payment Link購入後にTelegramを一度だけ接続するための台帳。
-- 生の接続tokenは保存しない。service_roleだけがhashを照合・消費する。

CREATE TABLE IF NOT EXISTS public.lm_doraemon_purchase_claims (
  reference_id text PRIMARY KEY CHECK (reference_id ~ '^dm_[a-f0-9]{32}$'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','paid','payment_incomplete','connected','refunded','disputed','revoked'
  )),
  checkout_session_id text UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  payment_status text,
  telegram_chat_id text,
  telegram_user_id text,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Safe when this migration is re-applied to a database created by an older draft.
ALTER TABLE public.lm_doraemon_purchase_claims
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text;

ALTER TABLE public.lm_doraemon_purchase_claims
  DROP CONSTRAINT IF EXISTS lm_doraemon_purchase_claims_status_check;
ALTER TABLE public.lm_doraemon_purchase_claims
  ADD CONSTRAINT lm_doraemon_purchase_claims_status_check
  CHECK (status IN ('pending','paid','payment_incomplete','connected','refunded','disputed','revoked'));

CREATE INDEX IF NOT EXISTS lm_doraemon_purchase_claim_status_idx
  ON public.lm_doraemon_purchase_claims(status, expires_at);

CREATE INDEX IF NOT EXISTS lm_doraemon_purchase_claim_payment_intent_idx
  ON public.lm_doraemon_purchase_claims(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lm_doraemon_purchase_claim_charge_idx
  ON public.lm_doraemon_purchase_claims(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

ALTER TABLE public.lm_doraemon_purchase_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_lm_doraemon_purchase_claim(
  p_token_hash text,
  p_chat_id text,
  p_user_id text,
  p_profile_name text
)
RETURNS TABLE(status text, uid text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE claim public.lm_doraemon_purchase_claims%ROWTYPE; target_uid text; existing_uid text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
     OR p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,19}$'
     OR p_user_id IS NULL OR p_user_id !~ '^[1-9][0-9]{0,19}$'
     OR p_chat_id <> p_user_id THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text; RETURN;
  END IF;

  SELECT * INTO claim FROM public.lm_doraemon_purchase_claims
   WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid'::text, NULL::text; RETURN; END IF;
  IF claim.status = 'connected' THEN
    IF claim.telegram_chat_id = p_chat_id AND claim.telegram_user_id = p_user_id THEN
      SELECT u.uid INTO existing_uid FROM public.lm_users u WHERE u.telegram_chat_id::text = p_chat_id ORDER BY u.uid LIMIT 1;
      RETURN QUERY SELECT 'already_connected'::text, existing_uid; RETURN;
    END IF;
    RETURN QUERY SELECT 'already_claimed'::text, NULL::text; RETURN;
  END IF;
  IF claim.status <> 'paid' THEN RETURN QUERY SELECT 'not_paid'::text, NULL::text; RETURN; END IF;
  IF claim.expires_at <= now() THEN RETURN QUERY SELECT 'expired'::text, NULL::text; RETURN; END IF;

  SELECT u.uid INTO existing_uid FROM public.lm_users u
   WHERE u.telegram_chat_id::text = p_chat_id ORDER BY u.uid LIMIT 1 FOR UPDATE;
  target_uid := COALESCE(existing_uid, 'lm_tg_' || md5(p_chat_id));
  INSERT INTO public.lm_users(uid, telegram_chat_id, name, tg_onboard_stage, paid,
    stripe_customer_id, stripe_subscription_id, plan_status, stripe_event_at)
    VALUES (target_uid, p_chat_id, NULLIF(trim(coalesce(p_profile_name,'')), ''), 'calendar', true,
      claim.stripe_customer_id, claim.stripe_subscription_id, 'active', claim.paid_at)
    ON CONFLICT ON CONSTRAINT lm_users_pkey DO UPDATE SET
      telegram_chat_id = EXCLUDED.telegram_chat_id,
      name = CASE WHEN public.lm_users.name IS NULL OR trim(public.lm_users.name) = '' THEN EXCLUDED.name ELSE public.lm_users.name END,
      paid = true,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      plan_status = 'active',
      stripe_event_at = GREATEST(public.lm_users.stripe_event_at, EXCLUDED.stripe_event_at),
      updated_at = now();

  UPDATE public.lm_doraemon_purchase_claims SET
    status = 'connected', telegram_chat_id = p_chat_id, telegram_user_id = p_user_id,
    claimed_at = now(), updated_at = now()
    WHERE reference_id = claim.reference_id;
  RETURN QUERY SELECT 'connected'::text, target_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_lm_doraemon_purchase_claim(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_lm_doraemon_purchase_claim(text,text,text,text) TO service_role;
