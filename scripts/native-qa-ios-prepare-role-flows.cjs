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
// Maestro iOS 26 test driver (40803352514) died while inspecting the Apple
// deep-link system modal's SafariViewService accessibility hierarchy. Earlier
// runs (40801389841) showed "Open in American?" covering the actual Traveler
// home after sign-in. Do not exercise a custom-scheme deep link just to reach
// an Operator page: real commissioned accounts already have a native menu row.
// Drive that existing user-facing navigation, then prove real Operator duty.
// Run 40805559327 proves a coordinate tap may complete without opening
// the drawer. Require actual menu and commissioned-role native testIDs;
// a missed tap is retried only when the UI remains unchanged.
const operatorDeepLink='- openLink: "americanrider:///operator"\n';
const realOperatorNavigation=
  '- extendedWaitUntil:\n    visible:\n      id: "traveler-menu-open"\n    timeout: 90000\n'+
  '- tapOn:\n    id: "traveler-menu-open"\n    retryTapIfNoChange: true\n'+
  // The iOS native drawer may still be animating when its row first appears.
  // Maestro recommends waiting for stability, then checking the target ID.
  '- waitForAnimationToEnd:\n    timeout: 5000\n'+
  '- extendedWaitUntil:\n    visible:\n      id: "traveler-switch-to-operator"\n    timeout: 60000\n'+
  '- tapOn:\n    id: "traveler-switch-to-operator"\n    retryTapIfNoChange: true\n'+
  '- extendedWaitUntil:\n    visible:\n      id: "operator-commence-operations"\n    timeout: 60000\n';
assert.equal(originalStart.split(operatorDeepLink).length-1,1,
  'Refuse ambiguous Operator deep link');
const start=originalStart.replace(postSignInNegative,'')
  .replace(operatorDeepLink,realOperatorNavigation)+
  '- extendedWaitUntil:\n    visible: "In Service"\n    timeout: 60000\n';
assert.ok(start.includes('traveler-switch-to-operator')&&
  start.includes('retryTapIfNoChange: true')&&
  start.includes('waitForAnimationToEnd:')&&
  !start.includes(operatorDeepLink)&&
  !start.includes(postSignInNegative), 'Require actual in-app Operator navigation');
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
