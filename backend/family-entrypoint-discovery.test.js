'use strict';
// Family invitation discoverability without deploying or inviting a real Teen.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
for(let pass=0;pass<2;pass++){
 const home=file('app/index.tsx'),menu=file('app/account.tsx'),family=file('app/family.tsx');
 assert.match(home,/label: t\('traveler\.familyTitle'\), onPress: \(\) => go\('\/family'\)/,
  'Home Travel drawer needs a Family and Teen path');
 assert.match(menu,/title: t\('traveler\.familyTitle'\), onPress: \(\) => router\.navigate\('\/family'\)/,
  'Account menu must match Home Family/Teen entry');
 assert.match(family,/createFamilyInvite\(/,'Guardian must have a create invitation action');
 assert.match(family,/acceptFamilyInvite\(/,'Teen must have verified invitation acceptance action');
 assert.match(family,/onPress=\{acceptInvitation\}/,'Teen must deliberately accept');
 assert(!family.includes('setAcceptAttempt('),'Opening an invitation must not auto-accept it');
 for(const lang of ['en','es','fr','de','it'])assert(/familyInvitePrompt:/.test(file('src/i18n/'+lang+'.ts')) && /familyAcceptInvitation:/.test(file('src/i18n/'+lang+'.ts')));
 const server=file('backend/server.js');
 assert(server.includes("app.post('/family/invite', requireAuth, requireVerifiedEmail"),
  'Only verified guardian accounts may invite');
 assert(server.includes('&token=') && server.includes('encodeURIComponent(out.inviteToken)'),
  'Invitation must contain a bound deep-link token');
 assert.match(file('app.json'),/"scheme": "americanrider"/);
 for(const lang of ['en','es','fr','de','it'])
  assert(/familyTitle:\s*['"]/.test(file('src/i18n/'+lang+'.ts')),
    'Translated Family heading missing: '+lang);
}
console.log('PASS twice: discoverable Family authorization from Home and Account, no live invites or writes');
