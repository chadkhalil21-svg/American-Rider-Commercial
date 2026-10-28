'use strict';
// QA-only: hold Operator session on its own device while Traveler books.
// One-device sequential sign-in can outlive the real 45s offer window.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const dir=path.resolve(__dirname,'../.maestro/generated');
const input=path.join(dir,'qa-commercial-operator.yml');
const source=fs.readFileSync(input,'utf8');
const start='- extendedWaitUntil:\n    visible:\n      id: "operator-accept-traveler"';
const split=source.indexOf(start);
assert.ok(split>150,'Operator acceptance selector not found: refuse guessed role split');
assert.equal(source.indexOf(start,split+1),-1,'Operator accept selector must be unique');
const header=source.slice(0,source.indexOf('- launchApp:'));
assert.ok(header.includes('appId: com.americanrider.app')&&header.includes('---'));
const before=source.slice(0,split);
const offer='- extendedWaitUntil:\n    visible:\n      id: "operator-accept-traveler"\n    timeout: 90000\n- tapOn:\n    id: "operator-accept-traveler"';
assert.ok(source.slice(split).startsWith(offer),
  'Refuse a changed native offer sequence: do not fake Operator acceptance');
// The 15-second foreground offer MUST be accepted by direct Android input
// while it is actually visible. Maestro took 25.5 seconds on its tap alone
// (run 40721224687), so no second Maestro process may compete for its device.
// The separate native watcher performs exactly one real touch. This flow only
// checks subsequent pickup/arrival/operation controls after backend acceptance.
const after=header+source.slice(split+offer.length);
assert.ok(before.includes('operator-commence-operations')&&!before.includes('operator-accept-traveler'));
assert.ok(after.includes('operator-confirm-arrival')&&!after.includes('operator-accept-traveler'));
assert.ok(!after.includes('launchApp:'));

fs.writeFileSync(path.join(dir,'qa-commercial-operator-start.yml'),before);
fs.writeFileSync(path.join(dir,'qa-commercial-operator-fulfill.yml'),after);
console.log('PASS: isolated Operator setup and same-device session fulfillment flows prepared');
