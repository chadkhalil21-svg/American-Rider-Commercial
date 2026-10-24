'use strict';
// Founder-approved Recruiter settlement timing. Pure UTC arithmetic, no worker or reads.
// Never turn a ledger record into permission to transfer funds.
const DAY_MS=86400000;
const RESIDUAL_DAYS=90;
function nextMonthlyPayoutAt(now){
 if(!Number.isSafeInteger(now)||now<=0)return null;
 const d=new Date(now);
 const ms=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);
 return Number.isSafeInteger(ms)&&ms>now?ms:null;
}
function nextRecruiterCandidateAt({now,grossCents,minimumCents}={}){
 if(!Number.isSafeInteger(now)||now<=0||
    !Number.isSafeInteger(grossCents)||grossCents<0||
    !Number.isSafeInteger(minimumCents)||minimumCents<=200)return null;
 return grossCents>=minimumCents?nextMonthlyPayoutAt(now):
    now+RESIDUAL_DAYS*DAY_MS;
}
function residualCloseoutDue({candidate,now,grossCents,minimumCents}={}){
 return Number.isSafeInteger(now)&&now>0&&
  Number.isSafeInteger(grossCents)&&grossCents>0&&grossCents<minimumCents&&
  Number.isSafeInteger(candidate?.lastEligibleRewardAt)&&
  candidate.lastEligibleRewardAt>0&&
  now-candidate.lastEligibleRewardAt>=RESIDUAL_DAYS*DAY_MS&&
  Number.isSafeInteger(candidate?.nextAttemptAt)&&candidate.nextAttemptAt<=now;
}
module.exports={DAY_MS,RESIDUAL_DAYS,nextMonthlyPayoutAt,nextRecruiterCandidateAt,residualCloseoutDue};
