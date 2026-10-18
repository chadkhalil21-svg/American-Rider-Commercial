'use strict';
// Double-pass offline coverage; no live Travel records, external calls or charges.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const screen = read('app/operator/index.tsx');
const context = read('src/state/OperatorContext.tsx');
const inbox = read('src/backend/operatorInbox.ts');
const pricing = read('src/operatorOfferMoney.ts');
const server = read('backend/server.js');
const canonical = read('backend/economics.js');

for (let pass = 0; pass < 2; pass++) {
  assert.match(server, /travelCostCents: priced\.travelCostCents,?\s*\n\s*costCents: priced\.travelerPays/,
    'server stamps Travel Fare and Traveler Total together');
  assert.match(server, /tollCents: Math\.max\(0, Number\(priced\.tollCents\) \|\| 0\)/,
    'server stamps toll reimbursement');
  assert.match(canonical, /const operatorGets = fare - commission \+ toll/);
  assert.match(inbox, /tollCents: Number\(x\.tollCents \?\? 0\)/,
    'existing Operator inbox includes toll with no extra reads');
  assert.match(context, /operatorOfferAmounts\(\{\s*travelerTotalCents: t\.costCents,\s*travelFareCents: t\.travelCostCents,\s*tollCents: t\.tollCents/,
    'request uses authoritative integer cents');
  assert.match(context, /earn: r\.operatorReceivesCents != null \? r\.operatorReceivesCents \/ 100 : earnOf\(r\.fare\)/,
    'accepted revenue includes toll reimbursement');
  assert.match(context, /earn: prices \? prices\.operatorReceivesCents \/ 100 : earnOf\(fare\)/,
    'recovered Travel revenue includes toll reimbursement');
  for (const label of ['offerTravelerTotal','offerOperatorReceives','offerTollIncluded','offerPriceUnavailable']) {
    assert.match(screen, new RegExp("t\\('operator\\." + label + "'"));
  }
  assert.match(screen, /disabled=\{accepting \|\| declining \|\| !prices\}/,
    'acceptance requires disclosed prices');
  assert.doesNotMatch(pricing, /fareFromTotal|platformFee\(/);
  for (const lang of ['en', 'es', 'fr', 'it', 'de']) {
    const translations = read('src/i18n/' + lang + '.ts');
    for (const label of ['offerTravelerTotal','offerOperatorReceives','offerTollIncluded','offerPriceUnavailable']) {
      assert.match(translations, new RegExp('    ' + label + ': '), lang + ':' + label);
    }
  }
}

const cases = [
  [{travelerTotalCents:2000,travelFareCents:1780,tollCents:0},
   {travelerTotalCents:2000,operatorReceivesCents:1763,tollReimbursementCents:0}],
  [{travelerTotalCents:2500,travelFareCents:1800,tollCents:150},
   {travelerTotalCents:2500,operatorReceivesCents:1932,tollReimbursementCents:150}],
  [{travelerTotalCents:600,travelFareCents:350,tollCents:0},
   {travelerTotalCents:600,operatorReceivesCents:347,tollReimbursementCents:0}],
  [{travelerTotalCents:200,travelFareCents:99,tollCents:0},
   {travelerTotalCents:200,operatorReceivesCents:99,tollReimbursementCents:0}],
];
const invalid = [
  {travelerTotalCents:0,travelFareCents:1780,tollCents:0},
  {travelerTotalCents:1800,travelFareCents:1780,tollCents:50},
  {travelerTotalCents:2000,travelFareCents:0,tollCents:0},
  {travelerTotalCents:2000,travelFareCents:1780,tollCents:-1},
  {travelerTotalCents:2000.5,travelFareCents:1780,tollCents:0},
  {travelerTotalCents:NaN,travelFareCents:1780,tollCents:0},
  {travelerTotalCents:Number.MAX_SAFE_INTEGER+1,travelFareCents:1780,tollCents:0},
];
const url = pathToFileURL(path.join(root, 'src/operatorOfferMoney.ts')).href;
const code = [
  "import assert from 'node:assert/strict';",
  'import { operatorOfferAmounts } from ' + JSON.stringify(url) + ';',
  'const cases = ' + JSON.stringify(cases) + ';',
  'const invalid = ' + JSON.stringify(invalid) + ';',
  'for (let pass = 0; pass < 2; pass++) {',
  '  for (const [input, expected] of cases) assert.deepEqual(operatorOfferAmounts(input), expected);',
  '  for (const input of invalid) assert.equal(operatorOfferAmounts(input), null);',
  '}',
].join('\n');
execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{
  cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],
});
console.log('PASS twice: server-authoritative offer totals, full toll compensation, invalid pricing, and five languages.');
