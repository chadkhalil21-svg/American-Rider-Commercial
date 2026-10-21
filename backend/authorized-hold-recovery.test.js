'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {verifyHold}=require('./payment-hold-policy');
const now=Date.UTC(2026,9,21,12);
const pi=(opt={})=>({id:'pi_original',status:'requires_capture',capture_method:'manual',
  currency:'usd',amount:2500,amount_capturable:2500,
  metadata:{uid:'person',rideId:'trip1',capturePolicy:'manual_v1'},
  latest_charge:{payment_method_details:{card:{
    capture_before:Math.floor((now+86400000)/1000)
  }}},...opt});
for(let pass=0;pass<2;pass++){
  const args={intent:pi(),uid:'person',rideId:'trip1',totalCents:2500,
    now,requiredUntil:now+45*60000};
  assert.equal(verifyHold(args).ok,true);
  assert.equal(verifyHold({...args,intent:pi({status:'succeeded'})}).ok,false);
  assert.equal(verifyHold({...args,intent:pi({amount_capturable:0})}).ok,false);
  assert.equal(verifyHold({...args,intent:pi({metadata:{uid:'attacker',rideId:'trip1',capturePolicy:'manual_v1'}})}).ok,false);
  assert.equal(verifyHold({...args,requiredUntil:now+3*86400000}).ok,false);
  assert.equal(verifyHold({...args,intent:pi({latest_charge:null})}).ok,false);
}
const server=fs.readFileSync(path.join(__dirname,'payments.js'),'utf8');
const controller=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/backend/payments.ts'),'utf8');
assert.match(server,/pi\.status === 'requires_capture'/);
assert.match(server,/verifyHold\(\{intent:pi,uid,rideId,totalCents:q\.travelerPays,now,requiredUntil\}\)/);
assert.match(server,/alreadyAuthorized:true/);
assert.match(server,/if \(!RESUMABLE\.includes\(pi\.status\)\) return null/);
assert.match(controller,/routedMinutes: Number\(ride\.routedMinutes\) \|\| 90/);
assert.match(app,/if \(intent\.alreadyAuthorized === true\)/);
assert(app.indexOf('if (intent.alreadyAuthorized === true)')<app.indexOf('const init = await initPaymentSheet('),
  'already-held Travel must return BEFORE PaymentSheet, never create a second authorization');
console.log('PASS twice: provider-verified hold recovery; expired/foreign/partial rejected; device does not reauthorize');
