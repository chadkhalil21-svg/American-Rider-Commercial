'use strict';
const assert=require('node:assert/strict');
const {sweepRecruiterFinance}=require('./recruiter-finance-queue');
const {HOLD_MS}=require('./recruiter-commission-journal');
const NOW=Date.now()-1000;
class DB {
 constructor(){this.rows=new Map();this.writes=0;}
 snap(key){const value=this.rows.get(key);return {exists:value!==undefined,data:()=>value};}
 collection(c){const db=this;return{
  doc:id=>{const key=c+'/'+id;return {path:key,
   get:async()=>db.snap(key),
   update:async x=>{db.rows.set(key,{...db.rows.get(key),...x});db.writes++;}
  };},
  where(field,op,value){const terms=[[field,op,value]];return chain(terms);}
 };
 function chain(terms){return{
   where(f,o,v){return chain([...terms,[f,o,v]]);},
   limit(n){return {get:async()=>{
    const docs=[...db.rows.entries()].filter(([k,x])=>k.startsWith(c+'/')
      &&terms.every(([f,o,v])=>o==='=='?x[f]===v:o==='<='?x[f]<=v:false))
      .slice(0,n).map(([key,x])=>({id:key.slice(c.length+1),data:()=>x}));
    return {docs};
   }};}
  };}
 }
 async runTransaction(fn){
  const writes=[];const tx={
   get:async ref=>this.snap(ref.path),
   create:(ref,x)=>writes.push(['create',ref.path,x]),
   update:(ref,x)=>writes.push(['update',ref.path,x]),
   set:(ref,x)=>writes.push(['set',ref.path,x]),
  };
  const result=await fn(tx);
  for(const [action,key,x] of writes){
   if(action==='create'&&this.rows.has(key))throw Error('duplicate');
   if(action==='update'&&!this.rows.has(key))throw Error('missing');
   this.rows.set(key,action==='create'?x:{...(this.rows.get(key)||{}),...x});
   this.writes++;
  }
  return result;
 }
}
(async()=>{
 const db=new DB(),ride='ride-synthetic-001',op='operator-fixture',
  traveler='traveler-fixture',recruiter='recruiter-fixture',
  program={enabled:true,perTravelCents:15,maxTravels:200,
   maxCents:3000,version:'approved-2026-v1'};
 db.rows.set('rides/'+ride,{status:'completed',operatorId:op,travelerUid:traveler,
  paymentIntentId:'pi_paid',paidAt:NOW-5000,transferId:'tr_operator',
  settledAt:NOW-5000,referralAvailableCents:30,
  referralAccrualPending:true,referralProgramVersion:program.version});
 db.rows.set('referral_attributions/'+op+'_operator',{role:'operator',
  inviteeUid:op,inviterUid:recruiter,rewardEnabled:true,
  programVersion:program.version,qualifiedTravels:0,earnedCents:0});
 db.rows.set('recruiter_accounts/'+recruiter,{status:'approved',
  agreementAccepted:true,payoutEligibilityVerified:true,
  stripeRecruiterAccountId:'acct_Synthetic123456'});
 db.rows.set('recruiter_approvals/'+recruiter,{
  status:'approved',suspended:false,agreementAccepted:true,
  agreementAcceptedAt:NOW-10000,payoutEligibilityVerified:true});
 let x=await sweepRecruiterFinance({db,program,now:NOW});
 assert.equal(x.ok,true);
 assert.equal(x.accrued,1);assert.equal(x.cleared,1);
 assert.equal(db.rows.get('rides/'+ride).referralAccrualPending,false);
 const eventId=ride+'_operator';
 assert.equal(db.rows.get('referral_reward_events/'+eventId).status,'held');
 const before=db.writes;
 x=await sweepRecruiterFinance({db,program,now:NOW+1000});
 assert.equal(x.ok,true);assert.equal(x.accrued,0);
 assert.equal(db.writes,before,'no work without due event');
 // Advance both the settlement and event maturity beyond the 96-hour hold.
 db.rows.set('rides/'+ride,{...db.rows.get('rides/'+ride),
  settledAt:NOW-HOLD_MS-10000});
 x=await sweepRecruiterFinance({db,program,now:NOW+HOLD_MS+11000});
 assert.equal(x.ok,true);assert.equal(x.matured,1);
 assert.equal(db.rows.get('recruiter_payables/'+eventId).amountCents,15);
 assert.equal(db.rows.get('recruiter_finance_summaries/'+recruiter).availableCents,15);
 const after=db.writes;
 await sweepRecruiterFinance({db,program,now:NOW+HOLD_MS+13000});
 assert.equal(db.writes,after,'repeated sweeps do not duplicate payables');
 assert.equal((await sweepRecruiterFinance({db,program:{enabled:false},now:NOW})).disabled,true);
 console.log('PASS one recruiter settlement, fixed event, 96-hour maturation, zero repeat writes, existing one-clock guarded queue');
})().catch(e=>{console.error(e);process.exitCode=1});
