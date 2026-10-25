'use strict';
// Source-level safety contract for the national independent recruiter foundation.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('backend/server.js');
const portal=read('backend/recruiter-portal.js');
const approval=read('backend/recruiter-approval.js');
const policy=read('backend/referral-policy.js');
const app=JSON.parse(read('app.json')).expo;
const workspace=read('app/recruitment/index.tsx');
const accept=read('app/recruitment/accept.tsx');
const operatorQualify=read('app/operator/qualify.tsx');
const config=read('src/config.ts');

assert.match(server,/AR_RECRUITER_INVITES_ENABLED/);
assert.match(server,/AR_RECRUITER_WEB_ACCEPTANCE_VERIFIED/);
assert.match(server,/AR_RECRUITER_FOUNDER_USERS/);
assert.match(server,/requireRecruiterFounder/);
assert.match(server,/opsAuthMode\(\)!=='named'/);
assert.match(server,/app\.post\('\/ops\/recruiters\/invite',requireOps,requireRecruiterFounder/);
// Disabling invitations must not stop a Founder from rejecting or suspending a recruiter.
assert.match(server,/app\.post\('\/ops\/recruiters\/:uid\/review',requireOps,requireRecruiterFounder,\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*requireOpsMutation,recruiterInviteLimit,async\(req,res\)=>\{/);
assert.match(server,/window\.confirm\("Confirm "\+b\.dataset\.action/);
assert.match(server,/app\.post\('\/ops\/recruiters\/find',requireOps,requireRecruiterFounder,\s*requireOpsMutation,recruiterInviteLimit/);
assert.match(server,/\.where\('verifiedEmail','==',email\)\.limit\(1\)/);
assert.match(server,/id="recruiter-find"/);
assert.match(server,/d\.status==="approved"\|\|d\.status==="pending_review"/);

assert.match(server,/out\.reason==='account_inactive'\?403/);
assert.match(server,/requireOpsMutation,recruiterInviteLimit,requireRecruiterInviteLaunch/);
assert.match(server,/app\.post\('\/recruiters\/accept',requireRecruiterInviteLaunch,requireAuth/);
assert.match(server,/requireFreshAuth,requireVerifiedEmail,recruiterLimit/);
assert.match(server,/app\.get\('\/recruiters\/me',requireAuth,requireVerifiedEmail,recruiterLimit/);
assert.match(server,/AR_RECRUITER_WEB_REFERRAL_VERIFIED/);
assert.match(read('infra/cloud-run/deploy-existing-paid-source.py'),/AR_APP_LINKS_VERIFIED/);
assert.doesNotMatch(server,/AR_RECRUITER_LEGAL_SIGNOFF/);
assert.match(server,/AR_RECRUITER_PROGRAM_ENABLED/);
assert.match(server,/AR_REFERRALS_ENABLED/);
assert.match(server,/recruiterPortal\.recruiterSummary\(\{/);
assert.match(server,/uid:String\(req\.uid\),verifiedEmail:req\.email/);
assert.match(server,/programEnabled,linkVerified:readKey\('AR_RECRUITER_WEB_REFERRAL_VERIFIED'\)/);

assert.match(portal,/crypto\.randomBytes\(32\)/);
assert.match(portal,/createHash\('sha256'\)/);
assert.match(portal,/if\(emailOf\(i\.email\)!==email\)/);
assert.match(portal,/status:'approved'/);
assert.match(portal,/next:'identity_agreement_bank_verification'/);
assert.match(portal,/reason:'account_inactive'/);
assert.match(portal,/payoutEligibilityVerified:false/);
assert.match(portal,/linksAvailable/);
assert.match(portal,/recruiterMayRefer/);
assert.match(portal,/compensation:financialEnabled\?'commissioned':'not_commissioned'/);
assert.match(portal,/wallet/);
assert.match(portal,/bankSetup:financialEnabled\?'provider_verification_required':'not_commissioned'/);
assert.doesNotMatch(portal,/stripe\.transfers\.create|payouts\.create|routingNumber|accountNumber/);

assert.match(approval,/const PROGRAM_ENABLED=false/);
assert.match(approval,/linkVerified!==true/);
assert.match(approval,/origin:'https:\/\/americanrider\.tech'/);
assert.match(policy,/https:\/\/americanrider\.tech/);
assert.match(policy,/https:\/\/americanrider\.app/);
assert.match(workspace,/recruiter\.introductions/);
assert.match(workspace,/recruiter\.compensationNote/);
assert.match(accept,/emailVerified/);
assert.match(accept,/router\.replace\('\/recruitment'\)/);
assert.match(config,/LEGAL_URL = 'https:\/\/americanrider\.tech'/);
// Package identifier is intentionally unchanged and is NOT the web domain.
assert.equal(app.ios.bundleIdentifier,'com.americanrider.app');
assert.equal(app.android.package,'com.americanrider.app');
assert.equal(app.scheme,'americanrider');
assert.match(operatorQualify,/operator\.referralCodeOptional/);
assert.match(operatorQualify,/recordInvitation\(code, 'operator'\)/);
assert.match(operatorQualify,/EXPO_PUBLIC_REFERRALS_ENABLED/);
assert.match(operatorQualify,/areaActive && process\.env/);
assert.match(operatorQualify,/operator\.referralRecorded/);
assert.doesNotMatch(operatorQualify,/referral.*stripe\.transfers\.create/i);
console.log('PASS national recruiter source gates, private owner data, no bank payout, native identity and .tech web migration');
