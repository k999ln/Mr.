"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  parseEnvContent,
  selectedProfiles,
  checkOwnerTools,
  parseArgs,
  main,
} = require("./check-owner-tools.js");

function baseEnvironment() {
  return {
    LM_TELEGRAM_MODE: "byob_single",
    LM_TELEGRAM_BOT_TOKEN: `123456:${"a".repeat(32)}`,
    LM_TELEGRAM_BOT_USERNAME: "KaiOwnerBot",
    NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME: "KaiOwnerBot",
    LM_TELEGRAM_WEBHOOK_SECRET: "a".repeat(64),
    LM_LATE_APPROVAL_CALLBACK_SECRET: "b".repeat(64),
    LM_PUBLIC_URL: "https://life.owner.test",
    LM_WEB_ORIGIN: "https://web.owner.test",
    SUPABASE_URL: "https://owner.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"c".repeat(32)}`,
    LM_UID_SECRET: "d".repeat(64),
    LM_PANEL_SESSION_ROTATION_SECRET: "e".repeat(64),
    LM_FEEDBACK_PROVENANCE_KEY: "f".repeat(64),
    LM_RELATIONS_HASH_SECRET: "1".repeat(64),
    LM_TIME_ZONE: "Asia/Tokyo",
  };
}

function calendarCore() {
  return {
    LIFE_MAPS_KEY: "owner-maps-key",
    GEMINI_API_KEY: "owner-gemini-key",
  };
}

function sourceEnvironment() {
  return {
    LM_GITHUB_REPOSITORY: "operator/rockstar_ibot",
    LM_DEV_RAILWAY_PROJECT_ID: "123e4567-e89b-42d3-a456-426614174000",
    LM_DEV_RAILWAY_APP_SERVICE: "rockstar_ibot",
    LM_DEV_RAILWAY_POSTGRES_SERVICE: "postgres",
    LM_DEV_RAILWAY_ENVIRONMENT: "production",
    LM_DEV_HEALTH_URL: "https://life.owner.test/health",
  };
}

function browserEnvironment() {
  return {
    LM_MODE: "local",
    LM_BROWSER_TASKS_ENABLED: "1",
    LM_BROWSER_SESSION_KEY: "2".repeat(64),
    LM_FEEDBACK_DATABASE_URL: "postgresql://owner:password@db.owner.test/life_manager",
    GEMINI_API_KEY: "owner-gemini-key",
    LM_TELEGRAM_BOT_TOKEN: `123456:${"t".repeat(32)}`,
  };
}

function socialEnvironment(capability = "marketing.rockstar-ibot.daily.publish") {
  const dataDir = "/var/lib/rockstar_ibot/data";
  return {
    LM_RUNTIME_TENANT_ID: "owner-tenant",
    LM_WORKER_CAPABILITIES: capability,
    LM_DATA_DIR: dataDir,
    LM_POSTIZ_API_KEY: "owner-postiz-key",
    LM_INSTAGRAM_HANDLE: "owner.account",
    LM_INSTAGRAM_ACCOUNTS_PATH: `${dataDir}/instagram/accounts.json`,
    LM_INSTAGRAM_SETTINGS_PATH: `${dataDir}/instagram/settings.json`,
    LM_INSTAGRAM_CREDENTIALS_PATH: `${dataDir}/instagram/credentials.json`,
    LM_INSTAGRAM_PROFILE_STATE_DIR: `${dataDir}/instagram/state`,
    LM_TIKTOK_INTEGRATION: "owner-tiktok-integration",
  };
}

test("env parser accepts export and quotes without expanding secret text", () => {
  assert.deepEqual(parseEnvContent("# private\nexport A='one two'\nB=three\nA=last\n"), { A: "last", B: "three" });
});

test("base accepts runtime fallbacks but rejects public and Supabase key impersonation", () => {
  const env = baseEnvironment();
  delete env.LM_PUBLIC_URL;
  env.RAILWAY_PUBLIC_DOMAIN = "life-owner.up.railway.app";
  delete env.LM_PANEL_BASE_URL;
  assert.equal(checkOwnerTools(env, ["base"]).configurationReady, true);

  const publishable = checkOwnerTools({
    ...env,
    SUPABASE_SERVICE_ROLE_KEY: `sb_publishable_${"x".repeat(32)}`,
  }, ["base"]);
  assert.equal(publishable.configurationReady, false);
  assert.deepEqual(publishable.profiles[0].invalid.map((item) => item.name), ["SUPABASE_SERVICE_ROLE_KEY"]);

  const shadowedFallback = checkOwnerTools({ ...env, LM_PUBLIC_URL: "http://invalid.owner.test" }, ["base"]);
  assert.equal(shadowedFallback.configurationReady, false, "an invalid explicit URL shadows Railway in runtime too");
});

test("base profile accepts separate owner secrets and rejects reuse without returning values", () => {
  const valid = checkOwnerTools(baseEnvironment(), ["base"]);
  assert.equal(valid.ok, true);
  assert.equal(valid.profiles[0].status, "external_action_required");

  const reusedSecret = "a".repeat(64);
  const reused = checkOwnerTools({ ...baseEnvironment(), LM_UID_SECRET: reusedSecret }, ["base"]);
  assert.equal(reused.ok, false);
  assert.match(reused.profiles[0].invalid.map((item) => item.name).join(" "), /LM_TELEGRAM_WEBHOOK_SECRET \+ LM_UID_SECRET/);
  assert.doesNotMatch(JSON.stringify(reused), new RegExp(reusedSecret));
});

test("source profile is operator-only, fail-closed, and independent from Core", () => {
  const baseOnly = checkOwnerTools(baseEnvironment(), ["base"]);
  assert.equal(baseOnly.configurationReady, true, "Core must not require the optional self-heal lane");

  const missing = checkOwnerTools({}, ["source"]);
  assert.deepEqual(missing.profiles[0].missing, [
    "LM_GITHUB_REPOSITORY",
    "LM_DEV_RAILWAY_PROJECT_ID",
    "LM_DEV_RAILWAY_APP_SERVICE",
    "LM_DEV_RAILWAY_POSTGRES_SERVICE",
    "LM_DEV_RAILWAY_ENVIRONMENT",
    "LM_DEV_HEALTH_URL",
  ]);

  const configured = checkOwnerTools(sourceEnvironment(), ["source"]);
  assert.equal(configured.configurationReady, true);
  assert.equal(configured.profiles[0].status, "external_action_required");
  assert.match(configured.profiles[0].externalActions.join(" "), /viewer_permission/);

  const invalid = checkOwnerTools({
    ...sourceEnvironment(),
    LM_GITHUB_REPOSITORY: "https://github.com/operator/rockstar_ibot",
    LM_DEV_RAILWAY_PROJECT_ID: "project-name-not-id",
    LM_DEV_HEALTH_URL: "http://life.owner.test/health?token=bad",
  }, ["source"]);
  assert.deepEqual(invalid.profiles[0].invalid.map((item) => item.name), [
    "LM_GITHUB_REPOSITORY", "LM_DEV_RAILWAY_PROJECT_ID", "LM_DEV_HEALTH_URL",
  ]);
});

test("calendar requirements follow the exact transport precedence", () => {
  const incomplete = checkOwnerTools({ COMPOSIO_API_KEY: "owner-composio" }, ["calendar"]);
  assert.equal(incomplete.configurationReady, false);
  assert.deepEqual(new Set(incomplete.profiles[0].missing), new Set([
    "COMPOSIO_GCAL_AUTH_CONFIG",
    "LIFE_MAPS_KEY | GOOGLE_API_KEY",
    "GEMINI_API_KEY",
  ]));

  const composio = checkOwnerTools({
    ...calendarCore(),
    COMPOSIO_API_KEY: "owner-composio",
    COMPOSIO_GCAL_AUTH_CONFIG: "ac_owner",
  }, ["calendar"]);
  assert.equal(composio.ok, true);
  assert.equal(composio.profiles[0].status, "external_action_required");

  const shadowedMaps = checkOwnerTools({
    ...calendarCore(),
    LIFE_MAPS_KEY: "replace-me",
    GOOGLE_API_KEY: "owner-google-key",
    COMPOSIO_API_KEY: "owner-composio",
    COMPOSIO_GCAL_AUTH_CONFIG: "ac_owner",
  }, ["calendar"]);
  assert.equal(shadowedMaps.configurationReady, false, "LIFE_MAPS_KEY has runtime precedence");

  const gog = checkOwnerTools({
    ...calendarCore(),
    LIFE_TRANSPORT: "gog",
    GOG_ACCOUNT: "calendar@owner.test",
  }, ["calendar"]);
  assert.equal(gog.profiles[0].configurationReady, true);
  assert.equal(gog.profiles[0].status, "blocked_by_code");
  assert.deepEqual(gog.profiles[0].codeBlockers, ["travel_and_ask_loops_require_composio"]);

  const unipileOverride = checkOwnerTools({
    ...calendarCore(),
    LIFE_TRANSPORT: "gog",
    LIFE_CAL_TRANSPORT: "unipile",
    UNIPILE_DSN: "api.owner.test:13111",
    UNIPILE_TOKEN: "owner-unipile-token",
  }, ["calendar"]);
  assert.equal(unipileOverride.profiles[0].configurationReady, true);
  assert.equal(unipileOverride.profiles[0].status, "blocked_by_code");
  assert.match(unipileOverride.profiles[0].codeBlockers.join(" "), /panel_onboarding/);
});

test("voice validates AMD semantics and requires a real public key only while AMD is on", () => {
  const common = {
    TELNYX_API_KEY: "owner-telnyx-key",
    TELNYX_CONNECTION_ID: "owner-call-control",
    TELNYX_PHONE_NUMBER: "+12025550123",
    PUBLIC_WSS: "wss://voice.owner.test",
    LM_CALL_SECRET: "v".repeat(64),
    GEMINI_API_KEY: "owner-gemini-key",
  };
  const amdOff = checkOwnerTools({ ...common, LM_AMD: "off" }, ["voice"]);
  assert.equal(amdOff.configurationReady, true);
  assert.equal(amdOff.ok, true);

  const missingKey = checkOwnerTools(common, ["voice"]);
  assert.deepEqual(missingKey.profiles[0].missing, ["TELNYX_PUBLIC_KEY"]);

  const validKey = Buffer.alloc(32, 7).toString("base64");
  const amdOn = checkOwnerTools({ ...common, LM_AMD: "on", TELNYX_PUBLIC_KEY: validKey }, ["voice"]);
  assert.equal(amdOn.configurationReady, true);

  const pem = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  const pemKey = checkOwnerTools({ ...common, TELNYX_PUBLIC_KEY: pem }, ["voice"]);
  assert.equal(pemKey.configurationReady, true);

  const misleadingOff = checkOwnerTools({ ...common, LM_AMD: "false" }, ["voice"]);
  assert.match(JSON.stringify(misleadingOff.profiles[0].invalid), /LM_AMD/);
});

test("billing follows runtime Payment Link precedence and does not require Stripe API key", () => {
  const legacyAlias = checkOwnerTools({
    STRIPE_WEBHOOK_SECRET: `whsec_${"s".repeat(32)}`,
    STRIPE_PAYMENT_LINK: "https://buy.stripe.com/owner_subscription",
  }, ["billing"]);
  assert.equal(legacyAlias.configurationReady, true);

  const shadowedAlias = checkOwnerTools({
    STRIPE_WEBHOOK_SECRET: `whsec_${"s".repeat(32)}`,
    LM_STRIPE_PAYMENT_LINK: "https://evil.owner.test/pay",
    STRIPE_PAYMENT_LINK: "https://buy.stripe.com/owner_subscription",
  }, ["billing"]);
  assert.equal(shadowedAlias.configurationReady, false, "LM_STRIPE_PAYMENT_LINK has runtime precedence");
  assert.equal(shadowedAlias.profiles[0].invalid[0].name, "LM_STRIPE_PAYMENT_LINK | STRIPE_PAYMENT_LINK");

  const productionDev = checkOwnerTools({
    STRIPE_WEBHOOK_SECRET: `whsec_${"s".repeat(32)}`,
    STRIPE_PAYMENT_LINK: "https://buy.stripe.com/owner_subscription",
    STRIPE_DEV: "1",
    NODE_ENV: "production",
  }, ["billing"]);
  assert.match(JSON.stringify(productionDev.profiles[0].invalid), /STRIPE_DEV/);
});

test("mail separates valid Resend configuration from the Gmail code blocker", () => {
  const resend = {
    RESEND_API_KEY: "owner-resend-key",
    LM_MAIL_FROM: "Rockstar_ibot <hello@owner.test>",
    LM_REPLY_DOMAIN: "reply.owner.test",
    LM_INBOUND_SECRET: "m".repeat(64),
  };
  const resendOnly = checkOwnerTools(resend, ["mail"]);
  assert.equal(resendOnly.configurationReady, true);
  assert.equal(resendOnly.codeReady, false);
  assert.equal(resendOnly.profiles[0].status, "blocked_by_code");
  assert.match(resendOnly.profiles[0].codeBlockers.join(" "), /resend_inbound_signature/);

  const partialGmail = checkOwnerTools({ ...resend, UNIPILE_NOTIFY_SECRET: "n".repeat(64) }, ["mail"]);
  assert.equal(partialGmail.configurationReady, false);
  assert.deepEqual([...partialGmail.profiles[0].missing].sort(), [
    "LM_PUBLIC_URL | RAILWAY_PUBLIC_DOMAIN", "LM_UID_SECRET", "UNIPILE_DSN", "UNIPILE_TOKEN",
  ].sort());

  const configuredGmail = checkOwnerTools({
    ...resend,
    UNIPILE_DSN: "api.owner.test:13111",
    UNIPILE_TOKEN: "owner-unipile-token",
    UNIPILE_NOTIFY_SECRET: "n".repeat(64),
    LM_UID_SECRET: "u".repeat(64),
    LM_PUBLIC_URL: "https://life.owner.test",
  }, ["mail"]);
  assert.equal(configuredGmail.configurationReady, true);
  assert.equal(configuredGmail.codeReady, false);
  assert.equal(configuredGmail.profiles[0].status, "blocked_by_code");
  assert.match(configuredGmail.profiles[0].codeBlockers.join(" "), /gmail_onboarding_disabled/);
});

test("browser reports deployment blockers separately and keeps identity fields optional", () => {
  const local = checkOwnerTools(browserEnvironment(), ["browser"]);
  assert.equal(local.configurationReady, true);
  assert.equal(local.codeReady, true);
  assert.equal(local.deploymentReady, false);
  assert.equal(local.profiles[0].status, "blocked_by_deployment");
  assert.match(local.profiles[0].warnings.join(" "), /browser_email_missing/);

  const railway = checkOwnerTools({ ...browserEnvironment(), LM_MODE: "railway" }, ["browser"]);
  assert.equal(railway.ok, true);
  assert.equal(railway.profiles[0].status, "external_action_required");
});

test("social requires a publish capability, capability-specific refs, and owner-data paths", () => {
  const daily = checkOwnerTools(socialEnvironment(), ["social"]);
  assert.equal(daily.configurationReady, true);
  assert.equal(daily.ok, false);
  assert.equal(daily.profiles[0].status, "blocked_by_code");
  assert.deepEqual(daily.profiles[0].codeBlockers, ["legacy_social_lanes_require_owner_adapter_rebuild"]);

  const videoMissingRefs = checkOwnerTools(socialEnvironment("marketing.video.publish"), ["social"]);
  assert.deepEqual(videoMissingRefs.profiles[0].missing, [
    "LM_HONNE_EN_INSTAGRAM_PROFILE_REF", "LM_HONNE_EN_TIKTOK_INTEGRATION_REF",
  ]);

  const video = checkOwnerTools({
    ...socialEnvironment("runtime.noop,marketing.video.publish"),
    LM_HONNE_EN_INSTAGRAM_PROFILE_REF: "profile://instagram/owner",
    LM_HONNE_EN_TIKTOK_INTEGRATION_REF: "integration://postiz/tiktok/owner",
  }, ["social"]);
  assert.equal(video.configurationReady, true);

  const outsideOwnerData = checkOwnerTools({
    ...socialEnvironment(),
    LM_INSTAGRAM_CREDENTIALS_PATH: "/tmp/credentials.json",
  }, ["social"]);
  assert.match(JSON.stringify(outsideOwnerData.profiles[0].invalid), /LM_INSTAGRAM_CREDENTIALS_PATH/);

  const disabled = checkOwnerTools({
    ...socialEnvironment(),
    LM_WORKER_CAPABILITIES: "runtime.noop,marketing.liveness.telegram",
  }, ["social"]);
  assert.match(JSON.stringify(disabled.profiles[0].invalid), /LM_WORKER_CAPABILITIES/);
});

test("provider-specific bad formats are reported by name", () => {
  const result = checkOwnerTools({
    TELNYX_API_KEY: "owner-telnyx",
    TELNYX_CONNECTION_ID: "owner-call-control",
    TELNYX_PHONE_NUMBER: "090-0000-0000",
    TELNYX_PUBLIC_KEY: "public-key",
    PUBLIC_WSS: "https://not-wss.owner.test",
    LM_CALL_SECRET: "2".repeat(64),
    GEMINI_API_KEY: "owner-gemini",
    STRIPE_WEBHOOK_SECRET: "not-a-whsec",
    LM_STRIPE_PAYMENT_LINK: "https://evil.owner.test/pay",
    LM_BROWSER_TASKS_ENABLED: "true",
    LM_BROWSER_SESSION_KEY: "not-hex",
    LM_FEEDBACK_DATABASE_URL: "https://database.owner.test",
    LM_TELEGRAM_BOT_TOKEN: `123456:${"a".repeat(32)}`,
  }, ["voice", "billing", "browser"]);
  assert.equal(result.configurationReady, false);
  const invalid = JSON.stringify(result.profiles.map((profile) => profile.invalid));
  assert.match(invalid, /TELNYX_PHONE_NUMBER/);
  assert.match(invalid, /STRIPE_WEBHOOK_SECRET/);
  assert.match(invalid, /LM_BROWSER_SESSION_KEY/);
});

test("profile and argument parsing are bounded", () => {
  assert.deepEqual(selectedProfiles("voice,base,voice"), ["voice", "base"]);
  assert.equal(selectedProfiles("all").length, 10);
  assert.ok(selectedProfiles("all").includes("source"));
  assert.throws(() => selectedProfiles("unknown"), /unknown profile/);
  assert.deepEqual(parseArgs(["--profile", "base,voice", "--env-file", "/tmp/private.env"]), {
    profile: "base,voice", envFile: "/tmp/private.env",
  });
});

test("CLI does not describe incomplete configuration as runtime-ready", async () => {
  let output = "";
  const previousExitCode = process.exitCode;
  try {
    const report = await main(["--profile", "base"], {
      readFile: async () => "",
      env: {},
      stdout: { write: (chunk) => { output += String(chunk); } },
    });
    assert.equal(report.configurationReady, false);
    assert.match(output, /owner configuration: CONFIG INCOMPLETE/);
    assert.match(output, /Known code\/deployment blockers: NONE/);
    assert.doesNotMatch(output, /runtime blockers: NONE/);
  } finally {
    process.exitCode = previousExitCode || 0;
  }
});

test("CLI and structured report never contain configured secret values", async () => {
  const secrets = {
    token: `123456:${"z".repeat(32)}`,
    supabase: `sb_secret_${"q".repeat(32)}`,
    uid: "u".repeat(65),
  };
  const env = {
    ...baseEnvironment(),
    LM_TELEGRAM_BOT_TOKEN: secrets.token,
    SUPABASE_SERVICE_ROLE_KEY: secrets.supabase,
    LM_UID_SECRET: secrets.uid,
  };
  let output = "";
  const report = await main(["--profile", "base"], {
    readFile: async () => "",
    env,
    stdout: { write: (chunk) => { output += String(chunk); } },
  });
  assert.equal(report.ok, true);
  const serialized = JSON.stringify(report);
  for (const secret of Object.values(secrets)) {
    assert.equal(output.includes(secret), false);
    assert.equal(serialized.includes(secret), false);
  }
  assert.match(output, /CONFIG PASS base/);
  assert.match(output, /Known code\/deployment blockers: NONE/);
  assert.match(output, /Secret values were not printed/);
});
