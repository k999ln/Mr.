"""Security contracts for the Rockstar_ibot Twilio ingress."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


OUTBOUND_DIR = Path(__file__).resolve().parents[1]


def load_module(name: str):
    path = OUTBOUND_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_dialout_key_fails_closed_and_matches_exactly():
    security = load_module("phone_security")
    assert not security.dialout_key_is_valid("", "")
    assert not security.dialout_key_is_valid("owner-secret", "wrong")
    assert security.dialout_key_is_valid("owner-secret", "owner-secret")


def test_public_request_url_preserves_callback_path_and_query():
    security = load_module("phone_security")
    context_id = "a" * 32
    assert security.public_request_url(
        "https://phone.example/",
        f"http://127.0.0.1:7860/twiml?context_id={context_id}",
    ) == f"https://phone.example/twiml?context_id={context_id}"
    assert security.public_request_url(
        "https://phone.example/", "ws://127.0.0.1:7860/ws"
    ) == "wss://phone.example/ws"


def test_call_context_is_private_single_use_and_bounded():
    context_store = load_module("call_context_store")
    store = context_store.CallContextStore(ttl_seconds=60, max_entries=2)
    context_id = store.put(mode="lateness", ctx="private schedule", name="owner")
    assert context_store.valid_context_id(context_id)
    assert store.consume(context_id) == {
        "mode": "lateness",
        "ctx": "private schedule",
        "name": "owner",
    }
    assert store.consume(context_id) == {}


def test_ingress_and_runner_keep_security_boundaries():
    server = (OUTBOUND_DIR / "server.py").read_text(encoding="utf-8")
    runner = (OUTBOUND_DIR / "run.sh").read_text(encoding="utf-8")
    bot = (OUTBOUND_DIR / "bot.py").read_text(encoding="utf-8")
    assert server.count("twilio_signature_is_valid") >= 3
    assert "dialout_key_is_valid" in server
    assert "CALL_CONTEXTS.put(" in server
    assert "context_resolver=CALL_CONTEXTS.consume" in server
    assert 'os.getenv("HOST", "127.0.0.1")' in server
    assert 'host="0.0.0.0"' not in server
    assert "--protocol http2" in runner
    assert "--edge-ip-version 4" in runner
    assert "LM_PHONE_DIALOUT_SECRET" in runner
    assert "LM_PHONE_PUBLIC_TUNNEL" in runner
    assert 'sys.modules["nltk"] = None' in bot
    assert "TRANSCRIPT [Dais]" not in bot
