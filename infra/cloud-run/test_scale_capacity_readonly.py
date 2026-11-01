import importlib.util
import pathlib
import unittest
from unittest.mock import patch

SRC=pathlib.Path(__file__).with_name("scale-capacity-readonly.py")
s=importlib.util.spec_from_file_location("cloud_capacity",SRC)
m=importlib.util.module_from_spec(s)
s.loader.exec_module(m)
REV=m.SERVICE+"-00040-lcf"

def service(service_cap=None,rev=REV):
    ann={}
    if service_cap is not None:
        ann["run.googleapis.com/maxScale"]=str(service_cap)
    return {"metadata":{"annotations":ann},"status":{"traffic":[{"percent":100,"revisionName":rev}]}}

def revision(rev_cap=2,conc=20,rev=REV):
    ann={}
    if rev_cap is not None:
        ann["autoscaling.knative.dev/maxScale"]=str(rev_cap)
    return {"metadata":{"name":rev,"annotations":ann},
        "spec":{"containerConcurrency":conc,
                "containers":[{"resources":{"limits":{"cpu":"1","memory":"1Gi"}}}]}}

class CapacityTests(unittest.TestCase):
    def test_actual_revision_limit_not_service_guess(self):
        d=m.describe_capacity(service(),revision())
        self.assertEqual(d["effective_configured_instances"],2)
        self.assertEqual(d["configured_in_flight_request_ceiling"],40)
        self.assertFalse(d["quota_verified"])
    def test_service_limit_wins(self):
        d=m.describe_capacity(service(10),revision(100,80))
        self.assertEqual(d["effective_configured_instances"],10)
        self.assertEqual(d["configured_in_flight_request_ceiling"],800)
    def test_revision_limit_wins(self):
        d=m.describe_capacity(service(100),revision(20,20))
        self.assertEqual(d["effective_configured_instances"],20)
    def test_absent_revision_max_is_not_unlimited(self):
        d=m.describe_capacity(service(),revision(None,80))
        self.assertEqual(d["revision_max"],100)
        self.assertFalse(d["revision_max_explicit"])
    def test_never_certify_ambiguous_or_missing_live(self):
        self.assertFalse(m.describe_capacity(None,None)["verified"])
        self.assertFalse(m.describe_capacity(service(),revision(rev="other"))["verified"])
        s=service()
        s["status"]["traffic"].append({"percent":100,"revisionName":"other"})
        self.assertFalse(m.describe_capacity(s,revision())["verified"])
    def test_never_print_secrets_or_change_production(self):
        x=SRC.read_text()
        self.assertNotIn("run services update",x)
        self.assertNotIn("gcloud run deploy",x)
        self.assertIn("capture_output=True",x)

if __name__=="__main__":
    unittest.main()
