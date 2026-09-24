-- avocadomini: Telegram Starsの買い切り購入証跡と利用権限付与。
-- Bot APIが返すcharge idを一意キーにし、同じ支払いの再配送を冪等に扱う。

CREATE TABLE IF NOT EXISTS public.lm_doraemon_stars_purchases (
  telegram_payment_charge_id text PRIMARY KEY,
  telegram_user_id text NOT NULL CHECK (telegram_user_id ~ '^[1-9][0-9]{0,19}$'),
  telegram_chat_id text NOT NULL CHECK (telegram_chat_id ~ '^[1-9][0-9]{0,19}$'),
  currency text NOT NULL CHECK (currency = 'XTR'),
  total_amount bigint NOT NULL CHECK (total_amount > 0),
  invoice_payload text NOT NULL CHECK (octet_length(invoice_payload) BETWEEN 1 AND 128),
  terms_version text NOT NULL DEFAULT '2026-09-01',
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded','revoked')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (telegram_chat_id = telegram_user_id)
);

CREATE INDEX IF NOT EXISTS lm_doraemon_stars_user_idx
  ON public.lm_doraemon_stars_purchases(telegram_user_id, paid_at DESC);

ALTER TABLE public.lm_doraemon_stars_purchases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.lm_mark_doraemon_stars_paid(
  p_user_id text,
  p_chat_id text,
  p_telegram_payment_charge_id text,
  p_currency text,
  p_total_amount bigint,
  p_invoice_payload text
)
RETURNS TABLE(
  status text,
  created boolean,
  telegram_user_id text,
  telegram_payment_charge_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  inserted_count integer := 0;
  existing public.lm_doraemon_stars_purchases%ROWTYPE;
  target_uid text;
BEGIN
  IF p_user_id IS NULL OR p_user_id !~ '^[1-9][0-9]{0,19}$'
     OR p_chat_id IS NULL OR p_chat_id <> p_user_id
     OR p_telegram_payment_charge_id IS NULL OR octet_length(p_telegram_payment_charge_id) NOT BETWEEN 1 AND 512
     OR p_currency <> 'XTR' OR p_total_amount IS NULL OR p_total_amount <= 0
     OR p_invoice_payload IS NULL OR octet_length(p_invoice_payload) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid_stars_purchase';
  END IF;

  INSERT INTO public.lm_doraemon_stars_purchases(
    telegram_payment_charge_id, telegram_user_id, telegram_chat_id,
    currency, total_amount, invoice_payload
  ) VALUES (
    p_telegram_payment_charge_id, p_user_id, p_chat_id,
    p_currency, p_total_amount, p_invoice_payload
  ) ON CONFLICT (telegram_payment_charge_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT * INTO existing
    FROM public.lm_doraemon_stars_purchases
    WHERE lm_doraemon_stars_purchases.telegram_payment_charge_id = p_telegram_payment_charge_id
    FOR UPDATE;

  IF existing.telegram_user_id <> p_user_id OR existing.telegram_chat_id <> p_chat_id
     OR existing.currency <> p_currency OR existing.total_amount <> p_total_amount
     OR existing.invoice_payload <> p_invoice_payload OR existing.status <> 'paid' THEN
    RAISE EXCEPTION 'stars_purchase_evidence_mismatch';
  END IF;

  SELECT u.uid INTO target_uid FROM public.lm_users u
    WHERE u.telegram_chat_id::text = p_chat_id ORDER BY u.uid LIMIT 1 FOR UPDATE;
  target_uid := COALESCE(target_uid, 'lm_tg_' || md5(p_chat_id));

  INSERT INTO public.lm_users(uid, telegram_chat_id, tg_onboard_stage, paid, plan_status, stripe_event_at)
    VALUES (target_uid, p_chat_id, 'calendar', true, 'active', existing.paid_at)
    ON CONFLICT ON CONSTRAINT lm_users_pkey DO UPDATE SET
      telegram_chat_id = EXCLUDED.telegram_chat_id,
      paid = true,
      plan_status = 'active',
      stripe_event_at = GREATEST(public.lm_users.stripe_event_at, EXCLUDED.stripe_event_at),
      updated_at = now();

  RETURN QUERY SELECT
    CASE WHEN inserted_count = 1 THEN 'paid'::text ELSE 'already_paid'::text END,
    inserted_count = 1,
    p_user_id,
    p_telegram_payment_charge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lm_mark_doraemon_stars_paid(text,text,text,text,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_mark_doraemon_stars_paid(text,text,text,text,bigint,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.lm_mark_doraemon_stars_refunded(
  p_user_id text,
  p_chat_id text,
  p_telegram_payment_charge_id text
)
RETURNS TABLE(status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  purchase public.lm_doraemon_stars_purchases%ROWTYPE;
  has_other_access boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_user_id !~ '^[1-9][0-9]{0,19}$'
     OR p_chat_id IS NULL OR p_chat_id <> p_user_id
     OR p_telegram_payment_charge_id IS NULL THEN
    RAISE EXCEPTION 'invalid_stars_refund';
  END IF;

  SELECT * INTO purchase FROM public.lm_doraemon_stars_purchases
    WHERE lm_doraemon_stars_purchases.telegram_payment_charge_id = p_telegram_payment_charge_id
    FOR UPDATE;
  IF NOT FOUND OR purchase.telegram_user_id <> p_user_id OR purchase.telegram_chat_id <> p_chat_id THEN
    RAISE EXCEPTION 'stars_refund_evidence_mismatch';
  END IF;
  IF purchase.status = 'refunded' OR purchase.status = 'revoked' THEN
    RETURN QUERY SELECT 'already_refunded'::text; RETURN;
  END IF;

  UPDATE public.lm_doraemon_stars_purchases SET
    status = 'refunded', refunded_at = now(), updated_at = now()
    WHERE telegram_payment_charge_id = p_telegram_payment_charge_id;

  SELECT EXISTS(
    SELECT 1 FROM public.lm_doraemon_stars_purchases p
      WHERE p.telegram_chat_id = p_chat_id AND p.status = 'paid'
    UNION ALL
    SELECT 1 FROM public.lm_doraemon_purchase_claims c
      WHERE c.telegram_chat_id = p_chat_id AND c.status = 'connected'
  ) INTO has_other_access;

  IF NOT has_other_access THEN
    UPDATE public.lm_users SET paid = false, plan_status = 'refunded', updated_at = now()
      WHERE telegram_chat_id::text = p_chat_id;
  END IF;
  RETURN QUERY SELECT 'refunded'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.lm_mark_doraemon_stars_refunded(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_mark_doraemon_stars_refunded(text,text,text)
  TO service_role;
