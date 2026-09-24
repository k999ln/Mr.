import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_ROLE_IDS,
  EXPECTED_STYLE_CODES,
  botFamilyCatalog,
  createGatewayDeploymentPlan,
  getBotPackage,
  getMainBotPackage,
  listBotPackages,
  validateBotFamilyCatalog,
} from "../index.mjs";
import { STYLE_QUESTIONS, selectPersonalityStyle } from "../style-selector.mjs";

test("catalog contains exactly sixteen style packages and four operating-role packages", () => {
  const validation = validateBotFamilyCatalog();
  assert.deepEqual(validation, { ok: true, errors: [] });
  const packages = listBotPackages();
  assert.equal(packages.length, 20);
  assert.deepEqual(packages.filter((profile) => profile.kind === "personality_style").map((profile) => profile.styleCode).sort(), [...EXPECTED_STYLE_CODES].sort());
  assert.deepEqual(packages.filter((profile) => profile.kind === "operating_role").map((profile) => profile.id).sort(), [...EXPECTED_ROLE_IDS].sort());
});

test("Mr. Bot is the only main entry point and specialists return to it", () => {
  assert.equal(botFamilyCatalog.routing.mainProfileId, "mr-bot");
  assert.equal(botFamilyCatalog.routing.defaultEntryPoint, "mr-bot");
  assert.equal(botFamilyCatalog.routing.specialistReturnProfileId, "mr-bot");
  assert.equal(botFamilyCatalog.routing.handoffMode, "proposal_with_user_confirmation");
  assert.equal(getMainBotPackage().displayName, "Mr. Bot");
  assert.deepEqual(listBotPackages().filter((profile) => profile.isMain).map((profile) => profile.id), ["mr-bot"]);
});

test("avocadominibot is the only public Telegram username", () => {
  assert.equal(botFamilyCatalog.runtime.gatewayPublicUsername, "avocadominibot");
  assert.equal(botFamilyCatalog.runtime.gatewayPublicChannelUsername, null);
  assert.deepEqual(listBotPackages().filter((profile) => profile.publicUsername).map((profile) => profile.id), ["mr-bot"]);
  assert.equal(getMainBotPackage().publicUsername, "avocadominibot");
  assert.equal(listBotPackages().some((profile) => Object.hasOwn(profile, "usernameCandidates")), false);
});

test("deployment plan uses one gateway token for twenty internal profiles", () => {
  const result = createGatewayDeploymentPlan();
  assert.equal(result.ok, true);
  assert.equal(result.deployments.length, 1);
  const deployment = result.deployments[0];
  assert.equal(deployment.deploymentMode, "byob_single");
  assert.equal(deployment.publicUsername, "avocadominibot");
  assert.equal(deployment.internalProfileIds.length, 20);
  assert.equal(new Set(deployment.internalProfileIds).size, 20);
  assert.equal(deployment.runtimeEnvironment.LM_BOT_PROFILE_MODE, "internal_multi_profile");
  assert.equal(deployment.credentialBinding.source, "vault://telegram/mr-bot/bot-token");
  assert.equal(deployment.credentialBinding.committedToGit, false);
  assert.equal(Object.hasOwn(deployment.runtimeEnvironment, "LM_TELEGRAM_BOT_TOKEN"), false);
});

test("personality selection requires consent and reports a non-diagnostic, overridable style", () => {
  assert.deepEqual(selectPersonalityStyle(), {
    ok: false,
    errors: ["style_selection_consent_required"],
    classification: null,
  });
  const answers = Object.fromEntries(STYLE_QUESTIONS.map((question) => [question.id, "left"]));
  const result = selectPersonalityStyle({ consent: true, answers });
  assert.equal(result.ok, true);
  assert.equal(result.classification.styleCode, "ENTP");
  assert.equal(result.classification.profileId, "entp");
  assert.equal(result.classification.status, "self_reflection_style_not_diagnosis");
  assert.equal(result.classification.userMayOverride, true);
});

test("profile overlays cannot add a money, medical, publishing, or autonomous external effect", () => {
  const serialized = JSON.stringify(botFamilyCatalog);
  assert.doesNotMatch(serialized, /"money"\s*,?/);
  assert.doesNotMatch(serialized, /medical_diagnosis/);
  assert.doesNotMatch(serialized, /autonomous_publish/);
  assert.doesNotMatch(serialized, /profit_guarantee/);
  assert.equal(getBotPackage("baby").capabilities.includes("earning_workflow_proposal"), true);
  assert.equal(getBotPackage("bot-mother").capabilities.includes("essentials_intake"), true);
});

test("validator rejects a credential-like value, a public specialist, and a twenty-first package", () => {
  const mutated = structuredClone(botFamilyCatalog);
  mutated.packages.push({ ...mutated.packages[0], id: "extra", usernameCandidates: ["ExtraOneBot", "ExtraTwoBot"] });
  mutated.runtime.token = "123456789:abcdefghijklmnopqrstuvwxyzABCDE";
  mutated.packages[0].publicUsername = "ExtraOneBot";
  const result = validateBotFamilyCatalog(mutated);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(","), /exactly_20_packages_required/);
  assert.match(result.errors.join(","), /credential_field_prohibited/);
  assert.match(result.errors.join(","), /telegram_token_like_value_prohibited/);
  assert.match(result.errors.join(","), /internal_profile_must_not_have_public_username:entp/);
});
