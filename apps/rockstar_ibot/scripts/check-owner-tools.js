#!/usr/bin/env node
// Check whether this installation points at accounts and secrets owned by its operator.
//
// This is deliberately a configuration-presence check, not a provider login or billing probe. It
// prints environment-variable names and validation reasons only; secret values never enter output.
"use strict";

const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const {
  normalizeBotUsername,
  publicBaseUrl,
  validWebhookSecret,
} = require("../lib/telegram-config.js");

const PROFILE_ORDER = Object.freeze([
  "base",
  "source",
  "calendar",
  "voice",
  "billing",
  "mail",
  "durable",
  "browser",
  "social",
  "discovery",
]);

const PLACEHOLDER_RE = /(?:^|[._:/-])(your|example|placeholder|replace[-_ ]?me|change[-_ ]?me|xxxx)(?:$|[._:/-])|[<>]/i;

function parseEnvContent(content) {
  const parsed = {};
  for (const rawLine of String(content || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[match[1]] = value;
  }
  return parsed;
}

function present(value) {
  const text = String(value == null ? "" : value).trim();
  return Boolean(text) && !/[\0\r\n]/.test(text) && !PLACEHOLDER_RE.test(text);
}

function httpsOrigin(value) {
  return Boolean(publicBaseUrl({ LM_PUBLIC_URL: value }));
}

function wssOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "wss:" && !url.username && !url.password && !url.search && !url.hash &&
      (url.pathname === "" || url.pathname === "/") && present(url.hostname);
  } catch { return false; }
}

function httpsUrl(value, hostname) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !url.username && !url.password &&
      (!hostname || url.hostname === hostname) && present(url.hostname);
  } catch { return false; }
}

function githubRepository(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value || "").trim()) && present(value);
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || "").trim());
}

function railwaySelector(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(value || "").trim());
}

function healthEndpoint(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && present(url.hostname) && /^\/health\/?$/.test(url.pathname);
  } catch { return false; }
}

function stripePaymentLink(value) {
  if (!present(value)) return false;
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "buy.stripe.com" &&
      !url.username && !url.password && url.pathname.length > 1;
  } catch { return false; }
}

function postgresUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") && present(url.hostname);
  } catch { return false; }
}

function hostnameOnly(value) {
  const text = String(value || "").trim();
  if (!present(text) || text.includes("/") || text.includes("://") || /[\s@?#]/.test(text)) return false;
  try {
    const url = new URL(`https://${text}`);
    return Boolean(url.hostname) && present(url.hostname) && !url.username && !url.password &&
      (url.pathname === "" || url.pathname === "/") && !url.search && !url.hash;
  } catch { return false; }
}

function dnsHostname(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!present(text) || text.length > 253 || /[:/@?#]/.test(text)) return false;
  const labels = text.split(".");
  return labels.length > 1 && labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function mailFrom(value) {
  const text = String(value || "").trim();
  if (!text || /[\0\r\n]/.test(text)) return false;
  const address = /<([^<>]+)>$/.exec(text)?.[1] || text;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && present(address);
}

function emailAddress(value) {
  const text = String(value || "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text) && present(text);
}

function timeZone(value) {
  if (!present(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: String(value) }).format(); return true; }
  catch { return false; }
}

function absolutePath(value) {
  return present(value) && path.isAbsolute(String(value));
}

function pathBeneath(value, root) {
  if (!absolutePath(value) || !absolutePath(root)) return false;
  const resolved = path.resolve(String(value));
  const resolvedRoot = path.resolve(String(root));
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

function supabaseServiceKey(value) {
  const text = String(value || "").trim();
  if (!present(text) || /^sb_publishable_/i.test(text)) return false;
  if (/^sb_secret_[A-Za-z0-9._-]{20,}$/.test(text)) return true;
  const parts = text.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && payload.role === "service_role";
  } catch { return false; }
}

function telnyxPublicKey(value) {
  const text = String(value || "").trim().replace(/\\n/g, "\n");
  if (!text || text.includes("\0") || PLACEHOLDER_RE.test(text)) return false;
  try {
    if (text.includes("BEGIN PUBLIC KEY")) {
      const key = crypto.createPublicKey(text);
      return key.asymmetricKeyType === "ed25519";
    }
  } catch { return false; }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return false;
  return Buffer.from(text, "base64").length === 32;
}

function workerCapabilities(value) {
  const capabilities = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return capabilities.includes("marketing.rockstar-ibot.daily.publish") ||
    capabilities.includes("marketing.video.publish");
}

const is = Object.freeze({
  present,
  secret: (value) => present(value) && Buffer.byteLength(String(value), "utf8") >= 32,
  telegramToken: (value) => /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(value || "")),
  telegramUsername: (value) => Boolean(normalizeBotUsername(value)),
  webhookSecret: (value) => validWebhookSecret(value) && present(value),
  httpsOrigin,
  httpsUrl,
  githubRepository,
  uuid,
  railwaySelector,
  healthEndpoint,
  wssOrigin,
  supabaseKey: supabaseServiceKey,
  e164: (value) => /^\+[1-9]\d{7,14}$/.test(String(value || "")),
  stripeSecret: (value) => /^sk_(?:test|live)_[A-Za-z0-9]+$/.test(String(value || "")),
  stripeWebhook: (value) => /^whsec_\S+$/.test(String(value || "")) && present(value),
  stripeLink: stripePaymentLink,
  hostnameOnly,
  dnsHostname,
  mailFrom,
  emailAddress,
  timeZone,
  hex64: (value) => /^[a-f0-9]{64}$/i.test(String(value || "")),
  postgresUrl,
  absolutePath,
  pathBeneath,
  telnyxPublicKey,
  positiveInteger: (value) => /^\d+$/.test(String(value || "")) && Number(value) > 0,
  instagramHandle: (value) => /^@?[A-Za-z0-9._]{1,30}$/.test(String(value || "")),
  instagramProfileRef: (value) => /^profile:\/\/instagram\/[a-z0-9._-]+$/i.test(String(value || "")),
  tiktokIntegrationRef: (value) => /^integration:\/\/postiz\/tiktok\/[a-z0-9._-]+$/i.test(String(value || "")),
  workerCapabilities,
  true: (value) => String(value || "").trim().toLowerCase() === "true",
  enabled: (value) => String(value || "").trim() === "1",
});

function field(name, validate, expectation) {
  return Object.freeze({ name, validate, expectation });
}

function oneOf(names, validate, expectation) {
  return Object.freeze({ names: Object.freeze(names), validate, expectation });
}

function optionalField(name, validate, expectation) {
  return Object.freeze({ name, validate, expectation, optional: true });
}

function resolvedField(names, validateEnvironment, expectation) {
  return Object.freeze({
    names: Object.freeze(names),
    validateEnvironment,
    expectation,
  });
}

function calendarTransport(env) {
  const override = String(env.LIFE_CAL_TRANSPORT || "").trim().toLowerCase();
  if (override) return override;
  return String(env.LIFE_TRANSPORT || "composio").trim().toLowerCase();
}

function configuredUnipile(env) {
  // DSN/token can belong to the Calendar adapter alone. The notify secret is the only existing
  // Gmail-onboarding-specific setting, so do not turn Calendar-only Unipile credentials into a
  // false missing-mail report.
  return Boolean(String(env.UNIPILE_NOTIFY_SECRET || "").trim());
}

const PROFILES = Object.freeze({
  base: Object.freeze({
    label: "Telegram・公開URL・Core data plane",
    fields: Object.freeze([
      optionalField("LM_TELEGRAM_MODE", (value) => value === "byob_single", "byob_single"),
      field("LM_TELEGRAM_BOT_TOKEN", is.telegramToken, "BotFather token"),
      field("LM_TELEGRAM_BOT_USERNAME", is.telegramUsername, "末尾がbotのusername"),
      field("LM_TELEGRAM_WEBHOOK_SECRET", is.webhookSecret, "32〜256文字の専用secret"),
      field("LM_LATE_APPROVAL_CALLBACK_SECRET", is.webhookSecret, "Webhookとは別の32〜256文字secret"),
      resolvedField(
        ["LM_PUBLIC_URL", "RAILWAY_PUBLIC_DOMAIN"],
        (env) => Boolean(publicBaseUrl(env)),
        "LM_PUBLIC_URLはpathなしHTTPS origin、または有効なRailway public domain",
      ),
      optionalField("LM_PANEL_BASE_URL", is.httpsOrigin, "pathなしのPanel HTTPS origin"),
      optionalField("LM_WEB_ORIGIN", is.httpsOrigin, "pathなしのWeb HTTPS origin"),
      field("SUPABASE_URL", is.httpsOrigin, "自分のSupabase project URL"),
      field("SUPABASE_SERVICE_ROLE_KEY", is.supabaseKey, "backend専用service_role JWTまたはsb_secret_ key"),
      field("LM_UID_SECRET", is.secret, "32文字以上の専用secret"),
      field("LM_PANEL_SESSION_ROTATION_SECRET", is.secret, "32文字以上の専用secret"),
      field("LM_FEEDBACK_PROVENANCE_KEY", is.secret, "32文字以上の専用secret"),
      field("LM_RELATIONS_HASH_SECRET", is.secret, "32文字以上の専用secret"),
      optionalField("LM_TIME_ZONE", is.timeZone, "IANA time zone（例: Asia/Tokyo）"),
    ]),
    assess: (env) => ({
      externalActions: ["telegram_getMe_and_webhook_readback", "supabase_schema_readback"],
      warnings: env.LM_TIME_ZONE ? [] : ["LM_TIME_ZONE_unset_runtime_defaults_to_Asia_Tokyo"],
    }),
    notes: Object.freeze([
      "設定検査はSupabase schema/migrationの適用や接続成功までは証明しません。",
    ]),
  }),
  source: Object.freeze({
    label: "GitHub source・self-heal deploy target（運営者専用）",
    fields: Object.freeze([
      field("LM_GITHUB_REPOSITORY", is.githubRepository, "自分がwriteできるowner/repository"),
      field("LM_DEV_RAILWAY_PROJECT_ID", is.uuid, "自分のRailway project UUID"),
      field("LM_DEV_RAILWAY_APP_SERVICE", is.railwaySelector, "自分のRockstar_ibot app service IDまたはname"),
      field("LM_DEV_RAILWAY_POSTGRES_SERVICE", is.railwaySelector, "自分のPostgres service IDまたはname"),
      field("LM_DEV_RAILWAY_ENVIRONMENT", is.railwaySelector, "自分のRailway environment IDまたはname"),
      field("LM_DEV_HEALTH_URL", is.healthEndpoint, "queryなしHTTPS /health URL"),
    ]),
    assess: () => ({
      externalActions: [
        "github_repository_viewer_permission_write_or_admin_readback",
        "git_origin_matches_repository_readback",
        "railway_app_postgres_environment_target_readback",
        "configured_health_url_commit_and_ok_readback",
      ],
    }),
    notes: Object.freeze([
      "このprofileはoperator-onlyの自己修復レーンです。未設定またはreadback未確認ならDEV loopと自動merge/deployを有効化しません。",
    ]),
  }),
  calendar: Object.freeze({
    label: "Calendar・Maps・AI",
    fields: Object.freeze([
      optionalField("LIFE_TRANSPORT", (value) => ["composio", "gog"].includes(String(value).toLowerCase()), "composio または gog"),
      optionalField("LIFE_CAL_TRANSPORT", (value) => ["composio", "gog", "unipile"].includes(String(value).toLowerCase()), "composio、gog、unipile のいずれか"),
      resolvedField(
        ["LIFE_MAPS_KEY", "GOOGLE_API_KEY"],
        (env) => is.present(env.LIFE_MAPS_KEY || env.GOOGLE_API_KEY),
        "自分のGoogle Maps keyをどちらか1つ（LIFE_MAPS_KEY優先）",
      ),
      field("GEMINI_API_KEY", is.present, "自分のGemini API key"),
    ]),
    requirements: (env) => {
      const transport = calendarTransport(env);
      if (transport === "composio") return [
        field("COMPOSIO_API_KEY", is.present, "自分のComposio server API key"),
        field("COMPOSIO_GCAL_AUTH_CONFIG", is.present, "自分のGoogle Calendar auth config ID"),
      ];
      if (transport === "gog") return [
        field("GOG_ACCOUNT", is.emailAddress, "gogが使用する自分のGoogle account"),
        optionalField("GOG_BIN", is.present, "実行可能なgog binary名またはpath"),
      ];
      if (transport === "unipile") return [
        field("UNIPILE_DSN", is.hostnameOnly, "schemeなしの自分のUnipile hostname[:port]"),
        field("UNIPILE_TOKEN", is.present, "自分のUnipile access token"),
      ];
      return [];
    },
    assess: (env) => {
      const transport = calendarTransport(env);
      return {
        codeBlockers: transport === "unipile"
          ? ["unipile_calendar_panel_onboarding_is_not_wired", "travel_and_ask_loops_require_composio"]
          : transport === "gog" ? ["travel_and_ask_loops_require_composio"] : [],
        externalActions: transport === "composio"
          ? ["composio_auth_config_and_connected_account_readback"]
          : transport === "gog"
            ? ["gog_binary_keyring_and_single_account_readback"]
            : ["unipile_account_id_must_exist_per_user"],
        warnings: transport === "gog" ? ["gog_transport_is_single_host_account_only"] : [],
      };
    },
  }),
  voice: Object.freeze({
    label: "電話・音声AI",
    fields: Object.freeze([
      field("TELNYX_API_KEY", is.present, "自分のTelnyx API key"),
      field("TELNYX_CONNECTION_ID", is.present, "自分のCall Control application ID"),
      field("TELNYX_PHONE_NUMBER", is.e164, "自分のE.164発信番号"),
      field("PUBLIC_WSS", is.wssOrigin, "pathなしの公開WSS origin"),
      field("LM_CALL_SECRET", is.secret, "32文字以上のcall-context専用secret"),
      field("GEMINI_API_KEY", is.present, "自分のGemini API key"),
      optionalField("LM_AMD", (value) => ["on", "off"].includes(String(value).trim().toLowerCase()), "on または off（false/0は有効扱いになるため不可）"),
      optionalField("MAX_CONCURRENT_CALLS", is.positiveInteger, "正の整数"),
    ]),
    requirements: (env) => String(env.LM_AMD || "").trim().toLowerCase() === "off" ? [] : [
      field("TELNYX_PUBLIC_KEY", is.telnyxPublicKey, "Ed25519 PEMまたはbase64 raw 32-byte public key"),
    ],
    assess: () => ({ externalActions: ["telnyx_daily_preflight_readback"] }),
  }),
  billing: Object.freeze({
    label: "課金",
    fields: Object.freeze([
      field("STRIPE_WEBHOOK_SECRET", is.stripeWebhook, "このendpoint専用webhook signing secret"),
      resolvedField(
        ["LM_STRIPE_PAYMENT_LINK", "STRIPE_PAYMENT_LINK"],
        (env) => is.stripeLink(env.LM_STRIPE_PAYMENT_LINK || env.STRIPE_PAYMENT_LINK),
        "自分のbuy.stripe.com Payment Link（path必須）",
      ),
      optionalField("STRIPE_DEV", (value, env) => !(String(value) === "1" && String(env.NODE_ENV) === "production"), "productionでは1にしない"),
    ]),
    assess: () => ({
      externalActions: ["stripe_subscription_link_and_webhook_event_readback", "stripe_billing_migration_readback"],
    }),
    notes: Object.freeze([
      "現在のruntimeはsigned webhookでentitlementを更新し、STRIPE_SECRET_KEYでStripe APIを呼びません。",
    ]),
  }),
  mail: Object.freeze({
    label: "送受信メール（Gmail/Unipileは設定時のみ監査）",
    fields: Object.freeze([
      field("RESEND_API_KEY", is.present, "自分のResend API key"),
      field("LM_MAIL_FROM", is.mailFrom, "自分の検証済みdomainのFrom address"),
      field("LM_REPLY_DOMAIN", is.dnsHostname, "scheme/portなしの自分のinbound reply domain"),
      field("LM_INBOUND_SECRET", is.secret, "32文字以上のinbound webhook専用secret"),
    ]),
    requirements: (env) => configuredUnipile(env) ? [
      field("UNIPILE_DSN", is.hostnameOnly, "schemeなしの自分のUnipile hostname[:port]"),
      field("UNIPILE_TOKEN", is.present, "自分のUnipile access token"),
      field("UNIPILE_NOTIFY_SECRET", is.secret, "32文字以上のUnipile notify専用secret"),
      field("LM_UID_SECRET", is.secret, "署名URL用secret"),
      resolvedField(
        ["LM_PUBLIC_URL", "RAILWAY_PUBLIC_DOMAIN"],
        (values) => Boolean(publicBaseUrl(values)),
        "Gmail callbackを受ける公開HTTPS origin",
      ),
    ] : [],
    assess: (env) => ({
      codeBlockers: [
        "resend_inbound_signature_and_receiving_api_body_fetch_are_not_implemented",
        ...(configuredUnipile(env) ? ["gmail_onboarding_disabled_and_callback_routes_missing"] : []),
      ],
      externalActions: ["resend_domain_and_inbound_routing_readback"],
      warnings: !configuredUnipile(env) && (env.UNIPILE_DSN || env.UNIPILE_TOKEN)
        ? ["unipile_calendar_credentials_present_but_gmail_onboarding_not_selected"] : [],
    }),
    notes: Object.freeze([
      "UNIPILE_NOTIFY_SECRETでGmail onboardingを選択した場合だけ一式を検査し、設定が揃っていてもcode blockerとして分離します。",
    ]),
  }),
  durable: Object.freeze({
    label: "durable scheduler",
    fields: Object.freeze([
      field("INNGEST_SIGNING_KEY", is.present, "自分のInngest signing key"),
    ]),
    assess: () => ({ externalActions: ["inngest_signature_readback"] }),
    notes: Object.freeze([
      "INNGEST_EVENT_KEYは現runtimeから直接参照されません。local composeのin-process schedulerと二重writerにしないでください。",
    ]),
  }),
  browser: Object.freeze({
    label: "browser agent",
    fields: Object.freeze([
      field("LM_BROWSER_TASKS_ENABLED", is.enabled, "1"),
      field("LM_BROWSER_SESSION_KEY", is.hex64, "64桁hex（32 random bytes）"),
      field("LM_FEEDBACK_DATABASE_URL", is.postgresUrl, "browser job/session schema適用済みPostgres URL"),
      optionalField("LM_AGENT_BROWSER_EMAIL", is.mailFrom, "browser agent用email"),
      optionalField("LM_AGENT_BROWSER_NAME", is.present, "browser agent表示名"),
      field("GEMINI_API_KEY", is.present, "自分のGemini API key"),
      field("LM_TELEGRAM_BOT_TOKEN", is.telegramToken, "結果通知用の自分のBot token"),
    ]),
    assess: (env) => ({
      deploymentBlockers: String(env.LM_MODE || "").trim() === "local"
        ? ["browser_private_steel_service_is_not_in_local_compose"] : [],
      externalActions: ["browser_schema_readback", "railway_private_steel_health_readback"],
      warnings: [
        ...(!env.LM_AGENT_BROWSER_EMAIL ? ["browser_email_missing_some_forms_will_stop"] : []),
        ...(!env.LM_AGENT_BROWSER_NAME ? ["browser_name_missing_some_forms_will_stop"] : []),
        "browser_scope_excludes_payment_kyc_captcha_and_binding_actions",
      ],
    }),
    notes: Object.freeze([
      "現在のbrowser runtimeはprivate steel-browser serviceを別途必要とし、deploy/local composeにはまだ同梱されていません。",
    ]),
  }),
  social: Object.freeze({
    label: "SNS publication worker（任意）",
    fields: Object.freeze([
      field("LM_RUNTIME_TENANT_ID", (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(value || "")), "自分のtenant ID"),
      field("LM_WORKER_CAPABILITIES", is.workerCapabilities, "publish capabilityを少なくとも1つ含むcomma list"),
      field("LM_DATA_DIR", is.absolutePath, "runtime dataのabsolute path"),
      field("LM_POSTIZ_API_KEY", is.present, "自分のPostiz API key"),
      field("LM_INSTAGRAM_HANDLE", is.instagramHandle, "自分のInstagram handle"),
      field("LM_INSTAGRAM_ACCOUNTS_PATH", (value, env) => is.pathBeneath(value, env.LM_DATA_DIR), "LM_DATA_DIR配下のabsolute path"),
      field("LM_INSTAGRAM_SETTINGS_PATH", (value, env) => is.pathBeneath(value, env.LM_DATA_DIR), "LM_DATA_DIR配下のabsolute path"),
      field("LM_INSTAGRAM_CREDENTIALS_PATH", (value, env) => is.pathBeneath(value, env.LM_DATA_DIR), "LM_DATA_DIR配下のabsolute path"),
      field("LM_INSTAGRAM_PROFILE_STATE_DIR", (value, env) => is.pathBeneath(value, env.LM_DATA_DIR), "LM_DATA_DIR配下のabsolute path"),
      field("LM_TIKTOK_INTEGRATION", is.present, "自分のTikTok integration ID"),
    ]),
    requirements: (env) => String(env.LM_WORKER_CAPABILITIES || "").split(",").map((item) => item.trim())
      .includes("marketing.video.publish") ? [
        field("LM_HONNE_EN_INSTAGRAM_PROFILE_REF", is.instagramProfileRef, "profile://instagram/<owner-id>"),
        field("LM_HONNE_EN_TIKTOK_INTEGRATION_REF", is.tiktokIntegrationRef, "integration://postiz/tiktok/<owner-id>"),
      ] : [],
    assess: () => ({
      codeBlockers: ["legacy_social_lanes_require_owner_adapter_rebuild"],
      externalActions: ["postiz_integration_and_instagram_profile_file_readback"],
      warnings: [
        "social_publish_capabilities_are_disabled_by_default",
        "environment_provider_is_single_tenant_not_a_multi_user_vault",
        "legacy_native_carousel_lanes_embed_anicca_honne_account_integration_and_hash_constants",
      ],
    }),
    notes: Object.freeze([
      "Honne EN laneは運営用の限定workerです。配布defaultでは無効のままにしてください。",
    ]),
  }),
  discovery: Object.freeze({
    label: "Product Hunt候補検索（許諾取得後のみ）",
    fields: Object.freeze([
      field("PRODUCT_HUNT_ACCESS_TOKEN", is.present, "自分のProduct Hunt access token"),
      field("PRODUCT_HUNT_COMMERCIAL_API_APPROVED", is.true, "商用許諾を取得した場合だけtrue"),
    ]),
    assess: () => ({ externalActions: ["product_hunt_written_commercial_approval_readback"] }),
    notes: Object.freeze([
      "環境変数だけで商用許諾は成立しません。書面のapproval referenceもsource configへ記録する必要があります。",
    ]),
  }),
});

function selectedProfiles(value) {
  const requested = String(value || "base").split(",").map((item) => item.trim()).filter(Boolean);
  const expanded = requested.includes("all") ? PROFILE_ORDER : requested;
  const unknown = expanded.filter((name) => !PROFILES[name]);
  if (unknown.length) throw new Error(`unknown profile: ${unknown.join(", ")}`);
  return [...new Set(expanded)];
}

function checkProfile(name, env) {
  const profile = PROFILES[name];
  const missing = [];
  const invalid = [];
  const dynamicRequirements = typeof profile.requirements === "function" ? profile.requirements(env) : [];
  for (const requirement of [...profile.fields, ...dynamicRequirements]) {
    if (requirement.name) {
      const value = env[requirement.name];
      if (!String(value == null ? "" : value).trim()) {
        if (!requirement.optional) missing.push(requirement.name);
      } else if (!requirement.validate(value, env)) {
        invalid.push({ name: requirement.name, expectation: requirement.expectation });
      }
      continue;
    }
    const candidates = requirement.names.map((key) => env[key]).filter((value) => String(value == null ? "" : value).trim());
    if (!candidates.length) missing.push(requirement.names.join(" | "));
    else if (requirement.validateEnvironment
      ? !requirement.validateEnvironment(env)
      : !candidates.some((value) => requirement.validate(value, env))) {
      invalid.push({ name: requirement.names.join(" | "), expectation: requirement.expectation });
    }
  }
  if (name === "base") {
    const secretNames = [
      "LM_TELEGRAM_WEBHOOK_SECRET",
      "LM_LATE_APPROVAL_CALLBACK_SECRET",
      "LM_UID_SECRET",
      "LM_PANEL_SESSION_ROTATION_SECRET",
      "LM_FEEDBACK_PROVENANCE_KEY",
      "LM_RELATIONS_HASH_SECRET",
      "LM_CALL_SECRET",
      "LM_INBOUND_SECRET",
      "UNIPILE_NOTIFY_SECRET",
      "LM_BROWSER_SESSION_KEY",
    ];
    const used = new Map();
    for (const key of secretNames) {
      const value = String(env[key] || "");
      if (!value) continue;
      if (used.has(value)) invalid.push({ name: `${used.get(value)} + ${key}`, expectation: "同じsecretを流用しない" });
      else used.set(value, key);
    }
    const publicUsername = String(env.NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    const runtimeUsername = String(env.LM_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    if (publicUsername && publicUsername !== runtimeUsername) {
      invalid.push({ name: "NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME", expectation: "検証済みruntime usernameと一致" });
    }
  }
  if (name === "source"
    && env.LM_DEV_RAILWAY_APP_SERVICE
    && env.LM_DEV_RAILWAY_APP_SERVICE === env.LM_DEV_RAILWAY_POSTGRES_SERVICE) {
    invalid.push({
      name: "LM_DEV_RAILWAY_APP_SERVICE + LM_DEV_RAILWAY_POSTGRES_SERVICE",
      expectation: "異なるRailway serviceを指定",
    });
  }
  const assessment = typeof profile.assess === "function" ? profile.assess(env) || {} : {};
  const codeBlockers = Object.freeze([...(assessment.codeBlockers || [])]);
  const deploymentBlockers = Object.freeze([...(assessment.deploymentBlockers || [])]);
  const externalActions = Object.freeze([...(assessment.externalActions || [])]);
  const warnings = Object.freeze([...(assessment.warnings || [])]);
  const configurationReady = missing.length === 0 && invalid.length === 0;
  const codeReady = codeBlockers.length === 0;
  const deploymentReady = deploymentBlockers.length === 0;
  const status = !configurationReady ? "configuration_incomplete"
    : !codeReady ? "blocked_by_code"
      : !deploymentReady ? "blocked_by_deployment"
        : externalActions.length ? "external_action_required" : "ready_static";
  return Object.freeze({
    name,
    label: profile.label,
    status,
    configurationReady,
    codeReady,
    deploymentReady,
    ok: configurationReady && codeReady && deploymentReady,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
    codeBlockers,
    deploymentBlockers,
    externalActions,
    warnings,
    notes: profile.notes || Object.freeze([]),
  });
}

function checkOwnerTools(env, profiles = ["base"]) {
  const names = Array.isArray(profiles) ? profiles : selectedProfiles(profiles);
  const results = names.map((name) => checkProfile(name, env || {}));
  const configurationReady = results.every((result) => result.configurationReady);
  const codeReady = results.every((result) => result.codeReady);
  const deploymentReady = results.every((result) => result.deploymentReady);
  return Object.freeze({
    ok: configurationReady && codeReady && deploymentReady,
    configurationReady,
    codeReady,
    deploymentReady,
    profiles: Object.freeze(results),
  });
}

function parseArgs(argv) {
  const options = { profile: "base" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--profile" || argument === "--env-file") {
      if (!argv[index + 1]) throw new Error(`${argument} requires a value`);
      options[argument === "--profile" ? "profile" : "envFile"] = argv[++index];
    } else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

function helpText() {
  return [
    "Check installation-owned Rockstar_ibot provider settings without printing secret values.",
    "",
    "Usage:",
    "  npm run owner:check -- --profile all",
    "  npm run owner:check -- --env-file /absolute/private/rockstar_ibot.env --profile base,voice",
    "",
    `Profiles: ${PROFILE_ORDER.join(", ")}, all`,
    "Default env file: deploy/local/.env (process environment overrides file values)",
    "CONFIG PASS covers names, formats, and dependencies only; code/deployment blockers and external readbacks are reported separately.",
  ].join("\n");
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const output = dependencies.stdout || process.stdout;
  if (options.help) { output.write(`${helpText()}\n`); return null; }
  const defaultFile = path.resolve(__dirname, "../../../deploy/local/.env");
  const envFile = path.resolve(options.envFile || defaultFile);
  let fileEnvironment = {};
  try { fileEnvironment = parseEnvContent(await (dependencies.readFile || fs.readFile)(envFile, "utf8")); }
  catch (error) {
    if (options.envFile || error.code !== "ENOENT") throw error;
  }
  const environment = { ...fileEnvironment, ...(dependencies.env || process.env) };
  const report = checkOwnerTools(environment, selectedProfiles(options.profile));
  output.write(`Rockstar_ibot owner configuration: ${report.configurationReady ? "CONFIG PASS" : "CONFIG INCOMPLETE"}\n`);
  output.write(`Known code/deployment blockers: ${report.codeReady && report.deploymentReady ? "NONE" : "PRESENT"}\n`);
  for (const profile of report.profiles) {
    output.write(`${profile.configurationReady ? "CONFIG PASS" : "CONFIG FAIL"} ${profile.name} — ${profile.label} [${profile.status}]\n`);
    if (profile.missing.length) output.write(`  missing: ${profile.missing.join(", ")}\n`);
    for (const item of profile.invalid) output.write(`  invalid: ${item.name} (${item.expectation})\n`);
    for (const code of profile.codeBlockers) output.write(`  code blocker: ${code}\n`);
    for (const code of profile.deploymentBlockers) output.write(`  deployment blocker: ${code}\n`);
    for (const code of profile.externalActions) output.write(`  external action: ${code}\n`);
    for (const code of profile.warnings) output.write(`  warning: ${code}\n`);
    for (const note of profile.notes) output.write(`  note: ${note}\n`);
  }
  output.write("Secret values were not printed.\n");
  if (!report.ok) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`owner configuration check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  PROFILE_ORDER,
  PROFILES,
  parseEnvContent,
  selectedProfiles,
  checkProfile,
  checkOwnerTools,
  parseArgs,
  helpText,
  main,
};
