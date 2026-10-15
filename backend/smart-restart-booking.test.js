'use strict';
// Regression: phone restarts must not create a new Smart second-car booking key.
// Test the actual TypeScript helper compiled in-memory, not a duplicate regex.
// No Firebase/Stripe/mobile device or live user data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const {bookingId}=require('./booking');
const root=path.join(__dirname,'..');
const helperPath=path.join(root,'src','smartBookingKey.ts');
const compiled=ts.transpileModule(fs.readFileSync(helperPath,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const box={exports:{}};
vm.runInNewContext(compiled,box,{timeout:1000});
const {smartSecondCarKey}=box.exports;
assert.equal(typeof smartSecondCarKey,'function');
const valid=['AR-A0B1C2D3-MIA','AR-12345678-FLL','AR-12ABCDEF-PBI','AR-1234ABCD-SFL'];
for(const no of valid){
 const first=smartSecondCarKey(no),afterRestart=smartSecondCarKey(no);
 assert.equal(first,afterRestart,'restart must reuse the same second car identity');
 assert.match(first,/^[A-Za-z0-9_-]{16,100}$/,'key must satisfy backend validation');
 assert.equal(bookingId('guardian',first),bookingId('guardian',afterRestart));
 assert.notEqual(bookingId('teen',first),bookingId('guardian',first),'keys must remain per-account');
}
assert.equal(new Set(valid.map(smartSecondCarKey)).size,valid.length);
for(const bad of [null,undefined,'',false,123,'AR-1-MIA','AR-00000000-NYC',
 'AR-00000000-MIA\n','ar-12345678-mia','AR-12345678-MIA /fake','AR-GGGGGGGG-FLL']){
 assert.equal(smartSecondCarKey(bad),null,'no optimistic or tampered Travel Number may derive a booking key');
}
const state=fs.readFileSync(path.join(root,'src','state','RideContext.tsx'),'utf8');
assert.match(state,/import \{ smartSecondCarKey \} from '\.\.\/smartBookingKey'/);
assert.match(state,/if \(!journey \|\| !smartSecondCarKey\(journey\.leg1No\)\) return false/,
 'do not enter second-car booking without the first server Travel Number');
assert.match(state,/if \(smartJourneyRef\.current\?\.stage === 'leg2'\)[\s\S]{0,310}bookingKeyRef\.current = key/,
 'dispatch retries must use first-Travel identity rather than a new UUID');
assert.match(state,/bookingKeyRef\.current = journey\?\.stage === 'leg2'[\s\S]{0,150}smartSecondCarKey\(journey\.leg1No\)/,
 'fresh confirmations still reuse the same second-car booking identity');
const server=fs.readFileSync(path.join(root,'backend','server.js'),'utf8');
assert.match(server,/journeyNo: b\.journeyNo.*partyMode: b\.partyMode/,
 'server must include first Travel identity in booking fingerprint');
console.log('PASS Smart leg 2 restarts: stable real-Travel booking key, account separation, invalid identity denial, same-key UI retry');
