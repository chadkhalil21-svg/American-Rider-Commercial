// The screening gate on POST /operator/online, case by case. This decides whether an
// unscreened person may carry a passenger, so every branch gets a test.
const path = require('path');
const ROOT = __dirname;
const { screeningCurrent, RECHECK_MS } = require(path.join(ROOT, 'screening.js'));

const now = Date.now(), YEAR = 365*24*3600*1000;
const R = [];
const check = (l, c, d) => R.push({ l, ok: !!c, d });

// Paid eligibility depends on a current screening decision for each Operator.
// A vendor or a platform-wide setting cannot authorize an unscreened person.
// screeningCurrent is what the gate turns on.
check('no screening at all -> not current', !screeningCurrent(null));
check('undefined -> not current', !screeningCurrent(undefined));
check('passed, recheck in the future -> current',
  screeningCurrent({ decision: 'pass', recheckDue: now + YEAR }));
check('passed but recheck overdue -> NOT current',
  !screeningCurrent({ decision: 'pass', recheckDue: now - 1 }));
check('refused -> never current',
  !screeningCurrent({ decision: 'refuse', recheckDue: now + YEAR }));
check('held for review -> never current',
  !screeningCurrent({ decision: 'review', recheckDue: now + YEAR }));
check('ordered but not returned -> not current',
  !screeningCurrent({ decision: 'ordered', recheckDue: now + YEAR }));
check('awaiting a provider -> not current',
  !screeningCurrent({ decision: 'awaiting_provider' }));
check('awaiting an agency report -> not current',
  !screeningCurrent({ decision: 'awaiting_agency' }));
check('a pass with no recheck date -> not current (no date, no licence to drive)',
  !screeningCurrent({ decision: 'pass' }));

// The three-year clock runs from the report, so a two-year-old accepted report expires in one.
const conducted = now - 2*YEAR;
check('report conducted 2 years ago is still current for ~1 more year',
  screeningCurrent({ decision: 'pass', recheckDue: conducted + RECHECK_MS }));
check('report conducted 3 years and a day ago is not',
  !screeningCurrent({ decision: 'pass', recheckDue: (now - 3*YEAR - 86400000) + RECHECK_MS }));

let bad = 0;
for (const r of R) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}`); }
console.log(`\n${R.length - bad}/${R.length} passed`);
process.exit(bad ? 1 : 0);
