#!/usr/bin/env python3
"""Reopen + keep the daily-driver CloakBrowser persistent context ALIVE forever.
Per HARD RULE 0.39: never kill/close this. If it died (reboot), relaunch with:
  nohup ~/.openclaw/skills/_shared/venv-cloak/bin/python3 <this> &
It opens the daily-driver profile headlessly and sleeps forever so the
forever-tab stays up without taking over the logged-in desktop."""
import time
from cloakbrowser import launch_persistent_context

ctx = launch_persistent_context(
    "/Users/anicca/.cloak/profiles/daily-driver",
    headless=True, humanize=False,
    # Pin remote debugging to loopback and retain Chrome's origin checks.
    # Port 0 = Chrome picks a free port and writes it to DevToolsActivePort inside the
    # profile, which is what browser-guard resolves. Hardcoding a port is what produced
    # the 2026-07-26 collision: the fixed port was already held by a proxy onto the gig
    # production browser, so "the daily driver" silently resolved to another account's
    # Chrome. ~/.config/ai/registry/browsers.toml states the rule -- a port is not an
    # identity, and the live port must be read from the profile, never assumed.
    args=["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
)
print("daily-driver REOPENED (headless). keeping alive.", flush=True)
while True:
    time.sleep(3600)
