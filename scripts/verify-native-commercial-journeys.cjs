#!/usr/bin/env node
'use strict';
// A strict cross-platform native COMMERCIAL acceptance gate.
// Only genuine per-platform observed events may be submitted. Missing evidence
// is a FAILURE, never a green result inferred from synthetic backend checks.
// This gate does not create Trips, Stripe charges, compliance approvals or users.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const SEQUENCE = [
  ['traveler_sign_in','native'],
  ['operator_sign_in','native'],
  ['traveler_quote','native'],
  ['traveler_booking_submitted','native'],
  ['stripe_test_authorization','stripe_test'],
  ['operator_offer_received','native'],
  ['operator_accepted','native'],
  ['operator_arrived','native'],
  ['traveler_pickup_verified','native'],
  ['travel_started','native'],
  ['travel_completed','native'],
  ['stripe_test_capture','stripe_test'],
  ['stripe_test_operator_transfer','stripe_test'],
  ['traveler_receipt_displayed','native'],
  ['operator_earnings_displayed','native'],
];
const NEGATIVE = [
  'traveler_cancellation_before_dispatch',
  'operator_no_show',
  'payment_declined_or_canceled',
  'refund_or_authorization_release',
  'interrupted_request_recovery',
];
const REQUIRED_PLATFORMS = ['ios','android'];
function checkedRelative(root, relative) {
  assert.equal(typeof relative,'string','an evidence artifact path is required');
  const target = path.resolve(root, relative);
  assert.ok(target.startsWith(path.resolve(root)+path.sep),'evidence must stay inside provided artifact directory');
  assert.ok(fs.statSync(target).isFile() && fs.statSync(target).size > 100,'evidence artifact is empty');
  return target;
}
function validate(trace, root, expectedPlatform, expectedSha) {
  assert.equal(trace.platform,expectedPlatform,'wrong native operating system');
  assert.equal(trace.buildType,'release','Debug/JS mocks cannot certify release build');
  assert.equal(trace.appId,'com.americanrider.app','wrong app identity');
  assert.equal(trace.commit,expectedSha,'must test the exact release commit');
  assert.equal(trace.environment,'isolated_test','no production accounts or real customer charges');
  assert.ok(Number.isSafeInteger(trace.workflowRunId) && trace.workflowRunId>0,'need native GitHub runner evidence');
  assert.ok(typeof trace.travelId==='string' && trace.travelId.length>=8,'missing linked Travel ID');
  assert.ok(typeof trace.paymentIntentId==='string' && /^pi_/.test(trace.paymentIntentId),'missing TEST PaymentIntent identifier');
  assert.ok(typeof trace.operatorTransferId==='string' && /^tr_/.test(trace.operatorTransferId),'missing TEST Connect transfer identifier');
  assert.equal(trace.stripeLivemode,false,'production Stripe funds forbidden');
  assert.ok(Number.isInteger(trace.travelerTotalCents)&&trace.travelerTotalCents>0,'invalid amount');
  assert.ok(Number.isInteger(trace.capturedCents)&&trace.capturedCents>0,'capture not verified');
  assert.ok(trace.capturedCents<=trace.travelerTotalCents,'capture exceeds agreed total');
  assert.equal(trace.providerVerified,true,'record independent Stripe TEST API confirmation, not mock response');
  assert.equal(trace.firestoreVerified,true,'record independent isolated Firestore Trip state');
  assert.ok(Array.isArray(trace.events),'missing per-device event trace');
  let lastTime=0;
  for(const [step,authority] of SEQUENCE){
    const match=trace.events.find(x=>x.step===step);
    assert.ok(match,expectedPlatform+': missing '+step);
    assert.equal(match.authority,authority,expectedPlatform+': incorrect evidence authority for '+step);
    assert.equal(match.travelId,trace.travelId,expectedPlatform+': unmatched Travel ID for '+step);
    assert.ok(Number.isFinite(match.time)&&match.time>=lastTime,expectedPlatform+': out-of-order '+step);
    lastTime=match.time;
    if(authority==='native'){
      const screenshot=checkedRelative(root,match.screenshot);
      const signature=fs.readFileSync(screenshot).subarray(0,8);
      assert.ok(signature.equals(Buffer.from([137,80,78,71,13,10,26,10])),
        expectedPlatform+': missing real PNG screenshot for '+step);
      checkedRelative(root,match.accessibilityTree);
    }
    if(authority==='stripe_test'){
      assert.equal(match.paymentIntentId,trace.paymentIntentId,expectedPlatform+': Stripe payment mismatch at '+step);
      assert.equal(match.livemode,false,'real payment is not a test');
      assert.equal(match.providerVerified,true,expectedPlatform+': require actual Stripe TEST response');
      if(step==='stripe_test_operator_transfer')
        assert.equal(match.transferId,trace.operatorTransferId,'mismatched Connect transfer');
    }
  }
  assert.ok(trace.negativeScenarios && typeof trace.negativeScenarios==='object',
    expectedPlatform+': negative journeys not checked');
  for(const step of NEGATIVE) {
    const event=trace.negativeScenarios[step];
    assert.ok(event && event.status==='pass',expectedPlatform+': missing '+step);
    assert.ok(event.travelId && event.travelId!==trace.travelId,
      expectedPlatform+': use independent test Travel for '+step);
    checkedRelative(root,event.proof);
  }
  assert.ok(trace.actualTestWallet===true,'native Stripe PaymentSheet was not exercised');
  return {platform:expectedPlatform,events:SEQUENCE.length,negative:NEGATIVE.length};
}
if(require.main===module){
  try{
    const root=path.resolve(process.argv[2]||'artifacts/native-commercial');
    const sha=process.env.EXPECTED_RELEASE_SHA||'';
    assert.match(sha,/^[a-f0-9]{40}$/,'pin EXPECTED_RELEASE_SHA to canonical release commit');
    const results=[];
    for(const platform of REQUIRED_PLATFORMS){
      const file=path.join(root,platform+'.json');
      assert.ok(fs.existsSync(file),
        platform+': NO COMPLETE NATIVE COMMERCIAL JOURNEY TRACE. Login/navigation or synthetic payment tests do not count.');
      results.push(validate(JSON.parse(fs.readFileSync(file,'utf8')),root,platform,sha));
    }
    console.log('PASS independently documented commercial native journeys on both platforms:',JSON.stringify(results));
  }catch(error){
    console.error('NOT CERTIFIED: '+error.message);
    process.exitCode=1;
  }
}
module.exports={validate,SEQUENCE,NEGATIVE};
