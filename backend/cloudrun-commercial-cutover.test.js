'use strict';
// Every backend npm test pass includes this OFFLINE pre-cutover safeguard.
// No Google API, Render, Stripe, real key, scheduled dispatch or network call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert.match(gitignore, /^__pycache__\/$/m,
  'Python Cloud Shell bytecode must be ignored before the clean release guard');
assert.match(gitignore, /^\*\.py\[cod\]$/m,
  'Python interpreter bytecode must not block Cloud Run commissioning');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const prepPath = path.join(root, 'infra/cloud-run/prepare-commercial-cutover.py');
const prep = fs.readFileSync(prepPath, 'utf8');
assert.match(server,/process\.env\.K_SERVICE === 'american-rider-api-production'/,
  'final production Cloud Run service has an independent safety guard');
assert.match(server,/AR_CLOUDRUN_CUTOVER_ACTIVE/,
  'real-money activation requires explicit cutover authorization');
assert.match(server,/realMoneyPosture !== cutoverActive/,
  'no live Stripe key without explicit cutover, no half-enabled cutover');
assert.match(server,/!readKey\('STRIPE_CONNECT_WEBHOOK_SECRET'\)/,
  'real-money activation requires Connect webhook signature');
assert.match(server,/!readKey\('STRIPE_WEBHOOK_SECRET'\)/,
  'real-money activation requires account webhook signature');
assert.match(server,/Cloud Run production scheduler is not active/,
  'prepared production service must not dispatch scheduled Travels');
assert.match(prep,/WEBHOOKS = \(/);
assert.match(prep,/STRIPE_CONNECT_WEBHOOK_SECRET/);
assert.match(prep,/RESEND_WEBHOOK_SECRET/);
assert.match(prep,/SCHEDULER_JOB = "ar-production-minute-sweeps"/);
assert.match(prep,/--no-allow-unauthenticated/);
assert.match(prep,/--update-secrets=/);
assert.doesNotMatch(prep,/gcloud run services update-traffic|--allow-unauthenticated(?=\s|")/,
  'no customers or public access during preparation');
const tests=spawnSync('python3',['-m','unittest','discover',
  '-s',path.join(root,'infra/cloud-run'),'-p','test_prepare_commercial_cutover.py'],{
    encoding:'utf8',timeout:30000
});
assert.equal(tests.status,0,'Offline cutover safety suite: '+tests.stderr.slice(-3000));
console.log('PASS: guarded commercial money switch, signed-webhook continuity, paused scheduler and private Google backend.');
