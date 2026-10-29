'use strict';
// One continuous, deliberately isolated in-memory Recruiter -> Operator/Traveler
// -> settled Travel -> commission -> payout-ledger trace.
// No production identities, Firestore, Stripe writes, device, or money.
const assert=require('node:assert/strict');
const {createInvitation,acceptInvitation}=require('../backend/recruiter-portal');
const {shareLink,claim}=require('../backend/referral-service');
const {PROGRAM,recordHeldAccrual}=require('../backend/referral-accrual');
const {releaseCommission,reserveRecruiterPayout,
  recordRecruiterPayoutSubmission,reconcileRecruiterPayout}=
  require('../backend/recruiter-commission-ledger');
class FakeDb {
 constructor(){this.rows=new Map();this.writes=0;}
 collection(c){const db=this;return {doc:id=>({
   path:c+'/'+id,
   async create(v){if(db.rows.has(c+'/'+id))throw Error('exists');db.rows.set(c+'/'+id,v);},
   async get(){const x=db.rows.get(c+'/'+id);return {exists:x!==undefined,data:()=>x};},
   async set(v,o){db.rows.set(c+'/'+id,o?.merge?{...db.rows.get(c+'/'+id),...v}:v);}
 })};}
 async runTransaction(fn){const changes=[];const db=this;
  const tx={
   async get(ref){const x=db.rows.get(ref.path);return {exists:x!==undefined,data:()=>x};},
   create(ref,v){changes.push(['create',ref.path,v]);},
   update(ref,v){changes.push(['update',ref.path,v]);},
   set(ref,v,options){changes.push(['set',ref.path,v,options]);},
  };
  const result=await fn(tx);
  for(const [op,path] of changes){
   if(op==='create'&&this.rows.has(path))throw Error('duplicate '+path);
   if(op==='update'&&!this.rows.has(path))throw Error('missing '+path);
  }
  for(const [op,path,val,options] of changes){
   this.rows.set(path,op==='set'&&options?.merge!==true?val:{...(this.rows.get(path)||{}),...val});
   this.writes++;
  }
  return result;
 }
 at(k){return this.rows.get(k);}
 set(k,v){this.rows.set(k,v);}
}
(async()=>{
 const db=new FakeDb();
 const now=Date.UTC(2026,9,29,12,0);
 const recruiter='qa_recruiter_001',operator='qa_operator_001',traveler='qa_traveler_001';
 const email='qa-recruiter@example.invalid';
 const invite=await createInvitation({db,email,allowedRoles:['operator','traveler'],actor:'qa_founder',now});
 assert.equal(invite.ok,true,'Founder-issued invitation');
 assert.equal((await acceptInvitation({db,uid:'qa_other_person',verifiedEmail:'other@example.invalid',token:invite.token,now:now+10})).reason,'wrong_verified_email');
 const accepted=await acceptInvitation({db,uid:recruiter,verifiedEmail:email,token:invite.token,now:now+100});
 assert.equal(accepted.ok,true,'verified matching email accepts');
 assert.equal(db.at('recruiter_approvals/'+recruiter).payoutEligibilityVerified,false,'invitation is not real KYC');
 // Explicitly authorize a TEST FIXTURE, never a real person. This represents
 // post-onboarding provider claims tested separately by Stripe TEST and production.
 const account=db.at('recruiter_accounts/'+recruiter);
 const approval=db.at('recruiter_approvals/'+recruiter);
 db.set('recruiter_accounts/'+recruiter,{...account,status:'approved',
   identityVerified:true,agreementAccepted:true,payoutEligibilityVerified:true,
   bankVerified:true,taxReady:true,bankProvider:'stripe_connect',
   providerRecipientRef:'acct_QaSynthetic001',providerRecipientStatus:'active',
   connectFeeConsentVersion:'recruiter_connect_2026_10_v1',
   agreementAcceptedAt:now+200});
 db.set('recruiter_approvals/'+recruiter,{...approval,status:'approved',suspended:false,
   approvedBy:'qa_founder',approvedAt:now,
   identityVerified:true,agreementAccepted:true,agreementAcceptedAt:now+200,
   payoutEligibilityVerified:true,expiresAt:Date.UTC(2032,0,1),programVersion:PROGRAM.version});
 const opLink=await shareLink({db,uid:recruiter,role:'operator',now:now+400,
   origin:'https://americanrider.tech',paidRecruiterProgramEnabled:true});
 const trLink=await shareLink({db,uid:recruiter,role:'traveler',now:now+400,
   origin:'https://americanrider.tech',paidRecruiterProgramEnabled:true});
 assert.equal(opLink.ok,true);assert.equal(trLink.ok,true);
 assert.equal(opLink.compensationActive,true);assert.equal(trLink.compensationActive,true);
 const opCode=new URL(opLink.url).searchParams.get('r');
 const trCode=new URL(trLink.url).searchParams.get('r');
 assert.equal(opCode,trCode,'one stable owned code across both role-specific links');
 assert.equal(new URL(opLink.url).searchParams.get('role'),'operator');
 assert.equal(new URL(trLink.url).searchParams.get('role'),'traveler');
 // Auth creation times are synthetic trusted-server fixtures, not phone input.
 const claimArgs={db,code:opCode,now:now+2000,authCreatedAtMs:now+600,
   paidRecruiterProgram:{enabled:true,version:PROGRAM.version}};
 const opClaim=await claim({...claimArgs,uid:operator,role:'operator'});
 const trClaim=await claim({...claimArgs,uid:traveler,role:'traveler'});
 assert.equal(opClaim.ok,true,JSON.stringify(opClaim));assert.equal(trClaim.ok,true,JSON.stringify(trClaim));
 assert.equal(opClaim.rewardEnabled,true);assert.equal(trClaim.rewardEnabled,true);
 assert.equal((await claim({...claimArgs,uid:traveler,role:'traveler'})).reason,'already_attributed');
 assert.equal(db.at('referral_attributions/'+operator+'_operator').inviterUid,recruiter);
 assert.equal(db.at('referral_attributions/'+traveler+'_traveler').inviterUid,recruiter);
 // A payout only becomes possible after 90 QUALIFYING TEST TRAVELS:
 // 90 * ($0.15 operator + $0.15 traveler) = $27 gross, $25 after one $2 fee.
 // Real Stripe capture and transfer proof is a separately enforced provider gate.
 const eventIds=[],enabled={...PROGRAM,enabled:true};
 for(let i=0;i<90;i++){
  const travelId='qa_travel_'+String(i).padStart(5,'0');
  db.set('rides/'+travelId,{status:'completed',operatorId:operator,travelerUid:traveler,
    paymentIntentId:'pi_QA_SYNTHETIC_'+i,transferId:'tr_QA_SYNTHETIC_'+i,
    settledAt:now+5000+i,authorizationState:'captured',paymentCapturePolicy:'manual_v1',
    capturedAt:now+4800+i,capturedCents:2000,referralAvailableCents:30,
    referralProgramVersion:PROGRAM.version,referralAccrualPending:true});
  const x=await recordHeldAccrual({db,rideId:travelId,program:enabled,now:now+6000+i});
  assert.equal(x.ok,true,JSON.stringify({i,x}));
  assert.equal(x.events,2);assert.equal(x.heldCents,30);
  if(i===0){
   const writes=db.writes;
   const replay=await recordHeldAccrual({db,rideId:travelId,program:enabled,now:now+9000});
   assert.equal(replay.events,0);assert.equal(db.writes,writes,'duplicate Travel creates no double commissions');
  }
  eventIds.push(travelId+'_operator',travelId+'_traveler');
 }
 const beforeHold=await releaseCommission({db,eventId:eventIds[0],now:now+7000,
  terms:{enabled:true,approved:true,version:PROGRAM.version,holdMs:86400000,minimumCents:2500}});
 assert.equal(beforeHold.reason,'unmatured_or_ineligible','hold cannot be skipped');
 const matured=now+86400000+20000;
 const terms={enabled:true,approved:true,version:PROGRAM.version,holdMs:86400000,minimumCents:2500};
 for(const eventId of eventIds){
  const out=await releaseCommission({db,eventId,now:matured,terms});
  assert.equal(out.ok,true,JSON.stringify({eventId,out}));
 }
 assert.equal(db.at('recruiter_commission_wallets/'+recruiter).availableCents,2700);
 const auth={programEnabled:true,providerApproved:true,scheduleApproved:true,
  provider:'stripe_connect',activeMonthlyFeeCents:200,minimumCents:2500};
 const batchId='qa_recruiter_batch_001';
 const reserve=await reserveRecruiterPayout({db,uid:recruiter,batchId,eventIds,
   authorization:auth,now:matured+1});
 assert.equal(reserve.status,'reserved',JSON.stringify(reserve));
 assert.equal(reserve.amountCents,2700);assert.equal(reserve.feeCents,200);assert.equal(reserve.netCents,2500);
 assert.equal((await reserveRecruiterPayout({db,uid:recruiter,batchId,eventIds,
   authorization:auth,now:matured+2})).duplicate,true);
 // These are simulated signed Stripe callbacks, NOT real provider results.
 const payment='po_QA_MOCK_PAYOUT_001';
 assert.equal((await recordRecruiterPayoutSubmission({db,batchId,
   proof:{verified:true,providerPaymentId:payment,idempotencyKey:batchId},now:matured+3})).status,'submitted');
 assert.equal((await reconcileRecruiterPayout({db,batchId,
   proof:{verified:true,status:'paid',eventId:'evt_QA_MOCK_001',providerPaymentId:payment},
   now:matured+4})).status,'paid');
 assert.equal((await reconcileRecruiterPayout({db,batchId,
   proof:{verified:true,status:'paid',eventId:'evt_QA_MOCK_001',providerPaymentId:payment},
   now:matured+5})).duplicate,true);
 const wallet=db.at('recruiter_commission_wallets/'+recruiter);
 assert.equal(wallet.paidCents,2700);assert.equal(wallet.netPaidCents,2500);
 assert.equal(wallet.connectFeesPaidCents,200);
 assert.equal(db.at('recruiter_commission_payouts/'+batchId).status,'paid');
 console.log(JSON.stringify({result:'PASS',evidenceClass:'IN_MEMORY_SYNTHETIC_ONLY',
  identities:{recruiters:1,operators:1,travelers:1},
  invitation:'email-bound single-use',links:2,attributedRoles:2,
  completedSyntheticTravels:90,heldAndMaturedCommissionEvents:180,
  grossCommissionCents:2700,monthlyConnectFeeCents:200,simulatedNetPayoutCents:2500,
  payoutProvider:'MOCK_ONLY_NOT_STRIPE',signedMobileUI:'NOT_TESTED_HERE',
  productionFinanceFlags:'UNCHANGED',liveMoney:'NONE'},null,2));
})().catch(e=>{console.error('FAIL isolated 3-role journey',e);process.exitCode=1});
