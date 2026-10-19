"""Offline-only safety tests for GitHub-connected GCP production audit."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

FILE = Path(__file__).with_name("read-only-production-audit.py")
spec = importlib.util.spec_from_file_location("ar_real_prod_audit", FILE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def service(stripe=False, flag=None, mode="development"):
    env = [
        {"name": "DEPLOYMENT_MODE", "value": mode},
        {"name": "AR_EXTERNAL_SCHEDULER", "value": "1"},
        {"name": "STRIPE_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "SECRET", "key": "1"}}},
        {"name": "STRIPE_CONNECT_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "SECRET", "key": "1"}}},
        {"name": "RESEND_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "SECRET", "key": "1"}}},
    ]
    if stripe:
        env.append({"name": "STRIPE_SECRET_KEY",
                    "valueFrom": {"secretKeyRef": {"name": "SECRET", "key": "1"}}})
    if flag is not None:
        env.append({"name": "AR_CLOUDRUN_CUTOVER_ACTIVE", "value": flag})
    return {
        "spec": {"template": {"spec": {
            "serviceAccountName": audit.EXPECTED_RUNTIME,
            "containers": [{"env": env}],
        }}},
        "status": {"latestReadyRevisionName": "american-rider-api-production-00002-test",
                   "url": "https://american-rider-api-production-123.us-east1.run.app"},
    }


class TestReadOnlyAudit(unittest.TestCase):
    def test_config_targets_only_real_service(self):
        self.assertEqual(audit.PROJECT, "american-rider-35688")
        self.assertEqual(audit.REGION, "us-east1")
        self.assertEqual(audit.SERVICE, "american-rider-api-production")
        self.assertEqual(audit.SCHEDULER_JOB, "ar-production-minute-sweeps")

    def test_service_metadata_never_materializes_secret_values(self):
        item = audit.summary_of_service(service())
        text = str(item)
        self.assertIn("'account_webhook_secret_bound': True", text)
        self.assertNotIn("SECRET", text)
        self.assertFalse(item["live_stripe_secret_bound"])
        self.assertEqual(item["mode"], "development")
        self.assertTrue(item["runtime_ok"])

    def test_unable_to_inspect_iam_is_unknown_not_false(self):
        self.assertIsNone(audit.public_invoker(None))
        self.assertFalse(audit.public_invoker({"bindings": []}))
        self.assertTrue(audit.public_invoker({"bindings": [
            {"role": "roles/run.invoker", "members": ["allUsers"]}
        ]}))

    def test_safe_current_prelaunch_configuration(self):
        data = [
            service(), {"bindings": []},
            {"state": "PAUSED", "httpTarget": {
                "uri": "https://american-rider-api-production-123.us-east1.run.app/scheduled/sweep"
            }}
        ]
        with mock.patch.object(audit, "metadata", side_effect=data), \
             mock.patch.object(audit, "verify_http_through_proxy", return_value="HTTP 200"):
            rows, risk = audit.audit()
        self.assertFalse(risk)
        self.assertIn(("Google Scheduler state", "PAUSED"), rows)
        self.assertIn(("Private Google API /live", "HTTP 200"), rows)

    def test_live_secret_without_activation_is_a_configuration_risk(self):
        with mock.patch.object(audit, "metadata", side_effect=[
            service(stripe=True, flag=None), {"bindings": []},
            {"state": "PAUSED", "httpTarget": {
                "uri": "https://american-rider-api-production-123.us-east1.run.app/scheduled/sweep"
            }},
        ]), mock.patch.object(audit, "verify_http_through_proxy", return_value="unknown"):
            _, risk = audit.audit()
        self.assertTrue(risk)

    def test_active_scheduler_before_cutover_is_risk(self):
        with mock.patch.object(audit, "metadata", side_effect=[
            service(), {"bindings": []},
            {"state": "ENABLED", "httpTarget": {
                "uri": "https://american-rider-api-production-123.us-east1.run.app/scheduled/sweep"
            }},
        ]), mock.patch.object(audit, "verify_http_through_proxy", return_value="unknown"):
            _, risk = audit.audit()
        self.assertTrue(risk)


if __name__ == "__main__":
    unittest.main()
