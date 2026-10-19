"""Offline safety tests. No Render/Google calls, secrets, money or files written."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

SCRIPT = Path(__file__).with_name("stage-render-secrets.py")
spec = importlib.util.spec_from_file_location("stage_render_secrets", SCRIPT)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class StageRenderSecretTests(TestCase):
    def test_dangerous_runtime_or_endpoint_secrets_are_excluded(self):
        result, excluded, invalid = migration.eligible_values({
            "STRIPE_SECRET_KEY": "sk_live_example_never_real",
            "PUBLIC_APP_URL": "https://example.com",
            "FIREBASE_SERVICE_ACCOUNT": '{"private_key":"example"}',
            "SCHEDULER_TOKEN": "old-render-scheduler",
            "STRIPE_WEBHOOK_SECRET": "whsec_old",
            "SCREENING_PROVIDER_WEBHOOK_SECRET": "old",
            "RENDER_INSTANCE_ID": "render-only",
            "DEPLOYMENT_MODE": "production",
            "GOOGLE_APPLICATION_CREDENTIALS": "/etc/secrets/account.json",
        })
        self.assertEqual(result, {
            "STRIPE_SECRET_KEY": "sk_live_example_never_real",
            "PUBLIC_APP_URL": "https://example.com",
        })
        self.assertEqual(invalid, [])
        self.assertIn("FIREBASE_SERVICE_ACCOUNT", excluded)
        self.assertIn("SCREENING_PROVIDER_WEBHOOK_SECRET", excluded)

    def test_masked_and_unexpected_values_halt_before_copy(self):
        staged, excluded, invalid = migration.eligible_values({
            "RESEND_API_KEY": "********", "lowercase": "cannot-stage", "HERE_API_KEY": "",
        })
        self.assertEqual(staged, {})
        self.assertEqual(excluded, [])
        self.assertEqual(set(invalid), {"RESEND_API_KEY", "lowercase", "HERE_API_KEY"})

    def test_new_secret_name_and_in_memory_base64_version(self):
        calls = []
        def api(url, token, operation, method="GET", data=None):
            calls.append((url, operation, method, data))
            if operation == "Google secret lookup":
                raise migration.ApiFailure(operation, 404)
            if operation == "Google secret versions":
                return {"versions": []}
            return {}
        with mock.patch.object(migration, "request_json", side_effect=api):
            result = migration.stage_one("STRIPE_SECRET_KEY", "example-in-memory", "test-google-token")
        self.assertEqual(result, "staged")
        self.assertTrue(calls[0][0].endswith("/ar-render-import-stripe-secret-key"))
        self.assertEqual(calls[1][2], "POST")
        self.assertEqual(calls[-1][2], "POST")
        self.assertNotIn("example-in-memory", str(calls))
        self.assertIn("payload", calls[-1][3])

    def test_existing_enabled_secret_is_never_overwritten(self):
        def api(url, token, operation, method="GET", data=None):
            if operation == "Google secret versions":
                return {"versions": [{"state": "ENABLED"}]}
            return {}
        with mock.patch.object(migration, "request_json", side_effect=api) as call:
            result = migration.stage_one("HERE_API_KEY", "value", "test-token")
        self.assertEqual(result, "already-staged")
        self.assertEqual(call.call_count, 2)

    def test_permission_error_does_not_create_secret(self):
        with mock.patch.object(
            migration, "request_json",
            side_effect=migration.ApiFailure("Google secret lookup", 403),
        ) as call:
            with self.assertRaises(migration.ApiFailure):
                migration.stage_one("STRIPE_SECRET_KEY", "value", "token")
        self.assertEqual(call.call_count, 1)

    def test_render_service_identity_is_verified(self):
        def api(url, token, operation, method="GET", data=None):
            if operation == "Render service identity":
                return {"id": migration.SERVICE_ID,
                        "repo": "https://github.com/" + migration.EXPECTED_REPO}
            if operation == "Render environment page 1":
                return [{"envVar": {"key": "STRIPE_SECRET_KEY", "value": "demo"}, "cursor": "x"}]
            self.fail("Unexpected Render query")
        with mock.patch.object(migration, "request_json", side_effect=api):
            value = migration.render_environment("never-real")
        self.assertEqual(value, {"STRIPE_SECRET_KEY": "demo"})
