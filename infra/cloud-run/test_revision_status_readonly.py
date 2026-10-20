import importlib.util
import pathlib
import unittest
from unittest import mock

FILE = pathlib.Path(__file__).with_name("revision-status-readonly.py")
spec = importlib.util.spec_from_file_location("revision_status_readonly", FILE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def service(created="american-rider-api-production-00007-demo", ready="american-rider-api-production-00006-old"):
    return {"status": {
        "latestCreatedRevisionName": created,
        "latestReadyRevisionName": ready,
        "traffic": [{"revisionName": ready, "percent": 100}]
    }}


def revision(name, timestamp, ready, reason=""):
    return {
        "metadata": {"name": name, "creationTimestamp": timestamp},
        "status": {"conditions": [
            {"type": "Ready", "status": ready, "reason": reason,
             "message": "NEVER_PRINT_FAKE_SECRET_OR_CUSTOMER_INFORMATION"}
        ]}
    }


class RevisionStatusReadOnlyTest(unittest.TestCase):
    def test_reports_real_unready_revision_without_secret_text(self):
        results = m.summarize(service(), [
            revision("american-rider-api-production-00006-old", "2026-10-19T01:00:00Z", "True"),
            revision("american-rider-api-production-00007-demo", "2026-10-19T02:00:00Z", "False", "ContainerMissing")
        ])
        joined = "\n".join(results)
        self.assertIn("Latest CREATED revision: american-rider-api-production-00007-demo", joined)
        self.assertIn("Latest READY revision: american-rider-api-production-00006-old", joined)
        self.assertIn("Ready=False(ContainerMissing)", joined)
        self.assertIn("Current 100% traffic: american-rider-api-production-00006-old", joined)
        self.assertNotIn("NEVER_PRINT_FAKE_SECRET", joined)

    def test_reports_consistent_latest_ready(self):
        result = m.summarize(service(created="same", ready="same"), [])
        self.assertTrue(any("pointer agrees" in line for line in result))

    def test_unreadable_metadata_never_claims_success(self):
        self.assertIn("UNAVAILABLE", " ".join(m.summarize(None, None)))
        self.assertIn("UNAVAILABLE", " ".join(m.summarize(service(), None)))

    def test_malformed_and_unsafe_condition_reason_redacted(self):
        result = m.summarize(service(), [revision("legitimate", "2026-10-19T02:00:00Z",
                                "False", "secret token=foo@private.example")])
        self.assertNotIn("secret token", " ".join(result))
        self.assertIn("unavailable", " ".join(result))

    def test_no_google_mutation_ever_issued(self):
        with mock.patch.object(m, "cmd_json", side_effect=[
            service(), [revision("rev", "2026-10-19T02:00:00Z", "False")]
        ]) as client, mock.patch.dict(m.os.environ, {"GITHUB_STEP_SUMMARY": ""}):
            self.assertEqual(m.main(), 0)
        commands = [call.args[:3] for call in client.call_args_list]
        self.assertEqual(commands[0], ("run", "services", "describe"))
        self.assertEqual(commands[1], ("run", "revisions", "list"))
        for call in client.call_args_list:
            self.assertFalse({"deploy", "update", "update-traffic", "set-iam-policy"} & set(call.args))


if __name__ == "__main__":
    unittest.main()
