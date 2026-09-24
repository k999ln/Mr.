"""Short-lived, single-use call context kept only inside the local phone process."""

from __future__ import annotations

from collections import OrderedDict
import re
import secrets
import threading
import time


_CONTEXT_ID = re.compile(r"^[A-Za-z0-9_-]{32}$")


def valid_context_id(value: str) -> bool:
    return bool(_CONTEXT_ID.fullmatch(str(value or "")))


class CallContextStore:
    def __init__(self, *, ttl_seconds: int = 1800, max_entries: int = 128) -> None:
        if ttl_seconds <= 0 or max_entries <= 0:
            raise ValueError("call context limits must be positive")
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._items: OrderedDict[str, tuple[float, dict[str, str]]] = OrderedDict()
        self._lock = threading.Lock()

    def _purge(self, now: float) -> None:
        expired = [
            context_id
            for context_id, (created_at, _) in self._items.items()
            if now - created_at > self._ttl_seconds
        ]
        for context_id in expired:
            self._items.pop(context_id, None)
        while len(self._items) >= self._max_entries:
            self._items.popitem(last=False)

    def put(self, *, mode: str, ctx: str, name: str) -> str:
        now = time.monotonic()
        context_id = secrets.token_urlsafe(24)
        with self._lock:
            self._purge(now)
            self._items[context_id] = (
                now,
                {"mode": mode, "ctx": ctx, "name": name},
            )
        return context_id

    def consume(self, context_id: str) -> dict[str, str]:
        if not valid_context_id(context_id):
            return {}
        now = time.monotonic()
        with self._lock:
            self._purge(now)
            item = self._items.pop(context_id, None)
        return dict(item[1]) if item else {}

    def discard(self, context_id: str) -> None:
        with self._lock:
            self._items.pop(context_id, None)
