-- Fresh Supabase bootstrap for the avocadomini Telegram entrypoint.
--
-- The historical Rockstar_ibot migrations assume that lm_users already exists.
-- This small baseline makes the current avocadomini flow reproducible on a new
-- Supabase project without pretending that the unrelated legacy feature schema
-- has also been bootstrapped.

CREATE TABLE IF NOT EXISTS public.lm_users (
  uid text PRIMARY KEY,
  telegram_chat_id text,
  name text,
  phone text,
  email text,
  tg_onboard_stage text,
  calendar_provider text,
  gmail_account_id text,
  gmail_skipped boolean NOT NULL DEFAULT false,
  paid boolean NOT NULL DEFAULT false,
  plan_status text,
  home_address text,
  payout_destination jsonb,
  lm_bot_profile_id text,
  call_language text,
  wake_policy text NOT NULL DEFAULT 'travel-only',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  stripe_event_at timestamptz,
  last_discovery_at timestamptz,
  last_discovery_gate text,
  agent_wallet_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lm_users_telegram_chat_id_key
  ON public.lm_users (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

ALTER TABLE public.lm_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lm_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lm_users TO service_role;

COMMENT ON TABLE public.lm_users IS
  'avocadomini/Rockstar_ibot tenant registry; service_role only.';
