"""Small fail-closed security helpers for the Twilio phone ingress."""

from __future__ import annotations

import secrets
from urllib.parse import urlsplit, urlunsplit


def dialout_key_is_valid(expected: str, provided: str) -> bool:
    """Allow dial-out only when a non-empty owner key matches exactly."""
    return bool(expected and provided) and secrets.compare_digest(expected, provided)


def public_request_url(public_base: str, request_url: str) -> str:
    """Rebuild the exact public callback URL when TLS terminates at a tunnel."""
    request = urlsplit(request_url)
    if not public_base:
        return urlunsplit(
            (request.scheme, request.netloc, request.path, request.query, "")
        )
    public = urlsplit(public_base)
    scheme = public.scheme
    if request.scheme in {"ws", "wss"}:
        scheme = "wss" if public.scheme == "https" else "ws"
    return urlunsplit((scheme, public.netloc, request.path, request.query, ""))


def twilio_signature_is_valid(
    *, auth_token: str, signature: str, url: str, params, validator_factory=None
) -> bool:
    """Validate a Twilio callback; any missing input or error fails shut."""
    if not auth_token or not signature or not url:
        return False
    if validator_factory is None:
        from twilio.request_validator import RequestValidator

        validator_factory = RequestValidator
    try:
        return bool(validator_factory(auth_token).validate(url, params, signature))
    except Exception:
        return False
