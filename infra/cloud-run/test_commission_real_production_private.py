"""No cloud/network calls: test safeguards of the final private production API."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

PATH = Path(__file__).with_name("commission-real-production-private.py")
spec = importlib.util.spec_from_file_location("commission_real_prod", PATH)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class ProductionPreflightTests(TestCase):
    def test_non_money_secrets_are_exact_and_complete(self):
        self.assertEqual(len(migration.SAFE_IMPORTS), 13)
        self.assertNotIn("STRIPE_SECRET_KEY", migration.SAFE_IMPORTS)
        self.assertNotIn("STRIPE_WEBHOOK_SECRET", migration.SAFE_IMPORTS)
        self.assertNotIn("STRIPE_CONNECT_WEBHOOK_SECRET", migration.SAFE_IMPORTS)
        self.assertNotIn("FIREBASE_SERVICE_ACCOUNT", migration.SAFE_IMPORTS)
        self.assertNotIn("SCHEDULER_TOKEN", migration.SAFE_IMPORTS)
        self.assertEqual(migration.PROJECT, "american-rider-35688")
        self.assertEqual(migration.SERVICE, "american-rider-api-production")
        self.assertNotEqual(migration.SERVICE, migration.CANDIDATE)

    def test_candidate_fails_on_accidental_stripe_binding(self):
        with mock.patch.object(migration, "gjson", return_value={
            "spec": {"template": {"spec": {"containers": [{"env": [
                {"name": "STRIPE_SECRET_KEY", "valueFrom": {"secretKeyRef": {
                    "name": "ar-render-import-stripe-secret-key", "key": "1"
                }}},
            ]}]}}}
        }):
            with self.assertRaisesRegex(RuntimeError, "candidate still has a Stripe key"):
                migration.validate_candidate()

    def test_no_render_or_public_api_switch_on_deploy(self):
        calls = []
        def capture(*args, **kw):
            calls.append((args, kw))
        fake_versions = {key: "1" for key in migration.SAFE_IMPORTS}
        fake_versions["SCHEDULER_TOKEN"] = "1"
        with mock.patch.object(migration, "gc", side_effect=capture):
            migration.deploy(fake_versions, "a" * 40)
        args, flags = calls[0]
        cmd = " ".join(args)
        self.assertIn("--no-allow-unauthenticated", cmd)
        self.assertIn("--service-account=ar-production-live-runtime@", cmd)
        self.assertIn("DEPLOYMENT_MODE=development", cmd)
        self.assertIn("AR_EXTERNAL_SCHEDULER=1", cmd)
        self.assertIn("GOOGLE_CLOUD_PROJECT=american-rider-35688", cmd)
        self.assertIn("--set-secrets=", cmd)
        self.assertNotIn("STRIPE_SECRET_KEY", cmd)
        self.assertNotIn("STRIPE_WEBHOOK_SECRET", cmd)
        self.assertNotIn("STRIPE_CONNECT_WEBHOOK_SECRET", cmd)
        self.assertNotIn("gcloud scheduler", cmd)
        self.assertNotIn("--allow-unauthenticated", cmd.replace("--no-allow-unauthenticated", ""))
        self.assertTrue(flags.get("visible"))
        self.assertEqual(flags.get("timeout"), 1200)

    def test_verify_detects_public_iam_or_money_key(self):
        info = {"spec": {"template": {"spec": {
            "serviceAccountName": migration.SA_EMAIL,
            "containers": [{"env": [
                {"name": "DEPLOYMENT_MODE", "value": "development"},
                {"name": "STRIPE_SECRET_KEY", "valueFrom": {"secretKeyRef": {"name": "x", "key": "1"}}}
            ]}]
        }}}, "status": {"url": "https://some-service.run.app"}}
        with mock.patch.object(migration, "gjson", return_value=info):
            with self.assertRaisesRegex(RuntimeError, "Unsafe Stripe secret"):
                migration.verify()
        info["spec"]["template"]["spec"]["containers"][0]["env"] = [{
            "name": "DEPLOYMENT_MODE", "value": "development"
        }]
        with mock.patch.object(migration, "gjson", side_effect=[info, {
            "bindings": [{"role": "roles/run.invoker", "members": ["allUsers"]}]
        }]):
            with self.assertRaisesRegex(RuntimeError, "unexpected public invoker"):
                migration.verify()

    def test_metadata_only_inventories(self):
        self.assertEqual(migration.SCHEDULER_SECRET, "ar-production-live-scheduler-token")
        self.assertEqual(migration.FIREBASE_ROLES, (
            "roles/datastore.user", "roles/firebaseauth.viewer"))
        self.assertNotIn("roles/editor", migration.FIREBASE_ROLES)
        self.assertNotIn("roles/owner", migration.FIREBASE_ROLES)
