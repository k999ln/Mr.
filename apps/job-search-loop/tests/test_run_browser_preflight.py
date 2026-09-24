import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "run-browser.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")


class RunBrowserPreflightTests(unittest.TestCase):
    def test_uses_canonical_guard_and_fenced_child_environment(self) -> None:
        self.assertIn(
            '${SCRIPT_DIR:h:h:h}/skills/earn/gig/scripts/gig_disk_guard.py',
            TEXT,
        )
        self.assertNotIn('$CANONICAL_HOME/gig/releases/', TEXT)
        self.assertIn("/usr/bin/python3 -I", TEXT)
        self.assertIn("pwd.getpwuid", TEXT)
        self.assertIn("GIG_DISK_HEADROOM_KIB=524288", TEXT)
        self.assertIn('GIG_HOST_STATE_DIR="$CANONICAL_HOME/.openclaw/state"', TEXT)
        self.assertIn(
            'GIG_STATE_DIR="$CANONICAL_HOME/.local/state/rockstar_ibot/job-search-browser"',
            TEXT,
        )
        unset_block = TEXT[TEXT.index("unset "):TEXT.index("\nGIG_DISK", TEXT.index("unset "))]
        for name in (
            "GIG_IGNORE_DISK_PRESSURE_BLOCK",
            "GIG_IGNORE_DISK_WRITERS_STOP",
            "DISK_CONTROL_STATE_DIR",
            "OPENCLAW_STATE_DIR",
            "LIFE_MANAGER_HOST_STATE_DIR",
        ):
            self.assertIn(name, TEXT)
            self.assertIn(name, unset_block)

    def test_guard_is_before_profile_chromium_and_exec_effects(self) -> None:
        guard_invocation = '/usr/bin/python3 -I "$DISK_GUARD" /usr/bin/true'
        guard = TEXT.find(guard_invocation)
        self.assertGreaterEqual(guard, 0)
        for effect in (
            'PROFILE="',
            'mkdir -p "$PROFILE"',
            'chmod 700 "$PROFILE"',
            "CHROMIUM_BIN=",
            'exec "$CHROMIUM_BIN"',
        ):
            self.assertLess(guard, TEXT.index(effect))
        self.assertIn(guard_invocation, TEXT)

    def test_existing_profile_and_chromium_lifecycle_stays_intact(self) -> None:
        self.assertIn(
            'PROFILE="${JOB_SEARCH_BROWSER_PROFILE:-$HOME/.cloak/profiles/job-search-daily}"',
            TEXT,
        )
        self.assertIn(
            'ls -d "$HOME"/.cloakbrowser/chromium-*/Chromium.app/Contents/MacOS/Chromium(N)',
            TEXT,
        )
        for argument in (
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-features=MacAppCodeSignClone",
            "--fingerprint=80137",
            "--fingerprint-platform=macos",
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=9222",
            '--user-data-dir="$PROFILE"',
            "about:blank",
        ):
            self.assertIn(argument, TEXT)
        for unsafe_argument in (
            "--password-store=basic",
            "--use-mock-keychain",
            "--no-sandbox",
            "--remote-allow-origins",
        ):
            self.assertNotIn(unsafe_argument, TEXT)

    def test_scheduled_browser_is_headless_and_cannot_take_focus(self) -> None:
        self.assertIn("--headless=new", TEXT)
        self.assertIn("--hide-scrollbars", TEXT)
        self.assertIn("--mute-audio", TEXT)
        for unsafe_argument in (
            "--password-store=basic",
            "--use-mock-keychain",
            "--no-sandbox",
            "--remote-allow-origins",
        ):
            self.assertNotIn(unsafe_argument, TEXT)


if __name__ == "__main__":
    unittest.main()
