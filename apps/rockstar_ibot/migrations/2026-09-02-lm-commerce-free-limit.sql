-- Change the free concurrent-tool allowance from five to three for already-migrated databases.

CREATE OR REPLACE FUNCTION public.lm_select_commerce_tool(
  p_uid text,
  p_connector_key text,
  p_credential_reference text DEFAULT NULL
) RETURNS SETOF public.lm_commerce_tool_selections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_paid boolean;
  v_active_count integer;
  v_selection public.lm_commerce_tool_selections%ROWTYPE;
BEGIN
  IF p_uid IS NULL OR btrim(p_uid) = '' OR length(p_uid) > 256 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_tenant_uid';
  END IF;
  IF p_connector_key IS NULL OR p_connector_key NOT IN (
    'telegram', 'x', 'telegram-stars', 'stripe', 'email', 'landing-page', 'lms',
    'software-license', 'community', 'brain-import'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'connector_unavailable';
  END IF;
  IF p_credential_reference IS NOT NULL AND (
    length(p_credential_reference) > 512
    OR p_credential_reference !~ '^(credential|vault|secret|keychain|env|managed|provider|composio|artifact)://[A-Za-z0-9][A-Za-z0-9._~:/@+-]{0,510}$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_credential_reference';
  END IF;

  SELECT COALESCE(users.paid, false)
    INTO v_paid
    FROM public.lm_users AS users
   WHERE users.uid = p_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'tenant_not_found';
  END IF;

  SELECT selection.*
    INTO v_selection
    FROM public.lm_commerce_tool_selections AS selection
   WHERE selection.uid = p_uid
     AND selection.connector_key = p_connector_key
   FOR UPDATE;

  IF FOUND AND v_selection.active THEN
    IF p_credential_reference IS NOT NULL
       AND p_credential_reference IS DISTINCT FROM v_selection.credential_reference THEN
      UPDATE public.lm_commerce_tool_selections AS selection
         SET credential_reference = p_credential_reference,
             connection_state = 'selected',
             runtime_adapter_reference = NULL,
             connected_at = NULL,
             updated_at = now()
       WHERE selection.uid = p_uid
         AND selection.connector_key = p_connector_key
      RETURNING selection.* INTO v_selection;
    END IF;
    RETURN NEXT v_selection;
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_active_count
    FROM public.lm_commerce_tool_selections AS selection
   WHERE selection.uid = p_uid
     AND selection.active;
  IF NOT v_paid AND v_active_count >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'free_tool_limit_reached';
  END IF;

  INSERT INTO public.lm_commerce_tool_selections AS selection (
    uid, connector_key, active, connection_state, credential_reference,
    runtime_adapter_reference,
    selected_at, connected_at, disconnected_at, updated_at
  ) VALUES (
    p_uid, p_connector_key, true, 'selected', p_credential_reference, NULL,
    now(), NULL, NULL, now()
  )
  ON CONFLICT (uid, connector_key) DO UPDATE
    SET active = true,
        connection_state = 'selected',
        credential_reference = EXCLUDED.credential_reference,
        runtime_adapter_reference = NULL,
        selected_at = now(),
        connected_at = NULL,
        disconnected_at = NULL,
        updated_at = now()
  RETURNING selection.* INTO v_selection;

  RETURN NEXT v_selection;
END;
$$;
