"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ownerRailwayTarget,
  railwayVariables,
} = require("./error-intake-inject.js");

const VALID_ENV = Object.freeze({
  LM_DEV_RAILWAY_PROJECT_ID: "11111111-2222-4333-8444-555555555555",
  LM_DEV_RAILWAY_APP_SERVICE: "life-core",
  LM_DEV_RAILWAY_POSTGRES_SERVICE: "life-postgres",
  LM_DEV_RAILWAY_ENVIRONMENT: "production",
});

test("error injection requires a complete explicit owner Railway target", () => {
  for (const name of Object.keys(VALID_ENV)) {
    assert.throws(
      () => ownerRailwayTarget({ ...VALID_ENV, [name]: "" }),
      new RegExp(name),
    );
  }

  assert.deepEqual(ownerRailwayTarget(VALID_ENV), {
    projectId: VALID_ENV.LM_DEV_RAILWAY_PROJECT_ID,
    appService: VALID_ENV.LM_DEV_RAILWAY_APP_SERVICE,
    postgresService: VALID_ENV.LM_DEV_RAILWAY_POSTGRES_SERVICE,
    environment: VALID_ENV.LM_DEV_RAILWAY_ENVIRONMENT,
  });
  assert.equal(Object.isFrozen(ownerRailwayTarget(VALID_ENV)), true);
});

test("error injection rejects unsafe or ambiguous Railway selectors", () => {
  for (const overrides of [
    { LM_DEV_RAILWAY_PROJECT_ID: "not-a-project-id" },
    { LM_DEV_RAILWAY_APP_SERVICE: "--service" },
    { LM_DEV_RAILWAY_POSTGRES_SERVICE: "database with spaces" },
    { LM_DEV_RAILWAY_ENVIRONMENT: "production;deploy" },
    {
      LM_DEV_RAILWAY_APP_SERVICE: "same-service",
      LM_DEV_RAILWAY_POSTGRES_SERVICE: "same-service",
    },
  ]) {
    assert.throws(() => ownerRailwayTarget({ ...VALID_ENV, ...overrides }), /invalid|distinct/i);
  }
});

test("Railway variable read uses only the validated owner project and environment", () => {
  const target = ownerRailwayTarget(VALID_ENV);
  const calls = [];
  const result = railwayVariables(target, target.postgresService, (...args) => {
    calls.push(args);
    return JSON.stringify({ DATABASE_PUBLIC_URL: "postgresql://example.invalid/life" });
  });

  assert.deepEqual(result, { DATABASE_PUBLIC_URL: "postgresql://example.invalid/life" });
  assert.deepEqual(calls, [[
    "railway",
    [
      "variables",
      "-p", VALID_ENV.LM_DEV_RAILWAY_PROJECT_ID,
      "-s", VALID_ENV.LM_DEV_RAILWAY_POSTGRES_SERVICE,
      "-e", VALID_ENV.LM_DEV_RAILWAY_ENVIRONMENT,
      "--json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ]]);
  assert.throws(
    () => railwayVariables(target, "some-other-service", () => "{}"),
    /service invalid/i,
  );
});
