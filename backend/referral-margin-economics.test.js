'use strict';
// Off-by-default referral margin scenarios. No Stripe, Firestore, API calls or quote changes.
const assert=require('node:assert/strict');
const {economicsFor, feeIsSufficient, minimumPlatformFeeCents,
  MIN_PLATFORM_CONTRIBUTION_CENTS}=require('./economics');
const args={travelCostCents:1750,platformFeeCents:250};
for(const cardCountry of ['US','GB',null]){
  const base=economicsFor({...args,cardCountry});
  const noReferral=economicsFor({...args,cardCountry,referralReserveCents:0});
  assert.deepEqual(base,noReferral,'existing production quotes must be unchanged');
  const one=economicsFor({...args,cardCountry,referralReserveCents:15});
  const both=economicsFor({...args,cardCountry,referralReserveCents:30});
  assert.equal(one.platformContributionCents,base.platformContributionCents-15);
  assert.equal(both.platformContributionCents,base.platformContributionCents-30);
  assert.equal(one.operatorGets,base.operatorGets,'never touch 99% of Fare');
  assert.equal(both.operatorGets,base.operatorGets,'never touch 99% of Fare');
  assert.equal(one.travelerPays,base.travelerPays,
    'scenario reserve alone must not silently raise displayed Total');
  const raised=minimumPlatformFeeCents({
    travelCostCents:1750,cardCountry,referralReserveCents:30,
  });
  assert(raised>=250);
  assert(feeIsSufficient({
    travelCostCents:1750,platformFeeCents:raised,cardCountry,referralReserveCents:30,
  }), 'optional referral-aware minimum fee must preserve the original minimum margin');
  const costed=economicsFor({
    travelCostCents:1750,platformFeeCents:raised,cardCountry,referralReserveCents:30,
  });
  assert(costed.platformContributionCents>=MIN_PLATFORM_CONTRIBUTION_CENTS);
}
const domestic=economicsFor({...args,cardCountry:'US'});
const foreign=economicsFor({...args,cardCountry:'GB'});
assert.equal(domestic.platformContributionCents,114);
assert.equal(foreign.platformContributionCents,84);
assert.equal(economicsFor({...args,cardCountry:'US',referralReserveCents:30}).platformContributionCents,84);
assert.equal(economicsFor({...args,cardCountry:'GB',referralReserveCents:30}).platformContributionCents,54);
assert.equal(feeIsSufficient({...args,cardCountry:'GB',referralReserveCents:30}),false);
for(const amount of [-1,31,0.25,NaN,Infinity,'30',null]){
  assert.throws(()=>economicsFor({...args,referralReserveCents:amount}),/referralReserveCents/);
}
console.log('PASS: opt-in zero/one/dual referral budget protects 99% Fare, 75c margin and all unchanged quotes');
