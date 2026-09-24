#!/usr/bin/env node
// Local side of the Telegram↔Codex bridge.
//
// This process must run on Kai's Mac because the ChatGPT/Codex login is local. It polls the
// Railway Core queue; Railway never receives CODEX_HOME, auth.json, or any other local credential.
"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const {
  classifyExecutionFailure,
  runWithDoraemonSafetyGate,
} = require("../lib/doraemon-safety-gate.js");

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_KEYCHAIN_SERVICE = "com.k999ln.mr.codex-telegram-bridge";
const DEFAULT_POLL_MS = 2_000;
const DEFAULT_LEASE_SECONDS = 900;
const MAX_RESULT = 16_000;

function redactSensitive(value) {
  return String(value || "")
    .replace(/\b(?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, "[redacted]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function baseUrl(env = process.env) {
  const value = String(env.LM_CODEX_BRIDGE_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(value)) throw new Error("LM_CODEX_BRIDGE_BASE_URL must be an https URL");
  return value;
}

async function keychainToken(env = process.env, execImpl = execFileAsync) {
  if (String(env.LM_CODEX_BRIDGE_TOKEN || "").trim()) return String(env.LM_CODEX_BRIDGE_TOKEN).trim();
  const service = String(env.LM_CODEX_BRIDGE_TOKEN_SERVICE || DEFAULT_KEYCHAIN_SERVICE).trim();
  const account = String(env.LM_CODEX_BRIDGE_TOKEN_ACCOUNT || os.userInfo().username).trim();
  if (!service || !account) throw new Error("Codex bridge Keychain reference is unavailable");
  try {
    const result = await execImpl("/usr/bin/security", ["find-generic-password", "-a", account, "-s", service, "-w"]);
    const token = String(result && result.stdout || "").trim();
    if (!token) throw new Error("empty token");
    return token;
  } catch {
    throw new Error("Codex bridge token is not available in the local Keychain");
  }
}

function requestHeaders(token) {
  return { Authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function apiRequest(url, token, init = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { ...requestHeaders(token), ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`bridge api http ${response.status}`);
  return response.json().catch(() => ({}));
}

function codexPrompt(job) {
  if (job && ["doraemon_feature", "doraemon_command"].includes(job.job_kind)) {
    return [
      "あなたはavocadominiの利用者向け成果物だけを作る隔離実行担当です。",
      "ファイル、端末、リポジトリ、環境変数、アカウント、ネットワーク上のサービスを調べたり変更したりしないでください。",
      "ブラウザ、デスクトップアプリ、GUI、open、osascript、外部コネクタを起動しないでください。利用者の画面を操作してはいけません。",
      "秘密値や内部情報を出力しないでください。外部への公開・送信・決済・返金・権限変更・送金は実行しないでください。",
      "以下の仕事の指示に従い、利用者へ返す日本語の下書き本文だけを作ってください。",
      "",
      String(job.prompt || "").slice(0, 12_000),
    ].join("\n");
  }
  return [
    "あなたはKai所有のMr.リポジトリを扱う、Telegram経由のCodex実行担当です。",
    `対象リポジトリ: ${REPO_ROOT}`,
    "必ずAGENTS.mdとMrのプロジェクト指示を守ってください。",
    "秘密値、アクセストークン、個人情報を出力・コミット・Telegramへ転送しないでください。",
    "vvvvや旧Rockstar系を修正先・push先・deploy先に使わないでください。",
    "git reset --hard、git clean、広い範囲の削除、秘密値の表示、外部への送信・決済・公開は実行しないでください。",
    job.mode === "workspace-write"
      ? "このジョブは編集モードです。必要なファイルだけ変更し、変更内容と検証結果を最後に短く報告してください。"
      : "このジョブは読み取り専用モードです。ファイルを変更せず、確認結果と提案だけを報告してください。",
    "",
    "Kaiからの指示:",
    String(job.prompt || "").slice(0, 12_000),
  ].join("\n");
}

function isolatedCodexEnvironment(env = process.env) {
  const allowed = [
    "HOME", "USER", "LOGNAME", "PATH", "SHELL", "TMPDIR", "TMP", "TEMP",
    "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS",
  ];
  const result = {};
  for (const key of allowed) {
    if (typeof env[key] === "string" && env[key]) result[key] = env[key];
  }
  result.CODEX_HOME = String(env.CODEX_HOME || "/Users/noelle/.codex-work");
  result.BROWSER = "/usr/bin/false";
  result.GIT_TERMINAL_PROMPT = "0";
  result.NO_COLOR = "1";
  return result;
}

async function runCodex(job, options = {}) {
  const featureJob = job && ["doraemon_feature", "doraemon_command"].includes(job.job_kind);
  const temporaryWorkdir = featureJob
    ? await fs.mkdtemp(path.join(os.tmpdir(), "avocadomini-job-"))
    : null;
  const workdir = temporaryWorkdir || path.resolve(options.workdir || process.env.LM_CODEX_WORKDIR || REPO_ROOT);
  const codexBin = options.codexBin || process.env.CODEX_BIN || "/Users/noelle/.local/bin/codex";
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 20 * 60 * 1000;
  const spawnImpl = options.spawnImpl || spawn;
  const outputPath = path.join(os.tmpdir(), `mr-codex-result-${process.pid}-${Date.now()}.txt`);
  const args = [
    "exec", "--ephemeral",
    ...(featureJob ? [
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "-c", "shell_environment_policy.inherit=none",
    ] : []),
    "--color", "never", "--sandbox", job.mode === "workspace-write" ? "workspace-write" : "read-only",
    "-C", workdir, "-o", outputPath,
  ];
  if (job.mode === "workspace-write") args.splice(2, 0, "--approve-for-me");
  args.push(codexPrompt(job));

  try {
    return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceKillTimer = null;
    const child = spawnImpl(codexBin, args, {
      cwd: workdir,
      env: featureJob
        ? isolatedCodexEnvironment(options.env || process.env)
        : { ...process.env, CODEX_HOME: process.env.CODEX_HOME || "/Users/noelle/.codex-work" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      forceKillTimer = setTimeout(() => {
        if (!settled) try { child.kill("SIGKILL"); } catch {}
      }, Number.isSafeInteger(options.killGraceMs) ? options.killGraceMs : 5_000);
    }, timeoutMs);
    const finish = async (code, signal, processError = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      let result = "";
      try { result = await fs.readFile(outputPath, "utf8"); } catch {}
      try { await fs.unlink(outputPath); } catch {}
      result = redactSensitive(String(result || stdout || "").trim());
      const hasResult = result.length > 0;
      if (!result) result = signal ? `Codexが時間切れになりました (${signal})。` : `Codexの実行に失敗しました (終了コード ${code == null ? "不明" : code})。`;
      resolve({
        status: code === 0 && hasResult ? "completed" : "failed",
        result: result.slice(0, MAX_RESULT),
        exitCode: Number.isInteger(code) ? code : null,
        codexSessionId: null,
        failureCode: code === 0 && hasResult
          ? null
          : code === 0
            ? "invalid_result"
            : classifyExecutionFailure({
              timedOut,
              errorCode: processError && processError.code,
              diagnostics: stderr,
            }),
      });
    };
    child.once("error", (error) => finish(1, null, error));
    child.once("close", (code, signal) => finish(code, signal));
    });
  } finally {
    if (temporaryWorkdir) {
      try { await fs.rm(temporaryWorkdir, { recursive: true, force: true }); } catch {}
    }
  }
}

async function runOne(options = {}) {
  const root = baseUrl(options.env || process.env);
  const token = options.token || await keychainToken(options.env || process.env, options.execFileImpl || execFileAsync);
  const next = await apiRequest(`${root}/internal/codex/jobs/next`, token, {}, options.fetchImpl);
  const job = next && next.job;
  if (!job) return { status: "idle" };
  let result;
  try {
    const execute = options.runCodex
      ? (nextJob, context) => options.runCodex(nextJob, context)
      : (nextJob) => runCodex(nextJob, options);
    result = await runWithDoraemonSafetyGate(job, execute, {
      retryDelayMs: options.retryDelayMs,
      wait: options.retryWait,
    });
  } catch (error) {
    result = { status: "failed", result: "Codexブリッジの実行に失敗しました。", exitCode: 1, codexSessionId: null };
    if (options.log) options.log(`job execution failed: ${String(error && error.message || error)}`);
  }
  let submitted = false;
  let lastError;
  for (let attempt = 0; attempt < 3 && !submitted; attempt += 1) {
    try {
      await apiRequest(`${root}/internal/codex/jobs/${encodeURIComponent(String(job.id))}/result`, token, {
        method: "POST",
        body: JSON.stringify(result),
      }, options.fetchImpl);
      submitted = true;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  if (!submitted) throw lastError || new Error("codex result submission failed");
  return { status: "submitted", jobId: String(job.id), resultStatus: result.status };
}

async function runForever(options = {}) {
  const env = options.env || process.env;
  const pollMs = Number.isInteger(options.pollMs) ? options.pollMs : DEFAULT_POLL_MS;
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  while (!stopped) {
    try { await runOne({ ...options, env }); }
    catch (error) { if (options.log) options.log(`poll failed: ${String(error && error.message || error)}`); }
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { status: "stopped" };
}

if (require.main === module) {
  runForever({ log: (message) => console.error(`[codex-bridge] ${message}`) })
    .catch((error) => { console.error(`[codex-bridge] stopped: ${String(error && error.message || error)}`); process.exitCode = 1; });
}

module.exports = {
  REPO_ROOT,
  DEFAULT_KEYCHAIN_SERVICE,
  baseUrl,
  keychainToken,
  codexPrompt,
  isolatedCodexEnvironment,
  redactSensitive,
  runCodex,
  runOne,
  runForever,
};
