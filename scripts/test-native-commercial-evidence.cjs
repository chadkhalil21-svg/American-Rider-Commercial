#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validate,SEQUENCE,NEGATIVE}=require('./verify-native-commercial-journeys.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ar-native-proof-test-'));
try{
  const screenshot=path.join(root,'proof.png');
  fs.writeFileSync(screenshot,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(128)]));
  fs.writeFileSync(path.join(root,'hierarchy.xml'),'<hierarchy>'+('native observed test fixture '.repeat(8))+'</hierarchy>');
  fs.writeFileSync(path.join(root,'negative.txt'),'Disposal-only synthetic fixture: not real native evidence.'.repeat(4));
  const time0=Date.parse('2026-10-27T00:00:00.000Z');
  const sha='a'.repeat(40),ride='QA-SYNTHETIC-1234',payment='pi_fake_unit_only',transfer='tr_fake_unit_only';
  const trace={
    platform:'android',buildType:'release',appId:'com.americanrider.app',
    commit:sha,environment:'isolated_test',workflowRunId:1234,
    travelId:ride,paymentIntentId:payment,operatorTransferId:transfer,
    stripeLivemode:false,travelerTotalCents:1400,capturedCents:1400,
    providerVerified:true,firestoreVerified:true,actualTestWallet:true,
    events:SEQUENCE.map(([step,authority],i)=>({
      step,authority,travelId:ride,time:time0+i*1000,
      screenshot:'proof.png',accessibilityTree:'hierarchy.xml',
      paymentIntentId:payment,transferId:transfer,livemode:false,providerVerified:true,
    })),
    negativeScenarios:Object.fromEntries(NEGATIVE.map((name,i)=>[name,{
      status:'pass',travelId:'QA-NEG-'+i,proof:'negative.txt'
    }]))
  };
  assert.equal(validate(trace,root,'android',sha).events,SEQUENCE.length);
  const invalids=[
    [x=>{delete x.events[3]},'missing booking stage'],
    [x=>{x.events[8].travelId='OTHER'},'cross-linked Travel ID'],
    [x=>{x.events[11].livemode=true},'live Stripe payment'],
    [x=>{x.negativeScenarios.operator_no_show.status='not_run'},'unverified failure path'],
    [x=>{x.actualTestWallet=false},'PaymentSheet not exercised'],
    [x=>{x.providerVerified=false},'no real provider confirmation'],
    [x=>{x.events[5].time=0},'out-of-order event'],
  ];
  for(const [tamper,description] of invalids){
    const value=structuredClone(trace);tamper(value);
    assert.throws(()=>validate(value,root,'android',sha),undefined,description);
  }
  assert.throws(()=>validate(trace,root,'ios',sha),'wrong native platform must fail');
  console.log('PASS native evidence guard self-tests: valid SHAPE and 8 tamper cases.');
  console.log('These fixtures are SYNTHETIC; no mobile, Stripe or paid Travel acceptance happened in this self-test.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
