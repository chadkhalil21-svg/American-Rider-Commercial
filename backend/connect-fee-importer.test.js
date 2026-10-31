'use strict';
const assert=require('node:assert/strict');
const {candidate,idFor,importPayoutFeeReport}=require('./connect-fee-importer');
const {REPORT}=require('./connect-fee-report-run');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
const day=Math.floor(Date.UTC(2026,9,30)/1000);
const row='ftxn_charge,po_Settled,Payout processing,0.48,0.00,USD,Connect,Connect,Payouts,balance,txn_ExactFee,payout';
const header='fee_transaction_id,incurred_by,fee_description,amount,tax,currency,suite,product,feature_name,settled_via,balance_transaction_id,incurred_by_type';
assert.deepEqual(candidate(Object.fromEntries(header.split(',').map((x,i)=>[x,row.split(',')[i]]))),
  {kind:'bank_payout',amountCents:48});
assert.equal(candidate({suite:'Payments',product:'Payments'}),null);
assert.equal(idFor({balance_transaction_id:'txn_A',fee_transaction_id:'ftxn_A',incurred_by:'po_A'}),
 idFor({balance_transaction_id:'txn_A',fee_transaction_id:'ftxn_A',incurred_by:'po_A'}));
class Ref{
 constructor(db,path){this.db=db;this.path=path;}
 async get(){const v=this.db.rows.get(this.path);return {exists:v!==undefined,data:()=>v};}
}
class Query{
 constructor(db,col){this.db=db;this.col=col;this.field=null;this.value=null;}
 where(k,op,v){assert.equal(op,'==');this.field=k;this.value=v;return this;}
 limit(v){this.max=v;return this;}
 async get(){const docs=[...this.db.rows].filter(([k,v])=>k.startsWith(this.col+'/')&&v[this.field]===this.value)
 .slice(0,this.max).map(([key,data])=>({id:key.split('/').pop(),data:()=>data}));return {docs};}
}
class Col{constructor(db,path){this.db=db;this.path=path;}doc(id){return new Ref(this.db,this.path+'/'+id);}where(k,op,v){return new Query(this.db,this.path).where(k,op,v);}}
const db={rows:new Map(),collection(p){return new Col(this,p);},
 async runTransaction(fn){let pending=[];const tx={get:ref=>ref.get(),create:(ref,data)=>pending.push([ref.path,data])};
 const v=await fn(tx);for(const [key,data] of pending){if(db.rows.has(key))throw Error('duplicate');db.rows.set(key,data);}return v;}};
db.rows.set('operator_connect_payouts/confirmed',{uid:'op_1',accountId:'acct_Operator',payoutId:'po_Settled',status:'paid',eventAt:day*1000});
db.rows.set('users/op_1',{stripeAccountId:'acct_Operator',stripeFeeConsent:{version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,accountMonthlyUsd:2,acceptedAt:(day-86400)*1000}});
let retrieved=0;
const stripe={reporting:{reportRuns:{retrieve:async(id)=>({id,report_type:REPORT,livemode:true,status:'succeeded',result:{id:'file_Exact'}})}},
balanceTransactions:{retrieve:async id=>{retrieved++;return {id,livemode:true,currency:'usd',type:'stripe_fee',reporting_category:'fee',net:-48,created:day+3600};}}};
(async()=>{
 const args={db,stripe,runId:'frr_Exact',csv:header+'\n'+row,now:(day+86400)*1000};
 const a=await importPayoutFeeReport(args);
 assert.equal(a.created,1);assert.equal(a.monthlyAccountFeesImported,0);
 const b=await importPayoutFeeReport(args);
 assert.equal(b.existing,1);assert.equal(db.rows.size,3);assert.equal(retrieved,2);
 const record=[...db.rows].find(([x])=>x.startsWith('operator_connect_fee_obligations/'))[1];
 assert.equal(record.providerFeeConfirmed,true);assert.equal(record.kind,'bank_payout');
 assert.equal(record.providerFeePayer,'application');
 const wrong={...stripe,balanceTransactions:{retrieve:async id=>({id,livemode:true,currency:'usd',type:'stripe_fee',reporting_category:'fee',net:-60,created:day+3600})}};
 const mismatch=await importPayoutFeeReport({...args,stripe:wrong,csv:header+'\n'+row.replace('ftxn_charge','ftxn_wrong')});
 assert.equal(mismatch.quarantined,1);
 const month=await importPayoutFeeReport({...args,csv:header+'\n'+row.replace('po_Settled','')});
 assert.equal(month.created,0);
 const refunded=await importPayoutFeeReport({...args,csv:header+'\n'+row.replace('0.48','-0.48')});
 assert.equal(refunded.created,0);
 console.log('PASS immutable evidence-only Connect payout fee import; duplicate, foreign, refund and mismatch quarantine; no network writes');
})().catch(e=>{console.error(e);process.exitCode=1});
