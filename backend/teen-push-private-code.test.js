'use strict';
// Lock-screen safety: an Expo push is not a secure pickup-code channel.
// The actual code is retrieved only from authenticated, live Travel endpoints.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
const server = read('server.js');
const scheduler = read('scheduler.js');
const privateEndpoint = server.slice(server.indexOf("app.get('/travel/teen-pickup/code'"),
  server.indexOf("app.post('/travel/teen-pickup/verify'"));
assert(privateEndpoint.includes('requireAuth') &&
       privateEndpoint.includes('requireFreshAuth') &&
       privateEndpoint.includes('party.guardianUid') &&
       privateEndpoint.includes('party.teenUid'),
  'Teen pickup code must be obtainable only by authenticated Teen or guardian');
assert.match(privateEndpoint, /pinForRide\(id,ride\.teenPickup\.hash\)/,
  'private code remains available from authenticated Travel');
const snippets = [
  server.slice(server.indexOf("kind: 'teen_pickup_code'")-160,
    server.indexOf("kind: 'teen_pickup_code'")+440),
  scheduler.slice(scheduler.indexOf("kind: 'teen_pickup_code'")-100,
    scheduler.indexOf("kind: 'teen_pickup_code'")+440),
];
for (const [i, snippet] of snippets.entries()) {
  assert.match(snippet, /private pickup code is available inside American Rider/,
    'notification '+i+' should direct the user to the private code');
  assert.doesNotMatch(snippet, /body\s*:\s*`[^;]*\$\{[^}]*\.pin\}/s,
    'notification '+i+' must not interpolate the pickup PIN');
  assert.match(snippet, /screen:\s*'\/teen-pickup'/,
    'notification '+i+' must open the authenticated Teen code screen');
}
const root = read('../src/boot/FullRoot.tsx');
const codeScreen = read('../app/teen-pickup.tsx');
assert(root.includes("recipientUid !== user.uid") &&
  root.includes("screen === '/teen-pickup'") &&
  root.includes("router.navigate({ pathname: '/teen-pickup', params: { rideId } }"),
  'Teen push must open only an allowlisted route after the same account binding');
assert(codeScreen.includes('fetchTeenPickupCode(rideId)') &&
  codeScreen.includes('currentRideId.current === rideId') &&
  !codeScreen.includes('params.pin'),
  'private code is fetched server-side and stale requests cannot expose prior Travel');
assert(read('../src/backend/family.ts').includes('export async function fetchTeenPickupCode(rideId:string)'),
  're-use existing authenticated, protected Teen code endpoint');
console.log('PASS: private Teen PIN stays off notifications; matched recipient routes to authenticated, stale-safe code retrieval');
