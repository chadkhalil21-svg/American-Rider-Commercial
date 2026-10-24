'use strict';
// One existing authenticated scheduler owns all recruit finance work.
// Due-only pages, no all-Travels scan. No provider money is moved in this file.
const {recordHeldAccrual}=require('./referral-accrual');
const {sweepMaturedCommissions}=require('./recruiter-commission-journal');
async function sweepRecruiterFinance({db,program,limit=15,now=Date.now()}={}){
 if(!program?.enabled)return {ok:true,disabled:true,processed:0};
 if(!db||!Number.isSafeInteger(limit)||limit<1||limit>50||
   !Number.isSafeInteger(now))return {ok:false,reason:'invalid_request'};
 try{
  const page=await db.collection('rides').where('referralAccrualPending','==',true)
   .limit(limit).get();
  let accrued=0,cleared=0,blocked=0;
  for(const item of page.docs||[]){
    // Invalid settlement, changed program version or refunded Travel must
    // not be marked processed. Reconciliation will restore or reverse it.
    if(item.data()?.referralProgramVersion!==program.version){blocked++;continue;}
    const result=await recordHeldAccrual({db,rideId:item.id,program,now});
    if(!result.ok){blocked++;continue;}
    try{
     await db.collection('rides').doc(item.id).update({
      referralAccrualPending:false,referralAccrualCheckedAt:now});
     cleared++;accrued+=result.events||0;
    }catch{blocked++;}
  }
  // After a completed Travel has aged past the contract hold, reconcile
  // the fixed-ID event into an AVAILABLE balance. No Stripe operation here.
  const maturity=await sweepMaturedCommissions({db,programVersion:program.version,
    limit,now,enabled:true});
  return {ok:maturity.ok,accrued,cleared,blocked,
    processed:(page.docs||[]).length,
    matured:maturity.available||0,maturityBlocked:maturity.blocked||0};
 }catch{return {ok:false,reason:'finance_sweep_unavailable'};}
}
module.exports={sweepRecruiterFinance};
