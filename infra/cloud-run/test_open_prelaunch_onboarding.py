"""Offline no-Google/no-money tests for FIRST public prelaunch onboarding."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

FILE = Path(__file__).with_name("open-prelaunch-onboarding.py")
spec = importlib.util.spec_from_file_location("ar_open_prelaunch", FILE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def service(key=False, flag="", prelaunch=""):
    env = [
        {"name": "DEPLOYMENT_MODE", "value": "production" if prelaunch else "development"},
        {"name": "AR_EXTERNAL_SCHEDULER", "value": "1"},
        {"name": "STRIPE_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "secret", "key": "1"}}},
        {"name": "STRIPE_CONNECT_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "secret", "key": "1"}}},
        {"name": "RESEND_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "secret", "key": "1"}}},
        {"name": "SCHEDULER_TOKEN", "valueFrom": {"secretKeyRef": {"name": "secret", "key": "1"}}},
        {"name": "AR_PRELAUNCH_PUBLIC", "value": prelaunch},
        {"name": "AR_CLOUDRUN_CUTOVER_ACTIVE", "value": flag},
    ]
    if key:
        env.append({"name": "STRIPE_SECRET_KEY",
                    "valueFrom": {"secretKeyRef": {"name": "secret", "key": "1"}}})
    return {
        "spec": {"template": {"spec": {
            "serviceAccountName": mod.RUNTIME,
            "containers": [{"env": env}],
        }}},
        "status": {
            "latestReadyRevisionName": "american-rider-api-production-00003-lhg",
            "url": "https://american-rider-api-production-test-ue.a.run.app",
        },
    }


class TestOnboarding(unittest.TestCase):
    def test_exact_project_not_staging(self):
        self.assertEqual(mod.PROJECT, "american-rider-35688")
        self.assertEqual(mod.SERVICE, "american-rider-api-production")
        self.assertEqual(mod.REGION, "us-east1")

    def test_refuse_any_secret_key_before_public_onboarding(self):
        with self.assertRaisesRegex(RuntimeError, "Live Stripe key mounted"):
            mod.inspect(service(key=True))
        with self.assertRaisesRegex(RuntimeError, "Commercial cutover already active"):
            mod.inspect(service(flag="1"))

    def test_reject_changed_runtime_or_in_process_sweeps(self):
        s = service()
        s["spec"]["template"]["spec"]["serviceAccountName"] = "fake@example.com"
        with self.assertRaisesRegex(RuntimeError, "identity changed"):
            mod.inspect(s)
        s = service()
        s["spec"]["template"]["spec"]["containers"][0]["env"][1]["value"] = "0"
        with self.assertRaisesRegex(RuntimeError, "dispatch clock"):
            mod.inspect(s)

    def test_prelaunch_requires_production_guards_and_no_key(self):
        with self.assertRaisesRegex(RuntimeError, "flags not installed"):
            mod.inspect(service(), expecting_public=True)
        self.assertTrue(mod.inspect(service(prelaunch="1"), expecting_public=True))

    def test_public_onboarding_endpoint_checks_must_not_accept_money(self):
        good = {
            "/live": {"ok": True},
            "/health": {
                "stripe": "no-key", "deployment": "production",
                "scheduler": "authenticated",
                "support": {"firestore": "on"}, "fleet": {"operators": 0},
            },
            "/config": {"mode": "no-key", "canTakePayment": False},
        }
        with mock.patch.object(mod, "meta", return_value=service(prelaunch="1")), \
             mock.patch.object(mod, "http_json", side_effect=lambda url, path: good[path]):
            mod.verify_public()
        bad = dict(good)
        bad["/config"] = {"mode": "live", "canTakePayment": True}
        with mock.patch.object(mod, "meta", return_value=service(prelaunch="1")), \
             mock.patch.object(mod, "http_json", side_effect=lambda url, path: bad[path]):
            with self.assertRaisesRegex(RuntimeError, "payment"):
                mod.verify_public()

    def test_no_external_command_without_founder_exact_confirmation(self):
        with mock.patch.object(mod, "run") as runner:
            with self.assertRaisesRegex(RuntimeError, "founder confirmation"):
                mod.main() if False else mod.main()  # must fail before Google
        runner.assert_not_called()


if __name__ == "__main__":
    unittest.main()
