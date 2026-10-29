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
const postSignInNegative='- extendedWaitUntil:\n    notVisible: "Welcome back"\n    timeout: 30000\n';
const originalStart=original.slice(0,ai);
assert.equal(originalStart.split(postSignInNegative).length-1,1,
  'Refuse ambiguous post-sign-in negative assertion');
// iOS 26.4 XCTest stalled while polling for a stale login heading after a
// successful credential submission, then Safari WebView snapshotting lost its
// accessibility server (run 40799591251). Avoid that expensive negative poll.
// A real native operator route + real In Service screen must still appear.
// Maestro's official iOS openLink guidance: iOS can require confirmation
// of the very first custom-scheme deep link. Run 40801389841 screenshot shows
// "Open in “American”?" obscuring the Traveler screen. The test waited for
// Commence Operations behind this system modal until it timed out.
// Only acknowledge the genuine Apple dialog if it appears. Keep the actual
// Operator route, Commence Operations tap, and In Service assertion mandatory.
const operatorDeepLink='- openLink: "americanrider:///operator"\n';
const iosSystemConfirmation=
  '- runFlow:\n    when:\n      visible: "Open in.*American.*"\n    commands:\n      - tapOn: "Open"\n';
assert.equal(originalStart.split(operatorDeepLink).length-1,1,
  'Refuse ambiguous Operator deep link');
const start=originalStart.replace(postSignInNegative,'')
  .replace(operatorDeepLink,operatorDeepLink+iosSystemConfirmation)+
  '- extendedWaitUntil:\n    visible: "In Service"\n    timeout: 60000\n';
assert.ok(start.includes(operatorDeepLink+iosSystemConfirmation)&&
  !start.includes(postSignInNegative), 'Require real on-device role transition');
let offer=header+original.slice(ai,next);
offer=offer.replace('    timeout: 90000','    timeout: 600000');
const board=header+original.slice(next,fi);
const complete=header+original.slice(fi);
assert.ok(start.includes('operator-commence-operations')&&start.includes('In Service')&&
  !start.includes('operator-accept-traveler'));
assert.ok(offer.includes('operator-accept-traveler')&&!offer.includes('operator-confirm-arrival'));
assert.ok(board.includes('operator-confirm-arrival')&&board.includes('operator-commence-travel')&&!board.includes('operator-complete-operation'));
assert.ok(complete.includes('operator-complete-operation')&&complete.includes('Operation Complete'));
for(const [name,source] of Object.entries({start,offer,board,complete})){
  fs.writeFileSync(path.join(dir,'qa-commercial-ios-operator-'+name+'.yml'),source);
}
console.log('PASS: four auditable native Operator flows for two separate iPhone simulators');
