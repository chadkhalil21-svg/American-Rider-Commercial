'use strict';
// Exact-source, offline safety guard for the manual PRIVATE production-project
// candidate. No credentials, GCP calls, provider API calls or deployments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const shellPath = path.join(root, 'infra/cloud-run/commission-production-private.sh');
const workflowPath = path.join(root, '.github/workflows/cloud-run-production-candidate.yml');
const shell = fs.readFileSync(shellPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const syntax = spawnSync('bash', ['-n', shellPath], { encoding: 'utf8' });
assert.equal(syntax.status, 0, 'shell has valid bash syntax: ' + syntax.stderr);
for (const source of [shell, workflow]) {
  assert.match(source, /american-rider-35688/, 'production project must be explicit');
  assert.match(source, /american-rider-api-production-candidate/, 'cannot overwrite the future live service');
  assert.match(source, /DEPLOYMENT_MODE=test/, 'candidate cannot run in production/live mode');
  assert.match(source, /AR_EXTERNAL_SCHEDULER=1/, 'candidate may not run a second in-process scheduler');
  assert.match(source, /--no-allow-unauthenticated/, 'candidate must be IAM-private');
  assert.match(source, /ar-production-runtime@/, 'candidate must use a dedicated runtime identity');
  assert.match(source, /ar-production-private-candidate-scheduler-token/, 'scheduler token is in Secret Manager');
  assert.doesNotMatch(source, /--allow-unauthenticated(?=\s|$)/m);
  assert.doesNotMatch(source, /STRIPE_SECRET_KEY\s*[:=]/, 'no Stripe credentials');
  assert.doesNotMatch(source, /STRIPE_WEBHOOK_SECRET\s*[:=]/, 'no live webhook');
}
assert.match(shell, /gcloud(?: --quiet)? secrets add-iam-policy-binding/, 'secret access scoped to this identity');
assert.match(shell, /gcloud --quiet secrets describe/, 'bounded Secret Manager existence check is explicit');
assert.match(shell, /timeout --signal=TERM --kill-after=5s 35s/, 'Secret Manager existence check cannot hang indefinitely');
assert.match(shell, /SECRET_CHECK_STATUS.*\$\?/s, 'lookup command status is captured');
assert.match(shell, /NOT_FOUND\|not found\|404/, 'create only when resource is actually not found');
assert.match(shell, /No Cloud Run deployment attempted/, 'timeout and permission errors cannot silently advance to deployment');
assert.match(shell, /timeout --signal=TERM --kill-after=5s 60s/, 'secret permission writes have a bounded runtime');

assert.match(shell, /--role="roles\/secretmanager\.secretAccessor"/);
assert.match(shell, /gcloud run services list/, 'read service inventory before first deploy');
assert.match(shell, /if grep -Fxq "\$SERVICE"/, 'refuse to overwrite an existing candidate');
assert.match(shell, /\$URL\/live/, 'probe nonreserved light health endpoint');
assert.doesNotMatch(shell, /gcloud scheduler jobs create|gcloud scheduler jobs update|gcloud run services add-iam-policy-binding/, 'no active scheduling or new public caller IAM');
assert.match(workflow, /workflow_dispatch:/, 'candidate refresh strictly manual');
assert.match(workflow, /inputs\.confirm == 'PRIVATE_ONLY'/, 'manual confirmation required');
assert.match(workflow, /github\.ref == 'refs\/heads\/release\/current'/, 'deployment only from release/current');
assert.doesNotMatch(workflow, /^  push:/m, 'no automatic production deploy');
console.log('PASS: private production-project candidate guards; Render, live payments, webhooks and scheduler untouched.');
