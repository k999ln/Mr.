"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  baseUrl,
  codexPrompt,
  isolatedCodexEnvironment,
  redactSensitive,
  runCodex,
  runOne,
} = require("./codex-telegram-bridge.js");

test("bridge requires an HTTPS Core URL and keeps edit mode explicit", () => {
  assert.equal(baseUrl({ LM_CODEX_BRIDGE_BASE_URL: "https://core.example/" }), "https://core.example");
  assert.throws(() => baseUrl({ LM_CODEX_BRIDGE_BASE_URL: "http://core.example" }), /https/);
  assert.match(codexPrompt({ mode: "read-only", prompt: "確認して" }), /読み取り専用/);
  assert.match(codexPrompt({ mode: "workspace-write", prompt: "更新して" }), /編集モード/);
  const featurePrompt = codexPrompt({ job_kind: "doraemon_feature", mode: "read-only", prompt: "返信案を作る" });
  assert.match(featurePrompt, /隔離実行/);
  assert.match(featurePrompt, /リポジトリ.*調べたり変更したりしない/);
  assert.match(featurePrompt, /ブラウザ.*起動しない/);
  assert.match(featurePrompt, /画面を操作してはいけません/);
  assert.doesNotMatch(featurePrompt, /対象リポジトリ/);
  const commandPrompt = codexPrompt({ job_kind: "doraemon_command", mode: "read-only", prompt: "まとめて作る" });
  assert.match(commandPrompt, /隔離実行/);
  assert.doesNotMatch(commandPrompt, /対象リポジトリ/);
});

test("isolated Doraemon environment drops provider secrets and disables browser launch", () => {
  const env = isolatedCodexEnvironment({
    HOME: "/Users/fixture",
    PATH: "/usr/bin:/bin",
    CODEX_HOME: "/Users/fixture/.codex-work",
    OPENAI_API_KEY: "must-not-pass",
    STRIPE_SECRET_KEY: "must-not-pass",
    LM_TELEGRAM_BOT_TOKEN: "must-not-pass",
  });
  assert.equal(env.HOME, "/Users/fixture");
  assert.equal(env.CODEX_HOME, "/Users/fixture/.codex-work");
  assert.equal(env.BROWSER, "/usr/bin/false");
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.LM_TELEGRAM_BOT_TOKEN, undefined);
});

test("Doraemon Codex process ignores user plugins and receives only the isolated environment", async () => {
  let spawned;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  const resultPromise = runCodex({
    uid: "lm_tg_100",
    job_kind: "doraemon_feature",
    feature_key: "nurture",
    mode: "read-only",
    prompt: "返信案を作る",
  }, {
    codexBin: "/fixture/codex",
    timeoutMs: 1_000,
    env: {
      HOME: "/Users/fixture",
      PATH: "/usr/bin:/bin",
      CODEX_HOME: "/Users/fixture/.codex-work",
      STRIPE_SECRET_KEY: "must-not-pass",
      LM_TELEGRAM_BOT_TOKEN: "must-not-pass",
    },
    spawnImpl: (file, args, options) => {
      spawned = { file, args, options };
      queueMicrotask(() => {
        child.stdout.emit("data", "返信案ができました");
        child.emit("close", 0, null);
      });
      return child;
    },
  });
  const result = await resultPromise;
  assert.equal(result.status, "completed");
  assert.equal(spawned.file, "/fixture/codex");
  for (const arg of ["--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "shell_environment_policy.inherit=none", "read-only"]) {
    assert.ok(spawned.args.includes(arg), `missing ${arg}`);
  }
  assert.equal(spawned.options.env.BROWSER, "/usr/bin/false");
  assert.equal(spawned.options.env.STRIPE_SECRET_KEY, undefined);
  assert.equal(spawned.options.env.LM_TELEGRAM_BOT_TOKEN, undefined);
});

test("an empty Codex response is never reported as completed", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  const resultPromise = runCodex({
    uid: "lm_tg_100", job_kind: "doraemon_feature", feature_key: "nurture",
    mode: "read-only", prompt: "返信案を作る",
  }, {
    codexBin: "/fixture/codex",
    timeoutMs: 1_000,
    spawnImpl: () => {
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
  });
  const result = await resultPromise;
  assert.equal(result.status, "failed");
  assert.equal(result.failureCode, "invalid_result");
});

test("bridge redacts common credential-shaped output", () => {
  assert.equal(redactSensitive("api_key=abc sk_live_123 Bearer xyz"), "[redacted] [redacted] Bearer [redacted]");
});

test("bridge claims one job, runs Codex, and posts only the result envelope", async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith("/next")) return new Response(JSON.stringify({ job: {
      id: "00000000-0000-4000-8000-000000000001", prompt: "確認して", mode: "read-only",
    } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const result = await runOne({
    env: { LM_CODEX_BRIDGE_BASE_URL: "https://core.example" },
    token: "bridge-secret",
    fetchImpl,
    runCodex: async (job) => {
      assert.equal(job.prompt, "確認して");
      return { status: "completed", result: "確認しました", exitCode: 0, codexSessionId: null };
    },
  });
  assert.equal(result.status, "submitted");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/next$/);
  assert.match(requests[1].url, /\/result$/);
  assert.match(requests[1].init.body, /確認しました/);
  assert.equal(requests[1].init.headers.Authorization, "Bearer bridge-secret");
});

test("Doraemon bridge retries only a classified transient failure and submits a safety receipt", async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith("/next")) return new Response(JSON.stringify({ job: {
      id: "00000000-0000-4000-8000-000000000002",
      uid: "lm_tg_100",
      job_kind: "doraemon_feature",
      feature_key: "nurture",
      prompt: "返信案を作る",
      mode: "read-only",
    } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  let executions = 0;
  await runOne({
    env: { LM_CODEX_BRIDGE_BASE_URL: "https://core.example" },
    token: "bridge-secret",
    fetchImpl,
    retryDelayMs: 0,
    retryWait: async () => {},
    runCodex: async () => {
      executions += 1;
      return executions === 1
        ? { status: "failed", result: "一時的な障害", failureCode: "upstream_unavailable", exitCode: 1 }
        : { status: "completed", result: "返信案ができました", exitCode: 0 };
    },
  });
  assert.equal(executions, 2);
  const submitted = JSON.parse(requests.at(-1).init.body);
  assert.equal(submitted.status, "completed");
  assert.equal(submitted.safety.recoveryState, "recovered");
  assert.equal(submitted.safety.attempts, 2);
  assert.equal(submitted.safety.screenImpact, "none");
  assert.equal(submitted.safety.browserAccess, "denied");
  assert.equal(submitted.safety.externalEffect, "denied");
});
