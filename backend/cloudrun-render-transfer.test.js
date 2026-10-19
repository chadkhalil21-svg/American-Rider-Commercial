'use strict';
// Offline guard: no provider/Google API calls, no real credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'infra/cloud-run/stage-render-secrets.py'), 'utf8');
assert.match(script, /SERVICE_ID = "srv-daq8vlou01pc73f9qho0"/, 'exact active Render API service');
assert.match(script, /PROJECT = "american-rider-35688"/, 'correct Google production project');
assert.match(script, /getpass\.getpass/, 'Render token must not appear in shell command line');
assert.match(script, /EXPECTED_REPO/, 'check the source is American Rider Commercial');
assert.match(script, /secretmanager\.googleapis\.com/, 'writes only to Google Secret Manager');
assert.match(script, /if exc\.status != 404:/, 'creation only on confirmed secret absence');
assert.match(script, /if any\(version\.get\("state"\) == "ENABLED"/, 'never overwrite enabled versions');
assert.match(script, /"FIREBASE_SERVICE_ACCOUNT"/, 'do not copy Firebase private key');
assert.match(script, /"SCHEDULER_TOKEN"/, 'never reuse Render minute-sweep token');
assert.match(script, /"STRIPE_WEBHOOK_SECRET"/, 'do not reuse endpoint-bound Stripe signing secret');
assert.match(script, /"STRIPE_CONNECT_WEBHOOK_SECRET"/, 'do not reuse Connect webhook signing secret');
assert.match(script, /name\.endswith\("_WEBHOOK_SECRET"\)/, 'exclude other endpoint-specific webhook secrets');
assert.match(script, /input\("Type STAGE /, 'require interactive authorization for billing-affecting copies');
assert.doesNotMatch(script, /gcloud run deploy|gcloud scheduler jobs|stripe\.com\/v1|\/create-payment-intent/, 'no deploy or money action');
const tests = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', path.join(root,'infra/cloud-run'), '-p', 'test_stage_render_secrets.py'], {
  encoding:'utf8', timeout:20000,
});
assert.equal(tests.status,0,'Python offline import tests failed: '+tests.stderr.slice(-2500));
console.log('PASS: Render provider values remain in user Cloud Shell, stage only in Secret Manager, production traffic untouched.');
