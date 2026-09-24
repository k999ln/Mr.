"""Schema-v2 registry validation and deterministic launchd job-model rendering."""

from __future__ import annotations

import json
import re
from pathlib import PurePosixPath


DOMAINS = {"physical", "mental", "financial", "earn", "growth", "system"}
EFFECTS = {"none", "publish", "message", "money", "application", "trade", "account_mutation"}
ROUTES = {"deterministic", "shared-agent-runner"}
CADENCES = {"start_interval_seconds", "calendar_interval", "run_at_load", "keep_alive"}
REQUIRED_FIELDS = {
    "label", "domain", "entrypoint", "cadence", "effect_class", "state_root",
    "log_root", "cleanup", "provider_route",
}
BROWSER_POLICY_FIELD = "browser_policy"
BROWSER_POLICY_FIELDS = {
    "execution_surface", "screen_impact", "interactive_handoff",
    "interactive_timeout_seconds",
}
BROWSER_EXECUTION_SURFACES = {
    "remote_headless", "local_headless", "interactive_handoff",
}
BROWSER_SCREEN_IMPACTS = {"none"}
BROWSER_HANDOFF_POLICIES = {"denied", "approval_required"}
BROWSER_ENVIRONMENT_FIELDS = {
    "execution_surface": "LIFE_MANAGER_BROWSER_EXECUTION_SURFACE",
    "screen_impact": "LIFE_MANAGER_BROWSER_SCREEN_IMPACT",
    "interactive_handoff": "LIFE_MANAGER_BROWSER_INTERACTIVE_HANDOFF",
    "interactive_timeout_seconds": "LIFE_MANAGER_BROWSER_INTERACTIVE_TIMEOUT_SECONDS",
}
SECRET_FIELD = re.compile(r"token|secret|password|credential|auth|api.?key", re.I)


def _fail(message: str) -> None:
    raise ValueError(message)


def is_browser_owner(loop_id: str, row: dict) -> bool:
    """Return whether a scheduled loop owns a persistent browser process."""
    cadence = row.get("cadence") if isinstance(row, dict) else None
    return (
        isinstance(cadence, dict)
        and cadence.get("keep_alive") is True
        and (loop_id.endswith("-browser") or loop_id.endswith("-daily-driver"))
    )


def _validate_browser_policy(loop_id: str, row: dict) -> None:
    policy = row.get(BROWSER_POLICY_FIELD)
    if is_browser_owner(loop_id, row) and not isinstance(policy, dict):
        _fail(f"{loop_id}: persistent browser owner requires browser_policy")
    if policy is None:
        return
    if not isinstance(policy, dict) or set(policy) != BROWSER_POLICY_FIELDS:
        _fail(f"{loop_id}: browser_policy fields are incomplete or unknown")
    if policy["execution_surface"] not in BROWSER_EXECUTION_SURFACES:
        _fail(f"{loop_id}: invalid browser execution_surface")
    if policy["screen_impact"] not in BROWSER_SCREEN_IMPACTS:
        _fail(f"{loop_id}: scheduled browser screen_impact must be none")
    if policy["interactive_handoff"] not in BROWSER_HANDOFF_POLICIES:
        _fail(f"{loop_id}: invalid interactive_handoff policy")
    timeout = policy["interactive_timeout_seconds"]
    if not isinstance(timeout, int) or isinstance(timeout, bool) or not 60 <= timeout <= 900:
        _fail(f"{loop_id}: interactive_timeout_seconds must be 60..900")
    if (is_browser_owner(loop_id, row)
            and policy["execution_surface"] == "interactive_handoff"):
        _fail(f"{loop_id}: KeepAlive browser cannot use interactive_handoff")


def expected_browser_environment(row: dict) -> dict[str, str]:
    policy = row.get(BROWSER_POLICY_FIELD)
    if not isinstance(policy, dict):
        return {}
    return {
        environment_name: str(policy[policy_name])
        for policy_name, environment_name in BROWSER_ENVIRONMENT_FIELDS.items()
    }


def validate_browser_runtime_environment(row: dict, environment: dict[str, str]) -> None:
    expected = expected_browser_environment(row)
    mismatches = [name for name, value in expected.items() if environment.get(name) != value]
    if mismatches:
        _fail(f"browser runtime policy environment mismatch: {sorted(mismatches)}")


def validate_registry(registry: dict) -> dict:
    allowed_top = {"schema_version", "loops", "external_labels", "retired_labels"}
    if (not isinstance(registry, dict)
            or not {"schema_version", "loops"}.issubset(registry)
            or set(registry) - allowed_top):
        _fail("registry must contain schema_version, loops, and optional external_labels")
    if registry["schema_version"] != 2 or not isinstance(registry["loops"], dict):
        _fail("schema_version must be 2 and loops must be an object")
    labels = set()
    for loop_id, row in registry["loops"].items():
        if not isinstance(loop_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", loop_id):
            _fail(f"invalid loop id: {loop_id}")
        if not isinstance(row, dict):
            _fail(f"{loop_id}: entry must be an object")
        secret_fields = [key for key in row if SECRET_FIELD.search(key)]
        if secret_fields:
            _fail(f"{loop_id}: secret-like fields forbidden: {secret_fields}")
        allowed_fields = REQUIRED_FIELDS | {BROWSER_POLICY_FIELD}
        missing, unknown = REQUIRED_FIELDS - set(row), set(row) - allowed_fields
        if missing:
            _fail(f"{loop_id}: missing fields: {sorted(missing)}")
        if unknown:
            _fail(f"{loop_id}: unknown fields: {sorted(unknown)}")
        label = row["label"]
        if not isinstance(label, str) or not label.startswith("ai.anicca.") or label in labels:
            _fail(f"{loop_id}: invalid or duplicate label")
        labels.add(label)
        if row["domain"] not in DOMAINS:
            _fail(f"{loop_id}: invalid domain")
        if row["effect_class"] not in EFFECTS:
            _fail(f"{loop_id}: invalid effect_class")
        if row["provider_route"] not in ROUTES:
            _fail(f"{loop_id}: invalid provider_route")
        entrypoint = row["entrypoint"]
        path = PurePosixPath(entrypoint) if isinstance(entrypoint, str) else PurePosixPath("/")
        if path.is_absolute() or ".." in path.parts or str(path) in {"", "."}:
            _fail(f"{loop_id}: entrypoint must be repository-relative")
        cadence = row["cadence"]
        if not isinstance(cadence, dict) or len(cadence) != 1 or set(cadence) - CADENCES:
            _fail(f"{loop_id}: cadence must contain exactly one allowed key")
        key, value = next(iter(cadence.items()))
        if key == "start_interval_seconds" and (not isinstance(value, int) or value <= 0):
            _fail(f"{loop_id}: invalid start_interval_seconds")
        if key in {"run_at_load", "keep_alive"} and value is not True:
            _fail(f"{loop_id}: {key} must be true")
        if key == "calendar_interval" and not isinstance(value, (dict, list)):
            _fail(f"{loop_id}: invalid calendar_interval")
        for root_field in ("state_root", "log_root"):
            if not isinstance(row[root_field], str) or not row[root_field].startswith("~/"):
                _fail(f"{loop_id}: {root_field} must be home-relative")
        cleanup = row["cleanup"]
        if not isinstance(cleanup, dict) or set(cleanup) != {"max_runs", "max_age_days"}:
            _fail(f"{loop_id}: cleanup contract is incomplete")
        if any(not isinstance(cleanup[key], int) or cleanup[key] <= 0 for key in cleanup):
            _fail(f"{loop_id}: cleanup bounds must be positive integers")
        _validate_browser_policy(loop_id, row)
    external = registry.get("external_labels", [])
    if (not isinstance(external, list) or len(external) != len(set(external))
            or any(not isinstance(label, str) or not label.startswith("ai.anicca.")
                   for label in external)):
        _fail("external_labels must be unique ai.anicca labels")
    if labels.intersection(external):
        _fail("external_labels overlap managed labels")
    retired = registry.get("retired_labels", [])
    if (not isinstance(retired, list) or len(retired) != len(set(retired))
            or any(not isinstance(label, str) or not label.startswith("ai.anicca.") for label in retired)):
        _fail("retired_labels must be unique ai.anicca labels")
    if labels.intersection(retired) or set(external).intersection(retired):
        _fail("retired_labels overlap managed or external labels")
    return registry


def render_job_models(registry: dict) -> bytes:
    validate_registry(registry)
    models = [
        {"loop_id": loop_id, **registry["loops"][loop_id]}
        for loop_id in sorted(registry["loops"])
    ]
    return (json.dumps(models, sort_keys=True, separators=(",", ":")) + "\n").encode()
