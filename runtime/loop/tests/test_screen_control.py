import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path

from runtime.loop.screen_control import approve, revoke, run_approved, status


class ScreenControlTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "screen-control"

    def tearDown(self):
        self.temporary.cleanup()

    def test_default_is_protected_and_approval_is_bounded(self):
        self.assertEqual(status(self.root)["state"], "protected")
        with self.assertRaisesRegex(ValueError, "60..900"):
            approve(self.root, "gig", 59)
        approved = approve(self.root, "gig", 60, now=100.0)
        self.assertEqual(approved["state"], "approved")
        self.assertEqual(approved["screen_impact"], "interactive_handoff")
        self.assertEqual(status(self.root, now=161.0)["state"], "expired")
        self.assertEqual((self.root / "state.json").stat().st_mode & 0o777, 0o600)

    def test_invalid_and_expired_state_never_claims_screen_impact(self):
        self.root.mkdir(parents=True)
        (self.root / "state.json").write_text(
            json.dumps({"state": "unknown", "controller_pid": os.getpid()}),
            encoding="utf-8",
        )
        invalid = status(self.root)
        self.assertEqual(invalid["state"], "protected")
        self.assertEqual(invalid["screen_impact"], "none")
        self.assertFalse(invalid["running"])

        (self.root / "state.json").write_text(json.dumps({
            "state": "running", "loop_id": "gig", "controller_pid": os.getpid(),
            "expires_at_epoch": 100.0,
        }), encoding="utf-8")
        expired = status(self.root, now=101.0)
        self.assertEqual(expired["state"], "expired")
        self.assertEqual(expired["screen_impact"], "none")
        self.assertFalse(expired["running"])

    def test_run_consumes_approval_and_does_not_log_command(self):
        receipt = Path(self.temporary.name) / "environment.json"
        secret_argument = "never-write-this-command-argument"
        approve(self.root, "gig", 60)
        code = run_approved(self.root, "gig", [
            "/usr/bin/python3", "-c",
            (
                "import json,os,pathlib,sys;"
                "pathlib.Path(sys.argv[1]).write_text(json.dumps({"
                "'approved':os.environ.get('LIFE_MANAGER_INTERACTIVE_HANDOFF_APPROVED'),"
                "'timeout':os.environ.get('LIFE_MANAGER_INTERACTIVE_HANDOFF_TIMEOUT_SECONDS')}))"
            ),
            str(receipt),
            secret_argument,
        ], poll_seconds=0.01)
        self.assertEqual(code, 0)
        environment = json.loads(receipt.read_text(encoding="utf-8"))
        self.assertEqual(environment["approved"], "1")
        self.assertGreaterEqual(int(environment["timeout"]), 1)
        self.assertEqual(status(self.root)["state"], "protected")
        with self.assertRaisesRegex(RuntimeError, "single-use"):
            run_approved(self.root, "gig", ["/usr/bin/true"])
        self.assertNotIn(
            secret_argument,
            (self.root / "audit.jsonl").read_text(encoding="utf-8"),
        )

    def test_revoke_stops_a_running_handoff(self):
        approve(self.root, "gig", 60)
        result = []
        worker = threading.Thread(
            target=lambda: result.append(
                run_approved(self.root, "gig", ["/bin/sleep", "30"], poll_seconds=0.01)
            )
        )
        worker.start()
        deadline = time.time() + 5
        while status(self.root)["state"] != "running" and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(status(self.root)["state"], "running")
        revoked = revoke(self.root, "gig")
        worker.join(timeout=8)
        self.assertFalse(worker.is_alive())
        self.assertEqual(result, [75])
        self.assertEqual(revoked["state"], "protected")
        self.assertFalse(status(self.root)["running"])


if __name__ == "__main__":
    unittest.main()
