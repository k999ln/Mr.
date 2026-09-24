import { readFileSync } from "node:fs";

const catalogUrl = new URL("./catalog.json", import.meta.url);
const EXPECTED_STYLE_CODES = Object.freeze([
  "ENTP", "ENTJ", "ENFP", "ENFJ",
  "ESTP", "ESTJ", "ESFP", "ESFJ",
  "INTP", "INTJ", "INFP", "INFJ",
  "ISTP", "ISTJ", "ISFP", "ISFJ",
]);
const EXPECTED_ROLE_IDS = Object.freeze(["mr-bot", "bot-mother", "baby", "life-guard"]);
const USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;
const SAFE_CAPABILITIES = new Set([
  "conversation",
  "planning",
  "reflection",
  "request_intake",
  "orchestration_proposal",
  "essentials_intake",
  "earning_workflow_proposal",
  "safety_review",
]);

function loadCatalog() {
  return JSON.parse(readFileSync(catalogUrl, "utf8"));
}

export const botFamilyCatalog = Object.freeze(loadCatalog());

const clean = (value) => String(value ?? "").trim();

export function normalizeBotUsername(value) {
  const username = clean(value).replace(/^@/, "");
  if (!USERNAME_RE.test(username) || !/bot$/i.test(username)) return "";
  return username;
}

export function validateBotFamilyCatalog(catalog = botFamilyCatalog) {
  const errors = [];
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const ids = new Set();
  const styleCodes = [];
  const roleIds = [];

  if (catalog?.schemaVersion !== 2) errors.push("schema_version_must_be_2");
  if (catalog?.familyId !== "rockstar_ibot-telegram-bot-family") errors.push("family_id_invalid");
  if (catalog?.runtime?.mode !== "byob_single") errors.push("runtime_must_be_byob_single");
  if (catalog?.runtime?.profileMode !== "internal_multi_profile") errors.push("profile_mode_must_be_internal_multi_profile");
  if (catalog?.runtime?.gatewayProfileId !== "mr-bot") errors.push("gateway_profile_must_be_mr_bot");
  if (normalizeBotUsername(catalog?.runtime?.gatewayPublicUsername) !== "avocadominibot") errors.push("gateway_username_must_be_avocadominibot");
  if (catalog?.runtime?.gatewayPublicChannelUsername !== null) errors.push("gateway_channel_must_be_unset_until_owner_confirmed");
  if (catalog?.runtime?.sharedBackend !== "rockstar_ibot-core") errors.push("shared_backend_invalid");
  if (catalog?.runtime?.tokenStorage !== "external_vault_only") errors.push("token_storage_must_be_external_vault_only");
  if (catalog?.routing?.mainProfileId !== "mr-bot") errors.push("main_profile_must_be_mr_bot");
  if (catalog?.routing?.defaultEntryPoint !== "mr-bot") errors.push("default_entry_point_must_be_mr_bot");
  if (catalog?.routing?.specialistReturnProfileId !== "mr-bot") errors.push("specialist_return_profile_must_be_mr_bot");
  if (catalog?.routing?.specialistDelivery !== "internal_profile") errors.push("specialist_delivery_must_be_internal_profile");
  if (catalog?.routing?.handoffMode !== "proposal_with_user_confirmation") errors.push("handoff_mode_invalid");
  if (catalog?.policy?.diagnosticClaim !== false) errors.push("diagnostic_claim_must_be_false");
  if (catalog?.policy?.highImpactDecisionUse !== "prohibited") errors.push("high_impact_decision_use_must_be_prohibited");
  if (packages.length !== 20) errors.push("exactly_20_packages_required");

  for (const profile of packages) {
    const id = clean(profile?.id);
    if (!id || ids.has(id)) errors.push(`profile_id_invalid_or_duplicate:${id || "missing"}`);
    ids.add(id);

    if (profile?.kind === "personality_style") styleCodes.push(clean(profile.styleCode).toUpperCase());
    else if (profile?.kind === "operating_role") roleIds.push(id);
    else errors.push(`profile_kind_invalid:${id}`);

    if (!clean(profile?.displayName)) errors.push(`display_name_required:${id}`);
    if (!clean(profile?.mission)) errors.push(`mission_required:${id}`);
    if (!Array.isArray(profile?.operatingRules) || profile.operatingRules.length < 3) {
      errors.push(`operating_rules_incomplete:${id}`);
    }
    if (!Array.isArray(profile?.capabilities) || profile.capabilities.length === 0) {
      errors.push(`capabilities_required:${id}`);
    } else {
      for (const capability of profile.capabilities) {
        if (!SAFE_CAPABILITIES.has(capability)) errors.push(`capability_not_allowed:${id}:${capability}`);
      }
    }

    const publicUsername = clean(profile?.publicUsername);
    if (id === "mr-bot") {
      if (normalizeBotUsername(publicUsername) !== catalog?.runtime?.gatewayPublicUsername) errors.push("mr_bot_public_username_invalid");
    } else if (publicUsername || Object.hasOwn(profile, "usernameCandidates")) {
      errors.push(`internal_profile_must_not_have_public_username:${id}`);
    }
  }

  const actualStyles = [...new Set(styleCodes)].sort();
  const expectedStyles = [...EXPECTED_STYLE_CODES].sort();
  if (JSON.stringify(actualStyles) !== JSON.stringify(expectedStyles)) errors.push("personality_style_set_invalid");
  const actualRoles = [...new Set(roleIds)].sort();
  const expectedRoles = [...EXPECTED_ROLE_IDS].sort();
  if (JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles)) errors.push("operating_role_set_invalid");
  const mainProfiles = packages.filter((profile) => profile?.isMain === true);
  if (mainProfiles.length !== 1 || mainProfiles[0]?.id !== "mr-bot") errors.push("exactly_one_mr_bot_main_required");

  const serialized = JSON.stringify(catalog);
  if (/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/.test(serialized)) errors.push("telegram_token_like_value_prohibited");
  if (/"(?:token|secret|password)"\s*:/i.test(serialized)) errors.push("credential_field_prohibited");

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function listBotPackages() {
  const validation = validateBotFamilyCatalog();
  if (!validation.ok) throw new Error(validation.errors.join(","));
  return botFamilyCatalog.packages.map((profile) => structuredClone(profile));
}

export function getBotPackage(profileId) {
  const id = clean(profileId).toLowerCase();
  const profile = botFamilyCatalog.packages.find((candidate) => candidate.id === id);
  return profile ? structuredClone(profile) : null;
}

export function getMainBotPackage() {
  return getBotPackage(botFamilyCatalog.routing.mainProfileId);
}

export function createGatewayDeploymentPlan() {
  const validation = validateBotFamilyCatalog();
  if (!validation.ok) return { ok: false, errors: validation.errors, deployments: [] };
  const main = getMainBotPackage();
  const deployment = {
    profileId: main.id,
    isMain: true,
    displayName: main.displayName,
    publicUsername: botFamilyCatalog.runtime.gatewayPublicUsername,
    deploymentMode: "byob_single",
    sharedBackend: "rockstar_ibot-core",
    internalProfileIds: botFamilyCatalog.packages.map((profile) => profile.id),
    runtimeEnvironment: {
      LM_TELEGRAM_MODE: "byob_single",
      LM_TELEGRAM_BOT_USERNAME: botFamilyCatalog.runtime.gatewayPublicUsername,
      LM_BOT_PROFILE_ID: main.id,
      LM_BOT_PROFILE_MODE: "internal_multi_profile",
      LM_BOT_IS_MAIN: "true",
    },
    credentialBinding: {
      environmentName: "LM_TELEGRAM_BOT_TOKEN",
      source: "vault://telegram/mr-bot/bot-token",
      committedToGit: false,
    },
  };
  return { ok: true, errors: [], deployments: [deployment] };
}

export { EXPECTED_ROLE_IDS, EXPECTED_STYLE_CODES };
