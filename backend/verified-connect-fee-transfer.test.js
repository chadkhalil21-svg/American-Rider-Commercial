'use strict';
const assert=require('node:assert/strict');
const {transferOnce}=require('./payout-transfer-guard');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
const RIDE='b'.repeat(40),PI='pi_synthetic',ACCOUNT='acct_FeeTest',CHARGE='ch_synthetic';
const now=Date.UTC(2026,9,20);
class DB{
 constructor(){this.data=new Map();this.writes=0;this.chain=Promise.resolve();}
 collection(path){return new Collection(this,path);}
 async runTransaction(fn){
  const run=async()=>{
   const writes=[];const tx={
    get:async x=>x instanceof Query?x.get():x.get(),
    create:(ref,value)=>writes.push(['create',ref.key,value]),
    set:(ref,value,opts)=>writes.push(['set',ref.key,value,opts])
   };
   const result=await fn(tx);
   for(const [mode,key,value,opts] of writes){
    if(mode==='create'&&this.data.has(key))throw Error('duplicate ledger claim');
    this.data.set(key,opts?.merge?{...(this.data.get(key)||{}),...value}:value);
    this.writes++;
   }
   return result;
  };
  const promise=this.chain.then(run,run);this.chain=promise.catch(()=>{});return promise;
 }
}
class Ref{
 constructor(db,key){this.db=db;this.key=key;this.id=key.split('/').pop();}
 async get(){const data=this.db.data.get(this.key);return {exists:!!data,id:this.id,ref:this,data:()=>data};}
}
class Collection{
 constructor(db,path){this.db=db;this.path=path;}
 doc(id){return new Ref(this.db,this.path+'/'+id);}
 where(key,op,value){return new Query(this.db,this.path,[{key,op,value}]);}
}
class Query{
 constructor(db,path,filters=[]){this.db=db;this.path=path;this.filters=filters;this.max=50;this.sort=null;}
 where(key,op,value){this.filters.push({key,op,value});return this;}
 orderBy(key){this.sort=key;return this;}
 limit(n){this.max=n;return this;}
 async get(){
  let docs=[...this.db.data.entries()].filter(([key])=>key.startsWith(this.path+'/') &&
   !key.slice(this.path.length+1).includes('/')).map(([key,data])=>({
    id:key.slice(this.path.length+1),ref:new Ref(this.db,key),data:()=>data,exists:true}));
  for(const f of this.filters)docs=docs.filter(d=>{
   if(f.op!=='==')throw Error('unsupported mock filter');
   return d.data()[f.key]===f.value;
  });
  if(this.sort)docs.sort((a,b)=>a.data()[this.sort]-b.data()[this.sort]);
  return {docs:docs.slice(0,this.max)};
 }
}
function setup({confirmed=true,consented=true,feeAmount=200}={}){
 const db=new DB();
 db.data.set('rides/'+RIDE,{status:'completed',payoutLedgerVersion:1,
   travelerUid:'traveler',operatorId:'op',paymentIntentId:PI});
 db.data.set('users/op',{stripeAccountId:ACCOUNT,stripeFeeConsent:consented?{
   version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,accountMonthlyUsd:2,
   acceptedAt:now-86400000}:null});
 db.data.set('operator_connect_fee_obligations/fee1',{
   uid:'op',accountId:ACCOUNT,status:'due',currency:'usd',kind:'monthly_active_account',
   source:'stripe_authenticated_balance_transaction',
   providerBalanceTransactionId:'txn_RealSyntheticProviderReceipt',
   providerFeeConfirmed:confirmed,providerFeePayer:'application',
   pricingOwnerConfirmed:true,feePaidDirectlyByOperator:false,
   amountCents:feeAmount,recoveredCents:0,incurredAt:now-1000
 });
 let transfers=[],created=0;
 const args={db,rideId:RIDE,paymentIntentId:PI,expectedUid:'traveler',
   operatorStripeAccount:ACCOUNT,chargeId:CHARGE,amountCents:10000,platformTake:250,now,
   async findTransfers(group){return {data:transfers.filter(x=>x.transfer_group===group),has_more:false};},
   async createTransfer(group,amountCents){
    const v={id:'tr_'+(++created),currency:'usd',amount:amountCents,
      destination:ACCOUNT,source_transaction:CHARGE,transfer_group:group,
      metadata:{rideId:RIDE,paymentIntentId:PI},reversed:false,amount_reversed:0};
    transfers.push(v);return v;
   }
 };
 return {db,args,get created(){return created;},get transfers(){return transfers;}};
}
(async()=>{
 const old=process.env.CONNECT_VERIFIED_FEE_RECOVERY;
 try{
  delete process.env.CONNECT_VERIFIED_FEE_RECOVERY;
  const disabled=setup(),none=await transferOnce(disabled.args);
  assert.equal(none.ok,true);assert.equal(none.amountCents,10000);
  assert.equal(disabled.db.data.get('operator_connect_fee_obligations/fee1').status,'due');
  process.env.CONNECT_VERIFIED_FEE_RECOVERY='enabled';
  const x=setup();
  const first=await transferOnce(x.args),second=await transferOnce(x.args);
  assert.equal(first.ok,true);assert.equal(first.operatorGets,10000);
  assert.equal(first.amountCents,9800);assert.equal(first.feeWithheldCents,200);
  assert.equal(second.ok,true);assert.equal(x.created,1);
  assert.equal(x.transfers[0].amount,9800);
  const collected=x.db.data.get('operator_connect_fee_obligations/fee1');
  assert.equal(collected.status,'collected');assert.equal(collected.recoveredCents,200);
  assert.equal(collected.collectedTransferId,'tr_1');
  assert.equal(x.db.data.get('rides/'+RIDE).operatorGrossCents,10000);
  assert.equal(x.db.data.get('rides/'+RIDE).operatorPaidCents,9800);
  const noProof=setup({confirmed:false}),noProofOut=await transferOnce(noProof.args);
  assert.equal(noProofOut.amountCents,10000);assert.equal(noProofOut.feeWithheldCents,0);
  const noConsent=setup({consented:false}),noConsentOut=await transferOnce(noConsent.args);
  assert.equal(noConsentOut.amountCents,10000);
  const partial=setup({feeAmount:12000}),partialOut=await transferOnce(partial.args);
  assert.equal(partialOut.amountCents,1);assert.equal(partialOut.feeWithheldCents,9999);
  assert.equal(partial.db.data.get('operator_connect_fee_obligations/fee1').status,'due');
  assert.equal(partial.db.data.get('operator_connect_fee_obligations/fee1').recoveredCents,9999);
  console.log('PASS: disabled by default; synthetic verified Connect fees offset net earnings exactly once with consent and gross 99% accounting');
 }finally{
  if(old===undefined)delete process.env.CONNECT_VERIFIED_FEE_RECOVERY;
  else process.env.CONNECT_VERIFIED_FEE_RECOVERY=old;
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
