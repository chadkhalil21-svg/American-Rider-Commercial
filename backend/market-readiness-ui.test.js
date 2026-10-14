const assert = require('node:assert/strict');
const { marketChecklistPage } = require('./market-readiness-ui');
const market = { id: 'fl-miami-dade', name: '<County & others>', state: 'FL' };
const state = { status: 'waitlist', manifestVersion: 'abc123', readyToActivate: false,
  enforcedInCode: ['jurisdiction_authority','operator_insurance_process','screening_agreement'],
  missing: [{ id: 'provider:screening_provider', reason: 'Provider still requires verification' }] };
const waiting = marketChecklistPage([{ market, state }], { production: true });
assert.ok(waiting.includes('&lt;County &amp; others&gt;'));
assert.equal(waiting.includes('<County & others>'), false);
assert.match(waiting, /class="activate"[^>]*disabled/);
assert.ok(waiting.includes('role="status" aria-live="polite"'));
assert.equal(waiting.includes('Record independently reviewed evidence'), false);
assert.equal(waiting.includes('id="region-evidence-form"'), false);
assert.ok(waiting.includes('x-ar-ops-action'));
const intake = marketChecklistPage([{ market, state: { ...state, readyToOnboard: true } }], { production: true });
assert.match(intake, /class="onboard"[^>]*data-version="abc123"[^>]*>Authorize prelaunch/);
assert.match(intake, /class="activate"[^>]*disabled/);
const duringIntake = marketChecklistPage([{ market, state: { ...state, status: 'onboarding', readyToOnboard: true } }], { production: true });
assert.match(duringIntake, /Only approved Operator intake is allowed/);
assert.match(duringIntake, /Pause intake and new offers/);
const pendingFleet = marketChecklistPage([{ market, state: { ...state, fleetCleanupPending: true } }], { production: true });
assert.match(pendingFleet, /role="alert".*Fleet shutdown pending/);
assert.match(pendingFleet, /class="activate"[^>]*disabled/);
const green = marketChecklistPage([{ market, state: { ...state, readyToActivate: true, missing: [] } }], { production: true });
assert.match(green, /class="activate"[^>]*data-version="abc123"[^>]*>Activate/);
const testOnly = marketChecklistPage([{ market, state: { ...state, readyToActivate: true, missing: [] } }], { production: false });
assert.match(testOnly, /class="activate"[^>]*disabled/);
// Three counties share the same platform-level blocker; it is not three purchases.
const triCounty = ['Miami-Dade','Broward','Palm Beach'].map((name, i) => ({
  market: { id: ['fl-miami-dade','fl-broward','fl-palm-beach'][i], name, state:'FL' },
  state: { ...state,
    missing: [
      { id:'provider:screening_provider', reason:'No commissioned provider handoff' },

    ],
  },
}));
const grouped = marketChecklistPage(triCounty, { production: true });
assert.match(grouped, /Commission markets here, not in Operator screening/);

assert.equal((grouped.match(/Screening Provider/g)||[]).length, 1,
  'one platform dependency must not be repeated per county');
assert.equal((grouped.match(/<li><strong>Company Insurance Bound<\/strong>/g)||[]).length, 0);
assert.match(grouped, /Eleven retired regional document requirements are not requested/);
assert.equal((grouped.match(/class="activate"[^>]*disabled/g)||[]).length, 3,
  'shared missing dependency may never enable activation');
const unblockedLocally = marketChecklistPage([{market,state:{
  ...state, missing:[{id:'provider:screening_provider',reason:'Provider not commissioned'}],
  readyToActivate:false,
}}], {production:true});
assert.match(unblockedLocally,/No remaining county-specific evidence/);
assert.match(unblockedLocally,/class="activate"[^>]*disabled/);

const { catalog: expansionCatalog } = require('./market-expansion');
const marketList = expansionCatalog();
const national = marketChecklistPage([{market,state}],{
  production:true,
  expansion:{ok:true,plans:[{
    id:'ca',label:'<California>',status:'proposed',city:'San Jose'
  }],catalog:marketList},
});
assert.match(national,/Expand American Rider/);
assert.match(national,/No individual county/);
assert.match(national,/<details class="expansion-advanced">/);
assert.match(national,/Focus on a particular county or city \(optional\)/);
assert.match(national,/<details class="county-review">/);
assert.match(national,/at this stage/);
assert.match(national,/<h2>South Florida · commissioning details<\/h2>/);
assert.match(national,/id="open-south-florida"/);
assert.match(national,/one action/i);
assert.match(national,/\/ops\/markets\/regions\/fl-southeast\/activate/);
assert.match(national,/<details id="other-markets">/);
assert.match(national,/Prepare selected market — no activation/);
assert.match(national,/\/ops\/markets\/plan/);
assert.match(national,/Choose a jurisdiction/);
assert.match(national,/California \(CA\)/);
assert.match(national,/data-state="FL"/);
assert.ok(marketList.counties.filter(c=>c.state==='FL').length>3);
assert.match(national,/&lt;California&gt;/);
assert.doesNotMatch(national,/<California>/);
assert.match(national,/Proposed only — not commissioned/);
assert.match(national,/class="activate"[^>]*disabled/);
console.log('PASS market Operations checklist: escape, accessible feedback and production-only one-action activation');
