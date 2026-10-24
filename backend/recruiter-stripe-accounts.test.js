'use strict';
const assert=require('node:assert/strict');
const {
 FEE_CENTS,FEE_VERSION,FEE_DISCLOSURE,
 acceptRecruiterConnectFee,hostedRecruiterOnboarding,verifyRecruiterBank,
}=require('./recruiter-stripe-accounts');
const NOW=Date.now()-10_000;
const UID='recruiter-test-001',ACCOUNT='acct_StripeRecruiterTest001';
class Db {
 constructor(){this.rows=new Map();this.writes=0;}
 collection(name){return {doc:id=>{
  const path=name+'/'+id;
  return {path,get:async()=>this.snapshot(path)};
 }};}
 snapshot(path){const data=this.rows.get(path);return {exists:data!==undefined,
  data:()=>structuredClone(data)};}
 async runTransaction(fn){
  const ops=[];const tx={
   get:async ref=>this.snapshot(ref.path),
   update:(ref,fields)=>ops.push(['update',ref.path,fields]),
   set:(ref,fields)=>ops.push(['set',ref.path,fields]),
  };
  const result=await fn(tx);
  for(const [type,path,data] of ops){
   if(type==='update'&&!this.rows.has(path))throw Error('missing');
   this.rows.set(path,{...(this.rows.get(path)||{}),...data});this.writes++;
  }
  return result;
 }
}
(async()=>{
 const db=new Db(),counter={accounts:0,links:0,payoutConfigurations:0};
 db.rows.set('recruiter_accounts/'+UID,{
  status:'approved',verifiedEmail:'recruiter@example.com',agreementAccepted:true});
 db.rows.set('recruiter_approvals/'+UID,{
  status:'approved',suspended:false,agreementAccepted:true,
  agreementAcceptedAt:NOW-10_000});
 const stripe={accounts:{
  create:async(args,opts)=>{counter.accounts++;
   assert.equal(args.type,'express');assert.equal(args.country,'US');
   assert.equal(args.capabilities.transfers.requested,true);
   assert.equal(args.metadata.ar_recruiter_uid,UID);
   assert.ok(opts.idempotencyKey.includes('ar_recruiter_connect'));
   return {id:ACCOUNT};},
  update:async(id,patch)=>{assert.equal(id,ACCOUNT);counter.payoutConfigurations++;
   assert.equal(patch.settings.payouts.schedule.interval,'manual');
   return {settings:{payouts:{schedule:{interval:'manual'}}}};},
  retrieve:async id=>{assert.equal(id,ACCOUNT);return {
   id,metadata:{ar_recruiter_uid:UID},type:'express',country:'US',
   business_type:'individual',individual:{ssn_last_4_provided:true},
   payouts_enabled:true,details_submitted:true,capabilities:{transfers:'active'},
   requirements:{currently_due:[],past_due:[]},
   settings:{payouts:{schedule:{interval:'manual'}}},
  };},
 },accountLinks:{create:async data=>{counter.links++;
  assert.equal(data.account,ACCOUNT);
  assert.equal(data.type,'account_onboarding');
  assert.equal(data.return_url,'https://americanrider.tech/recruiters/portal/?connect=returned');
  assert.equal(data.refresh_url,'https://americanrider.tech/recruiters/portal/?connect=refresh');
  return {url:'https://connect.stripe.com/test-account-link'};}}};
 assert.equal(FEE_CENTS,200);
 assert(FEE_DISCLOSURE.includes('$2.00'));
 assert.equal((await hostedRecruiterOnboarding({db,stripe,uid:UID,
  verifiedEmail:'recruiter@example.com',programEnabled:true,
  now:NOW})).reason,'not_authorized','consent before bank');
 assert.equal(counter.accounts,0);
 assert.equal((await acceptRecruiterConnectFee({db,uid:UID,
  verifiedEmail:'attacker@example.com',accepted:true,version:FEE_VERSION,now:NOW})).reason,
 'not_authorized');
 assert.equal((await acceptRecruiterConnectFee({db,uid:UID,
  verifiedEmail:'recruiter@example.com',accepted:false,version:FEE_VERSION,now:NOW})).reason,
 'fee_consent_required');
 const yes=await acceptRecruiterConnectFee({db,uid:UID,
  verifiedEmail:'recruiter@example.com',accepted:true,version:FEE_VERSION,now:NOW});
 assert.equal(yes.ok,true);
 const dupe=await acceptRecruiterConnectFee({db,uid:UID,
  verifiedEmail:'recruiter@example.com',accepted:true,version:FEE_VERSION,now:NOW});
 assert.equal(dupe.duplicate,true);
 const gate={db,stripe,uid:UID,verifiedEmail:'recruiter@example.com',
  programEnabled:true,now:NOW};
 // An Operator already paid through Stripe must not be enrolled into a
 // second Recruiter Connect account, charged twice, or have the Operator's
 // payout schedule changed.
 db.rows.set('users/'+UID,{stripeAccountId:'acct_ExistingOperatorAccount123'});
 const dual=await hostedRecruiterOnboarding(gate);
 assert.equal(dual.reason,'operator_connect_already_exists_no_second_account');
 assert.equal(counter.accounts,0);
 assert.equal(counter.payoutConfigurations,0);
 assert.equal(db.rows.get('recruiter_accounts/'+UID).stripeRecruiterCreateStartedAt,undefined);
 db.rows.delete('users/'+UID);
 assert.equal((await hostedRecruiterOnboarding({...gate,programEnabled:false})).reason,'recruiter_program_off');
 let result=await hostedRecruiterOnboarding(gate);
 assert.equal(result.ok,true);
 assert.equal(result.bankDetailsCollectedBy,'stripe');
 assert.match(result.url,/^https:\/\/connect\.stripe\.com/);
 assert.equal(counter.accounts,1);
 result=await hostedRecruiterOnboarding(gate);
 assert.equal(result.ok,true);
 assert.equal(counter.accounts,1,'no second recruiter Stripe account');
 assert.equal(counter.payoutConfigurations,2,'manual payout schedule rechecked without second account creation');
 const verified=await verifyRecruiterBank({db,stripe,uid:UID,
  verifiedEmail:'recruiter@example.com',now:NOW});
 assert.equal(verified.ready,true);
 assert.equal(db.rows.get('recruiter_accounts/'+UID).providerRecipientRef,ACCOUNT);
 assert.equal(db.rows.get('recruiter_accounts/'+UID).taxReady,true,
  'actual Stripe-reported SSN verification permits payouts without a manual tax checkbox');
 assert.equal(db.rows.get('recruiter_accounts/'+UID).taxStatus,'stripe_tax_identity_verified');
 assert.equal((await verifyRecruiterBank({db,stripe,uid:UID,
  verifiedEmail:'other@example.com',now:NOW})).reason,'not_authorized');
 console.log('PASS Stripe recruiter identity, explicit $2 consent, hosted bank setup, repeated requests, provider verification, no fake tax eligibility or live money');
})().catch(e=>{console.error(e);process.exitCode=1;});
