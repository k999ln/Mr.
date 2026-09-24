#!/usr/bin/env node
"use strict";

const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { Pool } = require("pg");
const { persistFeedback } = require("../lib/feedback-intake.js");
const { runControlledErrorInjection } = require("../lib/error-injection.js");

const RAILWAY_PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAILWAY_SELECTOR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;


function ownerRailwayTarget(env = process.env) {
  const projectId = String(env.LM_DEV_RAILWAY_PROJECT_ID || "").trim();
  const appService = String(env.LM_DEV_RAILWAY_APP_SERVICE || "").trim();
  const postgresService = String(env.LM_DEV_RAILWAY_POSTGRES_SERVICE || "").trim();
  const environment = String(env.LM_DEV_RAILWAY_ENVIRONMENT || "").trim();
  if (!RAILWAY_PROJECT_ID.test(projectId)) {
    throw new Error("LM_DEV_RAILWAY_PROJECT_ID invalid");
  }
  for (const [name, value] of [
    ["LM_DEV_RAILWAY_APP_SERVICE", appService],
    ["LM_DEV_RAILWAY_POSTGRES_SERVICE", postgresService],
    ["LM_DEV_RAILWAY_ENVIRONMENT", environment],
  ]) {
    if (!RAILWAY_SELECTOR.test(value)) throw new Error(`${name} invalid`);
  }
  if (appService === postgresService) {
    throw new Error("error intake Railway services must be distinct");
  }
  return Object.freeze({ projectId, appService, postgresService, environment });
}


function railwayVariables(target, service, execute = execFileSync) {
  if (
    !target
    || (service !== target.appService && service !== target.postgresService)
  ) throw new Error("error intake Railway service invalid");
  return JSON.parse(execute(
    "railway",
    [
      "variables",
      "-p", target.projectId,
      "-s", service,
      "-e", target.environment,
      "--json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ));
}


function timeoutProbe() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("controlled_timeout")), 25);
    Promise.resolve(new Promise(() => {})).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}


async function sideEffectProbe() {
  execFileSync(process.execPath, ["-e", "process.exit(23)"], {
    stdio: "ignore",
  });
}


async function runtimeProbe() {
  const server = http.createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("controlled");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let httpFailed = false;
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    httpFailed = response.status >= 500;
    await response.arrayBuffer();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  let evalFailed = false;
  try {
    execFileSync(process.execPath, ["-e", "process.exit(1)"], {
      stdio: "ignore",
    });
  } catch {
    evalFailed = true;
  }
  if (httpFailed && evalFailed) throw new Error("controlled_runtime_regression");
}


async function main() {
  const target = ownerRailwayTarget();
  const database = railwayVariables(target, target.postgresService).DATABASE_PUBLIC_URL;
  const appVariables = railwayVariables(target, target.appService);
  const provenanceKey = appVariables.LM_FEEDBACK_PROVENANCE_KEY || appVariables.LM_UID_SECRET;
  if (!database || !provenanceKey) throw new Error("error_intake_production_variables_unavailable");
  const pool = new Pool({ connectionString: database });
  try {
    const results = await runControlledErrorInjection({
      provenanceKey,
      timeoutProbe,
      sideEffectProbe,
      runtimeProbe,
      persist: (intake) => persistFeedback(intake, { query: pool.query.bind(pool) }),
    });
    process.stdout.write(`${JSON.stringify({ incidents: results })}\n`);
  } finally {
    await pool.end();
  }
}


if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`error-intake-inject failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}


module.exports = { ownerRailwayTarget, railwayVariables };
