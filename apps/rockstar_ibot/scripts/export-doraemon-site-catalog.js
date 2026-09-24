#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DORAEMON_FEATURE_CATALOG } = require("../lib/doraemon-feature-catalog.js");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SITE_FILE = path.join(REPO_ROOT, "apps/doraemon-marketing-site/app/doraemon-tool-catalog.json");

function renderedCatalog() {
  const rows = DORAEMON_FEATURE_CATALOG.map((feature) => ({
    key: feature.key,
    actor: feature.actor,
    verb: feature.verb,
    detail: feature.detail,
    marketingTitle: feature.marketingTitle,
    marketingBody: feature.marketingBody,
  }));
  return `${JSON.stringify(rows, null, 2)}\n`;
}

function main(args = process.argv.slice(2)) {
  const expected = renderedCatalog();
  if (args.includes("--check")) {
    const current = fs.existsSync(SITE_FILE) ? fs.readFileSync(SITE_FILE, "utf8") : "";
    if (current !== expected) {
      console.error("doraemon site catalog is stale; run export-doraemon-site-catalog.js");
      return 1;
    }
    console.log("doraemon site catalog is current");
    return 0;
  }
  fs.writeFileSync(SITE_FILE, expected, "utf8");
  console.log(path.relative(REPO_ROOT, SITE_FILE));
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { SITE_FILE, renderedCatalog, main };
