"use strict";

const { FEATURE_KEYS, MAX_FEATURE_SELECTIONS } = require("./doraemon-feature-selection.js");

function createDoraemonFeatureStore(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supaKey = String(options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") throw new Error("feature_store_unavailable");

  const headers = (extra = {}) => ({
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    ...extra,
  });

  return Object.freeze({
    async get(uid) {
      const value = String(uid || "").trim();
      if (!value || value.length > 200) throw new Error("feature_selection_uid_invalid");
      const query = new URLSearchParams({
        uid: `eq.${value}`,
        select: "feature_key,selected_at",
        order: "selected_at.asc",
      });
      const response = await fetchImpl(`${supaUrl}/rest/v1/lm_doraemon_feature_selections?${query}`, {
        headers: headers({ Accept: "application/json" }),
      }).catch(() => null);
      if (!response || !response.ok) throw new Error("feature_selection_read_failed");
      const rows = await response.json().catch(() => null);
      if (!Array.isArray(rows)) throw new Error("feature_selection_read_failed");
      const received = rows.map((row) => row && row.feature_key);
      const keys = FEATURE_KEYS.filter((key) => received.includes(key));
      if (keys.length !== rows.length || keys.length > MAX_FEATURE_SELECTIONS) {
        throw new Error("feature_selection_read_failed");
      }
      return Object.freeze(keys);
    },
    async replace({ uid, featureKeys, termsVersion }) {
      const keys = FEATURE_KEYS.filter((key) => Array.isArray(featureKeys) && featureKeys.includes(key));
      if (typeof uid !== "string" || !uid || keys.length < 1 || keys.length > MAX_FEATURE_SELECTIONS || keys.length !== new Set(featureKeys).size) {
        throw new Error("feature_selection_invalid");
      }
      const response = await fetchImpl(`${supaUrl}/rest/v1/rpc/lm_replace_doraemon_feature_selections`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ p_uid: uid, p_feature_keys: keys, p_terms_version: termsVersion }),
      }).catch(() => null);
      if (!response || !response.ok) throw new Error("feature_selection_write_failed");
      const body = await response.json().catch(() => null);
      const result = Array.isArray(body) ? body[0] : body;
      if (!result || Number(result.selected_count) !== keys.length) throw new Error("feature_selection_write_failed");
      return Object.freeze({ uid, featureKeys: Object.freeze(keys), selectedCount: keys.length });
    },
  });
}

module.exports = { createDoraemonFeatureStore };
