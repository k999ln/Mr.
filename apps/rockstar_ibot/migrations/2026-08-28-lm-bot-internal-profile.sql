-- One public Telegram gateway (@Rockstar_ibot) with one user-selected internal behavior profile.
-- Profiles affect presentation and workflow routing only; they do not grant authority.

ALTER TABLE public.lm_users
  ADD COLUMN IF NOT EXISTS lm_bot_profile_id text;

UPDATE public.lm_users
SET lm_bot_profile_id = 'mr-bot'
WHERE lm_bot_profile_id IS NULL OR trim(lm_bot_profile_id) = '';

ALTER TABLE public.lm_users
  ALTER COLUMN lm_bot_profile_id SET DEFAULT 'mr-bot',
  ALTER COLUMN lm_bot_profile_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lm_users_bot_profile_id_check'
      AND conrelid = 'public.lm_users'::regclass
  ) THEN
    ALTER TABLE public.lm_users ADD CONSTRAINT lm_users_bot_profile_id_check CHECK (
      lm_bot_profile_id IN (
        'mr-bot', 'entp', 'entj', 'enfp', 'enfj', 'estp', 'estj', 'esfp', 'esfj',
        'intp', 'intj', 'infp', 'infj', 'istp', 'istj', 'isfp', 'isfj',
        'bot-mother', 'baby', 'life-guard'
      )
    );
  END IF;
END $$;

COMMENT ON COLUMN public.lm_users.lm_bot_profile_id IS
  'User-selected internal Mr. Bot behavior profile; never an authority or eligibility signal.';
