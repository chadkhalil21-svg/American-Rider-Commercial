'use strict';
// Offline-only security checks for the private, no-money production PROJECT
// candidate. Never call GCP, Stripe, Firebase or external services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const shellPath = path.join(root, 'infra/cloud-run/commission-production-private.sh');
const workflowPath = path.join(root, '.github/workflows/cloud-run-production-candidate.yml');
const shell = fs.readFileSync(shellPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const sweepMode = fs.readFileSync(path.join(__dirname, 'cloudrun-sweep-mode.js'), 'utf8');
const syntax = spawnSync('bash',['-n',shellPath],{encoding:'utf8'});
assert.equal(syntax.status,0,'valid bash syntax: '+syntax.stderr);
for (const source of [shell, workflow]) {
  assert.match(source,/american-rider-35688/,'production Google project explicit');
  assert.match(source,/american-rider-api-production-candidate/,'distinct nonlive Cloud Run service');
  assert.match(source,/DEPLOYMENT_MODE=test/,'candidate must not use production mode');
  assert.match(source,/AR_EXTERNAL_SCHEDULER=1/,'no in-process timer on Cloud Run');
  assert.match(source,/AR_PRIVATE_CANDIDATE_NO_SCHEDULER=1/,'explicit no-scheduler scope');
  assert.match(source,/--no-allow-unauthenticated/,'private IAM-only service');
  assert.match(source,/ar-production-runtime@/,'dedicated runtime identity');
  assert.doesNotMatch(source,/--allow-unauthenticated(?=\s|$)/m,'no public Cloud Run invocation');
  assert.doesNotMatch(source,/STRIPE_SECRET_KEY\s*[:=]/,'no money keys');
  assert.doesNotMatch(source,/STRIPE_WEBHOOK_SECRET\s*[:=]/,'no webhooks');
  assert.doesNotMatch(source,/--set-secrets/,'no candidate secret dependency');
}
assert.doesNotMatch(shell,/gcloud secrets (describe|create|versions|add-iam-policy-binding)/,
  'private candidate does not need Secret Manager API');
assert.doesNotMatch(workflow,/^\s+secrets:\s*\|/m,'workflow does not bind secrets');
assert.match(shell,/gcloud run services list/,'check for existing candidate');
assert.match(shell,/if grep -Fxq "\$SERVICE"/,'avoid repeat deployments');
assert.match(shell,/\$URL\/live/,'test nonreserved health path');
assert.doesNotMatch(shell,/gcloud scheduler jobs create|gcloud scheduler jobs update|gcloud run services add-iam-policy-binding/,
  'no scheduled work or public invoker rights');
assert.match(workflow,/workflow_dispatch:/,'explicit manual workflow only');
assert.match(workflow,/inputs\.confirm == 'PRIVATE_ONLY'/,'confirmed candidate refresh');
assert.match(workflow,/github\.ref == 'refs\/heads\/release\/current'/,'immutable release branch constraint');
assert.doesNotMatch(workflow,/^  push:/m,'no automatic production deployment');
assert.match(sweepMode,/env.K_SERVICE === 'american-rider-api-production-candidate'/,
  'scheduler exception only for the exact private candidate');
assert.match(sweepMode,/!String\(env.STRIPE_SECRET_KEY/,
  'no scheduler exception with any Stripe key');
console.log('PASS: private candidate needs no Secret Manager or scheduler; live payment and dispatch unchanged.');
