#!/usr/bin/env python3
"""Load owner-specific public claims without exposing private verification evidence.

The repository contains no seller identity, social handle, follower count, work
history, or public URL.  A local owner may opt facts into model context through the
private ``owner-profile.json`` written by onboarding.  Invalid, expired, insecurely
stored, or unscoped facts fail closed and become an empty list.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


DEFAULT_OWNER_PROFILE_PATH = Path(
    os.environ.get(
        "GIG_OWNER_PROFILE",
        str(Path.home() / ".config" / "anicca" / "gig" / "owner-profile.json"),
    )
)
ALLOWED_CONTEXTS = frozenset({"application", "negotiation", "reply", "storefront"})
MAX_FACTS = 20
MAX_URLS_PER_FACT = 5
MAX_PROFILE_BYTES = 262_144
_FACT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class OwnerProfileContractError(ValueError):
    """The private owner profile cannot authorize model-visible seller claims."""


def _private_profile_payload(path: Path) -> dict[str, Any]:
    """Open one bounded owner-owned regular file without following symlinks."""
    profile_path = Path(path).expanduser()
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(profile_path, flags)
    except FileNotFoundError:
        raise
    except OSError as error:
        raise OwnerProfileContractError("owner_profile_unreadable") from error
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or stat.S_IMODE(metadata.st_mode) & 0o077
            or metadata.st_uid != os.getuid()
            or metadata.st_size > MAX_PROFILE_BYTES
        ):
            raise OwnerProfileContractError("owner_profile_not_private")
        with os.fdopen(descriptor, "r", encoding="utf-8") as handle:
            descriptor = -1
            raw = handle.read(MAX_PROFILE_BYTES + 1)
        if len(raw.encode("utf-8")) > MAX_PROFILE_BYTES:
            raise OwnerProfileContractError("owner_profile_not_private")
        profile = json.loads(raw)
    except OwnerProfileContractError:
        raise
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise OwnerProfileContractError("owner_profile_unreadable") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)
    if not isinstance(profile, dict):
        raise OwnerProfileContractError("invalid_owner_profile")
    return profile


def _timestamp(name: str, value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip() or len(value) > 40:
        raise OwnerProfileContractError(f"invalid_{name}")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as error:
        raise OwnerProfileContractError(f"invalid_{name}") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise OwnerProfileContractError(f"invalid_{name}")
    return parsed.astimezone(timezone.utc)


def _text(name: str, value: Any, maximum: int) -> str:
    if not isinstance(value, str):
        raise OwnerProfileContractError(f"invalid_{name}")
    text = value.strip()
    if not text or len(text) > maximum or _CONTROL.search(text):
        raise OwnerProfileContractError(f"invalid_{name}")
    return text


def _public_url(value: Any) -> str:
    text = _text("public_url", value, 512)
    try:
        parsed = urlsplit(text)
        port = parsed.port
    except ValueError as error:
        raise OwnerProfileContractError("invalid_public_url") from error
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
        or parsed.fragment
    ):
        raise OwnerProfileContractError("invalid_public_url")
    return text


def normalize_verified_seller_facts(
    value: Any,
    *,
    context: str,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Validate and sanitize private facts for one explicit model context.

    ``evidence`` is mandatory in the private profile but is deliberately omitted from
    the returned rows.  Models need the approved public claim, not a private file path,
    customer name, screenshot location, or operator note used to verify it.
    """
    if context not in ALLOWED_CONTEXTS:
        raise OwnerProfileContractError("invalid_fact_context")
    if not isinstance(value, list) or len(value) > MAX_FACTS:
        raise OwnerProfileContractError("invalid_verified_seller_facts")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict):
            raise OwnerProfileContractError("invalid_verified_seller_fact")
        if raw.get("status") != "active":
            continue
        fact_id = _text("fact_id", raw.get("id"), 128)
        if not _FACT_ID.fullmatch(fact_id) or fact_id in seen:
            raise OwnerProfileContractError("invalid_fact_id")
        claim = _text("claim", raw.get("claim"), 1000)
        _text("evidence", raw.get("evidence"), 1000)
        verified_at = _timestamp("verified_at", raw.get("verified_at"))
        if verified_at > current + timedelta(minutes=5):
            raise OwnerProfileContractError("verified_at_in_future")
        raw_contexts = raw.get("contexts")
        if (
            not isinstance(raw_contexts, list)
            or not raw_contexts
            or len(raw_contexts) > len(ALLOWED_CONTEXTS)
            or any(item not in ALLOWED_CONTEXTS for item in raw_contexts)
            or len(set(raw_contexts)) != len(raw_contexts)
        ):
            raise OwnerProfileContractError("invalid_fact_contexts")
        raw_urls = raw.get("public_urls", [])
        if not isinstance(raw_urls, list) or len(raw_urls) > MAX_URLS_PER_FACT:
            raise OwnerProfileContractError("invalid_public_urls")
        public_urls = [_public_url(item) for item in raw_urls]
        if len(set(public_urls)) != len(public_urls):
            raise OwnerProfileContractError("duplicate_public_url")
        expires_at_raw = raw.get("expires_at")
        expires_at: datetime | None = None
        if expires_at_raw is not None:
            expires_at = _timestamp("expires_at", expires_at_raw)
            if expires_at <= verified_at:
                raise OwnerProfileContractError("invalid_fact_validity_window")
            if expires_at <= current:
                seen.add(fact_id)
                continue
        seen.add(fact_id)
        if context not in raw_contexts:
            continue
        row: dict[str, Any] = {
            "id": fact_id,
            "claim": claim,
            "verified_at": verified_at.isoformat().replace("+00:00", "Z"),
            "public_urls": public_urls,
        }
        if expires_at is not None:
            row["expires_at"] = expires_at.isoformat().replace("+00:00", "Z")
        rows.append(row)
    return sorted(rows, key=lambda row: row["id"])


def load_verified_seller_facts(
    path: Path = DEFAULT_OWNER_PROFILE_PATH,
    *,
    context: str,
    now: datetime | None = None,
    strict: bool = False,
) -> list[dict[str, Any]]:
    """Read one private profile and return only model-safe facts.

    Missing profiles are normal on a fresh install.  Every other contract failure also
    returns no claims unless ``strict`` is requested by a validator or test.
    """
    try:
        profile = _private_profile_payload(path)
        _text("owner_id", profile.get("owner_id"), 200)
        facts = profile.get("verified_seller_facts", [])
        return normalize_verified_seller_facts(facts, context=context, now=now)
    except FileNotFoundError:
        return []
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        if strict:
            if isinstance(error, OwnerProfileContractError):
                raise
            raise OwnerProfileContractError("owner_profile_unreadable") from error
        return []


def allowed_public_urls(facts: Any) -> set[str]:
    """Return exact model-visible URLs from already sanitized fact rows."""
    if not isinstance(facts, list):
        return set()
    return {
        url
        for row in facts
        if isinstance(row, dict)
        for url in row.get("public_urls", [])
        if isinstance(url, str)
    }


def _read_private_profile(path: Path) -> dict[str, Any]:
    profile = _private_profile_payload(path)
    _text("owner_id", profile.get("owner_id"), 200)
    facts = profile.get("verified_seller_facts", [])
    if not isinstance(facts, list) or len(facts) > MAX_FACTS:
        raise OwnerProfileContractError("invalid_verified_seller_facts")
    return profile


def _write_private_profile(path: Path, profile: dict[str, Any]) -> None:
    profile_path = Path(path).expanduser()
    profile_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    profile_path.parent.chmod(0o700)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{profile_path.name}.", dir=profile_path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(profile, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, profile_path)
        profile_path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def upsert_verified_fact(
    path: Path,
    *,
    fact_id: str,
    claim: str,
    evidence: str,
    verified_at: str,
    contexts: list[str],
    public_urls: list[str] | None = None,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Atomically add or replace one fact after the same runtime validation."""
    profile = _read_private_profile(path)
    if not contexts:
        raise OwnerProfileContractError("invalid_fact_contexts")
    fact: dict[str, Any] = {
        "id": fact_id,
        "claim": claim,
        "evidence": evidence,
        "verified_at": verified_at,
        "contexts": contexts,
        "public_urls": public_urls or [],
        "status": "active",
    }
    if expires_at is not None:
        fact["expires_at"] = expires_at
    # Validate the complete public projection before the private file changes.
    for context in contexts:
        normalize_verified_seller_facts([fact], context=context)
    facts = [
        row for row in profile.get("verified_seller_facts", [])
        if not isinstance(row, dict) or row.get("id") != fact_id
    ]
    facts.append(fact)
    if len(facts) > MAX_FACTS:
        raise OwnerProfileContractError("verified_seller_facts_limit_exceeded")
    for validation_context in ALLOWED_CONTEXTS:
        normalize_verified_seller_facts(facts, context=validation_context)
    profile["verified_seller_facts"] = facts
    _write_private_profile(path, profile)
    return normalize_verified_seller_facts([fact], context=contexts[0])[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", type=Path, default=DEFAULT_OWNER_PROFILE_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    show = subparsers.add_parser("show", help="print sanitized, model-visible facts")
    show.add_argument("--context", choices=sorted(ALLOWED_CONTEXTS), required=True)
    upsert = subparsers.add_parser("upsert", help="atomically add or replace one verified fact")
    upsert.add_argument("--id", required=True)
    upsert.add_argument("--claim", required=True)
    upsert.add_argument("--evidence", required=True)
    upsert.add_argument("--verified-at", required=True)
    upsert.add_argument("--contexts", required=True)
    upsert.add_argument("--public-url", action="append", default=[])
    upsert.add_argument("--expires-at")
    args = parser.parse_args(argv)
    if args.command == "show":
        rows = load_verified_seller_facts(
            args.profile, context=args.context, strict=True
        )
        payload = {
            "context": args.context,
            "count": len(rows),
            "facts": rows,
            "sha256": hashlib.sha256(json.dumps(
                rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
            ).encode()).hexdigest(),
        }
    else:
        contexts = [item.strip() for item in args.contexts.split(",") if item.strip()]
        row = upsert_verified_fact(
            args.profile,
            fact_id=args.id,
            claim=args.claim,
            evidence=args.evidence,
            verified_at=args.verified_at,
            contexts=contexts,
            public_urls=args.public_url,
            expires_at=args.expires_at,
        )
        payload = {"status": "saved", "fact": row}
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
