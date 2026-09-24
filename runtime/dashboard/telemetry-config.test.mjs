import assert from "node:assert/strict";
import test from "node:test";

import {
  configuredDashboardSyncUrl,
  configuredTelemetryUrl,
} from "./telemetry-config.mjs";

test("telemetry endpoints are disabled when installation-owned URLs are absent", () => {
  assert.equal(configuredTelemetryUrl({}), null);
  assert.equal(configuredDashboardSyncUrl({}), null);
});

test("telemetry endpoints accept only credential-free HTTPS URLs", () => {
  assert.equal(
    configuredTelemetryUrl({ ANICCA_TELEMETRY_URL: "https://telemetry.example/api/events" }),
    "https://telemetry.example/api/events",
  );
  assert.equal(configuredTelemetryUrl({ ANICCA_TELEMETRY_URL: "http://telemetry.example/events" }), null);
  assert.equal(configuredTelemetryUrl({ ANICCA_TELEMETRY_URL: "https://user:pass@telemetry.example/events" }), null);
  assert.equal(configuredTelemetryUrl({ ANICCA_TELEMETRY_URL: "https://telemetry.example/events?token=secret" }), null);
  assert.equal(configuredDashboardSyncUrl({ ANICCA_DASHBOARD_SYNC: "javascript:alert(1)" }), null);
});
