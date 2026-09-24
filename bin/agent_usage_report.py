#!/usr/bin/env python3
"""Compatibility launcher for the canonical Rockstar_ibot usage report."""

from pathlib import Path
import runpy


TARGET = (
    Path(__file__).resolve().parents[1]
    / "runtime"
    / "agent-runner"
    / "usage_report.py"
)

if not TARGET.is_file():
    raise SystemExit(f"canonical usage report is missing: {TARGET}")

runpy.run_path(str(TARGET), run_name="__main__")
