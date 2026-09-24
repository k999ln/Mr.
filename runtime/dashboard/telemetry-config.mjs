// Public telemetry endpoints are installation-owned configuration. A fresh checkout must never
// inherit another operator's dashboard or telemetry receiver.

function configuredHttpsEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function configuredTelemetryUrl(env = process.env) {
  return configuredHttpsEndpoint(env.ANICCA_TELEMETRY_URL);
}

export function configuredDashboardSyncUrl(env = process.env) {
  return configuredHttpsEndpoint(env.ANICCA_DASHBOARD_SYNC);
}

