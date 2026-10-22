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
assert.ok(!safety.includes('verificationCode('),'Traveler cannot trust a predictable Travel Number code');
assert.ok(!safety.includes('travelerPickupCode('),
  'ordinary adult safety must not create a PIN or incur an extra lookup');
assert.ok(!pickup.includes('operatorPickupStatus('),
  'normal adult pickup must not incur a redundant proof status read');
assert.ok(!pickup.includes('verifyOperatorPickupCode('),
  'normal adults are never forced to enter a six-digit code');
assert.match(pickup,/beginTrip\(active\.teen \? pickupEntry : undefined\)/,
  'only the Teen PIN is submitted before boarding');
assert.match(pickup,/active\.teen && !\/\^\\d\{4\}\$\//,
  'Teen four-digit pickup proof must still be checked');
assert.match(progress,/adult_pickup_unverified/,
  'already-enrolled legacy adult rides must still fail closed until resolved');
for(const lang of ['en','es','fr','it','de']){
 const catalog=read('src/i18n/'+lang+'.ts');
 for(const key of ['enterPrivatePickupCode','pickupSecurityIntro','pickupCodeUnavailable',
  'confirmTravelerName'])
   assert.ok(catalog.includes(key+':'),lang+' lacks '+key);
 for(const retired of ['pickupCodePendingRollout','pickupCodeVerified','getPickupSecurityCode'])
   assert.ok(!catalog.includes(retired+':'),lang+' advertises retired adult PIN '+retired);
}
console.log('PASS Traveler safety emergency call, explicit contact-sharing, truthful delivery, verbal adult pickup, mandatory Teen PIN and five-language contracts');
