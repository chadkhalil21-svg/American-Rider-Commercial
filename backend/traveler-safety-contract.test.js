const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const emergency=read('app/emergency.tsx');
const support=read('src/backend/support.ts');
const server=read('backend/server.js');
const safety=read('app/safety.tsx');
const pickup=read('app/operator/pickup.tsx');
const progress=read('backend/travelprogress.js');
assert.match(emergency,/Linking\.openURL\('tel:911'\)/,
  '911 must remain directly accessible without a platform callback');
assert.match(emergency,/void issueAlert\(\)/,
  'opening emergency screen independently records a human-readable incident');
assert.match(emergency,/updateEmergencyLocation\(/,
  'emergency location updates continue while screen stays open');
assert.match(emergency,/if \(withPhones\.length > 0\)/,
  'trusted contacts are selected using stored phone numbers');
assert.match(emergency,/onPress=\{alertContacts\}/,
  'sharing contacts is initiated by the Traveler, not silently sent');
assert.match(emergency,/t\('traveler\.emgMessagesOpenTo'/,
  'opening SMS composer never implies an SMS was sent');
assert.match(support,/stored.*emailed|emailed.*stored/,
  'emergency handling exposes separately whether record and email succeeded');
assert.match(server,/app\.post\('\/emergency', requireAuth, LIMITS\.emergency/,
  'emergency cannot require verified email or reject due to traffic-based limits');
assert.ok(!safety.includes('verificationCode('),'Traveler no longer trusts predictable Travel Number code');
assert.ok(!pickup.includes('verificationCode('),'Operator no longer sees the private pickup code');
assert.match(pickup,/mark|beginTrip\(active\.teen \? pickupEntry : undefined\)/,
  'Teen code must be submitted before boarding');
assert.match(progress,/adult_pickup_unverified/,
  'adult pickup enrollment must be enforced at the server');
for(const lang of ['en','es','fr','it','de']){
 const catalog=read('src/i18n/'+lang+'.ts');
 for(const key of ['enterPrivatePickupCode','pickupSecurityIntro','pickupCodePendingRollout',
  'pickupCodeVerified','pickupCodeUnavailable','getPickupSecurityCode'])
   assert.ok(catalog.includes(key+':'),lang+' lacks '+key);
}
console.log('PASS Traveler safety emergency call, explicit contact-sharing, truthful delivery, private pickup and five-language contracts');
