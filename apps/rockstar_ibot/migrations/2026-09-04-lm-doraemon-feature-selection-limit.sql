-- Existing installations may already have the 2026-09-03 RPC. Keep the website contract
-- (exactly three free tools) enforced after that migration has been applied.

CREATE OR REPLACE FUNCTION public.lm_replace_doraemon_feature_selections(
  p_uid text,
  p_feature_keys text[],
  p_terms_version text
) RETURNS TABLE(selected_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  allowed_keys constant text[] := ARRAY['request','course','check','store','promote','nurture','pay','deliver','measure','split'];
  normalized_keys text[];
BEGIN
  SELECT array_agg(DISTINCT key ORDER BY key) INTO normalized_keys
    FROM unnest(p_feature_keys) AS key;
  IF p_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.lm_users WHERE uid = p_uid)
     OR normalized_keys IS NULL OR cardinality(normalized_keys) <> 3
     OR normalized_keys <@ allowed_keys IS NOT TRUE
     OR p_terms_version IS NULL OR p_terms_version !~ '^[A-Za-z0-9._-]{1,64}$' THEN
    RAISE EXCEPTION 'invalid_doraemon_feature_selection';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('doraemon-features:' || p_uid));
  DELETE FROM public.lm_doraemon_feature_selections WHERE uid = p_uid;
  INSERT INTO public.lm_doraemon_feature_selections(uid, feature_key, terms_version)
    SELECT p_uid, key, p_terms_version FROM unnest(normalized_keys) AS key;
  RETURN QUERY SELECT cardinality(normalized_keys);
END;
$$;

REVOKE ALL ON FUNCTION public.lm_replace_doraemon_feature_selections(text,text[],text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_replace_doraemon_feature_selections(text,text[],text)
  TO service_role;
