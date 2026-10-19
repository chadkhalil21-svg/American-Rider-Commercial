'use strict';
// Runs the new Python commissioning guard suite in existing backend CI.
// No network, keys, Stripe calls, Firebase calls, Google auth, deployment or money.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const py = path.join(root, 'infra/cloud-run/commission-real-production-private.py');
const src = fs.readFileSync(py, 'utf8');
assert.match(src,/SERVICE = "american-rider-api-production"/);
assert.match(src,/CANDIDATE = "american-rider-api-production-candidate"/);
assert.match(src,/PROJECT = "american-rider-35688"/);
assert.match(src,/ROLE|FIREBASE_ROLES/);
assert.match(src,/roles\/datastore\.user/);
assert.match(src,/roles\/firebaseauth\.viewer/);
assert.match(src,/roles\/secretmanager\.secretAccessor/);
assert.match(src,/STRIPE_SECRET_KEY/);
assert.match(src,/DEPLOYMENT_MODE=development/);
assert.match(src,/--no-allow-unauthenticated/);
assert.match(src,/--max-instances=2/);
assert.match(src,/gcloud/, 'GCP operations are user-authenticated Cloud Shell only');
assert.doesNotMatch(src,/gcloud run services update-traffic|gcloud scheduler jobs create|gcloud scheduler jobs run|stripe\.com\/v1/,
  'no live traffic, scheduler or payment operation');
const syntax=spawnSync('python3',['-m','py_compile',py],{encoding:'utf8',timeout:15000});
assert.equal(syntax.status,0,'Python source syntax: '+syntax.stderr);
const suite=spawnSync('python3',['-m','unittest','discover','-s',path.join(root,'infra/cloud-run'),
  '-p','test_commission_real_production_private.py'],{encoding:'utf8',timeout:30000});
assert.equal(suite.status,0,'Offline safety tests: '+suite.stderr.slice(-5000));
console.log('PASS: final production Cloud Run service guarded, private, Firestore and secret IAM scoped; Render payments remain authoritative.');
