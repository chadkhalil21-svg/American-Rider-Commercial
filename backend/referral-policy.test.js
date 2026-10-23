'use strict';
const assert=require('node:assert/strict');
const {normalizedCode,inviteLink,claimDecision,rewardDecision}=require('./referral-policy');
assert.equal(normalizedCode(' aBc12345 '),'ABC12345');
assert.equal(inviteLink('abc12345'),'https://americanrider.app/join?r=ABC12345');
for(const x of ['','A123','john@example.com','x/y','https://example.com','123456789012345678901234567890123'])
  assert.equal(normalizedCode(x),null);
for(const targetRole of ['operator','traveler']){
  assert.equal(claimDecision({referrerUid:'alice',inviteeUid:'bob',
    targetRole,referrerEligible:true}).ok,true);
  assert.equal(claimDecision({referrerUid:'alice',inviteeUid:'alice',
    targetRole,referrerEligible:true}).ok,false);
  assert.equal(claimDecision({referrerUid:'alice',inviteeUid:'bob',
    targetRole,referrerEligible:true,alreadyClaimed:true}).ok,false);
  assert.equal(claimDecision({referrerUid:'alice',inviteeUid:'bob',
    targetRole,referrerEligible:true,alreadyActivatedRole:true}).ok,false);
  assert.equal(claimDecision({referrerUid:'alice',inviteeUid:'bob',
    targetRole,referrerEligible:true,sharedIdentity:true}).ok,false);
  assert.equal(claimDecision({referrerUid:'alice',inviteeUid:'bob',
    targetRole,referrerEligible:false}).ok,false);
}
const program={enabled:true,perTravelCents:25,maxTravels:160,maxCents:4000};
const operator={targetRole:'operator',inviteeUid:'bob'};
const traveler={targetRole:'traveler',inviteeUid:'carol'};
const travel={id:'paid-1',status:'completed',paymentStatus:'captured',operatorUid:'bob',travelerUid:'carol'};
function decision(attribution=operator,changes={},args={}) {
  return rewardDecision({attribution,travel:{...travel,...changes},program,
    availableContributionCents:100,...args});
}
assert.equal(decision().rewardCents,25);
assert.equal(decision(traveler).rewardCents,25);
assert.equal(decision(operator,{operatorUid:'stranger'}).rewardCents,0);
assert.equal(decision(traveler,{travelerUid:'stranger'}).rewardCents,0);
for(const changes of [{status:'cancelled'},{paymentStatus:'authorized'},
  {refunded:true},{disputed:true},{synthetic:true},{id:''}])
  assert.equal(decision(operator,changes).rewardCents,0);
assert.equal(decision(operator,{}, {alreadyCredited:true}).rewardCents,0);
assert.equal(decision(operator,{}, {priorQualifiedTravels:160}).rewardCents,0);
assert.equal(decision(operator,{}, {earnedCents:4000}).rewardCents,0);
assert.equal(decision(operator,{}, {earnedCents:3985}).rewardCents,15);
assert.equal(decision(operator,{}, {availableContributionCents:24}).reason,'reward_not_funded');
assert.equal(decision(operator,{}, {availableContributionCents:0}).rewardCents,0);
assert.equal(rewardDecision({attribution:operator,travel,program:{...program,enabled:false},
  availableContributionCents:100}).rewardCents,0);
assert.equal(rewardDecision({attribution:operator,travel,availableContributionCents:100}).rewardCents,0);
const count=20000;
for(let i=0;i<count;i++){
  const r=decision(operator,{}, {priorQualifiedTravels:i%162,
    availableContributionCents:i%35,earnedCents:(i%170)*25});
  assert.ok(r.rewardCents>=0&&r.rewardCents<=25);
  if(r.eligible)assert.equal(r.rewardCents,25);
}
// A single Travel may reward either referred participant; their combined
// rewards must fit ONE shared remaining budget, never separate full budgets.
const op=decision(operator,{}, {availableContributionCents:35});
const tr=decision(traveler,{}, {availableContributionCents:35-op.rewardCents});
assert.equal(op.rewardCents,25);
assert.equal(tr.rewardCents,0);

const proposal={enabled:true,perTravelCents:15,maxTravels:200,maxCents:3000};
const maxed=rewardDecision({attribution:operator,travel,program:proposal,priorQualifiedTravels:199,earnedCents:2985,availableContributionCents:30});
assert.equal(maxed.rewardCents,15);
const capped=rewardDecision({attribution:operator,travel,program:proposal,priorQualifiedTravels:200,earnedCents:3000,availableContributionCents:30});
assert.equal(capped.rewardCents,0);
console.log('PASS referral-policy: '+count+' synthetic scenarios, no provider/db/money calls');
