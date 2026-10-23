'use strict';
// A diagnostic contract, not a simulated production launch. Reports actual
// absent/present steps from source and forbids accidental recruiter activation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const approval=require('./recruiter-approval');
const ach=require('./recruiter-ach-batch');
const accrual=require('./referral-accrual');
const referral=require('./referral-service');
const read=filename=>fs.readFileSync(path.join(__dirname,filename),'utf8');
const server=read('server.js');
const mcp=read('chatgpt-mcp.js');
const app=JSON.parse(fs.readFileSync(path.join(__dirname,'../app.json'),'utf8'));
const records=[];
const stage=(name,built,needed)=>records.push({name,status:built?'source_present':'unbuilt_or_unwired',needed});
stage('Founder ChatGPT recruiter invitation',/\bname:\s*['"]invite_recruiter['"]/.test(mcp),
  'OAuth/MFA protected Founder-only action with audited consent and durable invitation');
stage('Invited email single-use activation',/app\.post\(['"]\/recruiter\/(?:invite|activate)/.test(server),
  'Bound recipient identity, expiring single-use token, verified email and acceptance');
stage('Recruiter protected session',/app\.get\(['"]\/recruiter\/(?:dashboard|me)/.test(server),
  'Authorized private session and per-recruiter data access');
stage('Recruiter personal link',typeof approval.approvedRecruiterLink==='function',
  'Helper exists but is unmounted and default OFF');
stage('Safe noncommercial /join holding page',/app\.get\(['"]\/join['"]/.test(server),
  'Informational, no-store, not a referral installation or claim');
stage('Real signed-app /join handoff',false,
  'App Store/Play Store targets, install/resume, session and verified attribution');
stage('Installed iOS App Links',Array.isArray(app.expo.ios.associatedDomains)&&
  app.expo.ios.associatedDomains.some(x=>x.includes('americanrider.app')),
  'AASA hosted at actual domain and physical installed-device verification');
stage('Installed Android App Links',Array.isArray(app.expo.android.intentFilters)&&
  app.expo.android.intentFilters.length>0,
  'assetlinks.json plus signed-app test');
stage('Recruiter QR and real earnings',/app\.get\(['"]\/recruiter\/(?:stats|earnings)/.test(server),
  'Scoped verified balances, code/QR and refresh without polling every Travel');
stage('Automatic bank ACH execution',/app\.post\(['"]\/recruiter\/(?:ach|payout)/.test(server),
  'Approved bank provider, funded ledger, hold/return and crash-safe idempotent batches');
assert.equal(approval.PROGRAM_ENABLED,false,'recruiter financial launch must stay disabled');
assert.equal(accrual.PROGRAM.enabled,false,'no real commission accrual until commissioned');
assert.equal(ach.planRecruiterAchBatch({}).reason,'program_off');
assert.equal(typeof referral.claim,'function');
assert.ok(!/recruiter_approvals/.test(read('referral-service.js')),
  'Update the audit if claimant-time revoked-recruiter validation is implemented');
assert.ok(server.includes("app.get('/join'"),
  'The paused join landing must exist to avoid broken links');
const baseline=new Set([
  'Founder ChatGPT recruiter invitation','Invited email single-use activation',
  'Recruiter protected session','Real signed-app /join handoff',
  'Installed iOS App Links','Installed Android App Links',
  'Recruiter QR and real earnings','Automatic bank ACH execution'
]);
for(const row of records){
  if(baseline.has(row.name))assert.equal(row.status,'unbuilt_or_unwired',
    'Update recruiter launch audit and legal/financial gate before declaring feature built: '+row.name);
}
const min=ach.DEFAULT_MINIMUM_CENTS;const perTravel=accrual.PROGRAM.perTravelCents;
const needed=Math.ceil(min/perTravel);
assert.equal(min,2500);
assert.equal(perTravel,15);
assert.equal(needed,167);
console.log('RECRUITER REALITY AUDIT (no money, no emails, no live signup)');
for(const item of records)console.log(item.status+': '+item.name+'; '+item.needed);
console.log('WARNING: old 15c x 200 cap = $30; proposed $25 minimum needs '+needed+' Travels before first bank payout.');
console.log('PASS: no accidental launch; missing links, actions, wallet rails and handoffs named.');
