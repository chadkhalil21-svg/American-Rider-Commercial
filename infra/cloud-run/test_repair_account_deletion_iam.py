"""Safe offline regressions for production account-deletion IAM repair."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

spec = importlib.util.spec_from_file_location(
    "ar_delete_iam", Path(__file__).with_name("repair-account-deletion-iam.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def records(runtime=None, role_exists=False, bound=False, additional=()):
    runtime = runtime or mod.RUNTIME
    existing = ([{"name": mod.ROLE, "includedPermissions": mod.PERMISSIONS, "stage": "GA"}]
                if role_exists else [])
    bindings = [{"role": role, "members": [mod.MEMBER]} for role in additional]
    if bound:
        bindings.append({"role": mod.ROLE, "members": [mod.MEMBER]})
    def fake(*args):
        if args[:3] == ("run", "services", "describe"):
            return {"spec": {"template": {"spec": {"serviceAccountName": runtime}}}}
        if args[:3] == ("iam", "roles", "list"):
            return existing
        if args[:2] == ("projects", "get-iam-policy"):
            return {"bindings": bindings}
        raise AssertionError("Unexpected cloud query: " + repr(args))
    return fake


class AccountDeletionIAMTests(TestCase):
    def test_only_firebase_delete_is_granted(self):
        self.assertEqual(mod.PERMISSIONS, ["firebaseauth.users.delete"])
        self.assertEqual(mod.RUNTIME, "ar-production-live-runtime@american-rider-35688.iam.gserviceaccount.com")

    def test_audit_when_permission_missing(self):
        with mock.patch.object(mod, "cli", return_value=mod.PROJECT), mock.patch.object(mod, "doc", side_effect=records()):
            self.assertEqual(mod.audit(), (False, False))

    def test_idempotent_verified_role_binding(self):
        with mock.patch.object(mod, "cli", return_value=mod.PROJECT), mock.patch.object(mod, "doc", side_effect=records(role_exists=True, bound=True)):
            self.assertEqual(mod.audit(), (True, True))

    def test_wrong_runtime_must_fail_closed(self):
        with mock.patch.object(mod, "cli", return_value=mod.PROJECT), mock.patch.object(mod, "doc", side_effect=records(runtime="some-other-identity@example.com")):
            with self.assertRaisesRegex(RuntimeError, "different identity"):
                mod.audit()

    def test_already_broad_auth_role_triggers_investigation(self):
        with mock.patch.object(mod, "cli", return_value=mod.PROJECT), mock.patch.object(mod, "doc", side_effect=records(additional=("roles/firebaseauth.admin",))):
            with self.assertRaisesRegex(RuntimeError, "already has"):
                mod.audit()

    def test_custom_role_must_not_contain_other_permissions(self):
        def fake(*args):
            result = records(role_exists=True)(*args)
            if args[:3] == ("iam", "roles", "list"):
                result[0]["includedPermissions"] = ["firebaseauth.users.delete", "firebaseauth.users.create"]
            return result
        with mock.patch.object(mod, "cli", return_value=mod.PROJECT), mock.patch.object(mod, "doc", side_effect=fake):
            with self.assertRaisesRegex(RuntimeError, "Custom role conflicts"):
                mod.audit()

    def test_do_not_apply_to_wrong_project(self):
        with mock.patch.object(mod, "cli", return_value="wrong-project"), mock.patch.object(mod, "doc") as cloud:
            with self.assertRaisesRegex(RuntimeError, "expected Google Cloud project"):
                mod.audit()
            cloud.assert_not_called()
