import importlib.util
import pathlib
import unittest

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

    def candidate(self):
        old=m.env(svc())
        values=list(old.values())+[{"name":"AR_RELEASE_COMMIT","value":"a"*40}]
        return {"metadata":{"name":"american-rider-api-production-00007-xd5","generation":2},
                "status":{"observedGeneration":2,"conditions":[
                    {"type":"Ready","status":"True","reason":"Retired"},
                    {"type":"Active","status":"False","reason":"Retired"},
                    {"type":"ResourcesAvailable","status":"Unknown","reason":"Retired"}
                ]},
                "spec":{"containers":[{"env":values}]}}

    def test_ready_true_retired_no_traffic_revision_is_accepted(self):
        # Authenticated Oct 19 Google audit: Ready=True, Active=False(Retired),
        # latest created != latest ready, and old revision serving all traffic.
        candidate=self.candidate()
        self.assertTrue(m.require_candidate_ready(
            candidate,"american-rider-api-production-00007-xd5","a"*40,m.env(svc())))
        self.assertEqual(m.require_single_traffic(svc()),"prod-old")

    def test_unready_new_revision_never_promotes(self):
        candidate=self.candidate()
        candidate["status"]["conditions"][0]["status"]="False"
        with self.assertRaisesRegex(m.Stop,"NOT Ready"):
            m.require_candidate_ready(candidate,"american-rider-api-production-00007-xd5","a"*40,m.env(svc()))

    def test_source_or_provider_bindings_changed_rejected(self):
        candidate=self.candidate()
        with self.assertRaisesRegex(m.Stop,"SHA differs"):
            m.require_candidate_ready(candidate,"american-rider-api-production-00007-xd5","b"*40,m.env(svc()))
        candidate=self.candidate()
        candidate["spec"]["containers"][0]["env"][3]["valueFrom"]["secretKeyRef"]["name"]="WRONG_SECRET"
        with self.assertRaisesRegex(m.Stop,"provider or runtime"):
            m.require_candidate_ready(candidate,"american-rider-api-production-00007-xd5","a"*40,m.env(svc()))

    def test_identity_and_generation_consistency_required(self):
        candidate=self.candidate()
        with self.assertRaisesRegex(m.Stop,"wrong Cloud Run candidate"):
            m.require_candidate_ready(candidate,"american-rider-api-production-00008-abc","a"*40,m.env(svc()))
        candidate=self.candidate()
        candidate["status"]["observedGeneration"]=1
        with self.assertRaisesRegex(m.Stop,"not reconciled"):
            m.require_candidate_ready(candidate,"american-rider-api-production-00007-xd5","a"*40,m.env(svc()))

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
