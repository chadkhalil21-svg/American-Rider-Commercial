'use strict';
// First-party Operator invitations carry a disclosure only when the same
// authenticated server says the Operator's Recruiter program can pay.
// No provider calls, database mutations, and no additional client request.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const server=read('backend/server.js');
const share=read('backend/referral-service.js');
const client=read('src/backend/referrals.ts');
const op=read('app/operator/invite.tsx');
const ui=read('app/recruitment/index.tsx');
assert.match(server,/paidRecruiterProgramEnabled:recruiterRewardsEnabled\(\)/);
assert.match(share,/compensationActive=paidRecruiterProgramEnabled===true/);
assert.match(share,/recruiterMayRefer\(account\.data\(\),approval\.data\(\),role,now\)/);
assert.match(share,/return \{ok:true,url:formatLink\(code\.code,role,origin\),/);
assert.match(client,/personalInvitationDetails\(role:InviteRole\)/);
assert.match(client,/compensationActive:out\?\.data\?\.compensationActive===true/);
assert.match(client,/return \(await personalInvitationDetails\(role\)\)\?\.url\?\?null/);
assert.match(op,/personalInvitationDetails\(role\)/);
assert.match(op,/invitation\.compensationActive/);
assert.match(op,/t\('recruiter\.shareDisclosure'\)/);
assert.match(op,/router\.navigate\('\/recruitment'\)/);
assert.match(ui,/t\('recruiter\.shareDisclosure'\)/);
// No second sign-in or new backend payment/auth provider is introduced.
assert.doesNotMatch(op,/Stripe|payouts\.create|auth\.createUser/);
console.log('PASS: Operator unpaid invite preserved; paid Recruiter sharing verified and disclosed');
