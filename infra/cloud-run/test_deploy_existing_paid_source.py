import importlib.util
import pathlib
import unittest
from unittest import mock

FILE=pathlib.Path(__file__).with_name("deploy-existing-paid-source.py")
spec=importlib.util.spec_from_file_location("ar_paid_source",FILE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def svc():
    return {
        "spec":{"template":{"spec":{"containers":[{"env":[
            {"name":"DEPLOYMENT_MODE","value":"production"},
            {"name":"AR_CLOUDRUN_CUTOVER_ACTIVE","value":"1"},
            {"name":"AR_EXTERNAL_SCHEDULER","value":"1"},
            {"name":"STRIPE_SECRET_KEY","valueFrom":{"secretKeyRef":{"name":"ar-render-import-stripe-secret-key","key":"1"}}},
            {"name":"SCHEDULER_TOKEN","valueFrom":{"secretKeyRef":{"name":"ar-production-scheduler-token","key":"1"}}},
        ]}]}}},
        "status":{"traffic":[{"revisionName":"prod-old","percent":100}],
                  "url":"https://american-rider-api-production-abc-ue.a.run.app"} }
def job():
    return {"state":"ENABLED","schedule":"* * * * *","httpTarget":{
        "uri":m.URL+"/scheduled/sweep", "httpMethod":"POST",
        "oidcToken":{"serviceAccountEmail":m.EXPECTED_SCHEDULER_SA},
        "headers":{"x-scheduler-token":"SYNTHETIC_DO_NOT_USE"}}}

class PaidSourceTest(unittest.TestCase):
    def test_one_authority_and_live_money(self):
        self.assertEqual(m.require_single_traffic(svc()),"prod-old")
        self.assertTrue(m.assert_live(svc(),job()))
    def test_reject_ambiguous_canary_and_unready_job(self):
        x=svc()
        x["status"]["traffic"]=[{"revisionName":"old","percent":90},{"revisionName":"new","percent":10}]
        with self.assertRaisesRegex(m.Stop,"single known"): m.require_single_traffic(x)
        y=job();y["state"]="PAUSED"
        with self.assertRaisesRegex(m.Stop,"not ENABLED"):m.assert_live(svc(),y)
    def test_existing_service_url_alias_is_approved_without_new_job(self):
        j=job()
        j["httpTarget"]["uri"]=svc()["status"]["url"]+"/scheduled/sweep"
        self.assertTrue(m.assert_live(svc(),j))

    def test_wrong_hosts_routes_and_query_are_blocked(self):
        for uri in ("https://other.example/scheduled/sweep",
                    m.URL+"/scheduled/other",
                    m.URL+"/scheduled/sweep?unexpected=true"):
            j=job()
            j["httpTarget"]["uri"]=uri
            with self.assertRaisesRegex(m.Stop,"destination differs"):
                m.assert_live(svc(),j)

    def test_no_identity_method_signature_or_cadence_bypass(self):
        variants = [
            lambda x:x["httpTarget"].update({"httpMethod":"GET"}),
            lambda x:x["httpTarget"]["oidcToken"].update({"serviceAccountEmail":"bad@example.com"}),
            lambda x:x["httpTarget"].update({"headers":{}}),
            lambda x:x.update({"schedule":"*/5 * * * *"}),
        ]
        for change in variants:
            j=job()
            change(j)
            with self.assertRaises(m.Stop):m.assert_live(svc(),j)

    def test_independently_ready_no_traffic_candidate_not_service_pointer(self):
        x=svc()
        x["status"]["latestCreatedRevisionName"]="american-rider-api-production-00007-test"
        x["status"]["latestReadyRevisionName"]="prod-old"
        new={"metadata":{"name":"american-rider-api-production-00007-test"},
             "status":{"conditions":[{"type":"Ready","status":"True","reason":"Retired"}]}}
        with mock.patch.object(m,"meta",side_effect=[x,new]) as called:
            candidate,current=m.wait_for_created_ready_revision("prod-old", attempts=1)
        self.assertEqual(candidate,"american-rider-api-production-00007-test")
        self.assertEqual(current["status"]["traffic"][0]["percent"],100)
        self.assertEqual(called.call_count,2)

    def test_never_promote_revision_with_failed_or_missing_ready_condition(self):
        for condition in ({"type":"Ready","status":"False"},
                          {"type":"Ready","status":"Unknown"},
                          {"type":"ResourcesAvailable","status":"True"}):
            x=svc()
            x["status"]["latestCreatedRevisionName"]="american-rider-api-production-00007-test"
            new={"metadata":{"name":"american-rider-api-production-00007-test"},
                 "status":{"conditions":[condition]}}
            with mock.patch.object(m,"meta",side_effect=[x,new]):
                with self.assertRaisesRegex(m.Stop,"NOT READY|Timed out"):
                    m.wait_for_created_ready_revision("prod-old", attempts=1)

    def test_never_promote_wrong_revision_or_changed_traffic(self):
        x=svc()
        x["status"]["latestCreatedRevisionName"]="american-rider-api-production-00007-test"
        wrong={"metadata":{"name":"american-rider-api-production-OTHER"},
               "status":{"conditions":[{"type":"Ready","status":"True"}]}}
        with mock.patch.object(m,"meta",side_effect=[x,wrong]):
            with self.assertRaisesRegex(m.Stop,"does not match"):
                m.wait_for_created_ready_revision("prod-old", attempts=1)
        x["status"]["traffic"]=[{"revisionName":"unexpected","percent":100}]
        with mock.patch.object(m,"meta",return_value=x):
            with self.assertRaisesRegex(m.Stop,"Live service traffic changed"):
                m.wait_for_created_ready_revision("prod-old", attempts=1)

    def test_zero_traffic_deploy_and_rollback_remain_protected(self):
        text=FILE.read_text()
        self.assertIn("wait_for_created_ready_revision(old_revision)",text)
        self.assertIn("public_readiness(sha)",text)
        self.assertIn('"--to-revisions={new_revision}=100"',text)
        self.assertIn("ROLLBACK: restored",text)

    def test_never_clear_existing_secret_or_flip_payment_mode(self):
        text=FILE.read_text()
        self.assertIn('"--no-traffic"',text)
        self.assertIn('"--update-env-vars=AR_RELEASE_COMMIT=',text)
        self.assertIn("ROLLBACK: restored",text)
        self.assertNotIn('"--set-secrets=',text)
        self.assertNotIn('"--allow-unauthenticated"',text)
        self.assertNotIn('STRIPE_SECRET_KEY=sk_live_',text)
    def test_missing_stripe_secret_ref_refuses(self):
        x=svc()
        x["spec"]["template"]["spec"]["containers"][0]["env"][3]={"name":"STRIPE_SECRET_KEY","value":"sk_test_unsafe"}
        with self.assertRaisesRegex(m.Stop,"not fully"):m.assert_live(x,job())

if __name__=="__main__":
    unittest.main()
