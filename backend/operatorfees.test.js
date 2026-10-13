const assert=require('node:assert');
const {accountFeeQuote,noWaiverConsentEffective,NO_WAIVER_POLICY_REVISION,monthKey,monthBounds,previousMonth}=require('./operatorfees');
const R=[];const check=(l,c,d='')=>R.push({l,ok:!!c,d});
let q=accountFeeQuote(0,true,'US');
check('active low-volume operator owes $2 Connect account cost',q.costCents===200,JSON.stringify(q));
check('collection cost is itemized and grossed up',q.processingCents===37&&q.totalCents===237,JSON.stringify(q));
check('unknown card is international-safe',accountFeeQuote(0,true,null).totalCents>=q.totalCents);
check('19 Travels does not waive',accountFeeQuote(19,true,'US').waived===false);
check('20 Travels waives',accountFeeQuote(20,true).waived===true);
check('21 Travels remains waived',accountFeeQuote(21,true).totalCents===0);
check('no payout means no active-account recovery',accountFeeQuote(0,false).totalCents===0);
for(const n of [0,1,19,20,100]){
  const v=accountFeeQuote(n,true,'US',{noWaiverAccepted:true});
  check('consented no-waiver applies at '+n+' Travels',!v.waived&&v.costCents===200&&v.threshold===null,JSON.stringify(v));
}
check('consented but no payout remains $0',
  accountFeeQuote(100,false,'US',{noWaiverAccepted:true}).totalCents===0);
check('legacy high-volume waiver remains in place',
  accountFeeQuote(100,true,'US').waived===true);
const consent = { accountFeeConsent: {revision:NO_WAIVER_POLICY_REVISION,verifiedServerSide:true,acceptedAt:Date.UTC(2026,9,10),effectiveMonth:'2026-11'} };
check('new policy cannot apply before effective month',!noWaiverConsentEffective(consent,'2026-10'));
check('new policy begins in consented month',noWaiverConsentEffective(consent,'2026-11'));
check('new policy persists following months',noWaiverConsentEffective(consent,'2026-12'));
check('missing verified server consent fails closed',!noWaiverConsentEffective({accountFeeConsent:{...consent.accountFeeConsent,verifiedServerSide:false}},'2026-11'));
check('missing revision fails closed',!noWaiverConsentEffective({accountFeeConsent:{...consent.accountFeeConsent,revision:'old'}},'2026-11'));
check('incomplete consent fails closed',!noWaiverConsentEffective({accountFeeConsent:{revision:NO_WAIVER_POLICY_REVISION,effectiveMonth:'2026-11'}},'2026-11'));
check('consent cannot apply retroactively',!noWaiverConsentEffective({accountFeeConsent:{...consent.accountFeeConsent,acceptedAt:Date.UTC(2026,10,3)}},'2026-11'));
check('invalid month never accepted',!noWaiverConsentEffective({accountFeeConsent:{...consent.accountFeeConsent,effectiveMonth:'2026-19'}},'2026-19'));
check('month key is UTC',monthKey(Date.UTC(2026,8,30,23,59))==='2026-09');
const b=monthBounds('2026-02');
check('month bounds are exact',b.start===Date.UTC(2026,1,1)&&b.end===Date.UTC(2026,2,1));
check('previous month crosses year',previousMonth(Date.UTC(2026,0,15))==='2025-12');
for(const r of R)console.log(`${r.ok?'PASS':'FAIL'}  ${r.l}${r.ok?'':' — '+r.d}`);
const bad=R.filter(r=>!r.ok);console.log(`\n${R.length-bad.length}/${R.length} passed`);assert.equal(bad.length,0);
