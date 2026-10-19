"""Offline tests: paid Google activation must fail closed with no Stripe webhooks changed."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest import mock

HERE = Path(__file__).with_name("activate-paid-production.py")
spec = importlib.util.spec_from_file_location("american_rider_paid_activate", HERE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def state():
    return {
        "metadata": {"annotations": {"run.googleapis.com/invoker-iam-disabled": "false"}},
        "spec": {"template": {"spec": {
            "serviceAccountName": m.RUNTIME,
            "containers": [{"env": [
                {"name": "DEPLOYMENT_MODE", "value": "development"},
                {"name": "AR_EXTERNAL_SCHEDULER", "value": "1"},
                {"name": "SCREENING_EVIDENCE_WORKFLOW_VERIFIED", "value": "true"},
                {"name": "SCHEDULER_TOKEN", "valueFrom": {"secretKeyRef": {"name": "scheduler", "key": "1"}}},
                {"name": "STRIPE_PUBLISHABLE_KEY", "valueFrom": {"secretKeyRef": {"name": "publishable", "key": "1"}}},
                {"name": "STRIPE_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "account", "key": "1"}}},
                {"name": "STRIPE_CONNECT_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "connect", "key": "1"}}},
                {"name": "RESEND_WEBHOOK_SECRET", "valueFrom": {"secretKeyRef": {"name": "mail", "key": "1"}}},
            ]}],
        }}},
        "status": {"latestReadyRevisionName": "american-rider-api-production-00003-lhg"},
    }


def scheduler():
    return {"state": "PAUSED", "httpTarget": {
        "uri": "https://american-rider-api-production-623854974930.us-east1.run.app/scheduled/sweep"
    }}


def secret():
    return {"name": "projects/american-rider-35688/secrets/ar-render-import-stripe-secret-key/versions/1", "state": "ENABLED"}


class LiveGcpTests(unittest.TestCase):
    def inspect(self, s=None, j=None, sec=None, policy=None):
        with mock.patch.object(m, "meta", return_value=policy or {"bindings": []}):
            return m.inspect(s if s is not None else state(),
                             j if j is not None else scheduler(),
                             sec if sec is not None else secret())

    def test_exact_existing_service_not_staging(self):
        self.assertEqual(m.SERVICE, "american-rider-api-production")
        self.assertEqual(m.PROJECT, "american-rider-35688")
        self.assertEqual(m.JOB, "ar-production-minute-sweeps")
        self.assertEqual(m.STRIPE_SECRET, "ar-render-import-stripe-secret-key")

    def test_ready_private_preflight(self):
        self.assertEqual(self.inspect(), [])

    def test_reject_missing_screening_evidence_flag_without_fake_attestation(self):
        s = state()
        s["spec"]["template"]["spec"]["containers"][0]["env"] = [
            x for x in s["spec"]["template"]["spec"]["containers"][0]["env"]
            if x["name"] != "SCREENING_EVIDENCE_WORKFLOW_VERIFIED"
        ]
        self.assertTrue(any("screening evidence" in x for x in self.inspect(s=s)))

    def test_reject_incomplete_webhooks_scheduler_or_live_already(self):
        s = state()
        s["spec"]["template"]["spec"]["containers"][0]["env"].append(
            {"name": "STRIPE_SECRET_KEY", "valueFrom": {"secretKeyRef": {"name": "live", "key": "1"}}})
        self.assertTrue(any("already has live money" in x for x in self.inspect(s=s)))
        self.assertTrue(any("not PAUSED" in x for x in self.inspect(j={
            "state": "ENABLED", "httpTarget": scheduler()["httpTarget"]
        })))

    def test_reject_public_access_and_unknown_iam(self):
        self.assertTrue(any("unexpectedly exposes" in x for x in
                            self.inspect(policy={"bindings": [
                                {"role": "roles/run.invoker", "members": ["allUsers"]}]})))
        with mock.patch.object(m, "meta", side_effect=m.Stop("no IAM read")):
            result = m.inspect(state(), scheduler(), secret())
        self.assertTrue(any("policy unreadable" in x for x in result))

    def test_missing_scheduler_read_and_disabled_stripe_secret(self):
        with mock.patch.object(m, "meta", return_value={"bindings": []}):
            blockers = m.inspect(state(), None, secret())
        self.assertTrue(any("scheduler state unreadable" in x for x in blockers))
        self.assertTrue(any("no enabled" in x for x in self.inspect(sec={
            "name": secret()["name"], "state": "DISABLED"
        })))

    def test_missing_live_secret_version_permission_fails_closed_not_traceback(self):
        # GitHub WIF may read Cloud Run but not Secret Manager versions.
        # Absence of permission is a BLOCKER, not evidence that secret vanished.
        with mock.patch.object(m, "meta", return_value={"bindings": []}):
            blockers = m.inspect(state(), scheduler(), None)
        self.assertEqual(len([b for b in blockers if "VERSION METADATA unreadable" in b]), 1)
        self.assertFalse(any("cannot be pinned" in b for b in blockers))
        with mock.patch.object(m, "meta", return_value={"bindings": []}):
            malformed = m.inspect(state(), scheduler(), {})
        self.assertTrue(any("no enabled" in b for b in malformed))
        self.assertTrue(any("cannot be pinned" in b for b in malformed))

    def test_read_state_handles_denied_credential_metadata_without_exposing_values(self):
        with mock.patch.object(m, "meta", side_effect=[
            state(), m.Stop("scheduler viewer denied"), m.Stop("secret version viewer denied")
        ]):
            svc, sched, sec = m.read_state()
        self.assertEqual(svc["status"]["latestReadyRevisionName"],
                         "american-rider-api-production-00003-lhg")
        self.assertIsNone(sched)
        self.assertIsNone(sec)
        with mock.patch.object(m, "meta", return_value={"bindings": []}):
            blockers = m.inspect(svc, sched, sec)
        self.assertTrue(any("scheduler state unreadable" in b for b in blockers))
        self.assertTrue(any("VERSION METADATA unreadable" in b for b in blockers))

    def test_live_get_responses_require_real_verified_provider_and_mode(self):
        health = {
            "stripe": "live", "deployment": "production", "screening": "on",
            "documents": "on", "scheduler": "authenticated",
            "support": {"firestore": "on"}, "fleet": {"operators": 0},
            "operationalReady": True, "commit": "abcdef0",
        }
        cfg = {"mode": "live", "canTakePayment": True, "stripePublishableKey": "pk_live_DUMMY"}
        m.verify_paid_public(health, cfg, {"ok": True})
        with self.assertRaisesRegex(m.Stop, "publishable key"):
            m.verify_paid_public(health, {**cfg, "stripePublishableKey": "pk_test_DUMMY"}, {"ok": True})
        with self.assertRaisesRegex(m.Stop, "Screening"):
            m.verify_paid_public({**health, "screening": "off"}, cfg, {"ok": True})

    def test_failed_public_health_auto_rolls_back_without_stripe_url_changes(self):
        live = state()
        vals = live["spec"]["template"]["spec"]["containers"][0]["env"]
        vals.extend([
            {"name": "STRIPE_SECRET_KEY", "valueFrom": {"secretKeyRef": {"name": "live", "key": "1"}}},
            {"name": "AR_CLOUDRUN_CUTOVER_ACTIVE", "value": "1"},
            {"name": "AR_RELEASE_COMMIT", "value": "a" * 40},
        ])
        vals[0]["value"] = "production"
        calls = []
        with mock.patch.object(m, "grant_live_secret_access"), \
             mock.patch.object(m, "gcloud", side_effect=lambda *a, **k: calls.append(a) or ""), \
             mock.patch.object(m, "meta", return_value=live), \
             mock.patch.object(m, "get_public", side_effect=m.Stop("no HTTP readiness")):
            with self.assertRaises(m.Stop):
                m.activate("a" * 40, secret())
        serialized = " ".join(" ".join(x) for x in calls)
        self.assertIn("--no-invoker-iam-check", serialized)
        self.assertIn("--invoker-iam-check", serialized)
        self.assertIn("--remove-secrets=STRIPE_SECRET_KEY", serialized)
        self.assertNotIn("stripe.com", serialized)
        self.assertNotIn("scheduler jobs resume", serialized)

    def test_approval_cannot_be_bypassed(self):
        with mock.patch.object(m, "require_exact_release", return_value="a" * 40), \
             mock.patch.object(m, "read_state", return_value=(state(), scheduler(), secret())), \
             mock.patch.object(m, "meta", return_value={"bindings": []}), \
             mock.patch.object(m, "activate") as activation, \
             mock.patch.dict(os.environ, {"FOUNDER_APPROVAL": ""}):
            with mock.patch.object(m.sys, "argv", ["script", "ACTIVATE_PAID"]):
                with self.assertRaisesRegex(m.Stop, "approval"):
                    m.main()
        activation.assert_not_called()


if __name__ == "__main__":
    unittest.main()
