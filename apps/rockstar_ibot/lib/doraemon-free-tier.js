"use strict";

const TELEGRAM_ID_RE = /^[1-9][0-9]{0,19}$/;
const TERMS_VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;
const RPC_NAME_RE = /^[a-z][a-z0-9_]{0,62}$/;

class DoraemonFreeTierError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "DoraemonFreeTierError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, details) {
  throw new DoraemonFreeTierError(code, details);
}

function normalizeInput(input = {}) {
  const userId = String(input.userId == null ? "" : input.userId);
  const chatId = String(input.chatId == null ? "" : input.chatId);
  const chatType = String(input.chatType || "");
  const termsVersion = String(input.termsVersion || "2026-09-02-free-v1");
  const profileName = String(input.profileName || "").trim().slice(0, 160);
  if (chatType !== "private" || !TELEGRAM_ID_RE.test(userId) || chatId !== userId) {
    fail("free_tier_private_chat_required");
  }
  if (!TERMS_VERSION_RE.test(termsVersion)) fail("free_tier_terms_version_invalid");
  return Object.freeze({ userId, chatId, profileName, termsVersion });
}

function createSupabaseFreeTierWriter(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supaKey = String(options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const rpcName = String(options.rpcName || "lm_start_doraemon_free_tier");
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function" || !RPC_NAME_RE.test(rpcName)) {
    fail("free_tier_store_unavailable");
  }

  return async function startFreeTier(input) {
    const value = normalizeInput(input);
    let response;
    try {
      response = await fetchImpl(`${supaUrl}/rest/v1/rpc/${rpcName}`, {
        method: "POST",
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: value.userId,
          p_chat_id: value.chatId,
          p_profile_name: value.profileName || null,
          p_terms_version: value.termsVersion,
        }),
      });
    } catch {
      fail("free_tier_write_failed");
    }
    if (!response || !response.ok) fail("free_tier_write_failed", { status: response && response.status });
    const body = await response.json().catch(() => null);
    const result = Array.isArray(body) ? body[0] : body;
    if (!result || typeof result.uid !== "string" || !result.uid) fail("free_tier_write_failed");
    if (!new Set(["started", "already_started", "already_paid"]).has(String(result.status || ""))) {
      fail("free_tier_write_failed");
    }
    return Object.freeze({
      uid: result.uid,
      paid: result.paid === true,
      duplicate: String(result.status) !== "started",
    });
  };
}

module.exports = {
  DoraemonFreeTierError,
  normalizeInput,
  createSupabaseFreeTierWriter,
};
