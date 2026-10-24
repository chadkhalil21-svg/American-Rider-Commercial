'use strict';
const assert=require('node:assert/strict');
const {submitReservedRecruiterPayout,handleRecruiterConnectPayoutEvent}=require('./recruiter-stripe-payout');
const NOW=Date.now()-1e4,MONTH=new Date(NOW).toISOString().slice(0,7).replace('-','');
const UID='recruiter-test-001',ACCT='acct_RecruiterTest001',
BATCH='recruiter-batch-123456',EVENT='ride_2026_operator';
class Db{
 constructor(){this.rows=new Map();}
 collection(col){return {doc:id=>({
  path:col+'/'+id,get:async()=>this.snapshot(col+'/'+id),
 })};}
 snapshot(path){const v=this.rows.get(path);return {exists:v!==undefined,
  data:()=>v===undefined?undefined:structuredClone(v)};}
 async runTransaction(fn){
  const changes=[];
  const tx={
   get:async ref=>this.snapshot(ref.path),
   create:(ref,v)=>changes.push(['create',ref.path,v]),
   update:(ref,v)=>changes.push(['update',ref.path,v]),
   set:(ref,v)=>changes.push(['set',ref.path,v]),
  };
  const value=await fn(tx);
  for(const [act,p]of changes){
   if(act==='create'&&this.rows.has(p))throw Error('exists');
   if(act==='update'&&!this.rows.has(p))throw Error('missing');
  }
  for(const [,p,v]of changes)this.rows.set(p,{...(this.rows.get(p)||{}),...v});
  return value;
 }
 set(p,v){this.rows.set(p,v);}
 at(p){return this.rows.get(p);}
}
function fixtures(db,batch=BATCH){
 db.set('recruiter_accounts/'+UID,{status:'approved',bankVerified:true,
  bankProvider:'stripe_connect',taxReady:true,providerRecipientRef:ACCT,
  connectFeeConsentVersion:'recruiter_connect_2026_10_v1'});
 db.set('recruiter_approvals/'+UID,{status:'approved',suspended:false,
  payoutEligibilityVerified:true});
 db.set('recruiter_commission_payouts/'+batch,{
  uid:UID,provider:'stripe_connect',recipientRef:ACCT,
  amountCents:2700,grossCents:2700,feeCents:200,netCents:2500,
  feeDisclosureVersion:'recruiter_connect_2026_10_v1',
  status:'reserved',feeMonth:MONTH,eventIds:[EVENT],currency:'usd'});
 db.set('recruiter_connect_fee_months/'+UID+'_'+MONTH,{
  status:'reserved',batchId:batch,amountCents:200});
 db.set('referral_reward_events/'+EVENT,{inviterUid:UID,status:'reserved',
  payoutBatchId:batch,amountCents:2700,requiresRecovery:false});
 db.set('recruiter_commission_wallets/'+UID,{availableCents:0,
  reservedCents:2700,paidCents:0,reversedCents:0,recoveryDueCents:0});
}
function mockStripe(){
 const stats={transfers:0,payouts:0};
 let t=null,p=null,available=2500,platformAvailable=5000,wrongBank=false;
 const stripe={
  accounts:{retrieve:async()=>({id:ACCT,metadata:{ar_recruiter_uid:UID},
    type:'express',payouts_enabled:true,details_submitted:true,
    capabilities:{transfers:'active'},
    requirements:{currently_due:[],past_due:[]},
    settings:{payouts:{schedule:{interval:'manual'}}}})},
  transfers:{
   list:async()=>({data:t?[t]:[],has_more:false}),
   create:async x=>{stats.transfers++;
    t={id:'tr_2026_123456',amount:x.amount,currency:'usd',
      destination:x.destination,transfer_group:x.transfer_group,
      metadata:x.metadata,reversed:false,amount_reversed:0};
    return t;},
  },
  balance:{retrieve:async opts=>({available:[{
    currency:'usd',amount:opts?.stripeAccount?available:platformAvailable}]})},
  payouts:{
   list:async()=>({data:p?[p]:[],has_more:false}),
   create:async(x,opts)=>{stats.payouts++;
    assert.equal(opts.stripeAccount,ACCT);
    assert.equal(x.amount,2500);assert.equal(x.metadata.ar_recruiter_batch,BATCH);
    p={id:'po_2026_123456',amount:x.amount,currency:'usd',status:'pending',
      metadata:x.metadata};
    return p;},
  },
 };
 return {stripe,stats,setPlatform:value=>platformAvailable=value,
   setAvailable:value=>available=value,wrongBank:value=>wrongBank=value};
}
(async()=>{
 const db=new Db();fixtures(db);
 const fake=mockStripe();
 const args={db,stripe:fake.stripe,batchId:BATCH,now:NOW,
  moneyAuthorized:true,legalApproved:true,providerApproved:true};
 assert.equal((await submitReservedRecruiterPayout({...args,moneyAuthorized:false})).reason,'recruiter_money_off');
 assert.equal(fake.stats.transfers,0);
 fake.setPlatform(0);
 const unfunded=await submitReservedRecruiterPayout(args);
 assert.equal(unfunded.status,'awaiting_platform_funds');
 assert.equal(fake.stats.transfers,0);
 fake.setPlatform(5000);fake.setAvailable(0);
 const waiting=await submitReservedRecruiterPayout(args);
 assert.equal(waiting.status,'awaiting_stripe_funds');
 assert.equal(fake.stats.transfers,1);
 assert.equal(db.at('recruiter_commission_payouts/'+BATCH).status,'reserved');
 fake.setAvailable(2500);
 const submitted=await submitReservedRecruiterPayout(args);
 assert.equal(submitted.status,'submitted_bank_pending');
 assert.equal(submitted.bankPaid,false);
 assert.equal(submitted.netCents,2500);
 assert.equal(submitted.feeCents,200);
 assert.equal(fake.stats.transfers,1);
 assert.equal(fake.stats.payouts,1);
 assert.equal(db.at('recruiter_commission_payouts/'+BATCH).providerPaymentId,'po_2026_123456');
 assert.equal((await submitReservedRecruiterPayout(args)).status,'bank_payout_submitted');
 assert.equal(fake.stats.transfers,1);assert.equal(fake.stats.payouts,1);
 const invalid={id:'evt_2026_12345',type:'payout.paid',account:'acct_Forged123456',
  data:{object:{id:'po_2026_123456',amount:2500,currency:'usd',status:'paid',
   metadata:{ar_recruiter_batch:BATCH}}}};
 assert.equal((await handleRecruiterConnectPayoutEvent({db,event:invalid,now:NOW})).reason,
  'unmatched_signed_bank_payout');
 const confirmed={...invalid,account:ACCT};
 assert.equal((await handleRecruiterConnectPayoutEvent({db,event:confirmed,now:NOW})).status,'paid');
 assert.equal(db.at('recruiter_commission_wallets/'+UID).paidCents,2700);
 assert.equal(db.at('recruiter_commission_wallets/'+UID).netPaidCents,2500);
 assert.equal(db.at('recruiter_commission_wallets/'+UID).connectFeesPaidCents,200);
 assert.equal(db.at('recruiter_connect_fee_months/'+UID+'_'+MONTH).status,'collected');
 assert.equal((await handleRecruiterConnectPayoutEvent({db,event:confirmed,now:NOW})).duplicate,true);
 const failed={...confirmed,id:'evt_2026_56789',type:'payout.failed',
   data:{object:{...confirmed.data.object,status:'failed',failure_code:'account_closed'}}};
 assert.equal((await handleRecruiterConnectPayoutEvent({db,event:failed,now:NOW})).status,
  'bank_reconciliation_required');
 assert.equal(db.at('recruiter_commission_payouts/'+BATCH).bankPayoutFailed,true);
 assert.equal(db.at('recruiter_commission_wallets/'+UID).availableCents,0,
  'no double funded payout after failed bank deposit');
 const rolloverDb=new Db();fixtures(rolloverDb);
 const otherMonth=new Date(NOW+40*86400000).getTime();
 const rolled=await submitReservedRecruiterPayout({...args,db:rolloverDb,now:otherMonth});
 assert.equal(rolled.status,'rescheduled_for_current_month');
 assert.equal(rolled.netCents,2500);
 assert.equal(rolloverDb.at('recruiter_commission_payouts/'+BATCH).feeMonth,
   new Date(otherMonth).toISOString().slice(0,7).replace('-',''));
 assert.equal(rolloverDb.at('recruiter_connect_fee_months/'+UID+'_'+MONTH).status,
   'released','a former month cannot charge an inactive month');
 assert.equal(rolloverDb.at('recruiter_connect_fee_months/'+UID+'_'
   +new Date(otherMonth).toISOString().slice(0,7).replace('-','')).status,'reserved');
 assert.equal((await submitReservedRecruiterPayout({...args,db:rolloverDb,now:otherMonth}))
   .status,'awaiting_platform_funds','new month roll occurs once without a money call');
 console.log('PASS Stripe Recruiter payout end-to-end simulated: funded-only, Transfer vs bank payout, exact $2 fee, manual schedule, forged event rejection, successful proof and failed bank recovery hold; ZERO LIVE MONEY');
})().catch(e=>{console.error(e);process.exitCode=1;});
