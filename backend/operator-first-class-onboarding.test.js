'use strict';
// Twice-run offline assurance for clarity: first-class insurance shopping without
// false premiums/insurance approval and without weakening commercial safety gates.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
for(let round=1;round<=2;round++){
 const insurance=read('app/operator/insurance.tsx');
 const qualify=read('app/operator/qualify.tsx');
 const documents=read('app/operator/documents.tsx');
 const vehicle=read('app/operator/vehicle.tsx');
 const background=read('app/operator/background.tsx');
 const review=read('app/operator/review.tsx');
 const server=read('backend/server.js');
 const data=read('src/data.ts');
 assert.match(insurance,/insRequirementsHeadline/,'show requirements without expanding');
 assert.match(insurance,/insFloridaRequirementsShort/,'show basic statutory amounts');
 assert.ok(insurance.indexOf('insRequirementsHeadline') < insurance.indexOf('insCompareHeadline'),
   'state the required coverage before directing a purchase');
 assert.match(insurance,/featured = \['Insureon', 'Limousine Insurance HQ'\]/,
   'multi-company quote entry points remain clearly accessible');
 assert.match(insurance,/const additional = national.filter/,'specialist carriers remain optional');
 assert.match(data,/name: 'Insureon'/);
 assert.match(data,/name: 'Limousine Insurance HQ'/);
 assert.match(insurance,/insCompareDisclosure/,'never promise real-time best prices');
 assert.match(insurance,/insOlderVehicleNote/,'vehicle age is underwritten, not universally forbidden');
 assert.match(insurance,/insOwnBrokerBody/,'allow Operators their own insurer');
 assert.match(insurance,/Share.share\(\{ message: config.script \}\)/,
   'broker wording is shareable without navigating away');
 assert.doesNotMatch(insurance,/referredBroker|BROKER\./,
   'do not privilege an unverified broker or show old contact details');
 assert.match(insurance,/liveStatus\?\.documentApproved === true/,
   'receipt of a PDF does not itself approve insurance');
 assert.match(qualify,/accessibilityRole="button" onPress=\{\(\) => router.navigate\('\/operator\/vehicle'\)\}/,
   'Vehicle details remain one obvious action in the qualification checklist');
 assert.match(qualify,/op.vehicle\?\.car \|\| t\('traveler.noVehicleOnFile'\)/,
   'show existing vehicle details without a false verified badge');
 assert.doesNotMatch(qualify,/d.key === 'basics'/,'no obsolete Basics badge can certify an account');
 assert.match(vehicle,/op.setVehicle\(car, plate\)/,'vehicle form saves real account details');
 assert.doesNotMatch(vehicle,/op.verifyDoc\('basics'\)/,'saving a car does not grant verification');
 assert.match(vehicle,/t\('operator.makeModelColor'\)/,
   'year, make, model, color are requested for quote eligibility');
 assert.match(qualify,/const areaAuthorized = areaActive;/,
   'Operator onboarding begins only after the service area opens');
 assert.match(qualify,/router.navigate\('\/operator\/payouts'\)/,
   'payout setup is accessible in the same application');
 assert.match(documents,/if \(d.key === 'insurance'\) router.navigate\('\/operator\/insurance'\)/,
   'insurance has one consistent guide, not conflicting upload flows');
 assert.match(background,/Linking.openURL\(url\)\.catch/,'broken screening links report an error');
 assert.match(background,/mode: requestMode/,'new and existing reports remain alternatives');
 assert.match(review,/qualificationStatus\(\)/,'approval remains a server decision');
 assert.match(server,/app.post\('\/operator\/qualification\/submit', requireAuth, LIMITS.qualification, requireActiveOperatingMarket/,
   'unopened counties cannot submit an application');
 assert.match(server,/app.post\('\/operator\/document', requireAuth, LIMITS.document, requireFreshAuth, requireActiveOperatingMarket/,
   'costly private documents remain blocked for unopened counties');
}
console.log('PASS twice: uncomplicated insurance comparison and honest Operator onboarding with real market/eligibility boundaries; no live quotes or providers contacted.');
