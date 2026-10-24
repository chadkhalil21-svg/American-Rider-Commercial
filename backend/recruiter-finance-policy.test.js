'use strict';
const assert=require('node:assert/strict');
const {fromConfig,fundingForRide}=require('./recruiter-finance-policy');
const config={
 AR_RECRUITER_FINANCE_ENABLED:'1',AR_RECRUITER_PROGRAM_ENABLED:'1',
 AR_RECRUITER_LEGAL_SIGNOFF:'1',
 AR_RECRUITER_APPROVED_RATE_CENTS:'15',
 AR_RECRUITER_APPROVED_MAX_TRAVELS:'200',
 AR_RECRUITER_APPROVED_LIFETIME_CAP_CENTS:'3000',
 AR_RECRUITER_APPROVED_PROGRAM_VERSION:'contract2026v1',
 AR_RECRUITER_TERMS_VERSION:'contract2026v1',
};
const from=o=>fromConfig(k=>o[k]);
assert.equal(from({...config,AR_RECRUITER_LEGAL_SIGNOFF:'0'}).enabled,false);
assert.equal(from({...config,AR_RECRUITER_APPROVED_RATE_CENTS:'35'}).enabled,false);
assert.equal(from({...config,AR_RECRUITER_APPROVED_PROGRAM_VERSION:'proposed-v1'}).enabled,false);
assert.equal(from({...config,AR_RECRUITER_TERMS_VERSION:''}).enabled,false);
const p=from(config);
assert.equal(p.enabled,true);
const ride={travelCostCents:1750,costCents:2000,governmentFeeCents:0,tollCents:0,cardCountry:'US'};
assert.equal(fundingForRide(ride,p),30,'two 15-cent rewards fit within original 75-cent min margin');
assert.equal(fundingForRide({...ride,cardCountry:'GB'},p),0,'international card fee must not erase minimum');
assert.equal(fundingForRide({...ride,costCents:1000},p),0,'client-price mismatch must not fund rewards');
assert.equal(fundingForRide({...ride,tollCents:undefined},p),0,'unknown charges cannot fund');
assert.equal(fundingForRide(ride,{enabled:false}),0);
console.log('PASS Founder-only commission authority, fee reserve, international-card preservation and zero rewards before approval');
