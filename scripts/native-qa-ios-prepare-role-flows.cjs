'use strict';
// Isolated iOS commercial QA: use independent Traveler and Operator simulators.
// Every offer, boarding and completion step still acts on the real native UI.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.maestro/generated');
const original=fs.readFileSync(path.join(dir,'qa-commercial-operator.yml'),'utf8');
const header=original.slice(0,original.indexOf('- launchApp:'));
assert.ok(header.includes('appId: com.americanrider.app')&&header.includes('---'));
const accept='- extendedWaitUntil:\n    visible:\n      id: "operator-accept-traveler"';
const tap='- tapOn:\n    id: "operator-accept-traveler"';
const finish='- extendedWaitUntil:\n    visible:\n      id: "operator-complete-operation"';
const ai=original.indexOf(accept),ti=original.indexOf(tap),fi=original.indexOf(finish);
assert.ok(ai>120 && ti>ai && fi>ti && original.indexOf(accept,ai+1)<0 &&
  original.indexOf(tap,ti+1)<0 && original.indexOf(finish,fi+1)<0,
  'Refuse ambiguous Operator journey split');
const next=original.indexOf('- extendedWaitUntil:',ti+tap.length);
assert.ok(next>ti && next<fi,'Offer must precede arrival controls');
const start=original.slice(0,ai);
let offer=header+original.slice(ai,next);
offer=offer.replace('    timeout: 90000','    timeout: 600000');
const board=header+original.slice(next,fi);
const complete=header+original.slice(fi);
assert.ok(start.includes('operator-commence-operations')&&!start.includes('operator-accept-traveler'));
assert.ok(offer.includes('operator-accept-traveler')&&!offer.includes('operator-confirm-arrival'));
assert.ok(board.includes('operator-confirm-arrival')&&board.includes('operator-commence-travel')&&!board.includes('operator-complete-operation'));
assert.ok(complete.includes('operator-complete-operation')&&complete.includes('Operation Complete'));
for(const [name,source] of Object.entries({start,offer,board,complete})){
  fs.writeFileSync(path.join(dir,'qa-commercial-ios-operator-'+name+'.yml'),source);
}
console.log('PASS: four auditable native Operator flows for two separate iPhone simulators');
