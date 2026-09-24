-- Commerce connector selections. A "tool" is one active connector key for one lm_users tenant.
-- Selection stores only a reference into an external credential store; provider secrets never enter
-- this table. The lm_users row is the per-tenant mutex for selection/disconnect RPCs.

CREATE TABLE IF NOT EXISTS public.lm_commerce_tool_selections (
  uid text NOT NULL REFERENCES public.lm_users(uid) ON DELETE CASCADE,
  connector_key text NOT NULL CHECK (connector_key IN (
    'telegram', 'x', 'telegram-stars', 'stripe', 'email', 'landing-page', 'lms',
    'software-license', 'community', 'brain-import'
  )),
  active boolean NOT NULL DEFAULT true,
  connection_state text NOT NULL DEFAULT 'selected'
    CHECK (connection_state IN ('selected', 'connected', 'disconnected')),
  credential_reference text CHECK (
    credential_reference IS NULL OR (
      length(credential_reference) <= 512
      AND credential_reference ~ '^(credential|vault|secret|keychain|env|managed|provider|composio|artifact)://[A-Za-z0-9][A-Za-z0-9._~:/@+-]{0,510}$'
    )
  ),
  runtime_adapter_reference text CHECK (
    runtime_adapter_reference IS NULL OR (
      length(runtime_adapter_reference) <= 512
      AND runtime_adapter_reference ~ '^(provider|managed|composio)://[A-Za-z0-9][A-Za-z0-9._~:/@+-]{0,510}$'
    )
  ),
  selected_at timestamptz NOT NULL DEFAULT now(),
  connected_at timestamptz,
  disconnected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, connector_key),
  CHECK (
    (active AND connection_state = 'selected' AND connected_at IS NULL
      AND runtime_adapter_reference IS NULL AND disconnected_at IS NULL)
    OR (active AND connection_state = 'connected' AND connected_at IS NOT NULL
      AND credential_reference IS NOT NULL AND runtime_adapter_reference IS NOT NULL
      AND disconnected_at IS NULL)
    OR (NOT active AND connection_state = 'disconnected'
      AND credential_reference IS NULL AND runtime_adapter_reference IS NULL
      AND connected_at IS NULL AND disconnected_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS lm_commerce_tool_selections_active_uid_idx
  ON public.lm_commerce_tool_selections (uid, connector_key)
  WHERE active;

ALTER TABLE public.lm_commerce_tool_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lm_commerce_tool_selections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lm_commerce_tool_selections TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.lm_commerce_tool_selections
  FROM service_role;

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

  -- This row lock makes the read-count-write decision atomic for one tenant. It also proves that
  -- p_uid has the same text identity domain as lm_users instead of admitting an orphan selection.
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

  -- An active reselect is idempotent: it neither consumes another slot nor rewrites timestamps.
  -- A changed credential reference is metadata, not proof of a connection, so it returns to the
  -- selected state until a provider-specific adapter verifies it.
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

CREATE OR REPLACE FUNCTION public.lm_disconnect_commerce_tool(
  p_uid text,
  p_connector_key text
) RETURNS SETOF public.lm_commerce_tool_selections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_selection public.lm_commerce_tool_selections%ROWTYPE;
BEGIN
  -- Serialize against selection so disconnect always stops consuming a free slot atomically.
  PERFORM 1 FROM public.lm_users AS users WHERE users.uid = p_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'tenant_not_found';
  END IF;

  SELECT selection.*
    INTO v_selection
    FROM public.lm_commerce_tool_selections AS selection
   WHERE selection.uid = p_uid
     AND selection.connector_key = p_connector_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'selection_not_found';
  END IF;

  IF v_selection.active THEN
    UPDATE public.lm_commerce_tool_selections AS selection
       SET active = false,
           connection_state = 'disconnected',
           credential_reference = NULL,
           runtime_adapter_reference = NULL,
           connected_at = NULL,
           disconnected_at = now(),
           updated_at = now()
     WHERE selection.uid = p_uid
       AND selection.connector_key = p_connector_key
    RETURNING selection.* INTO v_selection;
  END IF;

  RETURN NEXT v_selection;
END;
$$;

REVOKE ALL ON FUNCTION public.lm_select_commerce_tool(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lm_disconnect_commerce_tool(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_select_commerce_tool(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lm_disconnect_commerce_tool(text, text) TO service_role;

-- Selection is a commercial entitlement. Connection is separate provider evidence and can only be
-- asserted by the service role after an adapter-specific verification/readback succeeds.
CREATE OR REPLACE FUNCTION public.lm_mark_commerce_tool_connected(
  p_uid text,
  p_connector_key text,
  p_credential_reference text,
  p_runtime_adapter_reference text
) RETURNS SETOF public.lm_commerce_tool_selections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_selection public.lm_commerce_tool_selections%ROWTYPE;
BEGIN
  IF p_credential_reference IS NULL OR length(p_credential_reference) > 512
     OR p_credential_reference !~ '^(credential|vault|secret|keychain|env|managed|provider|composio|artifact)://[A-Za-z0-9][A-Za-z0-9._~:/@+-]{0,510}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_credential_reference';
  END IF;
  IF p_runtime_adapter_reference IS NULL OR length(p_runtime_adapter_reference) > 512
     OR p_runtime_adapter_reference !~ '^(provider|managed|composio)://[A-Za-z0-9][A-Za-z0-9._~:/@+-]{0,510}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_runtime_adapter_reference';
  END IF;

  PERFORM 1 FROM public.lm_users AS users WHERE users.uid = p_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'tenant_not_found';
  END IF;

  UPDATE public.lm_commerce_tool_selections AS selection
     SET connection_state = 'connected',
         credential_reference = p_credential_reference,
         runtime_adapter_reference = p_runtime_adapter_reference,
         connected_at = now(),
         disconnected_at = NULL,
         updated_at = now()
   WHERE selection.uid = p_uid
     AND selection.connector_key = p_connector_key
     AND selection.active
  RETURNING selection.* INTO v_selection;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'active_selection_not_found';
  END IF;

  RETURN NEXT v_selection;
END;
$$;

REVOKE ALL ON FUNCTION public.lm_mark_commerce_tool_connected(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lm_mark_commerce_tool_connected(text, text, text, text)
  TO service_role;
