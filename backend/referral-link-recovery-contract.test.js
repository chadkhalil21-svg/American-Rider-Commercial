'use strict';
// Source and configuration contract. No network, payouts, Firebase or cloud writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const config=JSON.parse(read('app.json')).expo;
assert.deepEqual(config.ios.associatedDomains,['applinks:americanrider.tech']);
const filter=config.android.intentFilters.find(f=>f.action==='VIEW'&&f.autoVerify===true);
assert.ok(filter,'Android app needs a verified VIEW intent filter');
assert.ok(filter.category.includes('BROWSABLE')&&filter.category.includes('DEFAULT'));
assert.ok(filter.data.some(d=>d.scheme==='https'&&d.host==='americanrider.tech'&&d.pathPrefix==='/join'));
assert.equal(config.ios.bundleIdentifier,'com.americanrider.app','bundle ID must not be changed');
assert.equal(config.android.package,'com.americanrider.app','Android package ID must not be changed');

const join=read('app/join.tsx');
assert.match(join,/params\.role!=='operator'&&params\.role!=='traveler'/,'invalid roles must not be credited');
assert.match(join,/savePendingInvite\(code,role\)/);
assert.match(join,/recordInvitation\(code,role\)/);
const pending=read('src/backend/referralPending.ts');
assert.match(pending,/AGE_MS=72\*60\*60\*1000/);
assert.match(pending,/AsyncStorage/);
const auth=read('src/screens/AuthScreen.tsx');
assert.match(auth,/savePendingInvite\(invitationCode\.trim\(\)\.toUpperCase\(\), role\)/);
assert.match(auth,/t\('auth\.invitationCodeOptional'\)/);
const traveler=read('app/index.tsx');
assert.match(traveler,/useFocusEffect\(useCallback/);
assert.match(traveler,/onboarding \|\| process\.env\.EXPO_PUBLIC_REFERRALS_ENABLED/);
assert.match(traveler,/result !== 'retry'/);
const operator=read('app/operator/qualify.tsx');
assert.match(operator,/savePendingInvite\(code, 'operator'\)/);
assert.match(operator,/useFocusEffect\(React\.useCallback/);
assert.match(operator,/readPendingInvite\(\)/);
assert.match(operator,/if \(result !== 'retry'\) await clearPendingInvite\(\)/);
assert.match(operator,/areaActive && process\.env\.EXPO_PUBLIC_REFERRALS_ENABLED/);
const service=read('backend/referral-service.js');
assert.match(service,/recruiter_accounts/,'revoked recruiters must not keep claiming');
assert.match(service,/referrer_not_eligible/);
assert.match(service,/rewardEnabled:paid/,'only an approved and commissioned Recruiter may earn; ordinary invitations remain unpaid');
const api=read('backend/server.js');
assert.match(api,/AR_RECRUITER_WEB_REFERRAL_VERIFIED/);
assert.match(read('infra/cloud-run/deploy-existing-paid-source.py'),/AR_APP_LINKS_VERIFIED/);
assert.match(api,/origin:'https:\/\/americanrider\.tech'/);
const portal=read('scripts/corporate-recruiter-portal.cjs');
assert.match(portal,/I may receive compensation/,'compensated invitations disclose the relationship');
const builder=read('scripts/build-corporate-website.cjs');
assert.match(builder,/Your introduction to American Rider/);
assert.match(builder,/This invitation page preserves a referral code. It does not accept transportation bookings or payments./,'landing page must not promise an unverified public store install or booking');
assert.match(builder,/role==="operator"/,'landing differentiates referral roles');
const invite=read('app/invite.tsx');
assert.match(invite,/traveler\.sendInvitation/,'the established Traveler Invite surface remains');
for(const lang of ['en','es','fr','it','de']){
  const dict=read('src/i18n/'+lang+'.ts');
  for(const key of ['invitationCodeOptional','invitationCodeInvalid','referralQuestion','referralCodeOptional','referralRecorded','referralFailed'])
    assert.ok(dict.includes(key+':'),lang+' needs '+key);
}
console.log('PASS referral recovery: signed-domain intent config, both roles, reversible failures, five languages, zero reward');
