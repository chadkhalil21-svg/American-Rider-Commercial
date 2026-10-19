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
        "status":{"traffic":[{"revisionName":"prod-old","percent":100}]} }
def job():
    return {"state":"ENABLED","httpTarget":{"uri":m.URL+"/scheduled/sweep"}}

class PaidSourceTest(unittest.TestCase):
    def test_one_authority_and_live_money(self):
        self.assertEqual(m.require_single_traffic(svc()),"prod-old")
        self.assertTrue(m.assert_live(svc(),job()))
    def test_reject_ambiguous_canary_and_unready_job(self):
        x=svc()
        x["status"]["traffic"]=[{"revisionName":"old","percent":90},{"revisionName":"new","percent":10}]
        with self.assertRaisesRegex(m.Stop,"single known"): m.require_single_traffic(x)
        y=job();y["state"]="PAUSED"
        with self.assertRaisesRegex(m.Stop,"must already"):m.assert_live(svc(),y)
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
