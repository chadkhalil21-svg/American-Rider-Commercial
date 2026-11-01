'use strict';
const assert=require('node:assert/strict');
const {submitOperatorReferralTransfer,reconcileOperatorReferralBankPayout,
 flagOperatorAutomaticBankReturn}=require('./recruiter-operator-transfers');
const UID='manual-operator-recruited-001',ACC='acct_OperatorRef1234567',
 BATCH='operator-commission-batch-001',EVENT='qualified_operator_role_001',
 PY='py_OperatorTransfer123456',PO='po_AutoPayout123456',NOW=Date.now();
class Db{
 constructor(){this.rows=new Map();this.queryReads=0;this.writes=0;}
 collection(col){
  const db=this;
  function query(conditions){
   return {
    where(field,_op,value){return query([...conditions,[field,value]]);},
    limit(n){return {get:async()=>{
     db.queryReads++;
     const docs=[...db.rows]
      .filter(([path,record])=>path.startsWith(col+'/')&&
       conditions.every(([key,value])=>record[key]===value))
      .slice(0,n).map(([path,record])=>({
       id:path.slice(col.length+1),data:()=>structuredClone(record),
      }));
     return {docs};
    }};},
   };
  }
  return {
   doc:id=>({path:col+'/'+id,get:async()=>db.snap(col+'/'+id)}),
   where(field,_op,value){return query([[field,value]]);},
  };
 }
 snap(p){const x=this.rows.get(p);return {exists:x!==undefined,data:()=>structuredClone(x)};}
 async runTransaction(fn){const writes=[];const tx={
  get:async r=>this.snap(r.path),
  create:(r,v)=>writes.push(['create',r.path,v]),
  update:(r,v)=>writes.push(['update',r.path,v]),
  set:(r,v)=>writes.push(['set',r.path,v]),
 };
 const out=await fn(tx);
 for(const [op,p] of writes)if(op==='create'&&this.rows.has(p))throw Error('dupe');
 for(const [op,p,v] of writes){this.rows.set(p,{...this.rows.get(p),...v});this.writes++;}
 return out;}
 put(p,v){this.rows.set(p,v);}
 at(p){return this.rows.get(p);}
}
(async()=>{
 const db=new Db();
 db.put('users/'+UID,{stripeAccountId:ACC});
 db.put('recruiter_accounts/'+UID,{
  status:'approved',verifiedEmail:'operator@example.com',agreementAccepted:true,
  bankProvider:'stripe_connect',bankVerified:true,taxReady:true,identityVerified:true,
  payoutEligibilityVerified:true,providerRecipientRef:ACC,payoutMode:'existing_operator_connect',
  providerRecipientStatus:'active',
 });
 db.put('recruiter_approvals/'+UID,{
  status:'approved',suspended:false,payoutEligibilityVerified:true,agreementAccepted:true,
 });
 db.put('recruiter_commission_payouts/'+BATCH,{
  uid:UID,payoutMode:'existing_operator_connect',provider:'stripe_connect',
  recipientRef:ACC,status:'reserved',amountCents:3000,grossCents:3000,
  netCents:3000,feeCents:0,currency:'usd',eventIds:[EVENT],
  feeMonth:new Date(NOW).toISOString().slice(0,7).replace('-',''),
 });
 db.put('referral_reward_events/'+EVENT,{inviterUid:UID,status:'reserved',payoutBatchId:BATCH,
  amountCents:3000,requiresRecovery:false});
 db.put('recruiter_commission_wallets/'+UID,{
  availableCents:0,reservedCents:3000,paidCents:0,reversedCents:0,recoveryDueCents:0});
 let transfer=null,available=0,txIncluded=false,transferWrites=0,bankCreates=0,payoutUpdates=0,accountCreates=0;
 const stripe={
  accounts:{retrieve:async()=>({id:ACC,metadata:{uid:UID},type:'express',country:'US',
   payouts_enabled:true,details_submitted:true,capabilities:{transfers:'active'},
   requirements:{currently_due:[],past_due:[]},settings:{payouts:{schedule:{interval:'manual'}}}}),
   update:async()=>{payoutUpdates++;},create:async()=>{accountCreates++;}},
  balance:{retrieve:async()=>({available:[{currency:'usd',amount:available}]})},
  transfers:{
    retrieve:async transferId=>transferId===transfer?.id?structuredClone(transfer):null,
   list:async()=>({data:transfer?[transfer]:[],has_more:false}),
   create:async(x,options)=>{transferWrites++;
    assert.equal(options.idempotencyKey,'ar_rec_'+BATCH);
    assert.equal(x.destination,ACC);assert.equal(x.amount,3000);
    assert.equal(x.metadata.ar_relationship,'operator_referrer');
    transfer={id:'tr_OperatorTransfer123456',destination_payment:PY,
      amount:3000,currency:'usd',destination:ACC,transfer_group:x.transfer_group,
      metadata:x.metadata,amount_reversed:0,reversed:false};
    return transfer;},
  },
  payouts:{create:async()=>{bankCreates++;throw Error('never call create payout')}},
  balanceTransactions:{list:async(x,opts)=>{
   assert.equal(opts.stripeAccount,ACC);assert.equal(x.payout,PO);
   return {data:txIncluded?[{id:'txn_OperatorReward12345',source:PY,
    currency:'usd',net:3000}]:[],has_more:false};
  }},
 };
 const args={db,stripe,batchId:BATCH,now:NOW,moneyAuthorized:true,
  providerApproved:true,operatorSharedApproved:true};
 const closed=await submitOperatorReferralTransfer({...args,operatorSharedApproved:false});
 assert.equal(closed.reason,'operator_recruiter_money_off');assert.equal(db.writes,0);
 assert.equal((await submitOperatorReferralTransfer(args)).status,'awaiting_platform_funds');
 assert.equal(transferWrites,0);
 available=6000;
 const sent=await submitOperatorReferralTransfer(args);
 assert.equal(sent.status,'credited_to_operator_stripe');
 assert.equal(sent.feeCents,0);assert.equal(transferWrites,1);
 assert.equal((await submitOperatorReferralTransfer(args)).status,'paid');
 assert.equal(transferWrites,1);
 assert.equal(bankCreates,0);assert.equal(accountCreates,0);assert.equal(payoutUpdates,0);
 const payout=db.at('recruiter_commission_payouts/'+BATCH);
 assert.equal(payout.status,'paid','verified Stripe balance credit fulfills shared-account referral');
 assert.equal(payout.settlementBoundary,'connected_stripe_balance');
 assert.equal(payout.bankPaid,false,'never imply Operator made a bank withdrawal');
 assert.equal(db.at('recruiter_commission_wallets/'+UID).paidCents,3000);
 assert.equal(db.at('recruiter_commission_wallets/'+UID).netPaidCents,3000);
 assert.equal(db.at('recruiter_commission_wallets/'+UID).reservedCents,0);
 assert.equal(db.at('referral_reward_events/'+EVENT).status,'paid');
 assert.equal(transferWrites,1,'retries cannot credit an Operator twice');
 assert.equal(bankCreates,0,'manual withdrawal remains the Operator’s decision');
 assert.equal(accountCreates,0,'no second Connect account for referral');
 assert.equal(payoutUpdates,0,'referral must not change the payout cadence');
 console.log('PASS manual Stripe balance credit, idempotence, bankPaid=false, no second Connect account or bank payout');
})().catch(e=>{console.error(e);process.exitCode=1;});
