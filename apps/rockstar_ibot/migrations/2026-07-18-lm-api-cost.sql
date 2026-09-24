CREATE TABLE IF NOT EXISTS public.lm_api_cost (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts timestamptz DEFAULT now(),
  uid text,
  kind text,
  quantity numeric,
  unit text,
  est_usd numeric,
  meta jsonb
);

ALTER TABLE public.lm_api_cost ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lm_api_cost FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lm_api_cost TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lm_api_cost_id_seq TO service_role;
