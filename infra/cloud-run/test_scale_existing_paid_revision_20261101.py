import importlib.util,pathlib,unittest
from unittest import mock
f=pathlib.Path(__file__).with_name("scale-existing-paid-revision-20261101.py")
s=importlib.util.spec_from_file_location("scale_live_once",f)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
NAME=m.EXPECTED_OLD
def rev(maxscale="2",image="sha256:old",concurrency=20):
    return {"metadata":{"name":NAME,"annotations":{"autoscaling.knative.dev/maxScale":maxscale}},
      "spec":{"serviceAccountName":m.RUNTIME,"containerConcurrency":concurrency,
              "containers":[{"image":image,"env":[
                {"name":"DEPLOYMENT_MODE","value":"production"},
                {"name":"AR_CLOUDRUN_CUTOVER_ACTIVE","value":"1"},
                {"name":"AR_EXTERNAL_SCHEDULER","value":"1"},
                {"name":"STRIPE_SECRET_KEY","valueFrom":{"secretKeyRef":{"name":"test"}}},
                {"name":"STRIPE_CONNECT_WEBHOOK_SECRET","valueFrom":{"secretKeyRef":{"name":"test"}}},
              ],"resources":{"limits":{"cpu":"1","memory":"1Gi"}}}]},
       "status":{"conditions":[{"type":"Ready","status":"True"}]}}
def svc(smax="20",name=NAME):
    return {"metadata":{"annotations":{"run.googleapis.com/maxScale":smax}},
      "status":{"traffic":[{"revisionName":name,"percent":100}],"latestCreatedRevisionName":name}}
class TestScale(unittest.TestCase):
    @mock.patch.object(m,"public_health",return_value=True)
    def test_preserve_exact_serving_20_cap(self,health):
        ident=m.verify_before(svc(),rev())
        self.assertEqual(ident["concurrency"],20)
        self.assertEqual(m.service_limit(svc()),20)
        self.assertEqual(m.limit(rev()),2)
        self.assertEqual(m.limit(rev("100")),100)
        self.assertEqual(m.limit(rev("3")),3)
    @mock.patch.object(m,"public_health",return_value=True)
    def test_refuse_altered_or_unknown_provider_config(self,health):
        with self.assertRaisesRegex(m.Stop,"drifted"):m.verify_before(svc("25"),rev())
        with self.assertRaisesRegex(m.Stop,"drifted"):m.verify_before(svc("20",name="unexpected"),rev())
        with self.assertRaisesRegex(m.Stop,"two-instance"):m.verify_before(svc(),rev("100"))
        with self.assertRaisesRegex(m.Stop,"identity"):m.verify_before(svc(),rev(image=""))
    @mock.patch.object(m,"public_health",return_value=True)
    def test_refuse_app_image_change(self,health):
        baseline=m.verify_before(svc(),rev())
        newer=rev("100",image="sha256:different")
        with mock.patch.object(m,"revision",return_value=newer):
            with self.assertRaisesRegex(m.Stop,"image"):m.validate_new(svc(),NAME+"-next",baseline)
    def test_no_source_rebuild_or_payment_actions(self):
        source=f.read_text()
        self.assertIn("--no-traffic",source)
        self.assertIn("--max-instances=default",source)
        self.assertIn("--to-revisions=",source)
        self.assertNotIn("gcloud run deploy",source)
        self.assertNotIn("--source=",source)
        self.assertNotIn("STRIPE_SECRET_KEY=sk_",source)
        future=(f.parent/"deploy-existing-paid-source.py").read_text()
        self.assertIn("--max-instances=default",future)
        self.assertNotIn("--max-instances=2",future)
if __name__=="__main__":unittest.main()
