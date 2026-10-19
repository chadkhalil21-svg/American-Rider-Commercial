"""Offline-only migration tests. Never access real Google, Render or Stripe."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

file = Path(__file__).with_name("prepare-commercial-cutover.py")
spec = importlib.util.spec_from_file_location("ar_prepare_commercial_cutover", file)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def good_service():
    return {
        "spec": {"template": {"spec": {
            "serviceAccountName": m.RUNTIME,
            "containers": [{"env": [
                {"name": "DEPLOYMENT_MODE", "value": "development"},
                {"name": "AR_EXTERNAL_SCHEDULER", "value": "1"},
            ]}],
        }}},
        "status": {"url": "https://american-rider-api-production-623854974930.us-east1.run.app"},
    }


class CutoverPrepTests(unittest.TestCase):
    def test_exact_scope(self):
        self.assertEqual(m.PROJECT, "american-rider-35688")
        self.assertEqual(m.SERVICE, "american-rider-api-production")
        self.assertEqual(m.SCHEDULER_JOB, "ar-production-minute-sweeps")
        self.assertEqual(m.WEBHOOKS, (
            "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET",
            "RESEND_WEBHOOK_SECRET"))
        self.assertNotIn("STRIPE_SECRET_KEY", m.WEBHOOKS)

    def test_abort_if_live_payment_key_or_public_service(self):
        val = good_service()
        val["spec"]["template"]["spec"]["containers"][0]["env"].append({
            "name": "STRIPE_SECRET_KEY", "valueFrom": {"secretKeyRef": {
                "name": "ar-render-import-stripe-secret-key", "key": "1"
            }}
        })
        with mock.patch.object(m, "google_json", return_value={"bindings": []}):
            with self.assertRaisesRegex(RuntimeError, "LIVE Stripe"):
                m.verify_safe_private(val)
        val = good_service()
        with mock.patch.object(m, "google_json", return_value={"bindings": [
            {"members": ["allUsers"], "role": "roles/run.invoker"}]}):
            with self.assertRaisesRegex(RuntimeError, "already public"):
                m.verify_safe_private(val)

    def test_bind_only_signing_keys_not_payment_key(self):
        calls = []
        def fake(*args, **kwargs):
            calls.append((args, kwargs))
            return ""
        versions = {
            "STRIPE_WEBHOOK_SECRET": ("ar-render-import-stripe-webhook-secret", "1"),
            "STRIPE_CONNECT_WEBHOOK_SECRET": ("ar-render-import-stripe-connect-webhook-secret", "1"),
            "RESEND_WEBHOOK_SECRET": ("ar-render-import-resend-webhook-secret", "1"),
        }
        with mock.patch.object(m, "google", side_effect=fake), \
             mock.patch.object(m, "service_info", return_value=good_service()), \
             mock.patch.object(m, "verify_safe_private"), \
             mock.patch.object(m, "service_health"):
            m.refresh_service(versions, "c"*40)
        self.assertEqual(len(calls), 2)
        update = " ".join(calls[0][0])
        deploy = " ".join(calls[1][0])
        self.assertIn("STRIPE_WEBHOOK_SECRET=", update)
        self.assertIn("STRIPE_CONNECT_WEBHOOK_SECRET=", update)
        self.assertNotIn("STRIPE_SECRET_KEY=", update)
        self.assertNotIn("STRIPE_SECRET_KEY=", deploy)
        self.assertIn("--no-allow-unauthenticated", deploy)
        self.assertIn("--update-env-vars=AR_RELEASE_COMMIT=", deploy)
        self.assertNotIn("--allow-unauthenticated", deploy.replace(
            "--no-allow-unauthenticated", ""))

    def test_private_health_uses_verified_alternative_after_401(self):
        good = {
            "stripe": "no-key", "deployment": "development",
            "support": {"firestore": "on"}, "fleet": {"operators": 0},
        }
        called = []
        def probe(url, token=None):
            called.append(url)
            return (None, "/live HTTP 401") if len(called) == 1 else (good, "ok")
        with mock.patch.object(m, "google", return_value="PRIVATE_ID_TOKEN"), \
             mock.patch.object(m, "_health_probe", side_effect=probe), \
             mock.patch.object(m, "_health_through_google_proxy") as proxy:
            result = m.service_health("https://alternate-name.a.run.app")
        self.assertEqual(result, m.VERIFIED_PRODUCTION_URL)
        self.assertEqual(called, [
            "https://alternate-name.a.run.app", m.VERIFIED_PRODUCTION_URL
        ])
        proxy.assert_not_called()

    def test_proxy_rescues_two_unusable_private_urls(self):
        good = {
            "stripe": "no-key", "deployment": "development",
            "support": {"firestore": "on"}, "fleet": {"operators": 1},
        }
        with mock.patch.object(m, "google", return_value="PRIVATE_ID_TOKEN"), \
             mock.patch.object(m, "_health_probe", return_value=(None, "/live HTTP 401")), \
             mock.patch.object(m, "_health_through_google_proxy", return_value=(good, "ok")) as proxy:
            result = m.service_health("https://alternate-name.a.run.app")
        self.assertEqual(result, "https://alternate-name.a.run.app")
        proxy.assert_called_once()

    def test_private_http_403_reports_iam_without_leaking_token(self):
        import io
        import urllib.error
        from contextlib import redirect_stdout
        denied = urllib.error.HTTPError(
            "https://private.run.app/live", 403, "Forbidden", {}, None)
        with mock.patch.object(m, "google", return_value="PRIVATE_ID_TOKEN"), \
             mock.patch.object(m.urllib.request, "urlopen", side_effect=denied), \
             mock.patch.object(m, "_health_through_google_proxy", return_value=(
                 None, "Google authenticated proxy exited")):
            with redirect_stdout(io.StringIO()) as output:
                with self.assertRaisesRegex(RuntimeError, r"/live HTTP 403") as ctx:
                    m.service_health("https://private.run.app")
        self.assertNotIn("PRIVATE_ID_TOKEN", str(ctx.exception))
        self.assertNotIn("PRIVATE_ID_TOKEN", output.getvalue())
        self.assertIn("No secrets, Stripe, scheduler or stores changed", str(ctx.exception))

    def test_private_network_error_classified_without_redeploy(self):
        import urllib.error
        with mock.patch.object(m, "google", return_value="PRIVATE_ID_TOKEN"), \
             mock.patch.object(m.urllib.request, "urlopen",
                               side_effect=urllib.error.URLError("DNS unavailable")), \
             mock.patch.object(m, "_health_through_google_proxy",
                               return_value=(None, "proxy not reachable")):
            with self.assertRaisesRegex(RuntimeError, r"/live transport URLError") as ctx:
                m.service_health("https://private.run.app")
        self.assertNotIn("DNS unavailable", str(ctx.exception))
        self.assertNotIn("PRIVATE_ID_TOKEN", str(ctx.exception))

    def test_health_must_stay_payment_disabled_even_if_http_200(self):
        bad = {
            "stripe": "live", "deployment": "production",
            "support": {"firestore": "on"}, "fleet": {"operators": 2},
        }
        with mock.patch.object(m, "google", return_value="PRIVATE_ID_TOKEN"), \
             mock.patch.object(m, "_health_probe", return_value=(bad, "ok")), \
             mock.patch.object(m, "_health_through_google_proxy") as proxy:
            with self.assertRaisesRegex(RuntimeError, "Stripe OFF") as ctx:
                m.service_health("https://private.run.app")
        proxy.assert_not_called()

    def test_existing_paused_scheduler_is_reused(self):
        calls = []
        def api(url, token, operation, payload=None, method="GET"):
            calls.append(operation)
            return {"state": "PAUSED", "httpTarget": {
                "uri": "https://verified.run.app/scheduled/sweep"
            }}
        with mock.patch.object(m, "google"), \
             mock.patch.object(m, "scheduler_identity"), \
             mock.patch.object(m, "scheduler_http", side_effect=api):
            m.prepare_paused_scheduler("https://verified.run.app")
        self.assertEqual(calls, ["Scheduler lookup"])

    def test_new_scheduler_has_future_schedule_then_must_pause(self):
        requests = []
        def api(url, token, operation, payload=None, method="GET"):
            requests.append((operation, payload))
            if operation == "Scheduler lookup":
                return {"__not_found__": True}
            if operation == "Verify scheduler is paused":
                return {"state": "PAUSED"}
            return {}
        with mock.patch.object(m, "google"), \
             mock.patch.object(m, "scheduler_identity"), \
             mock.patch.object(m, "scheduler_secret_value",
                               return_value="a" * 64), \
             mock.patch.object(m, "scheduler_http", side_effect=api):
            m.prepare_paused_scheduler("https://verified.run.app")
        self.assertEqual([x[0] for x in requests], [
            "Scheduler lookup", "Create inactive scheduler",
            "Pause scheduler", "Verify scheduler is paused"])
        job = requests[1][1]
        self.assertEqual(job["schedule"], "0 0 1 1 *")
        self.assertEqual(job["httpTarget"]["httpMethod"], "POST")
        self.assertEqual(job["httpTarget"]["headers"]["x-scheduler-token"], "a"*64)
        self.assertEqual(job["httpTarget"]["oidcToken"]["audience"],
                         "https://verified.run.app")

    def test_never_catches_403_as_missing_secret(self):
        with mock.patch.object(m.render_stage, "request_json", side_effect=m.render_stage.ApiFailure(
                "Google secret lookup", 403)):
            with self.assertRaises(m.render_stage.ApiFailure):
                m.render_stage.stage_one("STRIPE_WEBHOOK_SECRET", "whsec_dummy", "token")


if __name__ == "__main__":
    unittest.main()
