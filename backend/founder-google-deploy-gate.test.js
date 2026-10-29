'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../infra/cloud-run/deploy-existing-paid-source.py'),'utf8');
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/cloud-run-update-paid-source.yml'),'utf8');
for(const text of [
 'FOUNDER_GOOGLE_OPS_CONFIRM',
 'ENABLE_GOOGLE_FOUNDER_OPERATIONS',
 'One exact Founder Firebase UID is required',
 'Founder must match an existing named Operations account',
 'OPS_SESSION_SECRET',
 'OPS_MFA_SECRETS',
 'AR_FOUNDER_GOOGLE_OPS_ENABLED=1',
 'AR_FOUNDER_FIREBASE_UIDS',
 'old traffic untouched',
])assert.ok(script.includes(text),'required safe Founder activation condition missing: '+text);
assert.match(script,/now_env\.get\("AR_FOUNDER_GOOGLE_OPS_ENABLED"/);
assert.match(script,/now_env\.get\("AR_FOUNDER_FIREBASE_UIDS"/);
assert.match(script,/not set\(old_env\)\.issubset\(set\(now_env\)\)/);
assert.match(script,/wait_for_created_ready_revision\(old_revision\)/);
assert.match(script,/ROLLBACK: restored the last verified 100% traffic revision/);
for(const text of [
 'workflow_dispatch:',"default: 'NO'",
 'ENABLE_GOOGLE_FOUNDER_OPERATIONS','FOUNDER_GOOGLE_OPS_CONFIRM:','github.ref ==',
 'DEPLOY_AND_ACTIVATE_PAID_RECRUITERS','DEPLOY_EXISTING_PAID_CODE_ONLY',
])assert.ok(workflow.includes(text),'expected manual-owner workflow safeguard missing: '+text);
assert.doesNotMatch(workflow,/^  push:/m,'never trigger this paid production update automatically');
console.log('PASS manual Founder Google Operations production gating, exact UID, no traffic promotion without verification and rollback');
