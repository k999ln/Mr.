import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  auditStartupContext,
  contextDigest,
  loadStartupContext,
  validateStartupContext,
  validatePublicArtifact,
} from "../scripts/startup-context/lib.mjs";
import { buildApplicationKit } from "../scripts/startup-context/build-kit.mjs";

const contextPath = new URL("../.agents/startup-context.json", import.meta.url);
const marketingPath = new URL(
  "../.agents/product-marketing-context.md",
  import.meta.url,
);

function clone(value) {
  return structuredClone(value);
}

test("canonical startup context is valid and names Rockstar_ibot as the product", async () => {
  const context = await loadStartupContext(contextPath);

  assert.equal(context.product.name, "Rockstar_ibot");
  assert.equal(context.owner.github_login, "k999ln");
  assert.equal(context.company.legal_name, null);
  assert.equal(context.company.status, "unconfigured");
  assert.match(context.product.mission, /end suffering/i);
  assert.match(context.product.mission, /all living beings/i);
  assert.deepEqual(context.delivery, {
    local: "Free, open-source, self-hosted Rockstar_ibot.",
    cloud: "A future paid monthly option for an always-on hosted Rockstar_ibot; pricing and billing are not configured.",
  });
  assert.equal(context.traction.current_owner_revenue.display, "not yet verified");
  assert.equal(context.traction.current_owner_revenue.source, "none");
  assert.equal(context.links.product.status, "verified_owner_only");
  assert.equal(context.links.repository.status, "verified_owner_only");
  assert.equal(context.links.telegram.status, "verified");
  assert.equal(context.links.telegram.url, "https://t.me/avocadominibot");
  assert.equal(context.links.demo.status, "verified");
  assert.equal(
    context.links.demo.url,
    "https://effect-os-verified.kirin-999.chatgpt.site/start",
  );
  assert.doesNotMatch(JSON.stringify({ links: context.links, answers: context.application_answers }), /LifeManagerBotbot/);
  assert.doesNotMatch(context.application_answers.progress, /\$1,000|founder attests/i);
  for (const topic of ["mission", "revenue", "users", "applications", "agi"]) {
    const claim = context.claims.find((candidate) => candidate.topic === topic);
    assert.ok(claim, `missing ${topic} claim`);
    assert.equal(typeof claim.source, "string");
    assert.equal(typeof claim.status, "string");
    assert.equal(typeof claim.as_of, "string");
    assert.equal(typeof claim.public_use, "string");
  }
  assert.deepEqual(validateStartupContext(context), []);
});

test("marketing context defines the audience, pain, three organs, and truthful proof", async () => {
  const markdown = await readFile(marketingPath, "utf8");

  for (const heading of [
    "## Product Overview",
    "## Target Audience",
    "## Core Pain / Job to Be Done",
    "## Physical / Mental / Financial Organs",
    "## Differentiation",
    "## Alternatives / Competition",
    "## Objections",
    "## Customer Language",
    "## Brand Voice",
    "## Current Proof and Unknowns",
    "## Fundraising Goals",
  ]) {
    assert.match(markdown, new RegExp(`^${heading}$`, "m"));
  }
});

test("validator rejects missing required fields", async () => {
  const context = clone(await loadStartupContext(contextPath));
  delete context.links.repository;

  assert.match(validateStartupContext(context).join("\n"), /links\.repository/);
});

test("validator rejects an incomplete canonical application answer set", async () => {
  const context = clone(await loadStartupContext(contextPath));
  delete context.application_answers.progress;

  assert.match(validateStartupContext(context).join("\n"), /application_answers\.progress/);
});

test("validator accepts an unconfigured Telegram integration without a public link", async () => {
  const context = clone(await loadStartupContext(contextPath));

  context.links.telegram = {
    status: "unconfigured",
    url: null,
    expected_text: null,
    verified_at: null,
    evidence: "No installation-owned Telegram bot is configured.",
  };

  assert.equal(context.links.telegram.status, "unconfigured");
  assert.equal(context.links.telegram.url, null);
  assert.deepEqual(validateStartupContext(context), []);

  context.links.telegram = {
    status: "verified",
    url: null,
    expected_text: null,
    verified_at: null,
    evidence: "Incomplete verified Telegram link.",
  };
  assert.match(validateStartupContext(context).join("\n"), /links\.telegram\.url is required when verified/);
});

test("validator rejects product and company name confusion", async () => {
  const context = clone(await loadStartupContext(contextPath));
  context.company.status = "configured";
  context.company.legal_name = context.product.name;

  assert.match(validateStartupContext(context).join("\n"), /product.*company/i);
});

test("validator rejects claims without evidence", async () => {
  const context = clone(await loadStartupContext(contextPath));
  context.claims.push({
    id: "unsupported-growth",
    topic: "growth",
    statement: "Rockstar_ibot guarantees investment returns.",
    source: "none",
    status: "unsupported",
    as_of: "2026-08-27T00:20:00+09:00",
    public_use: "prohibited",
    evidence: [],
  });

  const errors = validateStartupContext(context).join("\n");
  assert.match(errors, /unsupported-growth/);
  assert.match(errors, /evidence/i);
});

test("validator rejects a claim without provenance", async () => {
  const context = clone(await loadStartupContext(contextPath));
  delete context.claims.find((claim) => claim.topic === "revenue").source;

  assert.match(validateStartupContext(context).join("\n"), /current-owner-revenue: source is required/);
});

test("context digest is stable and changes with the facts", async () => {
  const context = await loadStartupContext(contextPath);
  const sameFacts = clone(context);
  const changedFacts = clone(context);
  changedFacts.product.name = "Different Product";

  assert.equal(contextDigest(context), contextDigest(sameFacts));
  assert.notEqual(contextDigest(context), contextDigest(changedFacts));
  assert.match(contextDigest(context), /^[a-f0-9]{64}$/);
});

test("audit detects stale facts and reports unverified optional media", async () => {
  const context = clone(await loadStartupContext(contextPath));
  const result = await auditStartupContext(context, {
    now: new Date("2026-10-02T00:00:00+09:00"),
    maxAgeDays: 30,
    checkLinks: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /stale/i);
  assert.match(result.warnings.join("\n"), /links\.founder_video.*unverified/i);
  assert.match(result.warnings.join("\n"), /links\.dashboard.*unconfigured/i);
  assert.doesNotMatch(result.warnings.join("\n"), /links\.(?:demo|telegram).*unverified/i);
});

test("audit rejects forbidden legacy exact values", async () => {
  const context = clone(await loadStartupContext(contextPath));
  context.links.repository.url = context.forbidden_exact_values.repositories[0];

  const result = await auditStartupContext(context, {
    now: new Date("2026-08-02T13:00:00+09:00"),
    checkLinks: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /forbidden.*repository/i);
});

test("audit reads back every verified canonical link", async () => {
  const context = clone(await loadStartupContext(contextPath));
  for (const key of ["product", "repository"]) {
    context.links[key].status = "verified";
    context.links[key].expected_text = "Rockstar_ibot";
    context.links[key].verified_at = "2026-09-05T02:01:00+09:00";
  }
  const verifiedKeys = Object.entries(context.links)
    .filter(([, link]) => link.status === "verified")
    .map(([key]) => key);
  const expectedByUrl = new Map(
    verifiedKeys.map((key) => [
      context.links[key].url,
      context.links[key].expected_text,
    ]),
  );
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return new Response(
      `${expectedByUrl.get(url)} Rockstar_ibot ${context.context_version} ${contextDigest(context)}`,
      { status: 200 },
    );
  };

  const result = await auditStartupContext(context, {
    now: new Date("2026-09-05T02:10:00+09:00"),
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    requested.sort(),
    verifiedKeys
      .map((key) => context.links[key].url)
      .sort(),
  );
  assert.equal(result.link_checks.every((check) => check.ok), true);
});

test("audit rejects a public product page bound to an old startup context", async () => {
  const context = clone(await loadStartupContext(contextPath));
  context.links.product.status = "verified";
  context.links.repository.status = "verified";
  context.links.repository.expected_text = "Rockstar_ibot";
  context.links.repository.verified_at = "2026-08-28T00:00:00-04:00";
  const result = await auditStartupContext(context, {
    now: new Date("2026-08-28T13:00:00-04:00"),
    fetchImpl: async () => new Response("Rockstar_ibot 2026-08-01.1 stale-digest", { status: 200 }),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /product.*context digest/i);
});

test("audit rejects a 200 page that does not contain the expected product identity", async () => {
  const context = clone(await loadStartupContext(contextPath));
  context.links.product.status = "verified";
  context.links.repository.status = "verified";
  context.links.repository.expected_text = "Rockstar_ibot";
  context.links.repository.verified_at = "2026-08-28T00:00:00-04:00";
  const result = await auditStartupContext(context, {
    now: new Date("2026-08-28T13:00:00-04:00"),
    fetchImpl: async () => new Response("Unrelated legacy product", { status: 200 }),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /expected text/i);
});

test("primary README first view explains the current avocadomini production slice", async () => {
  const readme = (await readFile(new URL("../README.md", import.meta.url), "utf8")).slice(0, 4_000);

  assert.match(readme, /avocadomini/);
  assert.match(readme, /Rockstar_ibot/);
  assert.match(readme, /Telegram/);
  assert.match(readme, /10種類から1〜3種類/);
  assert.match(readme, /公式readbackがない操作は成功扱いにしません/);
  assert.match(readme, /\/home/);
  assert.match(readme, /effect-os-verified\.kirin-999\.chatgpt\.site/);
  assert.doesNotMatch(readme, /Live Dashboard/);
});

test("Japanese compatibility README points to the current safe Telegram journey", async () => {
  const readme = (await readFile(new URL("../README.ja.md", import.meta.url), "utf8")).slice(0, 4_000);

  assert.match(readme, /avocadomini/);
  assert.match(readme, /10種類から1〜3種類/);
  assert.match(readme, /Telegram/);
  assert.match(readme, /下書き・確認結果/);
  assert.match(readme, /接続・本人確認・公式receipt/);
  assert.match(readme, /\/help/);
  assert.match(readme, /life-manager-one-hub\.kirin-999\.chatgpt\.site/);
  assert.doesNotMatch(readme, /Live Dashboard/);
});

test("both public READMEs use canonical product links without a fixed Telegram bot", async () => {
  const context = await loadStartupContext(contextPath);

  for (const file of ["README.md", "README.ja.md"]) {
    const content = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(content, new RegExp(context.product.name), file);
    assert.match(content, new RegExp(context.links.product.url.replaceAll(".", "\\.")), file);
    assert.match(content, new RegExp(context.links.repository.url.replaceAll(".", "\\.")), file);
    assert.doesNotMatch(content, /LifeManagerBotbot|t\.me\/BotFather/i, file);
  }
});

test("application kit is deterministic and bound to the canonical context digest", async () => {
  const context = await loadStartupContext(contextPath);
  const directory = await mkdtemp(join(tmpdir(), "rockstar_ibot-kit-"));

  try {
    const first = await buildApplicationKit({ context, outputDirectory: directory });
    const firstContents = Object.fromEntries(
      await Promise.all(first.files.map(async (file) => [file, await readFile(join(directory, file), "utf8")])),
    );
    const second = await buildApplicationKit({ context, outputDirectory: directory });
    const secondContents = Object.fromEntries(
      await Promise.all(second.files.map(async (file) => [file, await readFile(join(directory, file), "utf8")])),
    );

    assert.deepEqual(second, first);
    assert.deepEqual(secondContents, firstContents);
    assert.deepEqual((await readdir(directory)).sort(), first.files.toSorted());
    for (const content of Object.values(firstContents)) {
      assert.match(content, new RegExp(context.context_version.replaceAll(".", "\\.")));
      assert.match(content, new RegExp(contextDigest(context)));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generated application kit describes Rockstar_ibot without unverified media", async () => {
  const context = await loadStartupContext(contextPath);
  const directory = await mkdtemp(join(tmpdir(), "rockstar_ibot-kit-"));

  try {
    await buildApplicationKit({ context, outputDirectory: directory });
    const answers = await readFile(join(directory, "answers.en.md"), "utf8");
    const deck = await readFile(join(directory, "deck.md"), "utf8");
    const assets = JSON.parse(await readFile(join(directory, "assets.json"), "utf8"));

    assert.match(answers, /body, mind, and money/i);
    assert.match(answers, /Telegram/);
    assert.match(answers, /all living beings/i);
    assert.match(answers, /No receipt-backed Rockstar_ibot revenue claim has been verified for Kai/i);
    assert.match(answers, /open-source/i);
    assert.match(answers, /paid monthly subscription/i);
    assert.match(deck, /Daily Organ/);
    assert.match(deck, /Financial Organ/);
    assert.match(deck, /t\.me\/avocadominibot/i);
    assert.match(deck, /effect-os-verified\.kirin-999\.chatgpt\.site/i);
    assert.doesNotMatch(deck, /public repository and Telegram entry point/i);
    assert.equal(assets.assets.some((asset) => asset.type === "telegram" && asset.status === "verified"), true);
    assert.equal(assets.assets.some((asset) => asset.type === "demo" && asset.status === "verified"), true);
    assert.equal(assets.assets.some((asset) => asset.type === "product"), false);
    assert.equal(assets.assets.some((asset) => asset.type === "repository"), false);
    assert.equal(
      assets.excluded.some((asset) => asset.type === "product" && asset.status === "verified_owner_only"),
      true,
    );
    assert.equal(
      assets.excluded.some((asset) => asset.type === "repository" && asset.status === "verified_owner_only"),
      true,
    );
    assert.equal(assets.assets.some((asset) => asset.status === "verified" && asset.type === "video"), false);

    for (const file of await readdir(directory)) {
      const content = await readFile(join(directory, file), "utf8");
      assert.doesNotMatch(content, /LifeManagerBotbot|t\.me\/BotFather/i, file);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the committed fundraising kit matches the canonical startup context", async () => {
  const context = await loadStartupContext(contextPath);

  for (const file of ["README.md", "answers.en.md", "answers.ja.md", "assets.json", "deck.md", "one-pager.md"]) {
    const content = await readFile(new URL(`../fundraising/application-kit/${file}`, import.meta.url), "utf8");
    assert.deepEqual(validatePublicArtifact(content, context), [], file);
  }
});

test("public artifact validator blocks legacy product values, PII, and placeholders", async () => {
  const context = await loadStartupContext(contextPath);
  const digest = contextDigest(context);
  const metadata = `context-version: ${context.context_version}\ncontext-digest: ${digest}\n`;

  assert.match(validatePublicArtifact(`${metadata}Repository: https://github.com/Daisuke134/anicca-oss`, context).join("\n"), /forbidden/i);
  assert.match(validatePublicArtifact(`${metadata}Contact: private-person@example.com`, context).join("\n"), /email/i);
  assert.match(validatePublicArtifact(`${metadata}Answer: {{traction}}`, context).join("\n"), /placeholder/i);
  assert.match(validatePublicArtifact(`${metadata}Rockstar_ibot is an AGI.`, context).join("\n"), /achieved-agi/);
  assert.match(validatePublicArtifact(`${metadata}Rockstar_ibot has 10,000 users.`, context).join("\n"), /numeric-users/);
  assert.match(validatePublicArtifact(`${metadata}Rockstar_ibot was accepted to Example Accelerator.`, context).join("\n"), /unverified-application-outcome/);
  assert.deepEqual(validatePublicArtifact(`${metadata}Product: Rockstar_ibot`, context), []);
});
