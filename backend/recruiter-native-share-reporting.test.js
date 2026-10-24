'use strict';
// Native recruiter acceptance contract: a remunerated invitation must carry
// disclosure in every supported language. No funds, provider calls or device I/O.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const ui=read('app/recruitment/index.tsx');
assert.match(ui,/Share\.share\(\{message:t\('recruiter\.shareDisclosure'\)\+' '\+body\.url\}\)/);
assert.match(ui,/body\.url\.endsWith\('&role='\+role\)/);
assert.match(ui,/americanrider\\\.tech/);
assert.match(ui,/settledOperatorTravels/);
assert.match(ui,/settledTravelerTravels/);
assert.match(ui,/operatorSettlementRecords/);
assert.match(ui,/travelerSettlementRecords/);
assert.match(ui,/Number\.isSafeInteger\(details\.counts\?\.operatorSettlementRecords\)/);
assert.match(ui,/Number\.isSafeInteger\(details\.counts\?\.travelerSettlementRecords\)/);
assert.match(ui,/details\.compensation==='commissioned'&&details\.wallet/);
assert.match(ui,/details\.wallet\.netPaidCents/);
for(const locale of ['en','es','fr','de','it']){
 const src=read('src/i18n/'+locale+'.ts');
 for(const key of ['shareDisclosure','settledOperatorTravels','settledTravelerTravels',
   'settledActivityNote','availableRewards','verifiedPaid','activeCompensationNote'])
   assert.match(src,new RegExp('\\b'+key+':\\s*"'),'missing '+key+' translation for '+locale);
}
console.log('PASS: Native recruiter compensated share disclosure, role-bound links, verified activity and paid-wallet view in five languages');
