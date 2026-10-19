'use strict';
// Local-only static and mocked checks. Runs in backend CI; does NOT call Google,
// Render, Stripe or Cloud Scheduler and cannot move real customers or money.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/cloud-run-paid-production.yml'), 'utf8');
const code = fs.readFileSync(path.join(root,'infra/cloud-run/activate-paid-production.py'), 'utf8');

assert.match(server, /process\.env\.K_SERVICE === 'american-rider-api-production'/);
assert.match(server, /AR_CLOUDRUN_CUTOVER_ACTIVE/);
assert.match(server, /pk_live_/);
assert.match(server, /!\/\^pk_live_\/\.test\(readKey\('STRIPE_PUBLISHABLE_KEY'\)\)/);
assert.match(server, /process\.env\.AR_RELEASE_COMMIT \|\| process\.env\.RENDER_GIT_COMMIT/);
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/ACTIVATE_PAID_CLOUDRUN/);
assert.match(workflow,/environment: american-rider-commercial-live/);
assert.match(workflow,/service_account: ar-production-deployer@american-rider-35688/);
assert.doesNotMatch(workflow,/on:\s*\n\s*push:/);
assert.match(code,/PROJECT = "american-rider-35688"/);
assert.match(code,/SERVICE = "american-rider-api-production"/);
assert.match(code,/STRIPE_SECRET = "ar-render-import-stripe-secret-key"/);
assert.match(code,/SCREENING_EVIDENCE_WORKFLOW_VERIFIED/);
assert.match(code,/Google scheduler state unreadable/);
assert.match(code,/--no-invoker-iam-check/);
assert.match(code,/--invoker-iam-check/);
assert.match(code,/--remove-secrets=STRIPE_SECRET_KEY/);
assert.match(code,/--update-secrets=STRIPE_SECRET_KEY=/);
assert.match(code,/AR_CLOUDRUN_CUTOVER_ACTIVE=1/);
assert.doesNotMatch(code,/scheduler.*jobs.*resume|webhook_endpoints\/.*:id|onrender\.com\/stripe\/webhook/,
  'private activation must not alter external Stripe, Render or dispatch authority');
const test = spawnSync('python3', ['-m','unittest','discover','-s',
    path.join(root,'infra/cloud-run'),'-p','test_activate_paid_production.py'],
    {encoding:'utf8', timeout:30000});
assert.equal(test.status,0,'mocked private paid-activation tests: '+test.stderr.slice(-4000));
const dispatchWorkflow = fs.readFileSync(path.join(root,'.github/workflows/cloud-run-enable-paid-dispatch.yml'),'utf8');
const dispatchScript = fs.readFileSync(path.join(root,'infra/cloud-run/enable-live-google-scheduler.py'),'utf8');
assert.match(dispatchWorkflow,/RENDER_DISABLED_STRIPE_GOOGLE_ENABLE_DISPATCH/);
assert.match(dispatchWorkflow,/workflow_dispatch:/);
assert.doesNotMatch(dispatchWorkflow,/on:\s*\n\s*push:/);
assert.match(dispatchScript,/--schedule=\* \* \* \* \*/);
assert.match(dispatchScript,/scheduler", "jobs", "resume"/);
assert.match(dispatchScript,/Google Scheduler destination/);
const dispatchTests = spawnSync('python3', ['-m','unittest','discover','-s',
    path.join(root,'infra/cloud-run'),'-p','test_enable_live_google_scheduler.py'],
    {encoding:'utf8',timeout:30000});
assert.equal(dispatchTests.status,0,'single-authority scheduler mocked tests: '+dispatchTests.stderr.slice(-4000));
console.log('PASS: live Cloud Run Stripe configuration is exact, founder-approved, provider-screening gated, and reversible.');
