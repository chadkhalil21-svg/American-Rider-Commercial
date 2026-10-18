'use strict';
// Family/Teen menu discoverability guard. No real invitations or messages sent.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
for(let pass=0;pass<2;pass++){
 const home=read('app/index.tsx');
 const account=read('app/account.tsx');
 const family=read('app/family.tsx');
 const server=read('backend/server.js');
 const policy=read('backend/family.js');
 const config=JSON.parse(read('app.json'));
 assert.match(home,/label: t\('traveler\.familyTitle'\), onPress: \(\) => go\('\/family'\)/,'Home navigation must expose Family');
 assert.match(account,/title: t\('traveler\.familyTitle'\), onPress: \(\) => router\.navigate\('\/family'\)/,'Account navigation must expose Family');
 assert.match(family,/createFamilyInvite\(/,'guardian must be able to invite');
 assert.match(family,/acceptFamilyInvite\(/,'Teen must be able to accept');
 assert.match(family,/revokeFamilyLink\(/,'guardian must be able to revoke');
 assert.match(server,/app\.post\('\/family\/invite', requireAuth, requireVerifiedEmail/,'invitation must require verified sign-in');
 assert.match(server,/app\.post\('\/family\/invite\/:id\/accept', requireAuth, requireVerifiedEmail/,'acceptance must require verified sign-in');
 assert.match(policy,/MIN_AGE=13, MAX_AGE=17/,'age policy remains server-authoritative');
 assert.equal(config.expo.scheme,'americanrider','native deep-link scheme must match Family invitation');
}
console.log('PASS twice: Family/Teen menu entries lead to verified-email invitation and acceptance; no deliveries');
