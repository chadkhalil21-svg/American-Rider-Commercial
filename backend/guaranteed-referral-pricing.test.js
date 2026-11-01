'use strict';
// Off-by-default fee policy regression. No real Stripe charge, transfer or DB.
const assert=require('node:assert/strict');
const {quote}=require('./payments');
const {fundedRecruiterSnapshot}=require('./recruiter-reward-budget');
const {PROGRAM}=require('./referral-accrual');
const original=process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED;
try {
  delete process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED;
  const old=quote(5000,null,[],'US',0);
  assert.equal(old.appFee,290,'uncommissioned current price must not move');

  process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED='1';
  const q=quote(5000,null,[],'US',0);
  assert.equal(q.appFee,323,'both $0.15 rewards are explicitly priced');
  assert.equal(q.operatorGets,4950,'guarantee never reduces 99% gross Fare');
  assert.equal(q.travelerPays,5323,'quote is the only accepted Traveler Total');
  assert.equal(q._economics.referralReserveCents,30);
  assert(q._economics.platformContributionCents>=75);
  assert.equal(fundedRecruiterSnapshot({
    travelCostCents:5000,travelerPays:q.travelerPays,
    governmentFeeCents:0,tollCents:0,cardCountry:'US'
  },{enabled:true}).referralAvailableCents,30);

  for (const card of ['US','GB',null])
    for (const fare of [300,750,1250,1750,5000,10000,30000]) {
      const priced=quote(fare,null,[],card,0);
      assert.equal(priced.operatorGets,fare-Math.floor(fare*.01));
      assert.equal(priced._economics.referralReserveCents,30);
      assert(priced._economics.platformContributionCents>=75,
        'fee must cover both contracted rewards and baseline contribution');
      const budget=fundedRecruiterSnapshot({
        travelCostCents:fare,travelerPays:priced.travelerPays,
        governmentFeeCents:0,tollCents:0,cardCountry:card
      },{enabled:true});
      assert.deepEqual(budget,{
        referralAvailableCents:30,referralProgramVersion:PROGRAM.version
      });
    }

  const smart=quote(5000,{
    leg1FareCents:5000,leg1GovernmentFeeCents:0,leg1TollCents:0
  },[],'US',0);
  assert.equal(smart._economics.referralReserveCents,60,
    'two separately charged car legs require two commission reserves');
  assert(smart._economics.platformContributionCents>=150);
  console.log('PASS: guarded referral fee covers both roles, all issuer classes, two-leg economics, unchanged uncommissioned quote');
} finally {
  if(original===undefined)delete process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED;
  else process.env.AR_RECRUITER_MARGIN_GUARANTEE_ENABLED=original;
}
