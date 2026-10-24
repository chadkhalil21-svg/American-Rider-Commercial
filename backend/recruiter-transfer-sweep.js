'use strict';
// Automatic, bounded, due-only recruiter transfers on the existing production
// scheduler. Enrollment/tax/program/provider gates remain OFF until commissioned.
const {transferRecruiterCommission}=require('./recruiter-connect-finance');
const INTERVAL=60*60*1000;
async function sweepRecruiterTransfers({db,stripe,program,enabled=false,
 now=Date.now(),limit=10}={}){
 if(!program?.enabled||enabled!==true)return {ok:true,disabled:true,processed:0};
 if(!db||!stripe||!Number.isSafeInteger(now)||
    !Number.isSafeInteger(limit)||limit<1||limit>20)
  return {ok:false,reason:'invalid_request'};
 try{
  const rows=await db.collection('recruiter_payables')
   .where('status','==','available')
   .where('nextAttemptAt','<=',now).limit(limit).get();
  let paidToProvider=0,blocked=0;
  for(const row of rows.docs||[]){
   const x=await transferRecruiterCommission({
    db,stripe,payableId:row.id,now,programEnabled:true,legalApproved:true,
   });
   if(x.ok){if(!x.alreadyTransferred)paidToProvider++;continue;}
   blocked++;
   // Failures are NOT paid. Reschedule read-only provider reconciliation,
   // never automatically create another transfer after an uncertain attempt.
   const ref=db.collection('recruiter_payables').doc(row.id);
   try{
    await db.runTransaction(async tx=>{
     const snap=await tx.get(ref);
     if(!snap.exists||snap.data().status!=='available')return false;
     tx.update(ref,{nextAttemptAt:now+INTERVAL,
      lastTransferStatus:x.reason||'needs_reconciliation'});
     return true;
    });
   }catch{/* next due retry stays safe under fixed provider attempt ID */}
  }
  return {ok:true,processed:(rows.docs||[]).length,
   transferredToProvider:paidToProvider,blocked};
 }catch{return {ok:false,reason:'transfer_sweep_unavailable'};}
}
module.exports={sweepRecruiterTransfers,INTERVAL};
