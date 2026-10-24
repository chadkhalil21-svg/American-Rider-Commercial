'use strict';
const assert=require('node:assert/strict');
const {ensureRecruiterAccount,hostedRecruiterOnboarding,verifyRecruiterBank,
 transferRecruiterCommission}=require('./recruiter-connect-finance');
const NOW=Date.now()-100_000, uid='recruiter-synthetic-001',
 acct='acct_syntheticRecruiterOne1',payableId='reward-synthetic-00001',
 rideId='ride-synthetic-000001';
class Db{
 constructor(){this.rows=new Map();this.reads=0;this.writes=0;}
 collection(collection){return{doc:id=>({path:collection+'/'+id,
  get:async()=>this.snap(collection+'/'+id)})};}
 snap(key){this.reads++;const v=this.rows.get(key);return {exists:v!==undefined,data:()=>v};}
 async runTransaction(fn){
  const mutations=[];
  const tx={get:async ref=>this.snap(ref.path),
   create:(ref,value)=>mutations.push({op:'create',key:ref.path,value}),
   update:(ref,value)=>mutations.push({op:'update',key:ref.path,value}),
  };
  const result=await fn(tx);
  for(const x of mutations){
   if(x.op==='create'&&this.rows.has(x.key))throw Error('duplicate');
   if(x.op==='update'&&!this.rows.has(x.key))throw Error('missing');
   this.rows.set(x.key,x.op==='create'?x.value:{...this.rows.get(x.key),...x.value});this.writes++;
  }
  return result;
 }
}
(async()=>{
 const db=new Db(), stats={creates:0,accountLinks:0,transfers:0,lookups:0};
 const profile={status:'approved',verifiedEmail:'recruiter@example.com',
  agreementAccepted:true};
 const approval={status:'approved',suspended:false,agreementAccepted:true,
  agreementAcceptedAt:NOW-5000};
 const provider={id:acct,type:'express',metadata:{ar_recruiter_uid:uid},
  payouts_enabled:true,details_submitted:true,
  capabilities:{transfers:'active'},requirements:{currently_due:[],past_due:[]}};
 const transfers=new Map();let simulateTimeout=false,accountMismatch=false;
 const stripe={accounts:{
  create:async (payload,options)=>{stats.creates++;
   assert.equal(payload.type,'express');
   assert.equal(payload.capabilities.transfers.requested,true);
   assert.equal(payload.metadata.ar_recruiter_uid,uid);
   assert.match(options.idempotencyKey,/^ar_recruiter_connect_/);
   return {id:acct};},
  retrieve:async id=>{assert.equal(id,acct);return accountMismatch?
   {...provider,metadata:{ar_recruiter_uid:'different-user'}}:provider;},
 },accountLinks:{create:async opts=>{stats.accountLinks++;
  assert.equal(opts.account,acct);
  assert.equal(opts.type,'account_onboarding');
  return {url:'https://connect.stripe.com/synthetic-hosted-onboarding'};}},
 transfers:{
  list:async ({transfer_group,limit})=>{stats.lookups++;assert.equal(limit,2);
   const found=transfers.get(transfer_group);
   return {data:found?[found]:[],has_more:false};},
  create:async (payload,opts)=>{stats.transfers++;
   assert.equal(opts.idempotencyKey,payload.transfer_group);
   const t={id:'tr_synthetic_001',amount:payload.amount,currency:payload.currency,
    destination:payload.destination,transfer_group:payload.transfer_group,
    metadata:payload.metadata,amount_reversed:0,reversed:false};
   transfers.set(payload.transfer_group,t);
   if(simulateTimeout)throw Error('Stripe response lost after transfer');
   return t;},
 }};
 db.rows.set('recruiter_accounts/'+uid,profile);
 db.rows.set('recruiter_approvals/'+uid,approval);
 const base={db,stripe,uid,verifiedEmail:'recruiter@example.com',
  programEnabled:true,legalApproved:true,now:NOW};
 const off=await hostedRecruiterOnboarding({...base,programEnabled:false});
 assert.equal(off.reason,'program_or_legal_off');assert.equal(stats.creates,0);
 const wrong=await hostedRecruiterOnboarding({...base,verifiedEmail:'attacker@example.com'});
 assert.equal(wrong.reason,'not_authorized');assert.equal(stats.creates,0);
 let onboarding=await hostedRecruiterOnboarding(base);
 assert.equal(onboarding.ok,true);
 assert.equal(onboarding.bankDetailsCollectedBy,'stripe');
 assert.match(onboarding.url,/^https:\/\/connect.stripe.com/);
 assert.equal(stats.creates,1);
 onboarding=await hostedRecruiterOnboarding(base);
 assert.equal(onboarding.ok,true);assert.equal(stats.creates,1,'one connected account per recruiter');
 assert.equal(stats.accountLinks,2,'a fresh hosted link is allowed');
 assert.equal(db.rows.get('recruiter_accounts/'+uid).stripeRecruiterAccountId,acct);
 // Never stamp payout verification on provider uncertainty or wrong identity.
 accountMismatch=true;
 let x=await verifyRecruiterBank(base);
 assert.equal(x.ready,false);
 assert.equal(db.rows.get('recruiter_approvals/'+uid).payoutEligibilityVerified,undefined);
 accountMismatch=false;
 x=await verifyRecruiterBank(base);
 assert.equal(x.ready,true);
 assert.equal(db.rows.get('recruiter_approvals/'+uid).payoutEligibilityVerified,true);
 assert.equal(db.rows.get('recruiter_accounts/'+uid).identityVerified,true);
 const available={status:'available',recruiterUid:uid,
  stripeRecruiterAccountId:acct,amountCents:3400,fundedCents:3400,
  availableAt:NOW-1,refundRiskClear:true,travelId:rideId};
 db.rows.set('recruiter_finance_summaries/'+uid,{availableCents:10200,transferredCents:0});
 db.rows.set('recruiter_payables/'+payableId,available);
 db.rows.set('rides/'+rideId,{
  status:'completed',transferId:'tr_OperatorSettlement',
  settledAt:NOW-1000,refunded:false,disputed:false,
 });
 const opts={db,stripe,payableId,programEnabled:true,legalApproved:true,now:NOW};
 assert.equal((await transferRecruiterCommission({...opts,legalApproved:false})).reason,
  'program_or_legal_off');
 assert.equal(stats.transfers,0);
 accountMismatch=true;
 x=await transferRecruiterCommission(opts);
 assert.equal(x.reason,'provider_account_not_ready');
 assert.equal(stats.transfers,0);
 accountMismatch=false;
 x=await transferRecruiterCommission(opts);
 assert.equal(x.reason,'reconciliation_required','never retry a reserved Stripe attempt');
 assert.equal(stats.transfers,0);
 // A fresh payable sends exactly one transfer, with no claim of bank deposit.
 const second='reward-synthetic-00002';
 db.rows.set('recruiter_payables/'+second,{...available});
 x=await transferRecruiterCommission({...opts,payableId:second});
 assert.equal(x.ok,true);assert.equal(x.bankPaid,false);
 assert.equal(x.status,'transferred_to_provider');
 assert.equal(stats.transfers,1);
 assert.equal(db.rows.get('recruiter_payables/'+second).bankPayoutStatus,
  'pending_provider_confirmation');
 x=await transferRecruiterCommission({...opts,payableId:second});
 assert.equal(x.ok,true);assert.equal(x.alreadyTransferred,true);
 assert.equal(stats.transfers,1,'no duplicate on repeated request');
 // A failure after Stripe accepted a transfer is reconciled from the provider.
 const third='reward-synthetic-00003';
 db.rows.set('recruiter_payables/'+third,{...available});
 simulateTimeout=true;
 x=await transferRecruiterCommission({...opts,payableId:third});
 assert.equal(x.reason,'transfer_result_unconfirmed');
 assert.equal(stats.transfers,2);
 simulateTimeout=false;
 x=await transferRecruiterCommission({...opts,payableId:third});
 assert.equal(x.ok,true);
 assert.equal(db.rows.get('recruiter_payables/'+third).status,'transferred_to_provider');
 assert.equal(stats.transfers,2,'lookup reconciles the prior Stripe attempt; zero replay money');
 assert.equal(db.rows.get('recruiter_finance_summaries/'+uid).availableCents,3400);
 assert.equal(db.rows.get('recruiter_finance_summaries/'+uid).transferredCents,6800);
 assert.equal(db.rows.get('recruiter_commission_journal/'+third+'_provider_transferred').transferId,'tr_synthetic_001');
 const denied='reward-synthetic-00004';
 db.rows.set('recruiter_payables/'+denied,{...available});
 db.rows.set('rides/'+rideId,{...db.rows.get('rides/'+rideId),refundPending:true});
 x=await transferRecruiterCommission({...opts,payableId:denied});
 assert.equal(x.reason,'eligibility_or_settlement_changed');assert.equal(stats.transfers,2);
 db.rows.set('rides/'+rideId,{...db.rows.get('rides/'+rideId),refundPending:false});
 db.rows.set('recruiter_payables/'+denied,{...available,amountCents:4000});
 x=await transferRecruiterCommission({...opts,payableId:denied});
 assert.equal(x.reason,'not_verified_payable');
 assert.equal(stats.transfers,2);
 // No raw routing/account details or TIN ever stored on platform.
 assert.doesNotMatch(JSON.stringify([...db.rows.values()]),/routingNumber|accountNumber|socialSecurityNumber|\bssn\b/);
 console.log('PASS recruiter Stripe hosted bank identity, refusal and ownership; funds-first immutable transfer, no duplicate, timeout reconciliation and no fictitious bank-paid');
})().catch(e=>{console.error(e);process.exitCode=1});
