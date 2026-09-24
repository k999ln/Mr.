#!/usr/bin/env python3
"""Owner-controlled, single-use lease for visible macOS automation."""

from __future__ import annotations

import argparse
import fcntl
import json
import math
import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterator


MIN_HANDOFF_SECONDS = 60
MAX_HANDOFF_SECONDS = 900
POLL_SECONDS = 0.25
LOOP_ID = re.compile(r"[a-z0-9][a-z0-9-]*\Z")


def state_root(env: dict[str, str] | None = None) -> Path:
    values = os.environ if env is None else env
    configured = values.get("LIFE_MANAGER_SCREEN_CONTROL_ROOT", "").strip()
    root = Path(configured).expanduser() if configured else (
        Path.home() / ".local/state/rockstar_ibot/screen-control"
    )
    if not root.is_absolute():
        raise ValueError("screen control root must be absolute")
    return root


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _read_state(root: Path) -> dict:
    try:
        value = json.loads((root / "state.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "state": "protected"}
    return value if isinstance(value, dict) else {"version": 1, "state": "protected"}


@contextmanager
def _transition_lock(root: Path) -> Iterator[None]:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    lock_path = root / "transition.lock"
    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        os.chmod(lock_path, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _append_audit(root: Path, value: dict) -> None:
    path = root / "audit.jsonl"
    line = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.chmod(path, 0o600)
        os.write(descriptor, line)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _pid_alive(pid: object) -> bool:
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def status(root: Path, *, now: float | None = None) -> dict:
    observed = time.time() if now is None else now
    value = _read_state(root)
    raw_state = value.get("state")
    state = raw_state if raw_state in {"protected", "approved", "running"} else "protected"
    expires_at = value.get("expires_at_epoch")
    expired = state in {"approved", "running"} and (
        not isinstance(expires_at, (int, float)) or expires_at <= observed
    )
    effective_state = "expired" if expired else state
    result = {
        "version": 1,
        "state": effective_state,
        "screen_impact": "interactive_handoff"
        if effective_state in {"approved", "running"} else "none",
        "loop_id": value.get("loop_id") if state in {"approved", "running"} else None,
        "expires_at": _iso(expires_at) if isinstance(expires_at, (int, float)) else None,
        "remaining_seconds": max(0, int(expires_at - observed))
        if isinstance(expires_at, (int, float)) else 0,
        "running": effective_state == "running" and _pid_alive(value.get("controller_pid")),
    }
    if expired:
        result["remaining_seconds"] = 0
    return result


def approve(root: Path, loop_id: str, seconds: int, *, now: float | None = None) -> dict:
    if not LOOP_ID.fullmatch(loop_id):
        raise ValueError("invalid loop id")
    if not MIN_HANDOFF_SECONDS <= seconds <= MAX_HANDOFF_SECONDS:
        raise ValueError("interactive handoff must be 60..900 seconds")
    observed = time.time() if now is None else now
    approval_id = uuid.uuid4().hex
    with _transition_lock(root):
        current = _read_state(root)
        if current.get("state") == "running" and _pid_alive(current.get("controller_pid")):
            raise RuntimeError("an interactive handoff is already running")
        value = {
            "version": 1,
            "state": "approved",
            "approval_id": approval_id,
            "loop_id": loop_id,
            "approved_at": _iso(observed),
            "expires_at": _iso(observed + seconds),
            "expires_at_epoch": observed + seconds,
        }
        _atomic_json(root / "state.json", value)
        _append_audit(root, {
            "version": 1, "event": "approved", "loop_id": loop_id,
            "approval_id": approval_id, "timestamp": _iso(observed),
            "expires_at": value["expires_at"],
        })
    return status(root, now=observed)


def revoke(root: Path, loop_id: str | None = None, *, now: float | None = None) -> dict:
    observed = time.time() if now is None else now
    with _transition_lock(root):
        current = _read_state(root)
        if loop_id is not None and current.get("loop_id") not in {None, loop_id}:
            raise RuntimeError("active handoff belongs to another loop")
        previous_loop = current.get("loop_id")
        _atomic_json(root / "state.json", {
            "version": 1, "state": "protected", "protected_at": _iso(observed),
        })
        _append_audit(root, {
            "version": 1, "event": "revoked", "loop_id": previous_loop,
            "timestamp": _iso(observed),
        })
    return status(root, now=observed)


def _terminate(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def run_approved(
    root: Path,
    loop_id: str,
    command: list[str],
    *,
    now: Callable[[], float] = time.time,
    popen: Callable[..., subprocess.Popen] = subprocess.Popen,
    poll_seconds: float = POLL_SECONDS,
) -> int:
    if not LOOP_ID.fullmatch(loop_id) or not command:
        raise ValueError("run requires a valid loop id and argv command")
    observed = now()
    run_id = uuid.uuid4().hex
    with _transition_lock(root):
        current = _read_state(root)
        expires_at = current.get("expires_at_epoch")
        if (current.get("state") != "approved" or current.get("loop_id") != loop_id
                or not isinstance(expires_at, (int, float)) or expires_at <= observed):
            raise RuntimeError("no live single-use approval for this loop")
        timeout_seconds = min(MAX_HANDOFF_SECONDS, max(1, math.ceil(expires_at - observed)))
        running = {
            **current,
            "state": "running",
            "run_id": run_id,
            "controller_pid": os.getpid(),
            "started_at": _iso(observed),
        }
        _atomic_json(root / "state.json", running)
        _append_audit(root, {
            "version": 1, "event": "started", "loop_id": loop_id,
            "approval_id": current.get("approval_id"), "run_id": run_id,
            "timestamp": _iso(observed),
        })
    environment = os.environ.copy()
    environment.update({
        "LIFE_MANAGER_INTERACTIVE_HANDOFF_APPROVED": "1",
        "LIFE_MANAGER_INTERACTIVE_HANDOFF_TIMEOUT_SECONDS": str(timeout_seconds),
        "LIFE_MANAGER_INTERACTIVE_HANDOFF_RUN_ID": run_id,
    })
    process = None
    result = 1
    finish_event = "failed"
    previous_sigterm = None

    def stop_controller(_signum, _frame):
        raise KeyboardInterrupt

    try:
        if threading.current_thread() is threading.main_thread():
            previous_sigterm = signal.signal(signal.SIGTERM, stop_controller)
        process = popen(command, env=environment, start_new_session=True)
        while True:
            code = process.poll()
            if code is not None:
                result = code if code >= 0 else 128 - code
                finish_event = "completed" if result == 0 else "failed"
                break
            live = _read_state(root)
            if live.get("state") != "running" or live.get("run_id") != run_id:
                finish_event = "revoked"
                result = 75
                _terminate(process)
                break
            if now() >= expires_at:
                finish_event = "expired"
                result = 124
                _terminate(process)
                break
            time.sleep(poll_seconds)
    except OSError:
        result = 127
        finish_event = "failed"
    except KeyboardInterrupt:
        result = 130
        finish_event = "revoked"
        if process is not None:
            _terminate(process)
    except BaseException:
        result = 143
        finish_event = "revoked"
        if process is not None:
            _terminate(process)
        raise
    finally:
        if previous_sigterm is not None:
            signal.signal(signal.SIGTERM, previous_sigterm)
        finished = now()
        with _transition_lock(root):
            live = _read_state(root)
            if live.get("run_id") == run_id:
                _atomic_json(root / "state.json", {
                    "version": 1, "state": "protected", "protected_at": _iso(finished),
                })
            _append_audit(root, {
                "version": 1, "event": finish_event, "loop_id": loop_id,
                "run_id": run_id, "timestamp": _iso(finished), "return_code": result,
            })
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lm-screen")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status")
    approval = subparsers.add_parser("approve")
    approval.add_argument("loop_id")
    approval.add_argument("--seconds", type=int, default=MAX_HANDOFF_SECONDS)
    revocation = subparsers.add_parser("revoke")
    revocation.add_argument("loop_id", nargs="?")
    run = subparsers.add_parser("run")
    run.add_argument("loop_id")
    run.add_argument("argv", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    root = state_root()
    try:
        if args.command == "status":
            value = status(root)
        elif args.command == "approve":
            value = approve(root, args.loop_id, args.seconds)
        elif args.command == "revoke":
            value = revoke(root, args.loop_id)
        else:
            command = args.argv[1:] if args.argv[:1] == ["--"] else args.argv
            return run_approved(root, args.loop_id, command)
    except (OSError, ValueError, RuntimeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps({"ok": True, **value}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
