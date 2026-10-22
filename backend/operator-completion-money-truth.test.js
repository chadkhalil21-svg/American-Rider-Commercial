'use strict';
// One deterministic cross-layer contract. No Firestore requests, Stripe calls or
// external services. Check exact cents and the already-declared live inbox index.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const name = path.join(root, 'src/operatorCompletionMoney.ts');
const script = ts.transpileModule(read('src/operatorCompletionMoney.ts'), {
  fileName: name, compilerOptions: { target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = new Module(name, module);
sandbox.filename = name;
sandbox.paths = module.paths;
sandbox._compile(script, name);
const { completionBreakdown } = sandbox.exports;

for (const fareCents of [300, 1780, 2099, 5987, 10000, 27349]) {
  for (const tollCents of [0, 275, 1250]) {
    const commission = Math.floor(fareCents * 0.01);
    const operatorTotal = fareCents - commission + tollCents;
    assert.deepEqual(completionBreakdown(fareCents/100, operatorTotal/100, tollCents),
      { commissionCents: commission, tollReimbursementCents:tollCents });
  }
}
assert.deepEqual(completionBreakdown(17.80,20.38,275),
  {commissionCents:17,tollReimbursementCents:275});
assert.equal(completionBreakdown(17.80,20.38,undefined).commissionCents,null,
  'older records missing toll evidence must not invent or show a negative fee');
assert.equal(completionBreakdown(17.80,20.38,0).commissionCents,null,
  'mismatched local estimates must not claim an exact commission');
assert.equal(completionBreakdown(Number.NaN,20,0).commissionCents,null);
assert.equal(completionBreakdown(17.801,17.63,0).commissionCents,null);
assert.equal(completionBreakdown(0,0,0).commissionCents,null);

const complete = read('app/operator/complete.tsx');
const state = read('src/state/OperatorContext.tsx');
assert.match(state,/tollReimbursementCents: op\.tollReimbursementCents/,
  'complete record must preserve the original server-priced toll');
assert.match(complete,/completionBreakdown\(rec\.fare, rec\.earn, rec\.tollReimbursementCents\)/);
assert.match(complete,/t\('operator\.completedEarningsEstimate'\)/);
assert.match(complete,/t\('operator\.completionTollReimbursement'\)/);
assert.doesNotMatch(complete,/t\('traveler\.addedToRevenue'\)/,
  'an estimated completed amount is not a confirmed Stripe transfer');

const inbox = read('src/backend/operatorInbox.ts');
const index = require('../firestore.indexes.json');
assert.match(inbox,/where\('operatorId', '==', uid\)/);
assert.match(inbox,/where\('status', 'in', \['assigned', 'accepted', 'arrived', 'onboard'\]\)/,
  'only live assignments belong in the Operator inbox');
assert.ok(index.indexes.some(i=>i.collectionGroup==='rides' && i.queryScope==='COLLECTION' &&
  i.fields?.[0]?.fieldPath==='operatorId' && i.fields?.[0]?.order==='ASCENDING' &&
  i.fields?.[1]?.fieldPath==='status' && i.fields?.[1]?.order==='ASCENDING'),
  'reuse the existing index; never add a new paid dependency or unsafe limit');
for(const lang of ['en','es','fr','it','de']) {
  const locale=read('src/i18n/'+lang+'.ts');
  for(const key of ['completedEarningsEstimate','completionTollReimbursement'])
    assert.match(locale,new RegExp('^\\s*'+key+':','m'),lang+' missing '+key);
}
console.log('PASS estimated completion/correct toll commission and indexed active Operator inbox in five locales');
