import json
import plistlib
import unittest
from pathlib import Path

from runtime.loop.macos_loop_registry import (
    expected_browser_environment,
    is_browser_owner,
    validate_browser_runtime_environment,
    validate_registry,
)


ROOT = Path(__file__).resolve().parents[3]


class BrowserScreenPolicyTest(unittest.TestCase):
    def test_every_persistent_browser_owner_is_registered_headless(self):
        registry = json.loads((ROOT / "config/loop-registry.json").read_text())
        validate_registry(registry)
        owners = {
            loop_id: row for loop_id, row in registry["loops"].items()
            if is_browser_owner(loop_id, row)
        }
        self.assertEqual(set(owners), {
            "affiliate-browser", "affiliate-impact-browser", "affiliate-x-browser",
            "hf-gig-browser", "job-search-browser", "job-search-mercor-browser",
            "lancers-revenue-browser", "rockstar-ibot-daily-driver",
        })
        for loop_id, row in owners.items():
            with self.subTest(loop_id=loop_id):
                policy = row["browser_policy"]
                self.assertIn(policy["execution_surface"], {"local_headless", "remote_headless"})
                self.assertEqual(policy["screen_impact"], "none")
                self.assertLessEqual(policy["interactive_timeout_seconds"], 900)

    def test_direct_local_browser_launchers_are_headless(self):
        launchers = (
            ROOT / "skills/earn/gig/scripts/launch_gig_browser.sh",
            ROOT / "apps/job-search-loop/scripts/run-browser.sh",
            ROOT / "runtime/legacy/lancers-revenue-browser/run.sh",
        )
        for launcher in launchers:
            with self.subTest(launcher=launcher):
                self.assertIn("--headless=new", launcher.read_text(encoding="utf-8"))
        context = (ROOT / "skills/browser/cdp_persistent_context.py").read_text(encoding="utf-8")
        self.assertIn("headless=not args.interactive", context)
        self.assertIn("LIFE_MANAGER_INTERACTIVE_HANDOFF_APPROVED", context)
        legacy_contexts = (
            ROOT / "skills/writer-agent/scripts/note-publish/dd-keepalive.py",
            ROOT / "skills/affiliate/legacy/launch_affiliate_browser.py",
        )
        for path in legacy_contexts:
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                self.assertIn("headless=True", text)
                self.assertNotIn("headless=False", text)

    def test_runtime_environment_must_match_registry_policy(self):
        row = {
            "browser_policy": {
                "execution_surface": "local_headless",
                "screen_impact": "none",
                "interactive_handoff": "approval_required",
                "interactive_timeout_seconds": 900,
            }
        }
        expected = expected_browser_environment(row)
        validate_browser_runtime_environment(row, expected)
        with self.assertRaisesRegex(ValueError, "SCREEN_IMPACT"):
            validate_browser_runtime_environment(row, {**expected,
                "LIFE_MANAGER_BROWSER_SCREEN_IMPACT": "foreground"})

    def test_daily_driver_handwritten_plist_is_background(self):
        plists = (
            ROOT / "skills/browser/launchd/ai.anicca.rockstar_ibot-daily-driver.plist.template",
            ROOT / "apps/lancers-revenue/launchd/ai.anicca.lancers-revenue-browser.plist",
            ROOT / "apps/job-search-loop/launchd/ai.anicca.job-search-browser.plist",
            ROOT / "apps/job-search-loop/launchd/ai.anicca.job-search-mercor-browser.plist",
        )
        for path in plists:
            with self.subTest(path=path):
                value = plistlib.loads(path.read_bytes())
                self.assertEqual(value["ProcessType"], "Background")

        manifest = json.loads(
            (ROOT / "skills/earn/gig/config/launchd-jobs.json").read_text(encoding="utf-8")
        )
        browser_jobs = [row for row in manifest["jobs"] if row["label"].endswith("-browser")]
        self.assertGreaterEqual(len(browser_jobs), 2)
        for row in browser_jobs:
            with self.subTest(label=row["label"]):
                self.assertEqual(row["ProcessType"], "Background")


if __name__ == "__main__":
    unittest.main()
