'use strict';
// Authoritative optional commission campaign. An accepted referral without a
// specifically approved, funded program never promises a commission.
const {economicsFor}=require('./economics');
const OFF=Object.freeze({enabled:false,reason:'not_commissioned'});
function fromConfig(read){
 const get=typeof read==='function'?read:()=>undefined;
 if(['AR_RECRUITER_FINANCE_ENABLED','AR_RECRUITER_PROGRAM_ENABLED',
      'AR_RECRUITER_LEGAL_SIGNOFF'].some(key=>get(key)!=='1'))
   return OFF;
 const perTravelCents=Number(get('AR_RECRUITER_APPROVED_RATE_CENTS'));
 const maxTravels=Number(get('AR_RECRUITER_APPROVED_MAX_TRAVELS'));
 const maxCents=Number(get('AR_RECRUITER_APPROVED_LIFETIME_CAP_CENTS'));
 const version=get('AR_RECRUITER_APPROVED_PROGRAM_VERSION');
 const agreementVersion=get('AR_RECRUITER_TERMS_VERSION');
 if(!Number.isSafeInteger(perTravelCents)||perTravelCents<1||perTravelCents>15||
    !Number.isSafeInteger(maxTravels)||maxTravels<1||maxTravels>10000||
    !Number.isSafeInteger(maxCents)||maxCents<perTravelCents||
    maxCents>150000||
    typeof version!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(version)||
    version==='proposed-v1'||typeof agreementVersion!=='string'||
    !/^[A-Za-z0-9._-]{4,64}$/.test(agreementVersion))
    return OFF;
 return Object.freeze({enabled:true,version,perTravelCents,maxTravels,
   maxCents,agreementVersion});
}
function fundingForRide(ride,program){
 if(!program?.enabled)return 0;
 const keys=['costCents','travelCostCents','governmentFeeCents','tollCents'];
 if(keys.some(x=>!Number.isSafeInteger(ride?.[x])||ride[x]<0))return 0;
 const platformFeeCents=ride.costCents-ride.travelCostCents-
   ride.governmentFeeCents-ride.tollCents;
 if(!Number.isSafeInteger(platformFeeCents)||platformFeeCents<0)return 0;
 let cost;
 try{cost=economicsFor({travelCostCents:ride.travelCostCents,
   platformFeeCents,governmentFeeCents:ride.governmentFeeCents,
   tollCents:ride.tollCents,cardCountry:ride.cardCountry||null});}
 catch{return 0;}
 if(cost.travelerPays!==ride.costCents)return 0;
 const surplus=cost.platformContributionCents-cost.requiredContributionCents;
 if(!Number.isSafeInteger(surplus)||surplus<program.perTravelCents)return 0;
 return Math.max(0,Math.min(30,program.perTravelCents*2,surplus));
}
module.exports={OFF,fromConfig,fundingForRide};
