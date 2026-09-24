#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  contextDigest,
  loadStartupContext,
  validatePublicArtifact,
  validateStartupContext,
} from "./lib.mjs";

function metadata(context, digest) {
  return `<!-- generated from .agents/startup-context.json; do not edit -->
context-version: ${context.context_version}
context-digest: ${digest}
`;
}

function linkLine(label, link) {
  if (link.status === "verified") return `- ${label}: ${link.url}`;
  if (link.status === "verified_owner_only") {
    return `- ${label}: owner-only; do not attach to a public application`;
  }
  if (link.status === "pending_creation") return `- ${label}: pending creation`;
  return `- ${label}: not configured`;
}

function markdownArtifacts(context, digest) {
  const head = metadata(context, digest);
  const product = context.product.name;
  const answers = context.application_answers;
  const mission = context.product.mission;
  const vision = context.product.vision;
  const localDelivery = context.delivery.local;
  const cloudDelivery = context.delivery.cloud;
  const traction = context.traction.current_owner_revenue.evidence;
  const links = [
    linkLine("Product page", context.links.product),
    linkLine("Repository", context.links.repository),
    linkLine("Telegram", context.links.telegram),
  ].join("\n");
  const telegramProof = context.links.telegram.status === "verified"
    ? `The installation-owned public Telegram bot is verified at ${context.links.telegram.url}.`
    : "No canonical public Telegram bot is verified.";
  const demoProof = context.links.demo.status === "verified"
    ? `The public avocadomini entry point is verified at ${context.links.demo.url}.`
    : "No public product demo is verified.";

  return {
    "README.md": `${head}
# ${product} fundraising application kit

This directory is generated from the Kai-owned startup context. Adapt answers to each program's official questions, but do not attach owner-only, pending, or unverified links.

${links}
- Demo video: not verified; do not attach
- Founder video: not verified; do not attach

Past submissions and former-owner accounts are historical evidence, not sources for current claims.
`,
    "answers.en.md": `${head}
# ${product} — canonical fundraising answers

## One word

${answers.one_word}

## Describe the company in 50 characters or less

${answers.short_description}

## What is the product?

${context.product.one_liner}

## What problem are you solving?

${answers.problem}

## How do you solve it?

${answers.solution}

## Why are you building this?

${answers.why_building}

## How far along are you?

${answers.progress}

## Who is the market?

${answers.market}

## How do you make money?

${answers.business_model}

## What is different?

${answers.differentiation}

## How are you building it?

${answers.how_built}

## How will you use the funds?

${answers.use_of_funds}

## Mission and long-term vision

${mission} ${vision}

## Verified delivery and traction boundary

${localDelivery} ${cloudDelivery} ${traction}

## Links

${links}
`,
    "answers.ja.md": `${head}
# ${product} — 資金調達応募の正本回答

## 何を作っていますか

${product}は、身体・心・お金と現実のfollow-throughを管理し、委任範囲で行動して、設置者が接続したTelegram botへ証拠付きの結果を返せるproactive general agentです。

## 何をしますか

Daily Organは予定と応募を進め、Physical / Mental Organは生活習慣とwellbeingを支え、Financial Organは総資産、収支、支出、収入機会、crypto、riskを制御した資産運用を管理します。提案だけで終わらず、許可された行動を実行し、receiptを保存します。

## Missionと長期vision

${mission} ${vision}

## 現在地

${answers.progress} ${traction}

## Business model

${localDelivery} ${cloudDelivery}

## 導線

${links}
`,
    "deck.md": `${head}
# ${product} deck source

## 1 — Rockstar_ibot

A proactive general agent for body, mind, money, and real-world follow-through.

## 2 — Problem

People know what would improve their lives, but action stops between disconnected calendars, forms, health routines, and financial accounts.

## 3 — Product

One manager coordinates specialist organs, executes within delegated boundaries, verifies the result, and can report through an installation-owned Telegram bot after it is connected.

## 4 — Daily Organ

Calendar, priorities, applications, and follow-through.

## 5 — Physical / Mental Organ

Routines, wellbeing, and continuity of care.

## 6 — Financial Organ

Cash flow, expenses, income opportunities, and risk-managed investing.

## 7 — Trust architecture

Least privilege, deterministic money arithmetic, typed state transitions, receipts, and fail-closed reporting.

## 8 — Delivery

${localDelivery} ${cloudDelivery}

## 9 — Current proof

An owner-only Hub and an installation-owned Telegram connector exist. ${telegramProof} ${demoProof} The canonical repository remains private; billing and receipt-backed revenue are not verified.

## 10 — Mission

${mission}
`,
    "one-pager.md": `${head}
# ${product}

${context.product.one_liner}

## The problem

A person's life is split across calendars, applications, health routines, bank accounts, investments, and dashboards. Advice is abundant; dependable execution and verification are scarce.

## The product

${product} coordinates a Daily Organ, a Physical / Mental Organ, and a Financial Organ. It uses specialist agents for semantic work and deterministic code for arithmetic, state, permissions, and receipts.

## Mission

${mission} ${vision}

## Current boundary

Begin with Kai's local runtime and owner-only Hub. ${traction} ${cloudDelivery}

## Trust

Least privilege, owner-separated accounts, no invented success, no guaranteed financial returns, and explicit provenance for every claim.

## Links

${links}
`,
  };
}

export async function buildApplicationKit({ context, outputDirectory }) {
  const errors = validateStartupContext(context);
  if (errors.length > 0) throw new Error(`Invalid startup context:
${errors.join("\n")}`);

  const digest = contextDigest(context);
  const artifacts = markdownArtifacts(context, digest);
  const links = ["product", "repository", "telegram", "dashboard", "demo", "founder_video"];
  const assets = {
    context_version: context.context_version,
    context_digest: digest,
    assets: links
      .filter((type) => context.links[type].status === "verified")
      .map((type) => ({ type, status: "verified", url: context.links[type].url })),
    excluded: links
      .filter((type) => context.links[type].status !== "verified")
      .map((type) => ({
        type,
        status: context.links[type].status,
        reason: context.links[type].evidence,
      })),
  };
  artifacts["assets.json"] = `${JSON.stringify(assets, null, 2)}\n`;

  for (const [file, content] of Object.entries(artifacts)) {
    const artifactErrors = validatePublicArtifact(content, context);
    if (artifactErrors.length > 0) {
      throw new Error(`${file} failed public artifact validation:
${artifactErrors.join("\n")}`);
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const [file, content] of Object.entries(artifacts)) {
    await writeFile(resolve(outputDirectory, file), content, "utf8");
  }

  return {
    context_version: context.context_version,
    context_digest: digest,
    files: Object.keys(artifacts).sort(),
  };
}

async function main() {
  const contextPath = new URL("../../.agents/startup-context.json", import.meta.url);
  const outputDirectory = fileURLToPath(new URL("../../fundraising/application-kit/", import.meta.url));
  const context = await loadStartupContext(contextPath);
  const result = await buildApplicationKit({ context, outputDirectory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
