"""Exercise the real deployment shell script against a stateful Docker/HTTP stub."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


OLD_IMAGE = "sha256:" + "1" * 64
NEW_IMAGE = "sha256:" + "2" * 64
NEW_COMMIT = "a" * 40
SCRIPT = Path(__file__).resolve().parents[1] / "deploy.sh"

# One fake executable dispatches on its symlink name. Its state models the
# running container independently of the saved deployment state on disk.
FAKE_CLI = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

command = Path(sys.argv[0]).name
args = sys.argv[1:]
if command == "flock":
    sys.exit(0)
if command == "timeout":
    os.execvp(args[1], args[1:])
state_file = Path(os.environ["TEST_DOCKER_STATE"])
state = json.loads(state_file.read_text())
state["events"].append([command, args])

def finish(output="", status=0):
    state_file.write_text(json.dumps(state))
    if output:
        print(output, end="")
    sys.exit(status)

if command == "docker":
    if args[0] == "login":
        if sys.stdin.read().strip() != "secret-test-token":
            finish(status=1)
        config = Path(os.environ["DOCKER_CONFIG"])
        (config / "config.json").write_text("secret-test-token")
        finish()
    if args[0] == "pull":
        finish(status=1 if state["scenario"] == "pull_failure" else 0)
    if args[:2] == ["container", "inspect"]:
        if args[3] == "{{.Image}}":
            finish(state["live_image"])
        if args[3] == "{{.State.Running}}":
            finish("true" if state["running"] else "false")
    if args[:2] == ["container", "rm"]:
        state["candidate"] = None
        finish()
    if args[:2] == ["image", "inspect"]:
        if args[3] == "{{.Id}}":
            finish(state["desired_image"])
        finish("invalid" if state["scenario"] == "invalid_revision" else state["commit"])
    if args[0] == "run":
        state["candidate"] = args[-1]
        finish("candidate-container")
    if args[0] == "compose":
        image = os.environ["PLANFIX_FRONTEND_IMAGE"]
        state["promotions"].append(image)
        state["live_image"] = image
        state["running"] = True
        if state["scenario"] == "cutover_command_failure" and image == state["new_image"]:
            state["running"] = False
            finish(status=1)
        finish()
elif command == "curl":
    url = args[-1]
    if "metadata.google.internal" in url:
        finish(json.dumps({"access_token": "secret-test-token"}))
    candidate = ":18080" in url
    image = state["candidate"] if candidate else state["live_image"]
    if not image or (not candidate and not state["running"]):
        finish(status=7)
    if url.endswith("/deploy-version.json"):
        # The original image intentionally does not implement this endpoint.
        if image != state["new_image"]:
            finish("<html>legacy app</html>")
        commit = "wrong-commit" if candidate and state["scenario"] == "candidate_version_failure" else state["commit"]
        finish(json.dumps({"commit": commit}))
    if "/api/v1/spots?size=1" in url:
        if candidate and state["scenario"] == "candidate_api_failure":
            finish("502", status=22)
        if not candidate and image == state["new_image"] and state["scenario"] == "cutover_health_failure":
            finish("502", status=22)
    finish("200")
finish("Unexpected mock invocation: " + repr([command, args]), status=99)
'''


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        executable = self.bin_dir / "fake_cli"
        executable.write_text(FAKE_CLI)
        executable.chmod(0o755)
        for name in ("docker", "curl", "flock", "timeout"):
            (self.bin_dir / name).symlink_to(executable)
        self.state_file = self.root / "docker-state.json"
        self.state_dir = self.root / "state"
        self.runtime_dir = self.root / "run"
        self.state_file.write_text(json.dumps({
            "scenario": "success",
            "live_image": OLD_IMAGE,
            "new_image": NEW_IMAGE,
            "desired_image": NEW_IMAGE,
            "running": True,
            "candidate": None,
            "commit": NEW_COMMIT,
            "promotions": [],
            "events": [],
        }))
        self.environment = {
            **os.environ,
            "PATH": str(self.bin_dir) + os.pathsep + os.environ["PATH"],
            "TEST_DOCKER_STATE": str(self.state_file),
            "PLANFIX_STATE_DIR": str(self.state_dir),
            "PLANFIX_RUNTIME_DIR": str(self.runtime_dir),
            "PLANFIX_COMPOSE_FILE": str(SCRIPT.parent / "compose.yaml"),
            "PLANFIX_HEALTH_TIMEOUT_SECONDS": "0",
        }

    def state(self):
        return json.loads(self.state_file.read_text())

    def update_state(self, **values):
        state = self.state()
        state.update(values)
        self.state_file.write_text(json.dumps(state))

    def run_deployer(self, expected_status=0):
        result = subprocess.run(
            ["bash", str(SCRIPT)], env=self.environment,
            text=True, capture_output=True, timeout=15,
        )
        self.assertEqual(result.returncode, expected_status, result.stdout + result.stderr)
        self.assertNotIn("secret-test-token", result.stdout + result.stderr)
        self.assertEqual(list(self.runtime_dir.glob("docker.*")), [])
        self.assertIsNone(self.state()["candidate"])
        return result

    def assert_saved(self, filename, image):
        self.assertEqual(
            (self.state_dir / filename).read_text(),
            "PLANFIX_FRONTEND_IMAGE=" + image + "\n",
        )

    def test_success_promotes_checked_image_and_keeps_previous(self):
        self.run_deployer()
        self.assertEqual(self.state()["promotions"], [NEW_IMAGE])
        self.assertEqual(self.state()["live_image"], NEW_IMAGE)
        self.assert_saved("current.env", NEW_IMAGE)
        self.assert_saved("previous.env", OLD_IMAGE)
        events = self.state()["events"]
        candidate_api = next(i for i, event in enumerate(events)
                             if event[0] == "curl" and event[1][-1] == "http://127.0.0.1:18080/api/v1/spots?size=1")
        promotion = next(i for i, event in enumerate(events)
                         if event[0] == "docker" and event[1][0] == "compose")
        self.assertLess(candidate_api, promotion)

    def test_candidate_api_failure_preserves_live_and_retries_after_recovery(self):
        self.update_state(scenario="candidate_api_failure")
        self.run_deployer(expected_status=1)
        self.assertEqual(self.state()["promotions"], [])
        self.assertEqual(self.state()["live_image"], OLD_IMAGE)
        self.assert_saved("current.env", OLD_IMAGE)
        self.assertFalse((self.state_dir / "rejected" / NEW_IMAGE.removeprefix("sha256:")).exists())
        self.update_state(events=[], scenario="success")
        self.run_deployer()
        self.assertEqual(self.state()["promotions"], [NEW_IMAGE])
        self.assert_saved("current.env", NEW_IMAGE)

    def test_wrong_candidate_commit_preserves_live(self):
        self.update_state(scenario="candidate_version_failure")
        self.run_deployer(expected_status=1)
        self.assertEqual(self.state()["promotions"], [])
        self.assert_saved("current.env", OLD_IMAGE)

    def test_cutover_failure_rolls_back_legacy_image(self):
        for scenario in ("cutover_command_failure", "cutover_health_failure"):
            with self.subTest(scenario=scenario):
                rejected = self.state_dir / "rejected" / NEW_IMAGE.removeprefix("sha256:")
                rejected.unlink(missing_ok=True)
                self.update_state(scenario=scenario, promotions=[])
                self.run_deployer(expected_status=1)
                self.assertEqual(self.state()["promotions"], [NEW_IMAGE, OLD_IMAGE])
                self.assertEqual(self.state()["live_image"], OLD_IMAGE)
                self.assertTrue(self.state()["running"])
                self.assert_saved("current.env", OLD_IMAGE)
                self.assert_saved("previous.env", OLD_IMAGE)
                self.assertTrue(rejected.exists())
                self.update_state(promotions=[])
                self.run_deployer()
                self.assertEqual(self.state()["promotions"], [])

    def test_unchanged_image_does_not_create_or_replace_containers(self):
        self.update_state(desired_image=OLD_IMAGE)
        self.run_deployer()
        self.assertEqual(self.state()["promotions"], [])
        self.assertFalse(any(event[0] == "docker" and event[1][0] == "run"
                             for event in self.state()["events"]))

    def test_invalid_revision_never_starts_candidate(self):
        self.update_state(scenario="invalid_revision")
        self.run_deployer(expected_status=1)
        self.assertEqual(self.state()["promotions"], [])
        self.assertFalse(any(event[0] == "docker" and event[1][0] == "run"
                             for event in self.state()["events"]))

    def test_interrupted_cutover_restores_committed_image_on_next_run(self):
        self.state_dir.mkdir()
        (self.state_dir / "current.env").write_text("PLANFIX_FRONTEND_IMAGE=" + OLD_IMAGE + "\n")
        self.update_state(live_image=NEW_IMAGE, desired_image=OLD_IMAGE)
        self.run_deployer()
        self.assertEqual(self.state()["promotions"], [OLD_IMAGE])
        self.assertEqual(self.state()["live_image"], OLD_IMAGE)

    def test_registry_failure_does_not_touch_live_and_cleans_credentials(self):
        self.update_state(scenario="pull_failure")
        self.run_deployer(expected_status=1)
        self.assertEqual(self.state()["promotions"], [])
        self.assertEqual(self.state()["live_image"], OLD_IMAGE)


if __name__ == "__main__":
    unittest.main()
