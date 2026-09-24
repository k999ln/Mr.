-- MetaMask payout registration for the authenticated Core Panel.
-- The browser only receives a short-lived opaque challenge. The database stores its hash,
-- binds it to one uid/chat/address, and atomically consumes it when the verified signature commits.

DO $$
DECLARE payout_type text;
BEGIN
  SELECT data_type INTO payout_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'lm_users'
     AND column_name = 'payout_destination';
  IF payout_type = 'text' THEN
    ALTER TABLE public.lm_users
      ALTER COLUMN payout_destination TYPE jsonb
      USING payout_destination::jsonb;
  ELSIF payout_type IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'lm_users.payout_destination must be jsonb before MetaMask registration';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lm_panel_wallet_challenges (
  challenge_hash text PRIMARY KEY CHECK (challenge_hash ~ '^[a-f0-9]{64}$'),
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE CASCADE,
  chat_id text NOT NULL CHECK (char_length(chat_id) BETWEEN 1 AND 100),
  address text NOT NULL CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  nonce text NOT NULL CHECK (nonce ~ '^[A-Za-z0-9]{8,64}$'),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2048),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  signature_hash text CHECK (signature_hash IS NULL OR signature_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS lm_panel_wallet_challenges_scope_idx
  ON public.lm_panel_wallet_challenges (uid, chat_id, expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS lm_panel_wallet_challenges_live_scope_idx
  ON public.lm_panel_wallet_challenges (uid, chat_id)
  WHERE used_at IS NULL;

ALTER TABLE public.lm_panel_wallet_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lm_panel_wallet_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lm_panel_wallet_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.create_lm_panel_wallet_challenge(
  p_challenge_hash text,
  p_uid text,
  p_chat_id text,
  p_address text,
  p_nonce text,
  p_message text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_challenge_hash IS NULL OR p_challenge_hash !~ '^[a-f0-9]{64}$'
     OR p_uid IS NULL OR p_uid = ''
     OR p_chat_id IS NULL OR char_length(p_chat_id) NOT BETWEEN 1 AND 100
     OR p_address IS NULL OR p_address !~ '^0x[0-9a-fA-F]{40}$'
     OR p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9]{8,64}$'
     OR p_message IS NULL OR char_length(p_message) NOT BETWEEN 1 AND 2048
     OR p_issued_at IS NULL OR p_issued_at < now() - interval '1 minute' OR p_issued_at > now() + interval '1 minute'
     OR p_expires_at IS NULL OR p_expires_at <= now()
     OR p_expires_at > p_issued_at + interval '5 minutes' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lm_users
     WHERE uid = p_uid AND telegram_chat_id::text = p_chat_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.lm_panel_wallet_challenges
   WHERE (used_at IS NOT NULL OR expires_at <= now())
     AND created_at < now() - interval '1 day';
  UPDATE public.lm_panel_wallet_challenges
     SET used_at = now()
   WHERE uid = p_uid AND chat_id = p_chat_id AND used_at IS NULL;

  BEGIN
    INSERT INTO public.lm_panel_wallet_challenges(
      challenge_hash, uid, chat_id, address, nonce, message, issued_at, expires_at
    ) VALUES (
      p_challenge_hash, p_uid, p_chat_id, p_address, p_nonce, p_message, p_issued_at, p_expires_at
    );
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_lm_panel_wallet_connection(
  p_challenge_hash text,
  p_uid text,
  p_chat_id text,
  p_address text,
  p_signature_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE challenge public.lm_panel_wallet_challenges%ROWTYPE;
DECLARE destination jsonb;
DECLARE bound_uid text;
BEGIN
  IF p_challenge_hash IS NULL OR p_challenge_hash !~ '^[a-f0-9]{64}$'
     OR p_address IS NULL OR p_address !~ '^0x[0-9a-fA-F]{40}$'
     OR p_signature_hash IS NULL OR p_signature_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'wallet_challenge_rejected';
  END IF;

  SELECT * INTO challenge
    FROM public.lm_panel_wallet_challenges
   WHERE challenge_hash = p_challenge_hash
     AND uid = p_uid
     AND chat_id = p_chat_id
     AND address = p_address
   FOR UPDATE;
  IF NOT FOUND OR challenge.used_at IS NOT NULL OR challenge.expires_at <= now() THEN
    RAISE EXCEPTION 'wallet_challenge_rejected';
  END IF;
  SELECT uid INTO bound_uid
    FROM public.lm_users
   WHERE uid = p_uid AND telegram_chat_id::text = p_chat_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scope_mismatch';
  END IF;

  UPDATE public.lm_panel_wallet_challenges
     SET used_at = now(), signature_hash = p_signature_hash
   WHERE challenge_hash = p_challenge_hash AND used_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_challenge_rejected'; END IF;

  destination := jsonb_build_object(
    'type', 'wallet',
    'status', 'usable',
    'address', p_address,
    'provider', 'metamask',
    'network', 'eip155:8453',
    'chain_id', 8453,
    'asset', 'USDC',
    'verification', 'siwe_eip4361',
    'confirmed_at', now()
  );
  UPDATE public.lm_users
     SET payout_destination = destination, updated_at = now()
   WHERE uid = p_uid AND telegram_chat_id::text = p_chat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'scope_mismatch'; END IF;
  RETURN destination;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lm_panel_wallet_challenge(text,text,text,text,text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_lm_panel_wallet_connection(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_lm_panel_wallet_challenge(text,text,text,text,text,text,timestamptz,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_lm_panel_wallet_connection(text,text,text,text,text)
  TO service_role;
