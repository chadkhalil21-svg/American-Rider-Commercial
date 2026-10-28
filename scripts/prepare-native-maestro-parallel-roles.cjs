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
let after=header+source.slice(split);
// Two native emulators have separate Maestro driver startup times. The
// Traveler must authenticate and enter Stripe TEST on the second phone before
// the first real assigned offer can exist. The old 90-second QA selector wait
// expired BEFORE the Traveler completed payment (run 40703430303).
// Change ONLY Maestro's wait-for-offer timeout, not the server's 45s offer TTL
// or the Operator's actual 15s foreground response window.
const wait='id: "operator-accept-traveler"\n    timeout: 90000';
assert.equal(after.split(wait).length-1,1,'Expected exactly one first offer timeout');
after=after.replace(wait,'id: "operator-accept-traveler"\n    timeout: 480000');
// Native Android run 40714909774: Maestro's id-based tap took 20 seconds
// waiting for a settled hierarchy AFTER it had already selected the actual
// Accept Traveler button. By the time it sent the touch, the real 15-second
// offer-response countdown had expired. Same tap coordinates then hit the
// Profile tab beneath the dismissed modal; the server correctly remained
// "assigned". Use a direct native coordinate tap ONLY on the fixed Android
// Pixel 6 1080x2400 TEST emulator, immediately after the asserted accessible
// offer button becomes visible. The exact captured button bounds were
// [556,2094][972,2250] (center 764,2172 => 71%,91%). Preserve the actual
// backend response window and require the real pickup-screen state afterward;
// never make the synthetic server accept anything automatically.
const acceptIdTap='- tapOn:\n    id: "operator-accept-traveler"';
assert.equal(after.split(acceptIdTap).length-1,1,
  'exactly one Operator accept tap must exist in generated flow');
after=after.replace(acceptIdTap,
  '- tapOn:\n    point: "71%,91%"\n- extendedWaitUntil:\n    visible:\n      id: "operator-confirm-arrival"\n    timeout: 60000');
// The original post-accept wait still runs. An invisible or expired offer is
// a hard test failure, not a reason to fake accepted status or double-tap.

assert.ok(before.includes('operator-commence-operations')&&!before.includes('operator-accept-traveler'));
assert.ok(after.includes('operator-confirm-arrival')&&!after.includes('launchApp:'));
fs.writeFileSync(path.join(dir,'qa-commercial-operator-start.yml'),before);
fs.writeFileSync(path.join(dir,'qa-commercial-operator-fulfill.yml'),after);
console.log('PASS: isolated Operator setup and same-device session fulfillment flows prepared');
