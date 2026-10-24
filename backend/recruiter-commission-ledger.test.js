'use strict';
const assert=require('node:assert/strict');
const {releaseCommission,reverseCommission,reserveRecruiterPayout,
  recordRecruiterPayoutSubmission,reconcileRecruiterPayout}=require('./recruiter-commission-ledger');
class FakeDb {
 constructor(){this.data=new Map();this.writes=0;}
 collection(n){return {doc:id=>({path:n+'/'+id})};}
 async runTransaction(callback){
  const changes=[];
  const tx={
   get:async ref=>{const has=this.data.has(ref.path);
    return {exists:has,data:()=>has?structuredClone(this.data.get(ref.path)):undefined};},
   create:(ref,value)=>changes.push(['create',ref.path,value]),
   set:(ref,value,opts)=>changes.push(['set',ref.path,value,opts]),
   update:(ref,value)=>changes.push(['update',ref.path,value]),
  };
  const output=await callback(tx);
  for(const [type,path] of changes){
    if(type==='create'&&this.data.has(path))throw Error('duplicate doc');
    if(type==='update'&&!this.data.has(path))throw Error('missing doc');
  }
  for(const [type,path,value,opts] of changes){
    const before=this.data.get(path)||{};
    this.data.set(path,type==='set'&&opts?.merge!==true?value:{...before,...value});
    this.writes++;
  }
  return output;
 }
 set(path,v){this.data.set(path,v);}
 at(path){return this.data.get(path);}
}
const uid='recruiter-001',terms={enabled:true,approved:true,version:'approved-test-v1',holdMs:86400000};
const account={status:'approved',agreementAccepted:true,identityVerified:true,
 payoutEligibilityVerified:true,bankVerified:true,taxReady:true,
 providerRecipientStatus:'active',providerRecipientRef:'acct_SyntheticRecruiter001',
 bankProvider:'stripe_connect',connectFeeConsentVersion:'recruiter_connect_2026_10_v1'};
const approved={status:'approved',suspended:false,identityVerified:true,
 agreementAccepted:true,payoutEligibilityVerified:true,programVersion:terms.version};
const ride=(paymentId,transferId)=>({status:'completed',operatorId:'operator-123',
 travelerUid:'traveler-123',paymentIntentId:paymentId,transferId,
 settledAt:1000,paidAt:1000,refunded:false});
const id1='ride-123456_operator',id2='ride-123457_operator',id3='ride-123458_operator';
const re=(rideId,amount)=>({travelId:rideId,role:'operator',inviterUid:uid,
 status:'held',programVersion:terms.version,amountCents:amount,createdAt:1000});
const db=new FakeDb();
db.set('recruiter_accounts/'+uid,account);
db.set('recruiter_approvals/'+uid,approved);
for(const [key,n,amount] of [[id1,'ride-123456',1500],[id2,'ride-123457',1200],
 [id3,'ride-123458',1500]]){
 db.set('referral_reward_events/'+key,re(n,amount));
 db.set('rides/'+n,ride('pi_'+n,'tr_'+n));
}
(async()=>{
 const now=1000+terms.holdMs+1000;
 assert.equal((await releaseCommission({db,eventId:id1,now,terms:{...terms,approved:false}})).reason,'terms_not_approved');
 assert.equal((await releaseCommission({db,eventId:id1,now:1000+500,terms})).reason,'unmatured_or_ineligible');
 const before=db.writes;
 assert.equal((await releaseCommission({db,eventId:id1,now,terms})).status,'available');
 assert.equal(db.at('recruiter_commission_wallets/'+uid).availableCents,1500);
 assert.equal((await releaseCommission({db,eventId:id1,now,terms})).duplicate,true);
 assert.equal(db.writes,before+3,'duplicate release costs reads but zero writes');
 assert.equal((await releaseCommission({db,eventId:id2,now,terms})).status,'available');
 assert.equal(db.at('recruiter_commission_wallets/'+uid).availableCents,2700);
 const auth={programEnabled:true,providerApproved:true,counselApproved:true,
  scheduleApproved:true,minimumCents:2500,provider:'stripe_connect',activeMonthlyFeeCents:200};
 const batchId='recruiter-batch-20261024-a';
 assert.equal((await reserveRecruiterPayout({db,uid,batchId,eventIds:[id1,id2],
    authorization:{...auth,providerApproved:false},now})).reason,'commission_program_not_approved');
 assert.equal((await reserveRecruiterPayout({db,uid,batchId,eventIds:[id1,id1],
    authorization:auth,now})).reason,'invalid_request');
 const reserved=await reserveRecruiterPayout({db,uid,batchId,eventIds:[id1,id2],
    authorization:auth,now});
 assert.equal(reserved.status,'reserved');assert.equal(reserved.amountCents,2700);
 assert.equal(reserved.netCents,2500);assert.equal(reserved.feeCents,200);
 assert.equal(db.at('recruiter_connect_fee_months/'+uid+'_'+new Date(now).toISOString().slice(0,7).replace('-','')).amountCents,200);
 assert.deepEqual([db.at('recruiter_commission_wallets/'+uid).availableCents,
  db.at('recruiter_commission_wallets/'+uid).reservedCents],[0,2700]);
 const duplicate=await reserveRecruiterPayout({db,uid,batchId,eventIds:[id1,id2],
  authorization:auth,now});
 assert.equal(duplicate.duplicate,true);
 assert.equal((await recordRecruiterPayoutSubmission({db,batchId,
   proof:{verified:false,providerPaymentId:'payment-123456',idempotencyKey:batchId}})).reason,'unverified_submission');
 const reverse=await reverseCommission({db,eventId:id1,now,
  proof:{verified:true,reason:'refund',eventId:'evt_refund_12345'}});
 assert.equal(reverse.recoveryRequired,true,'refund after reserve needs provider recovery');
 assert.equal(db.at('recruiter_commission_wallets/'+uid).reservedCents,2700,
  'do not silently withdraw a provider payment already reserved');
 assert.equal((await reverseCommission({db,eventId:id1,now,
  proof:{verified:true,reason:'refund',eventId:'evt_refund_12345'}})).duplicate,true);
 const submission=await recordRecruiterPayoutSubmission({db,batchId,now,
  proof:{verified:true,providerPaymentId:'payment-123456',idempotencyKey:batchId}});
 assert.equal(submission.status,'submitted');
 assert.equal((await recordRecruiterPayoutSubmission({db,batchId,now,
  proof:{verified:true,providerPaymentId:'payment-123456',idempotencyKey:batchId}})).duplicate,true);
 assert.equal((await reconcileRecruiterPayout({db,batchId,now,
  proof:{verified:false,status:'paid',eventId:'evt_payment_123',providerPaymentId:'payment-123456'}})).reason,
 'unverified_provider_event');
 const pendingReturn=await reconcileRecruiterPayout({db,batchId,now,
  proof:{verified:true,status:'failed',eventId:'evt_payment_123',
    providerPaymentId:'payment-123456'}});
 assert.equal(pendingReturn.reason,'bank_return_requires_platform_fund_recovery',
   'bank refusal does not return a second funded commission to the wallet');
 const failure=await reconcileRecruiterPayout({db,batchId,now,
  proof:{verified:true,status:'failed',eventId:'evt_payment_123',
    providerPaymentId:'payment-123456',fundsReturnedToPlatform:true}});
 assert.equal(failure.status,'failed');
 assert.equal(db.at('recruiter_connect_fee_months/'+uid+'_'+new Date(now).toISOString().slice(0,7).replace('-','')).status,'released');
 const w=db.at('recruiter_commission_wallets/'+uid);
 assert.deepEqual([w.availableCents,w.reservedCents,w.reversedCents,w.paidCents],[1200,0,1500,0]);
 assert.equal(db.at('referral_reward_events/'+id1).status,'reversed');
 assert.equal(db.at('referral_reward_events/'+id2).status,'available');
 const afterFailure=db.writes;
 assert.equal((await reconcileRecruiterPayout({db,batchId,now,
  proof:{verified:true,status:'failed',eventId:'evt_payment_123',providerPaymentId:'payment-123456'}})).duplicate,true);
 assert.equal(db.writes,afterFailure,'duplicated signed provider event writes nothing');
 assert.equal((await releaseCommission({db,eventId:id3,now,terms})).status,'available');
 const second='recruiter-batch-20261024-b';
 const secondReserved=await reserveRecruiterPayout({db,uid,batchId:second,
  eventIds:[id2,id3],authorization:auth,now});
 assert.equal(secondReserved.status,'reserved');
 assert.equal(secondReserved.netCents,2500,'failed bank event released fee, so first successful payout still pays exactly once');
 assert.equal((await recordRecruiterPayoutSubmission({db,batchId:second,now,
  proof:{verified:true,providerPaymentId:'payment-987654',idempotencyKey:second}})).status,'submitted');
 assert.equal((await reconcileRecruiterPayout({db,batchId:second,now,
  proof:{verified:true,status:'paid',eventId:'evt_payment_987',providerPaymentId:'payment-987654'}})).status,'paid');
 const final=db.at('recruiter_commission_wallets/'+uid);
 assert.deepEqual([final.availableCents,final.reservedCents,final.reversedCents,final.paidCents],
 [0,0,1500,2700]);
 const recovered=await reverseCommission({db,eventId:id3,now,
  proof:{verified:true,reason:'dispute',eventId:'evt_dispute_987'}});
 assert.equal(recovered.recoveryRequired,true,'do not imply returned cash was recovered');
 assert.equal(db.at('recruiter_commission_wallets/'+uid).paidCents,2700);
 assert.equal(db.at('recruiter_commission_wallets/'+uid).connectFeesPaidCents,200);
 assert.equal(db.at('recruiter_commission_wallets/'+uid).netPaidCents,2500);
 assert.equal(db.at('recruiter_commission_wallets/'+uid).recoveryDueCents,1500,
   'money already paid but disputed is an outstanding recovery, not silently reclaimed');
 assert.equal(db.at('referral_reward_events/'+id3).requiresRecovery,true);
 const residualDb=new FakeDb();
 const residualEvent='ride-555555_operator',residualAt=Date.UTC(2026,9,24,18,0),
   ninetyDays=90*86400000;
 residualDb.set('recruiter_accounts/'+uid,{...account});
 residualDb.set('recruiter_commission_wallets/'+uid,{availableCents:15,
   reservedCents:0,paidCents:0,reversedCents:0,recoveryDueCents:0});
 residualDb.set('referral_reward_events/'+residualEvent,{travelId:'ride-555555',
   role:'operator',inviterUid:uid,status:'available',amountCents:15,
   requiresRecovery:false});
 residualDb.set('recruiter_payout_candidates/'+uid,{uid,
   lastEligibleRewardAt:residualAt,nextAttemptAt:residualAt+ninetyDays});
 const closeoutAuth={...auth,minimumCents:1,standardMinimumCents:2500,
   closeout:true};
 const closeoutArgs={db:residualDb,uid,batchId:'recruiter-residual-2027',
   eventIds:[residualEvent],authorization:closeoutAuth};
 assert.equal((await reserveRecruiterPayout({...closeoutArgs,
    now:residualAt+ninetyDays-1})).reason,'residual_closeout_not_due');
 assert.equal((await reserveRecruiterPayout({...closeoutArgs,
    now:residualAt+ninetyDays})).status,'reserved');
 assert.equal(residualDb.at('recruiter_commission_payouts/recruiter-residual-2027').netCents,
   15,'residual funds are not forfeited to the $2 fee');
 assert.equal(residualDb.at('recruiter_commission_payouts/recruiter-residual-2027').feeCents,
   0,'provider cost borne by platform for tiny 90-day closeout');
 assert.equal(residualDb.at('recruiter_commission_payouts/recruiter-residual-2027').residualFeeWaived,
   true,'bank rollover retains waiver');
 const feeDocs=[...residualDb.data.keys()].filter(k=>k.startsWith('recruiter_connect_fee_months/'));
 assert.equal(feeDocs.length,0,'do not reserve a second monthly fee for waived closeout');

 console.log('PASS recruiter reward maturity, approved accounting, exact-event reservation, failed bank return, paid proof, reversals, idempotency; NO MONEY SENT');
})().catch(e=>{console.error(e);process.exitCode=1});