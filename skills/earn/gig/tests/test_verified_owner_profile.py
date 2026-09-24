"""Cross-owner safety contracts for model-visible seller facts."""

from __future__ import annotations

import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest


GIG_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = GIG_ROOT / "scripts"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


profile_module = _load("verified_owner_profile_test", "verified_owner_profile.py")
reply_composer = _load("owner_neutral_reply_composer_test", "reply_composer.py")
proposal_feedback = _load("owner_neutral_proposal_feedback_test", "proposal_feedback.py")


def _profile(path: Path) -> Path:
    path.write_text(json.dumps({
        "version": 1,
        "owner_id": "owner-a",
        "verified_seller_facts": [
            {
                "id": "social.primary",
                "claim": "The owner controls the public example social account.",
                "evidence": "operator attestation stored privately",
                "verified_at": "2026-08-20T00:00:00Z",
                "expires_at": "2026-09-20T00:00:00Z",
                "contexts": ["reply", "negotiation"],
                "public_urls": ["https://social.example/owner-a"],
                "status": "active",
            },
            {
                "id": "work.python",
                "claim": "The owner has verified Python automation delivery experience.",
                "evidence": "private delivery receipt hash",
                "verified_at": "2026-08-20T00:00:00Z",
                "contexts": ["application"],
                "public_urls": [],
                "status": "active",
            },
        ],
    }), encoding="utf-8")
    path.chmod(0o600)
    return path


def test_facts_are_owner_local_scoped_time_bounded_and_sanitized(tmp_path: Path):
    path = _profile(tmp_path / "owner-profile.json")

    facts = profile_module.load_verified_seller_facts(
        path,
        context="reply",
        now=datetime(2026, 8, 27, tzinfo=timezone.utc),
        strict=True,
    )

    assert facts == [{
        "id": "social.primary",
        "claim": "The owner controls the public example social account.",
        "verified_at": "2026-08-20T00:00:00Z",
        "public_urls": ["https://social.example/owner-a"],
        "expires_at": "2026-09-20T00:00:00Z",
    }]
    assert "operator attestation" not in json.dumps(facts)
    assert profile_module.load_verified_seller_facts(
        path,
        context="reply",
        now=datetime(2026, 9, 21, tzinfo=timezone.utc),
        strict=True,
    ) == []


def test_insecure_profile_and_unverified_url_fail_closed(tmp_path: Path):
    path = _profile(tmp_path / "owner-profile.json")
    path.chmod(0o644)

    assert profile_module.load_verified_seller_facts(path, context="reply") == []
    with pytest.raises(profile_module.OwnerProfileContractError, match="not_private"):
        profile_module.load_verified_seller_facts(path, context="reply", strict=True)


def test_symlink_and_non_regular_profile_fail_closed(tmp_path: Path):
    target = _profile(tmp_path / "actual-owner-profile.json")
    symlink = tmp_path / "owner-profile-link.json"
    symlink.symlink_to(target)

    assert profile_module.load_verified_seller_facts(symlink, context="reply") == []
    with pytest.raises(profile_module.OwnerProfileContractError):
        profile_module.load_verified_seller_facts(symlink, context="reply", strict=True)
    with pytest.raises(profile_module.OwnerProfileContractError, match="not_private"):
        profile_module.load_verified_seller_facts(tmp_path, context="reply", strict=True)


def test_reply_prompt_has_no_repository_owner_identity_and_uses_dynamic_fact():
    facts = [{
        "id": "social.primary",
        "claim": "The owner controls the public example social account.",
        "verified_at": "2026-08-20T00:00:00Z",
        "public_urls": ["https://social.example/owner-a"],
        "expires_at": "2026-09-20T00:00:00Z",
    }]
    context = {
        "conversation": [{"side": "buyer", "body": "利用できるSNSを教えてください"}],
        "verified_seller_facts": facts,
    }

    prompt = reply_composer.composition_prompt(context)

    assert "https://social.example/owner-a" in prompt
    assert "private delivery receipt" not in prompt
    assert "anicca_buddha" not in prompt
    assert "3,281" not in prompt
    reply_composer._require_verified_application_terms(
        context, "確認時点の公開先は https://social.example/owner-a です。"
    )
    with pytest.raises(ValueError, match="unverified external URL"):
        reply_composer._require_verified_application_terms(
            context, "公開先は https://social.example/other-owner です。"
        )


def test_application_guidance_uses_application_fact_and_never_derives_private_pii(tmp_path: Path):
    path = _profile(tmp_path / "owner-profile.json")

    guidance = proposal_feedback.verified_fact_guidance(path)

    assert "Python automation delivery experience" in guidance
    assert "public example social account" not in guidance
    assert "年代:" not in guidance
    assert "居住都道府県:" not in guidance


def test_upsert_is_atomic_private_and_returns_no_evidence(tmp_path: Path):
    path = tmp_path / "owner-profile.json"
    path.write_text(json.dumps({
        "version": 1, "owner_id": "owner-a", "verified_seller_facts": [],
    }), encoding="utf-8")
    path.chmod(0o600)

    public = profile_module.upsert_verified_fact(
        path,
        fact_id="capability.python",
        claim="The owner can deliver Python automation.",
        evidence="private receipt 123",
        verified_at="2026-08-20T00:00:00Z",
        contexts=["application", "reply"],
        public_urls=[],
    )

    assert path.stat().st_mode & 0o777 == 0o600
    assert "evidence" not in public
    stored = json.loads(path.read_text(encoding="utf-8"))
    assert stored["verified_seller_facts"][0]["evidence"] == "private receipt 123"
    assert profile_module.load_verified_seller_facts(
        path, context="negotiation", strict=True,
    ) == []
