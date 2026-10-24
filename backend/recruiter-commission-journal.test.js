'use strict';
const assert=require('node:assert/strict');
const {HOLD_MS,matureCommission,reverseCommission,sweepMaturedCommissions}=require('./recruiter-commission-journal');
const now=Date.now(),uid='recruiter-synthetic-001',rideId='travel-synthetic-00001';
class FakeDb{
 constructor(){this.rows=new Map();this.writes=0;}
 collection(col){return {doc:id=>({path:col+'/'+id}),
  where:(f,op,v)=>({where:(f2,op2,v2)=>({limit:n=>({get:async()=>{
    const docs=[...this.rows.entries()].filter(([k,x])=>k.startsWith(col+'/')&&x[f]===v&&x[f2]<=v2).slice(0,n)
       .map(([k,x])=>({id:k.slice(col.length+1),data:()=>x}));
    return {docs};
  }})})})};}
 async runTransaction(fn){
  const writes=[];const tx={
   get:async ref=>{const x=this.rows.get(ref.path);return {exists:x!==undefined,data:()=>x};},
   create:(ref,x)=>writes.push(['create',ref.path,x]),
   update:(ref,x)=>writes.push(['update',ref.path,x]),
   set:(ref,x)=>writes.push(['set',ref.path,x])
  };
  const out=await fn(tx);
  for(const [action,path,x] of writes){
   if(action==='create'&&this.rows.has(path))throw Error('duplicate');
   if(action==='update'&&!this.rows.has(path))throw Error('missing');
   this.rows.set(path,action==='create'?x:{...(this.rows.get(path)||{}),...x});
   this.writes++;
  }
  return out;
 }
}
(async()=>{
const db=new FakeDb();
const approval={status:'approved',suspended:false,agreementAccepted:true,
 agreementAcceptedAt:now-HOLD_MS-3000,payoutEligibilityVerified:true};
db.rows.set('recruiter_approvals/'+uid,approval);
db.rows.set('recruiter_accounts/'+uid,{status:'approved',agreementAccepted:true,
 payoutEligibilityVerified:true,stripeRecruiterAccountId:'acct_Synthetic123456',
 verifiedEmail:'recruiter@example.test'});
db.rows.set('rides/'+rideId,{status:'completed',paymentIntentId:'pi_paid_sample',
 transferId:'tr_operator_sample',settledAt:now-HOLD_MS-2000,referralAvailableCents:30});
const ev=id=>({status:'held',programVersion:'approved-r1',travelId:rideId,
 inviterUid:uid,role:'operator',amountCents:15,createdAt:now-HOLD_MS-2000});
const a='event-synthetic-0001';
db.rows.set('referral_reward_events/'+a,ev(a));
const args={db,eventId:a,programVersion:'approved-r1',now};
assert.equal((await matureCommission({...args,now:now-HOLD_MS+1000})).ok,false,'not early');
const out=await matureCommission(args);
assert.equal(out.status,'available');
assert.equal(db.rows.get('recruiter_payables/'+a).bankPayoutStatus,'not_sent');
assert.equal(db.rows.get('recruiter_finance_summaries/'+uid).availableCents,15);
const writes=db.writes;
assert.equal((await matureCommission(args)).alreadyAvailable,true);
assert.equal(db.writes,writes,'replays must not write again');
assert.equal((await reverseCommission({db,eventId:a,reason:'refund',now})).status,'reversed');
assert.equal(db.rows.get('recruiter_finance_summaries/'+uid).availableCents,0);
assert.equal(db.rows.get('recruiter_payables/'+a).status,'reversed');
const after=db.writes;
assert.equal((await reverseCommission({db,eventId:a,reason:'refund',now})).alreadyReversed,true);
assert.equal(db.writes,after);
const b='event-synthetic-0002';
db.rows.set('referral_reward_events/'+b,ev(b));
assert.equal((await matureCommission({...args,eventId:b})).status,'available');
db.rows.set('recruiter_payables/'+b,{...db.rows.get('recruiter_payables/'+b),
 status:'transferred_to_provider',stripeTransferId:'tr_recruiter'});
assert.equal((await reverseCommission({db,eventId:b,reason:'dispute',now})).status,'recovery_required');
assert.equal(db.rows.get('recruiter_accounts/'+uid).payoutsFrozen,true);
assert.equal(db.rows.get('recruiter_payables/'+b).bankPayoutStatus,'recovery_required');
const c='event-synthetic-0003';
db.rows.set('referral_reward_events/'+c,ev(c));
assert.equal((await matureCommission({...args,eventId:c})).reason,'settlement_or_recruiter_not_ready');
db.rows.set('rides/'+rideId,{...db.rows.get('rides/'+rideId),refunded:true});
assert.equal((await matureCommission({...args,eventId:c})).ok,false);
assert.deepEqual(await sweepMaturedCommissions({db,programVersion:'approved-r1',now,enabled:false}),
 {ok:true,disabled:true,processed:0});
console.log('PASS recruiter 96-hour held to available, immutable journal, one-time replay, refundable reversal, recovery freeze and safe disabled sweep');
})().catch(err=>{console.error(err);process.exitCode=1});
