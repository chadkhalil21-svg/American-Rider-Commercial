// A REFUND DOES NOT TAKE THE OPERATOR'S MONEY BACK, AND THAT IS WHERE THE LOSS LIVES.
//
// Adrian, 20 Sept 2026: "regarding the refunds you mentioned, we are protected, right? we
// don't want to lose." The honest answer was: partly.
//
// WHAT WAS ALREADY SAFE. A refund cannot exceed the payment, cannot be aimed at a payment
// belonging to another account, cannot be issued against an uncompleted charge, and cannot be
// issued twice — Stripe's own record of what remains refundable is read every time.
//
// WHAT WAS NOT. The operator's 99% leaves at completion and a refund does not reverse it. So
// past the point where our own retained take runs out, every cent given back is money we have
// already paid away and are paying a second time. On a $9.03 travel we keep about $1.58; a
// full refund costs about $7.45. The AI's ceiling was $45 — measured against the size of a
// FARE, which is what a traveler might be owed, not what the company can absorb.
const fs = require('fs');
const path = require('path');
const { quote } = require('./payments');
const { MAX_AUTO_CREDIT_CENTS, MAX_OUT_OF_POCKET_CENTS } = require('./support');

const results = [];
const check = (label, ok, detail) => results.push({ label, ok: !!ok, detail });
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const payments = read('payments.js');
const server = read('server.js');
const exceptions=read('payment-exception-policy.js');

// ---- The guards that were already there, asserted rather than assumed -------------------
for (const [label, re] of [
  ['a refund cannot exceed what remains refundable', /only \$\{?balance\.cents\}?c of that payment remains refundable|amountCents > balance\.cents/],
  ['a refund cannot touch another account\'s payment', /that payment belongs to a different account/],
  ['a refund cannot be issued against an uncompleted charge', /refundableChargeSafety\(pi\)/],
  ['a refund must be a positive whole number of cents', /must be a positive whole number of cents/],
]) {
  check(label, re.test(payments));
}

check('provider guard checks succeeded status before any refund',
 /pi\.status!=='succeeded'/.test(exceptions));
check('provider guard prevents double-refunding a disputed charge',
 /disputed_charge_requires_provider_reconciliation/.test(exceptions));
// ---- The cost is now measured, and stamped where it can be audited ----------------------
check('the true cost of a refund is computed from what we still hold',
  /const outOfPocketCents = Math.max\(0, amountCents - stillOurs\)/.test(payments));
check('and refundTravel returns it, so a caller can act before the month-end total',
  /outOfPocketCents \}$|status: refund\.status, outOfPocketCents/.test(payments));
check('and it is stamped on the Stripe refund itself, not only in our logs',
  /outOfPocketCents: String\(outOfPocketCents\)/.test(payments));
check('what we retain is stamped on EVERY intent, or the cost reads as total',
  (payments.match(/platformTake: String\(q\.platformTake\)/g) || []).length === 3,
  `${(payments.match(/platformTake: String\(q\.platformTake\)/g) || []).length} of 3 intent-creation sites`);

// ---- The operator's transfer is deliberately NOT reversed -------------------------------
check('a refund never reverses the operator\'s transfer automatically',
  !/reverse_transfer/.test(payments),
  'taking money from an operator who may have done nothing wrong is a person\'s judgement');

// ---- The two ceilings are different quantities, on purpose ------------------------------
check('the exposure ceiling is lower than the credit ceiling',
  MAX_OUT_OF_POCKET_CENTS < MAX_AUTO_CREDIT_CENTS, `${MAX_OUT_OF_POCKET_CENTS} vs ${MAX_AUTO_CREDIT_CENTS}`);
check('a refund costing more than we can absorb is recorded rather than closed quietly',
  /above the \$\{?MAX_OUT_OF_POCKET_CENTS\}?c limit|Refund exposure/.test(server));

// ---- The arithmetic, on today's real fares ----------------------------------------------
// The benchmark travel, and the worst case the AI can still reach on its own.
const q = quote(753, undefined, undefined, 'US');
const fullRefund = q.travelerPays;
const cost = Math.max(0, fullRefund - q.platformTake);
check(`a full refund of the benchmark travel (${usd(fullRefund)}) costs us ${usd(cost)}`,
  cost === fullRefund - q.platformTake && cost > 0, `retained ${usd(q.platformTake)}`);
check('and that cost is inside the exposure ceiling, so the AI can still make it right',
  cost <= MAX_OUT_OF_POCKET_CENTS, `${usd(cost)} against ${usd(MAX_OUT_OF_POCKET_CENTS)}`);
check('while a refund the size of the old ceiling would NOT be, which is the change',
  MAX_AUTO_CREDIT_CENTS - q.platformTake > MAX_OUT_OF_POCKET_CENTS);

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
