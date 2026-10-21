// The statutory standard, case by case. This is the file that decides whether a person may
// drive, so every rule in §627.748 gets a test that would fail if the rule were dropped.
const path = require('path');
const ROOT = __dirname;
for (const [rel, exports] of [
  ['./firebase-admin.js', { adminDb: () => null, adminStatus: () => ({ ok: false, reason: 'test' }) }],
  ['./tickets.js', { fileTicket: async () => ({ caseNo: 'AR-C-1' }) }],
  ['./env.js', { readKey: () => '' }],
]) {
  const p = require.resolve(path.join(ROOT, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] };
}
const { adjudicate, evaluateExistingReport, screeningCurrent, SCREENING_ADVANCE_MARGIN_MS } = require(path.join(ROOT, 'screening.js'));
const fs = require('node:fs');

const now = Date.parse('2026-08-23T12:00:00Z');
const yearsAgo = (y) => new Date(now - y * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
// STATUS MATTERS NOW, and it did not when these were written. A `consider` whose findings the
// parser got nothing out of is HELD for a person — "not read" must never become "pass". So a
// fixture testing an acceptable operator has to carry a status the standard can clear, and a
// fixture testing a disqualifier carries the records that disqualify.
const base = (o = {}) => ({
  status: 'clear', records: [], sexOffender: false,
  license: { valid: true, state: 'FL' }, movingViolations3y: 0, ...o,
});
/** A report the screening company flagged, with findings we could read. */
const considered = (o = {}) => base({ status: 'consider', ...o });

const R = [];
const check = (l, c, d) => R.push({ l, ok: !!c, d });
const decide = (rep) => adjudicate(rep, { now });

// ---- passes ------------------------------------------------------------------------------
check('clean report passes', decide(base({ status: 'clear' })).decision === 'pass');
check('a felony SIX years ago passes — outside the 5-year window',
  decide(considered({ records: [{ type: 'felony', charge: 'Grand theft', disposition: 'convicted', date: yearsAgo(6) }] })).decision === 'pass');
check('a DUI six years ago passes',
  decide(considered({ records: [{ type: 'misdemeanor', charge: 'DUI', disposition: 'convicted', date: yearsAgo(6) }] })).decision === 'pass');
check('a violent charge SIX years ago passes — the violent window is 5',
  decide(considered({ records: [{ type: 'misdemeanor', charge: 'Battery', disposition: 'convicted', date: yearsAgo(6) }] })).decision === 'pass');
check('a suspended-licence conviction FOUR years ago passes — that window is 3',
  decide(considered({ records: [{ type: 'misdemeanor', charge: 'Driving while license suspended', disposition: 'convicted', date: yearsAgo(4) }] })).decision === 'pass');
check('three moving violations passes; the bar is MORE than three',
  decide(base({ movingViolations3y: 3 })).decision === 'pass');
check('a dismissed felony is not a conviction and passes',
  decide(considered({ records: [{ type: 'felony', charge: 'Grand theft', disposition: 'nolle prosequi', date: yearsAgo(1) }] })).decision === 'pass');
check('an expunged record passes',
  decide(considered({ records: [{ type: 'felony', charge: 'Fraud', disposition: 'expunged', date: yearsAgo(2) }] })).decision === 'pass');
check('an unrelated recent misdemeanor passes — only the listed ones disqualify',
  decide(considered({ records: [{ type: 'misdemeanor', charge: 'Trespassing', disposition: 'convicted', date: yearsAgo(1) }] })).decision === 'pass');

// ---- refusals ----------------------------------------------------------------------------
const refuses = [
  ['felony within 5 years', considered({ records: [{ type: 'felony', charge: 'Grand theft', disposition: 'convicted', date: yearsAgo(2) }] })],
  ['DUI within 5 years', considered({ records: [{ type: 'misdemeanor', charge: 'Driving under the influence', disposition: 'convicted', date: yearsAgo(3) }] })],
  ['reckless driving within 5 years', considered({ records: [{ type: 'misdemeanor', charge: 'Reckless driving', disposition: 'convicted', date: yearsAgo(1) }] })],
  ['hit and run within 5 years', considered({ records: [{ type: 'misdemeanor', charge: 'Hit and run', disposition: 'convicted', date: yearsAgo(4) }] })],
  ['fleeing an officer within 5 years', considered({ records: [{ type: 'misdemeanor', charge: 'Fleeing or eluding', disposition: 'convicted', date: yearsAgo(2) }] })],
  ['violent offence within 5 years', considered({ records: [{ type: 'misdemeanor', charge: 'Aggravated assault', disposition: 'convicted', date: yearsAgo(2) }] })],
  ['violent offence at FOUR years — the defect that let this pass', considered({ records: [{ type: 'misdemeanor', charge: 'Battery', disposition: 'convicted', date: yearsAgo(4) }] })],
  ['lewdness within 5 years', considered({ records: [{ type: 'misdemeanor', charge: 'Indecent exposure', disposition: 'convicted', date: yearsAgo(3) }] })],
  ['driving on a suspended licence within 3 years', considered({ records: [{ type: 'misdemeanor', charge: 'Driving while license suspended', disposition: 'convicted', date: yearsAgo(2) }] })],
  ['driving on a revoked licence within 3 years', considered({ records: [{ type: 'misdemeanor', charge: 'Driving with revoked license', disposition: 'convicted', date: yearsAgo(1) }] })],
  ['on the sex offender registry', base({ sexOffender: true })],
  ['no valid driver license', base({ license: { valid: false, state: 'FL' } })],
  ['four moving violations in three years', base({ movingViolations3y: 4 })],
];
for (const [label, rep] of refuses) {
  const out = decide(rep);
  check(`refuses: ${label}`, out.decision === 'refuse' && out.reasons.length > 0, out.decision);
}

// ---- held for a person -------------------------------------------------------------------
check('a record with no date is held, never waved through',
  decide(considered({ records: [{ type: 'felony', charge: 'Grand theft', disposition: 'convicted', date: '' }] })).decision === 'review');
check('a suspended report is held', decide(base({ status: 'suspended' })).decision === 'review');
check('a flagged report whose findings could not be read is HELD, never passed',
  decide(base({ status: 'consider', records: [] })).decision === 'review');
check('  and a flagged report whose records ARE readable and all clear still passes',
  decide(considered({ records: [{ type: 'misdemeanor', charge: 'Trespassing', disposition: 'convicted', date: yearsAgo(1) }] })).decision === 'pass');

// ---- the thing that must never happen ----------------------------------------------------
check('NOTHING disqualifying ever returns pass',
  refuses.every(([, rep]) => decide(rep).decision !== 'pass'));
check('a held result is never a pass',
  decide(base({ status: 'suspended' })).decision !== 'pass');

// ---- EXISTING REPORT EVIDENCE --------------------------------------------------------------
//
// An outside report is evidence for review, never an automatic qualification or a platform
// purchase. Preserve qualifying components so the Operator need not repeat them unnecessarily,
// but provenance, permissible purpose, jurisdiction and freshness remain authoritative gates.
const recent = now - 30 * 24 * 3600 * 1000;
const ALL = ['nationwide_criminal', 'sex_offender', 'driving_history'];
const ex = (elements, source = 'agency', issuedAt = recent) =>
  evaluateExistingReport({ source, issuedAt, elements });

const complete = ex(ALL);
check('a complete declared report still requires authoritative review',
  complete.accept === false && complete.review === true && complete.missing.length === 0,
  JSON.stringify(complete));

check('criminal evidence in hand preserves it and identifies only driving history as missing',
  JSON.stringify(ex(['nationwide_criminal', 'sex_offender']).missing) === JSON.stringify(['driving_history']),
  JSON.stringify(ex(['nationwide_criminal', 'sex_offender'])));

check('driving history in hand preserves it and identifies the criminal searches as missing',
  JSON.stringify(ex(['driving_history']).missing) === JSON.stringify(['nationwide_criminal', 'sex_offender']),
  JSON.stringify(ex(['driving_history'])));

check('driving history plus sex-offender evidence identifies only nationwide criminal as missing',
  JSON.stringify(ex(['driving_history', 'sex_offender']).missing) === JSON.stringify(['nationwide_criminal']),
  JSON.stringify(ex(['driving_history', 'sex_offender'])));

check('nothing declared identifies all required components as missing',
  JSON.stringify(ex([]).missing) === JSON.stringify(ALL), JSON.stringify(ex([])));

check('an older report is never automatically accepted',
  evaluateExistingReport({ source:'agency', issuedAt:now - 4*365*24*3600*1000, elements:ALL }).accept === false);

check('a report with no date is never automatically accepted',
  evaluateExistingReport({ source:'agency', issuedAt:null, elements:ALL }).accept === false);

check('an Operator declaration is never authoritative evidence',
  evaluateExistingReport({ source:'operator', issuedAt:recent, elements:ALL }).accept === false);

check('no partial evidence state is ever an acceptance',
  [ex(['nationwide_criminal','sex_offender']), ex(['driving_history'])]
    .every((v) => v.accept === false && v.review === true));

// Mobile must not claim a report is verified during the 24-hour advance
// lockout, and must refresh after an outside-CRA portal returns to the app.
const mobile = fs.readFileSync(path.join(__dirname,'../app/operator/background.tsx'),'utf8');
const margin = SCREENING_ADVANCE_MARGIN_MS;
check('Operator app and server use the same 24-hour early-screening lockout',
  margin === 24*60*60*1000 &&
  mobile.includes("Number(record?.recheckDue) > Date.now() + 24 * 60 * 60 * 1000"));
check('server requires more than 24 hours left for fresh screening',
  !screeningCurrent({decision:'pass',recheckDue:now+margin},now) &&
  !screeningCurrent({decision:'pass',recheckDue:now+margin-1},now) &&
  screeningCurrent({decision:'pass',recheckDue:now+margin+1},now));
check('Operator screening refreshes after returning from CRA portal',
  mobile.includes("useFocusEffect(") &&
  mobile.includes("AppState.addEventListener('change'") &&
  mobile.includes("next === 'active'"));
check('only pending screening status gets bounded foreground polling',
  mobile.includes("}, 120_000)") && mobile.includes("['awaiting_agency', 'in_progress'") &&
  mobile.includes("AppState.currentState === 'active'"));
const insuranceMobile = fs.readFileSync(path.join(__dirname, '../app/operator/insurance.tsx'),'utf8');
check('insurance status refreshed automatically when phone returns from broker confirmation',
  insuranceMobile.includes('useFocusEffect(useCallback(') &&
  insuranceMobile.includes("AppState.addEventListener('change'") &&
  insuranceMobile.includes("state === 'active'") &&
  insuranceMobile.includes('void refresh();') &&
  insuranceMobile.includes('previousDocumentState.current !== op.docs.insurance'));

const reviewMobile = fs.readFileSync(path.join(__dirname,'../app/operator/review.tsx'),'utf8');
check('pending qualification refreshes on phone resume without 30-second background polling',
 reviewMobile.includes('useFocusEffect(useCallback(') &&
 reviewMobile.includes("AppState.addEventListener('change'") &&
 reviewMobile.includes('}, 10 * 60_000)') &&
 reviewMobile.includes('checkingRef.current') &&
 !reviewMobile.includes('setInterval(check, 30000)'));
let bad = 0;
for (const r of R) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '  <-- ' + r.d}`); }
console.log(`\n${R.length - bad}/${R.length} passed`);
process.exit(bad ? 1 : 0);
