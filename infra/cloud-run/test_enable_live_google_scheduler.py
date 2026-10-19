"""Offline signed, OIDC, target and once-per-minute scheduler safety."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

FILE = Path(__file__).with_name("enable-live-google-scheduler.py")
spec = importlib.util.spec_from_file_location("ar_enable_live_sweeps", FILE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def service():
    return {
        "status": {"url": m.CANONICAL},
        "spec": {"template": {"spec": {"containers": [{"env": [
            {"name": "DEPLOYMENT_MODE", "value": "production"},
            {"name": "AR_CLOUDRUN_CUTOVER_ACTIVE", "value": "1"},
            {"name": "AR_EXTERNAL_SCHEDULER", "value": "1"},
            {"name": "STRIPE_SECRET_KEY", "valueFrom": {"secretKeyRef": {"name": "live", "key": "1"}}},
            {"name": "SCHEDULER_TOKEN", "valueFrom": {"secretKeyRef": {"name": "scheduler", "key": "1"}}},
        ]}]}}}
    }


def job(state="PAUSED", schedule="0 0 1 1 *"):
    return {"state": state, "schedule": schedule, "httpTarget": {
        "uri": m.CANONICAL + "/scheduled/sweep", "httpMethod": "POST",
        "headers": {"x-scheduler-token": "SECRET_NEVER_LOGGED"},
        "oidcToken": {"serviceAccountEmail": m.EXPECTED_SCHEDULER, "audience": m.CANONICAL},
    }}


class DispatchTests(unittest.TestCase):
    def test_authorized_single_target(self):
        m.verify_target(service(), job())

    def test_refuse_dispatch_before_live_money(self):
        s = service()
        e = s["spec"]["template"]["spec"]["containers"][0]["env"]
        e[0]["value"] = "development"
        with self.assertRaisesRegex(m.Stop, "paid operational"):
            m.verify_target(s, job())
        s = service()
        e = s["spec"]["template"]["spec"]["containers"][0]["env"]
        e[2]["value"] = "0"
        with self.assertRaisesRegex(m.Stop, "internal sweep"):
            m.verify_target(s, job())

    def test_refuse_untrusted_destination_or_token(self):
        j = job()
        j["httpTarget"]["uri"] = "https://attacker.invalid/scheduled/sweep"
        with self.assertRaisesRegex(m.Stop, "destination"):
            m.verify_target(service(), j)
        j = job()
        j["httpTarget"]["oidcToken"]["serviceAccountEmail"] = "unknown@example.com"
        with self.assertRaisesRegex(m.Stop, "OIDC"):
            m.verify_target(service(), j)
        j = job()
        j["httpTarget"]["headers"] = {}
        with self.assertRaisesRegex(m.Stop, "token"):
            m.verify_target(service(), j)

    def test_no_second_scheduler_if_already_enabled(self):
        with self.assertRaisesRegex(m.Stop, "not PAUSED"):
            m.verify_target(service(), job(state="ENABLED", schedule="* * * * *"))

    def test_bounded_change_schedule_then_resume(self):
        events = []
        def gc(*args, **kw):
            events.append(args)
            return ""
        paused = job()
        paused_updated = job(schedule="* * * * *")
        enabled = job(state="ENABLED", schedule="* * * * *")
        with mock.patch.object(m, "meta", side_effect=[service(), paused, paused_updated, enabled]), \
             mock.patch.object(m, "gcloud", side_effect=gc), \
             mock.patch.object(m, "public_paid_ready", return_value=True):
            m.activate()
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0][:4], ("scheduler", "jobs", "update", "http"))
        self.assertIn("--schedule=* * * * *", events[0])
        self.assertEqual(events[1][:3], ("scheduler", "jobs", "resume"))
        self.assertNotIn("stripe", " ".join(" ".join(c) for c in events).lower())

    def test_failure_on_resume_repauses(self):
        events = []
        def gc(*args, **kw):
            events.append(args)
            if args[:3] == ("scheduler", "jobs", "resume"):
                raise m.Stop("no permission")
            return ""
        with mock.patch.object(m, "meta", side_effect=[service(), job(), job(schedule="* * * * *")]), \
             mock.patch.object(m, "gcloud", side_effect=gc), \
             mock.patch.object(m, "public_paid_ready", return_value=True):
            with self.assertRaises(m.Stop):
                m.activate()
        self.assertTrue(any(call[:3] == ("scheduler", "jobs", "pause") for call in events))

    def test_public_payment_ready_is_independent_of_global_screening_flag(self):
        import json
        health = {"deployment": "production", "stripe": "live",
                  "operationalReady": True, "documents": "on", "screening": "off",
                  "support": {"firestore": "on"}}
        config = {"canTakePayment": True, "mode": "live",
                  "stripePublishableKey": "pk_live_SYNTHETIC_ONLY"}

        class Response:
            status = 200
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *exc):
                return False
            def read(self, _):
                return json.dumps(self.payload).encode("utf8")

        def get(request, timeout=30):
            return Response(health if request.full_url.endswith("/health") else config)

        with mock.patch.object(m.urllib.request, "urlopen", side_effect=get):
            self.assertTrue(m.public_paid_ready(),
                            "A globally unset screening flag cannot veto an otherwise ready platform")
            health["documents"] = "off"
            with self.assertRaisesRegex(m.Stop, "Paid Google Cloud Run public service readiness"):
                m.public_paid_ready()
            health["documents"] = "on"
            config["stripePublishableKey"] = "pk_test_SYNTHETIC_ONLY"
            with self.assertRaisesRegex(m.Stop, "Paid Google Cloud Run public service readiness"):
                m.public_paid_ready()

    def test_owner_confirmation_gate(self):
        import os
        with mock.patch.dict(os.environ, {"GITHUB_REF": "refs/heads/release/current",
                                          "GITHUB_SHA": "a" * 40, "FOUNDER_CONFIRM": ""}), \
             mock.patch.object(m, "activate") as act:
            with self.assertRaisesRegex(m.Stop, "expressly confirm"):
                m.main()
        act.assert_not_called()


if __name__ == "__main__":
    unittest.main()
