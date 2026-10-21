'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');

function loadPureTypeScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', compiled)(module, module.exports);
  return module.exports;
}

const { scheduledDisplayTotal } = loadPureTypeScript('src/scheduledMoney.ts');
const { fmt } = loadPureTypeScript('src/theme.ts');

// Exactly what the real /travel/schedule backend stores: costCents, NOT cost.
// Previously restoring this shape into schedInfo sent undefined to fmt(),
// which raised the on-device Build 50: "Cannot read property 'toLocaleString' of undefined".
const stored = { id: 'synthetic-reservation', costCents: 2549, atMs: Date.now() + 3600000 };
assert.equal(stored.cost, undefined);
assert.equal(scheduledDisplayTotal(stored), 25.49);
assert.equal(fmt(scheduledDisplayTotal(stored)), '$25.49');

// Authoritative cents win over the historical display-dollar field.
assert.equal(scheduledDisplayTotal({ costCents: 2549, cost: 200 }), 25.49);
assert.equal(scheduledDisplayTotal({ costCents: 1 }), 0.01);
assert.equal(scheduledDisplayTotal({ cost: 25.49 }), 25.49);

// Invalid/missing fare must not render as $0.00 or propagate undefined.
for (const invalid of [undefined, null, {}, { costCents: 0 }, { costCents: -100 },
  { costCents: 2.5 }, { costCents: Infinity }, { costCents: NaN },
  { costCents: '2549' }, { cost: undefined }, { cost: -1 }, { cost: NaN },
  { costCents: 0, cost: 0 }]) {
  assert.equal(scheduledDisplayTotal(invalid), null);
}
assert.equal(scheduledDisplayTotal({ costCents: 0, cost: 10.15 }), 10.15);
assert.equal(scheduledDisplayTotal({ cost: 9.75 }), 9.75);

// Ensure the actual app consumes the decoding helper and explicitly branches
// before invoking the strict formatter; do not solve this by returning fake 0.
const provider = fs.readFileSync('src/state/RideContext.tsx', 'utf8');
const home = fs.readFileSync('app/index.tsx', 'utf8');
const upcoming = fs.readFileSync('app/upcoming.tsx', 'utf8');
const scheduled = fs.readFileSync('src/backend/scheduled.ts', 'utf8');
const server = fs.readFileSync('backend/server.js', 'utf8');
assert.match(server, /costCents:\s*priced\.travelerPays/);
assert.match(provider, /cost:\s*scheduledDisplayTotal\(r\)/);
assert.match(provider, /cost:\s*number\s*\|\s*null/);
assert.match(home, /Number\.isFinite\(ride\.schedInfo\.cost\)/);
assert.match(home, /traveler\.schedNotQuoted/);
assert.match(upcoming, /scheduledDisplayTotal\(r\)/);
assert.match(scheduled, /cost\?: number;/);
assert.doesNotMatch(home, /\{fmt\(ride\.schedInfo\.cost\)\}/);
console.log('Scheduled Travel boot price restoration and no-invented-fare regression: PASS');
