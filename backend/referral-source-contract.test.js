'use strict';
// Guarded launch contract: normal Traveler sharing stays simple; compensated
// referrals cannot become an accidental production money path.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const traveler=read('app/invite.tsx');
const operator=read('app/operator/invite.tsx');
const drawer=read('src/components/operator.tsx');
const backend=read('backend/server.js');
const attribution=read('backend/referral-service.js');
const accrual=read('backend/referral-accrual.js');
const share=read('src/backend/referrals.ts');
const join=read('app/join.tsx');
const rootApp=read('src/boot/FullRoot.tsx');

for(const key of ['inviteFriends','inviteSub','inviteShareText','sendInvitation'])
  assert.match(traveler,new RegExp("t\\('traveler\\."+key+"'"));
assert.doesNotMatch(traveler,/qr|QR|recruiter earnings|monthly commission/i);
assert.match(operator,/share\('traveler'\)/);
assert.match(operator,/share\('operator'\)/);
assert.match(drawer,/EXPO_PUBLIC_REFERRALS_ENABLED === '1'/);
assert.match(drawer,/\/operator\/invite/);
assert.match(read('src/i18n/en.ts'),/referralInviteTitle/);
assert.match(backend,/REFERRALS_ENABLED=readKey\('AR_REFERRALS_ENABLED'\)==='1'/);
assert.match(backend,/\/referrals\/share/);
assert.match(backend,/\/referrals\/claim/);
assert.match(backend,/\.where\('travelerUid','==',String\(req\.uid\)\)\.limit\(1\)/);
assert.match(attribution,/tx\.create\(claimRef/);
assert.match(attribution,/registered\.data\(\)\?\.ownerUid===uid/);
assert.match(attribution,/rewardEnabled:false/);
assert.match(accrual,/enabled:false,perTravelCents:15,maxTravels:200,maxCents:3000/);
assert.match(accrual,/tx\.update\(item\.claimRef,/);
assert.doesNotMatch(accrual,/stripe\.transfers\.create|stripe\.payouts\.create|stripe\.refunds\.create/);
assert.doesNotMatch(backend,/app\.(?:get|post)\('\/referrals\/(?:pay|transfer|credit)/);
assert.match(share,/EXPO_PUBLIC_REFERRALS_ENABLED !== '1'/);
assert.match(share,/referrals\/share\?role=/);
assert.match(join,/savePendingInvite/);
assert.match(rootApp,/readPendingInvite/);

console.log('PASS referral source contract: Traveler UX, Operator gate, owned links, held-only money');
