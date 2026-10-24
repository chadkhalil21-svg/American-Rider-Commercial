'use strict';
const assert=require('node:assert/strict');
const {recordSettledTravel,sweepSettledTravelActivity,recruiterSettlementCounts}=require('./recruiter-travel-activity');
const NOW=Date.UTC(2026,9,24);
class DB{
 constructor(){this.rows=new Map();}
 collection(c){const db=this;return {
  doc(id){const k=c+'/'+id;return {key:k,
   async get(){const v=db.rows.get(k);return {exists:v!==undefined,data:()=>v};}
  };},
  where(field,op,value){assert.equal(op,'==');return {
   limit(n){return {async get(){const docs=[...db.rows].filter(([k,v])=>k.startsWith(c+'/')&&v[field]===value)
     .slice(0,n).map(([k,v])=>({id:k.slice(c.length+1),data:()=>v}));return {docs};}};},
   count(){return {async get(){const count=[...db.rows].filter(([k,v])=>k.startsWith(c+'/')&&v[field]===value).length;return {data:()=>({count})};}};}
  };}
 };}
 async runTransaction(callback){
   const changes=[],tx={
    get:r=>r.get(),
    create:(r,v)=>changes.push({r,v,op:'create'}),
    update:(r,v)=>changes.push({r,v,op:'update'}),
   };
   const result=await callback(tx);
   for(const x of changes){
    const old=this.rows.get(x.r.key);
    if(x.op==='create'&&old)throw Error('duplicate');
    if(x.op==='update'&&!old)throw Error('missing');
    this.rows.set(x.r.key,x.op==='update'?{...old,...x.v}:x.v);
   }
   return result;
 }
}
(async()=>{
 const db=new DB(),rideId='travel-123456';
 const ride={referralTrackingPending:true,status:'completed',
  operatorId:'operator-one',travelerUid:'traveler-one',paymentIntentId:'pi_123',
  transferId:'tr_123',settledAt:NOW,paidAt:NOW,synthetic:false};
 db.rows.set('rides/'+rideId,ride);
 for(const [uid,role] of [['operator-one','operator'],['traveler-one','traveler']])
   db.rows.set('referral_attributions/'+uid+'_'+role,{
     inviterUid:'recruiter-one',inviteeUid:uid,role,claimedAt:NOW-3000});
 db.rows.set('recruiter_accounts/recruiter-one',{status:'approved'});
 assert.equal((await recordSettledTravel({db,rideId,now:NOW+1})).recorded,2);
 assert.equal(db.rows.get('rides/'+rideId).referralTrackingPending,false);
 assert.equal((await recordSettledTravel({db,rideId,now:NOW+2})).recorded,0,
   'replay must neither bill nor increase counter');
 assert.equal((await recruiterSettlementCounts({db,uid:'recruiter-one'})).operatorSettlementRecords,1);
 assert.equal((await recruiterSettlementCounts({db,uid:'recruiter-one'})).travelerSettlementRecords,1);
 assert.equal((await recruiterSettlementCounts({db,uid:'another-account'})).operatorSettlementRecords,0);
 const record=db.rows.get('recruiter_operator_settlements/'+rideId);
 assert.equal(record.commissionCents,null);
 assert.equal(record.payoutStatus,'not_commissioned');
 assert.equal(JSON.stringify(record).includes('address'),false);
 assert.equal(JSON.stringify(record).includes('costCents'),false);
 const pendingId='travel-123457';
 db.rows.set('rides/'+pendingId,{...ride,referralTrackingPending:true,transferId:null});
 assert.equal((await recordSettledTravel({db,rideId:pendingId})).reason,'settlement_not_verified');
 assert.equal(db.rows.get('rides/'+pendingId).referralTrackingPending,true);
 db.rows.set('rides/'+pendingId,{...ride,referralTrackingPending:true});
 const sweep=await sweepSettledTravelActivity({db,limit:20});
 assert.equal(sweep.recorded,2);
 assert.equal(sweep.blocked,0);
 assert.equal((await recruiterSettlementCounts({db,uid:'recruiter-one'})).operatorSettlementRecords,2);
 const refundId='travel-123458';
 db.rows.set('rides/'+refundId,{...ride,referralTrackingPending:true,refundPending:true});
 assert.equal((await recordSettledTravel({db,rideId:refundId})).reason,'settlement_not_verified');
 assert.equal(db.rows.get('rides/'+refundId).referralTrackingPending,true);
 console.log('PASS recruiter settled-Travel observations: authoritative settlement, scoped counters, replay, crash recovery and no cash accrual');
})().catch(e=>{console.error(e);process.exitCode=1;});
