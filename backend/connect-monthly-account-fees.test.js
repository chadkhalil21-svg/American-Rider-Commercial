'use strict';
const assert=require('node:assert/strict');
const {importMonthlyAccountFees,accountFeeRow,monthBounds,validatedReport}=require('./connect-monthly-account-fees');
const {planVerifiedConnectOffsets}=require('./connect-fee-offset-plan');
const {FEE_CONSENT_VERSION}=require('./connect-fee-consent');
const month='2026-09',bounds=monthBounds(month),now=Date.UTC(2026,9,31);
const first=bounds.start+3*86400000;
const consent={version:FEE_CONSENT_VERSION,approvedSeparatelyBilledFees:true,accountMonthlyUsd:2,acceptedAt:first-86400000};
const report={id:'frr_Signed',report_type:'platform_earnings.connected_accounts.1',livemode:true,
 status:'succeeded',parameters:{interval_start:bounds.start/1000,interval_end:bounds.end/1000},
 result:{id:'file_Signed'}};
assert.throws(()=>monthBounds('2026-13'),/bad billing/);
assert.throws(()=>validatedReport({...report,livemode:false},month,now),/verified mature/);
assert.throws(()=>validatedReport(report,month,bounds.end+86400000),/verified mature/);
assert.deepEqual(accountFeeRow({connected_account_id:'acct_First',currency:'usd',connect_monthly_active_account_fee_subtotal_amount:'2.00'}),
 {accountId:'acct_First',amountCents:200});
assert.equal(accountFeeRow({connected_account_id:'acct_First',currency:'usd',connect_monthly_active_account_fee_subtotal_amount:'2.01'}),null);
class Ref{
 constructor(db,p){this.db=db;this.path=p;}
 async get(){let v=this.db.store.get(this.path);return {exists:v!==undefined,data:()=>v};}
 collection(name){return new Col(this.db,this.path+'/'+name);}
}
class Col{
 constructor(db,p){this.db=db;this.path=p;}
 doc(id){return new Ref(this.db,this.path+'/'+id);}
 where(k,op,v){return new Query(this.db,this.path,k,v);}
}
class Query{
 constructor(db,p,k,v){this.db=db;this.path=p;this.k=k;this.v=v;}
 limit(n){this.n=n;return this;}
 async get(){return {docs:[...this.db.store].filter(([p,v])=>p.startsWith(this.path+'/')&&v[this.k]===this.v)
  .slice(0,this.n).map(([p,v])=>({id:p.split('/').pop(),data:()=>v}))};}
}
const db={store:new Map(),collection(p){return new Col(this,p);},
 async runTransaction(fn){const changes=[];const result=await fn({get:r=>r.get(),create:(r,v)=>changes.push([r.path,v])});
  for(const [p,v] of changes){assert.equal(db.store.has(p),false);db.store.set(p,v);}return result;}};
db.store.set('users/op_1',{stripeAccountId:'acct_First',stripeFeeConsent:consent});
db.store.set('operator_months/'+month+'/accounts/op_1',
 {verifiedPayoutCount:1,payoutSeen:true,firstPayoutAt:first});
const stripe={reporting:{reportRuns:{retrieve:async()=>report}}};
const header='connected_account_id,currency,connect_monthly_active_account_fee_subtotal_amount';
const csv=header+'\nacct_First,usd,2.00';
(async()=>{
 const req={db,stripe,runId:report.id,month,now,csv};
 const a=await importMonthlyAccountFees(req);
 assert.equal(a.created,1);
 const b=await importMonthlyAccountFees(req);
 assert.equal(b.existing,1);
 const [key,entry]=[...db.store].find(([k])=>k.startsWith('operator_connect_fee_obligations/'));
 assert.ok(key);assert.equal(entry.kind,'monthly_active_account');
 assert.equal(entry.amountCents,200);assert.equal(entry.source,'stripe_authenticated_platform_earnings_report');
 const plan=planVerifiedConnectOffsets({grossShareCents:10000,operatorId:'op_1',accountId:'acct_First',
   consent,obligations:[{id:key.split('/').pop(),...entry}],now});
 assert.equal(plan.withheldCents,200);assert.equal(plan.transferCents,9800);
 assert.equal(plan.allocations[0].providerBalanceTransactionId,null);
 assert.equal(plan.allocations[0].providerReportRunId,'frr_Signed');
 assert.equal(planVerifiedConnectOffsets({grossShareCents:10000,operatorId:'op_1',
   accountId:'acct_First',consent,obligations:[{id:'bad',...entry,providerReportRunId:'fake'}],now}).withheldCents,0);
 await assert.rejects(importMonthlyAccountFees({...req,csv:header+'\nacct_First,usd,1.50'}),
   /Monthly Stripe fee changed/);
 const old=db.store.get('users/op_1');
 db.store.set('users/op_1',{...old,stripeFeeConsent:{...consent,acceptedAt:first+1000}});
 const late=await importMonthlyAccountFees(req);
 assert.equal(late.quarantined,1);
 db.store.set('users/op_1',old);
 const duplicate=await importMonthlyAccountFees({...req,csv:header+'\nacct_First,usd,2.00\nacct_First,usd,2.00'});
 assert.equal(duplicate.created,0);assert.equal(duplicate.quarantined,1);
 console.log('PASS: verified monthly $2 Operator-account attribution, no retroactive fee, duplicate quarantine and once-only earnings offset');
})().catch(e=>{console.error(e);process.exitCode=1;});
