'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'app/reserve.tsx'),'utf8');
assert.match(ui,/const partyReady = travelPartyReady\(ride\.travelParty\);/,
 'real confirmation button must use readiness covering Family Teen Travel');
assert.match(ui,/payConfig\.canTakePayment && partyReady && authoritativePriceReady/,
 'party readiness may not bypass actual payment and server quote requirements');
assert.match(ui,/ride\.setTravelParty\(\{mode:'teen',travelerName:.*familyLinkId:f\.id\}\)/,
 'Teen selection must carry the actual guardian-authorized Family relationship id');
for(let run=1;run<=2;run++){
 const snippet=`
import assert from 'node:assert/strict';
import {travelPartyReady} from './src/travelPartyReadiness.ts';
const valid=[
  {mode:'self',travelerName:''},
  {mode:'other_adult',travelerName:'Passenger One'},
  {mode:'teen',travelerName:'Teen One',familyLinkId:'family-linked-001'},
];
const invalid=[
  {mode:'other_adult',travelerName:''},
  {mode:'other_adult',travelerName:'   '},
  {mode:'teen',travelerName:'Teen One'},
  {mode:'teen',travelerName:'Teen One',familyLinkId:''},
  {mode:'teen',travelerName:'Teen One',familyLinkId:'    '},
  {mode:'teen',travelerName:'' ,familyLinkId:'family-linked-001'},
  {mode:'invalid',travelerName:'Anyone',familyLinkId:'family-linked-001'},
];
for(const item of valid) assert.equal(travelPartyReady(item),true,JSON.stringify(item));
for(const item of invalid) assert.equal(travelPartyReady(item),false,JSON.stringify(item));
`;
 execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','--eval',snippet],
  {cwd:root,encoding:'utf8',stdio:'pipe'});
}
console.log('PASS twice: Travel Confirmation accepts an authorized Teen without weakening server-side Family or payment checks');
