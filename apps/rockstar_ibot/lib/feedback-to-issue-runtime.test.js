"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


test("D0 generates issues before running the canonical developer loop", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../scripts/rockstar_ibot-dev-d0.sh"),
    "utf8",
  );
  const worker = source.indexOf("feedback-to-issue.js");
  const picker = source.indexOf("gh issue list");
  assert.notEqual(worker, -1);
  assert.notEqual(picker, -1);
  assert.equal(worker < picker, true);
  assert.doesNotMatch(source, /(DATABASE_PUBLIC_URL|GH_TOKEN|GITHUB_TOKEN)=/);
});


test("D0 requires an explicit writable operator repo and gates PR creation on tests and evals", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../scripts/rockstar_ibot-dev-d0.sh"),
    "utf8",
  );
  assert.match(source, /LM_GITHUB_REPOSITORY/);
  assert.match(source, /gh repo view/);
  assert.match(source, /viewerPermission/);
  assert.match(source, /WRITE.*MAINTAIN.*ADMIN|ADMIN.*MAINTAIN.*WRITE/);
  assert.match(source, /origin must match LM_GITHUB_REPOSITORY/);
  assert.doesNotMatch(source, /Daisuke134\/rockstar_ibot|k999ln\/rockstar_ibot/);
  assert.match(source, /apps\/rockstar_ibot/);
  assert.match(source, /origin\/main/);
  assert.match(source, /LM_DEV_EXISTING_WORKTREE/);
  assert.match(source, /LM_DEV_BRANCH/);
  assert.match(source, /run_agent\.sh/);
  assert.doesNotMatch(source, /anicca-products|apps\/life-call|origin\/dev/);

  const tests = source.indexOf("npm test");
  const evals = source.indexOf("npm run eval");
  const createPr = source.indexOf("gh pr create");
  assert.equal(tests > 0, true);
  assert.equal(evals > tests, true);
  assert.equal(createPr > evals, true);
  assert.doesNotMatch(source, /gh pr merge/);
});


test("D0 fails closed when the fresh agent runner fails", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../scripts/rockstar_ibot-dev-d0.sh"),
    "utf8",
  );
  assert.match(source, /--loop\s+"rockstar_ibot-dev"/);
  const agentExit = source.indexOf('if [ "$AGENT_RC" -ne 0 ]');
  const tests = source.indexOf("npm test");
  const createPr = source.indexOf("gh pr create");
  assert.equal(agentExit > 0, true);
  assert.equal(agentExit < tests, true);
  assert.equal(agentExit < createPr, true);
});
