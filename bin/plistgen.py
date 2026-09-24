#!/usr/bin/env python3
"""Generate launchd jobs from each loop's own declaration.

Legacy launchd plists used to contain an operator checkout. A loop instead declares its cadence
and repository-relative entrypoint; machine paths are resolved from the selected Rockstar_ibot
release and owner state root at install time.

  python3 bin/plistgen.py --loops-dir loops --out-dir ~/Library/LaunchAgents
  python3 bin/plistgen.py --loops-dir loops --out-dir /tmp/x --diff   # show, install nothing

Each loops/<name>/loop.toml:

    name      = "x-repost"
    state_dir = "~/loops/x-repost"

    [env]
    X_REPOST_BROWSER_IDENTITY = "x:anicca"

    [jobs.pass]
    program          = "skills/x-repost/x-repost-cli.sh"
    interval_seconds = 3600

    [jobs.digest]
    program  = "skills/x-repost/x-repost-digest.sh"
    calendar = { hour = 9, minute = 12 }
"""
from __future__ import annotations

import argparse
import os
import plistlib
import re
import sys
import tomllib
from pathlib import Path

LABEL_PREFIX = "ai.anicca"
REPO_ROOT = Path(__file__).resolve().parents[1]
# launchd hands a job a minimal PATH. Homebrew covers python/tmux/openclaw, but npm-global
# binaries -- the model CLI among them -- live under ~/.local/bin, and leaving it out makes a loop
# depend on its own fallback guesswork instead of on its environment.
DEFAULT_PATH_PARTS = ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin",
                      "/usr/sbin", "/sbin", "{home}/.local/bin")


def expand(value: str, home: Path) -> str:
    expanded = value
    if expanded == "~" or expanded.startswith("~/"):
        expanded = str(home) + expanded[1:]
    expanded = expanded.replace("${HOME}", str(home)).replace("$HOME", str(home))
    return str(Path(expanded))


def _absolute(value: str | Path, name: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise SystemExit(f"{name} must be an absolute path")
    return path.resolve()


def _release_program(current: Path, value: str) -> Path:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        raise SystemExit("job program must be repository-relative")
    target = (current / relative).resolve()
    try:
        target.relative_to(current.resolve())
    except ValueError as error:
        raise SystemExit("job program escapes the selected release") from error
    return target


def render_template(template: Path, home: Path, current: Path, state_home: Path) -> bytes:
    """Resolve a portable static plist template without evaluating shell input."""
    replacements = {
        "__HOME__": str(home),
        "__LIFE_MANAGER_RELEASE_ROOT__": str(current),
        "__LIFE_MANAGER_STATE_HOME__": str(state_home),
        # Compatibility for templates that have not yet adopted the canonical names.
        "__MR_BOT_RELEASE_ROOT__": str(current),
        "__MR_BOT_STATE_HOME__": str(state_home),
        "__REPO_ROOT__": str(current),
        "__MR_BOT_HOME__": str(state_home),
    }
    try:
        value = plistlib.loads(template.read_bytes())
    except Exception as error:
        raise SystemExit(f"{template}: invalid plist template: {error}") from error

    def resolve(item):
        if isinstance(item, str):
            for marker, replacement in replacements.items():
                item = item.replace(marker, replacement)
            return item
        if isinstance(item, list):
            return [resolve(child) for child in item]
        if isinstance(item, dict):
            return {key: resolve(child) for key, child in item.items()}
        return item

    encoded = plistlib.dumps(resolve(value), sort_keys=False)
    unresolved = sorted(set(re.findall(rb"__[A-Z][A-Z0-9_]*__", encoded)))
    if unresolved:
        names = ", ".join(marker.decode("ascii") for marker in unresolved)
        raise SystemExit(f"{template}: unresolved placeholders: {names}")
    return encoded


def build(
    loop: dict,
    job_name: str,
    job: dict,
    home: Path,
    current: Path,
    logs: Path,
    state_home: Path | None = None,
) -> dict:
    name = loop["name"]
    # A migration must not rename. Labels on this machine follow no single convention
    # (ai.anicca.hf-gig-apply-direct, ai.anicca.bounty-core-healthcheck, ai.anicca.hf-bounty-daily),
    # and they are referenced by healthchecks, self-heal scripts, tests and docs. Renaming while
    # moving a loop would break those quietly, at the same moment its code moved -- two changes to
    # untangle instead of one. An existing loop declares the label it already answers to; only new
    # loops take the generated convention.
    label = job.get("label") or f"{LABEL_PREFIX}.{name}-{job_name}"

    default_path = ":".join(p.format(home=home) for p in DEFAULT_PATH_PARTS)
    state_home = state_home or logs.parent
    env = {
        "HOME": str(home),
        "PATH": job.get("path", default_path),
        "LIFE_MANAGER_RELEASE_ROOT": str(current),
        "LIFE_MANAGER_STATE_HOME": str(state_home),
    }
    if loop.get("state_dir"):
        # Every loop needs to be told where its own state lives, because the code it runs from is a
        # read-only release and must not be the place a ledger accumulates.
        env[loop.get("state_env", f"{name.upper().replace('-', '_')}_STATE_DIR")] = \
            expand(loop["state_dir"], home)
    env.update({k: str(v) for k, v in (loop.get("env") or {}).items()})
    env.update({k: str(v) for k, v in (job.get("env") or {}).items()})

    plist = {
        "Label": label,
        "ProgramArguments": ["/bin/bash", str(_release_program(current, job["program"]))],
        "ProcessType": job.get("process_type", "Background"),
        "ThrottleInterval": int(job.get("throttle_seconds", 60)),
        "WorkingDirectory": str(home),
        "EnvironmentVariables": env,
        "StandardOutPath": str(logs / f"{name}-{job_name}.out.log"),
        "StandardErrorPath": str(logs / f"{name}-{job_name}.err.log"),
    }

    if "interval_seconds" in job:
        plist["StartInterval"] = int(job["interval_seconds"])
    elif "calendars" in job:
        plist["StartCalendarInterval"] = [
            {k.capitalize(): int(v) for k, v in calendar.items()}
            for calendar in job["calendars"]
        ]
    elif "calendar" in job:
        cal = job["calendar"]
        plist["StartCalendarInterval"] = {k.capitalize(): int(v) for k, v in cal.items()}
    else:
        raise SystemExit(f"{label}: needs interval_seconds or calendar")

    return plist


def main():
    ap = argparse.ArgumentParser()
    source = ap.add_mutually_exclusive_group(required=True)
    source.add_argument("--loops-dir")
    source.add_argument("--template", action="append", help="render one static plist template")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--home", default=str(Path.home()))
    ap.add_argument(
        "--current",
        default=os.environ.get("LIFE_MANAGER_RELEASE_ROOT", str(REPO_ROOT)),
        help="absolute selected Rockstar_ibot release root",
    )
    ap.add_argument("--logs", default=None)
    ap.add_argument("--only", help="generate a single loop by name")
    ap.add_argument("--diff", action="store_true", help="print what would change, write nothing")
    args = ap.parse_args()

    home = _absolute(args.home, "--home")
    current = _absolute(args.current, "--current")
    state_home = _absolute(
        os.environ.get("LIFE_MANAGER_STATE_HOME", home / ".local" / "state" / "rockstar_ibot"),
        "LIFE_MANAGER_STATE_HOME",
    )
    logs = _absolute(args.logs, "--logs") if args.logs else state_home / "logs"
    out_dir = Path(expand(args.out_dir, home))

    if args.template:
        written = []
        for raw_template in args.template:
            template = Path(raw_template).expanduser().resolve()
            body = render_template(template, home, current, state_home)
            target = out_dir / template.name
            existing = target.read_bytes() if target.exists() else None
            if args.diff:
                state = "unchanged" if existing == body else ("new" if existing is None else "CHANGED")
                print(f"{state:>9}  {target}")
                continue
            out_dir.mkdir(parents=True, exist_ok=True)
            if existing != body:
                target.write_bytes(body)
                state = "written"
            else:
                state = "unchanged"
            written.append((template.name, state))
        for name, state in written:
            print(f"{state:>9}  {name}")
        return

    written = []
    for toml_path in sorted(Path(args.loops_dir).glob("*/loop.toml")):
        loop = tomllib.loads(toml_path.read_text(encoding="utf-8"))
        if args.only and loop.get("name") != args.only:
            continue
        for job_name, job in (loop.get("jobs") or {}).items():
            plist = build(loop, job_name, job, home, current, logs, state_home)
            target = out_dir / f"{plist['Label']}.plist"
            body = plistlib.dumps(plist, sort_keys=True)
            existing = target.read_bytes() if target.exists() else None
            if args.diff:
                state = "unchanged" if existing == body else ("new" if existing is None else "CHANGED")
                print(f"{state:>9}  {target}")
                continue
            if existing == body:
                written.append((plist["Label"], "unchanged"))
                continue
            out_dir.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
            written.append((plist["Label"], "written"))

    for label, state in written:
        print(f"{state:>9}  {label}")
    if not written and not args.diff:
        print("no loop.toml found", file=sys.stderr)


if __name__ == "__main__":
    main()
