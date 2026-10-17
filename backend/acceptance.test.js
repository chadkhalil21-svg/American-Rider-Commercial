// Acceptance re-checks eligibility at the moment of acceptance, not only at the offer.
// Run: node backend/acceptance.test.js
//
// The race this pins: a travel is offered while everything stands; then the disclosure
// version moves (or approval, a document, insurance, screening, payouts…); then the operator
// taps Accept. Before 22 Sept 2026 the phone wrote 'accepted' itself and nothing re-checked.
const fs = require('fs');
const path = require('path');
const { acceptOffer } = require('./eligibility');
const { assessOperator } = require('./qualification');
const { initialMonitoringFromDocument, applyIndependentConfirmation } = require('./insurance-monitoring');
const { DISCLOSURE_VERSION } = require('./disclosure');

const R = [];
const check = (l, c, d) => R.push({ l, ok: !!c, d });

// ——— a Firestore stand-in with transaction semantics: reads first, writes applied at the end ——
function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const ref = (col, id) => ({ col, id });
  const snap = (r) => {
    const v = data[r.col]?.[r.id];
    return { exists: !!v, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined) };
  };
  return {
    data,
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (r) => snap(r),
        update: (r, f) => writes.push(() => { Object.assign(data[r.col][r.id], f); }),
        set: (r, f) => writes.push(() => { data[r.col] = data[r.col] || {}; data[r.col][r.id] = { ...(data[r.col][r.id] || {}), ...f }; }),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
}

const NOW = Date.parse('2026-09-22T15:00:00Z');
const doc = (fields = {}) => ({
  verdict: 'accept',
  expiry: '2099-01-01',
  evidence: { isTheRequestedDocument: true, legible: true, fields: { expiry: '2099-01-01', ...fields } },
});
const Lm = (pp, pi, pd, csl) => ({ bodilyInjuryPerPerson: pp, bodilyInjuryPerIncident: pi, propertyDamage: pd, combinedSingleLimit: csl });
const insuranceDoc = () => {
  const d = doc({ commercialUse: 'yes', limits: '$1,000,000 CSL' });
  d.evidence.insurance = {
    namedInsureds: ['Ana Operator'], listedDrivers: [], effectiveDate: '2026-01-01', expirationDate: '2099-01-01',
    vehicles: [{ description: 'car', vin: '', plate: 'KTR 4821' }], useStatements: [], tncEndorsement: 'yes', forHireUse: 'not_shown',
    loggedOnLimits: Lm('$50,000', '$100,000', '$25,000', ''), rideLimits: Lm('', '', '', '$1,000,000'), generalLimits: Lm('', '', '', ''),
    pip: { shown: 'yes', amount: '$10,000' }, uninsuredMotorist: { shown: 'yes', amount: '' },
  };
  return d;
};
const goodUser = () => {
  const insurance = insuranceDoc();
  return {
    name: 'Ana Operator',
    operatingMarket: { id: 'fl-miami-dade' },
    insuranceDisclosure: { version: DISCLOSURE_VERSION, at: NOW - 1000 },
    documents: { license: doc(), registration: doc({ plate: 'KTR4821' }), insurance },
    insuranceMonitoring: applyIndependentConfirmation(initialMonitoringFromDocument(insurance, NOW),
      { status: 'verified_active', source: 'independently_verified_broker', now: NOW }),
    screening: { decision: 'pass', recheckDue: NOW + 1e10 },
  };
};
const OK = { account: { disabled: false }, payouts: { enabled: true } };
const goodFleet = () => ({
  available: true, onlineAt: NOW, commissioned: true, disclosureVersion: DISCLOSURE_VERSION,
  insuranceExpiry: '2099-01-01', lat: 25.76, lng: -80.19,
});
const seed = (userOver = {}, fleetOver = {}, rideOver = {}) => ({
  rides: { r1: { operatorId: 'op', status: 'assigned', createdAt: NOW - 5000, ...rideOver } },
  operators: { op: { ...goodFleet(), ...fleetOver } },
  users: { op: { ...goodUser(), ...userOver } },
});
const accept = (db, extra = {}) => acceptOffer({ db, uid: 'op', rideId: 'r1', externals: OK, now: () => NOW, ...extra });

(async () => {
  // ——— the rule: backend/qualification.js assessOperator, context 'accept' ————————————————
  // Every condition this file tested when acceptance had its own function is still tested here,
  // against the one assessment every gate now shares. Codes are the finer-grained ones it uses.
  const E = (u, f, o = {}) => assessOperator({ user: { ...goodUser(), ...u }, fleet: { ...goodFleet(), ...f }, context: 'accept', now: NOW, ...OK, ...o });
  const has = (a, code) => !a.eligible && a.blockers.some((b) => b.code === code);
  check('an operator in good standing is eligible', E({}, {}).eligible, JSON.stringify(E({}, {}).blockers));
  check('no account record → refused', has(assessOperator({ user: null, fleet: goodFleet(), context: 'accept', now: NOW, ...OK }), 'no_account'));
  check('off duty → refused', has(E({}, { available: false }), 'not_on_duty'));
  check('no fleet record → refused', has(assessOperator({ user: goodUser(), fleet: null, context: 'accept', now: NOW, ...OK }), 'not_on_duty'));
  check('old disclosure version → refused', has(E({ insuranceDisclosure: { version: '2026-08-29.1', at: 1 } }, {}), 'disclosure_required'));
  check('no disclosure → refused', has(E({ insuranceDisclosure: null }, {}), 'disclosure_required'));
  check('the FLEET stamp does not count — the account record decides',
    has(E({ insuranceDisclosure: { version: 'old', at: 1 } }, { disclosureVersion: DISCLOSURE_VERSION }), 'disclosure_required'));
  check('suspended by a person → refused', has(E({ suspension: { active: true, note: 'x' } }, {}), 'suspended'));
  check('a document refused since → refused', has(E({ documents: { ...goodUser().documents, license: { verdict: 'refuse' } } }, {}), 'document_refused'));
  check('a document held since → refused', has(E({ documents: { ...goodUser().documents, license: { ...doc(), verdict: 'review' } } }, {}), 'document_review'));
  check('a document missing → refused', has(E({ documents: { license: doc(), insurance: insuranceDoc() } }, {}), 'document_missing'));
  check('a document expired since → refused', has(E({ documents: { ...goodUser().documents, registration: { ...doc(), expiry: '2026-09-01' } } }, {}), 'document_expired'));
  check('documentBlocked on the fleet record → refused', has(E({}, { documentBlocked: true }), 'document_blocked'));
  check('insurance expiry passed (recorded date) → refused', has(E({}, { insuranceExpiry: '2026-09-21' }), 'coverage_expired'));
  check('screening blocked (refusal or hold on the fleet record) → refused', has(E({ screening: null }, { screeningBlocked: true }), 'screening_blocked'));
  check('screening blocked by the three-year sweep → refused', has(E({}, { screeningBlocked: true }), 'screening_expired'));
  check('live money and no screening → refused', has(E({ screening: null }, {}, { liveMoney: true }), 'screening_required'));
  check('live money and a lapsed screening → refused', has(E({ screening: { decision: 'pass', recheckDue: NOW - 1 } }, {}, { liveMoney: true }), 'screening_expired'));
  check('test money and no screening → refused, even without live payments',
    has(E({ screening: null }, {}), 'screening_required'));
  check('Stripe restricted payouts (webhook) → refused', has(E({}, { payoutsEnabled: false }), 'payouts_not_ready'));
  check('Stripe says payouts are not enabled → refused', has(E({}, {}, { payouts: { enabled: false } }), 'payouts_not_ready'));
  check('account disabled → refused', has(E({}, {}, { account: { disabled: true } }), 'account_disabled'));
  check('account status unknown → refused', !E({}, {}, { account: { disabled: null } }).eligible);

  // ——— the race, end to end through the transaction ——————————————————————————————
  {
    const db = fakeDb(seed());
    // The offer was made while everything stood. Now the disclosure version moves on.
    db.data.users.op.insuranceDisclosure = { version: '2026-08-29.1', at: NOW - 1e6 };
    const out = await accept(db);
    check('RACE: disclosure changed after the offer → acceptance refused', out.status === 409 && out.body.code === 'disclosure_required', JSON.stringify(out));
    check('RACE: the travel is NOT accepted', db.data.rides.r1.status === 'assigned');
    check('RACE: the travel is released for re-offer', db.data.rides.r1.releasedAt === NOW && db.data.rides.r1.releasedReason === 'disclosure_required');
    check('RACE: the operator is taken out of service', db.data.operators.op.available === false);
    const again = await accept(db);
    check('RACE: a second tap is refused as well', again.status === 409 && db.data.rides.r1.status === 'assigned');
  }
  // FOUNDER'S INSURANCE RULE: if the insurer changes status after an offer
  // but before acceptance, no new Travel can be accepted. Check the authoritative
  // account record, even if the fleet still displays a future insurance date.
  // Multiple conditions and both test passes must independently fail closed.
  for(let pass=0;pass<2;pass++)for(const bad of
    ['cancelled','nonrenewed','coverage_reduced','vehicle_removed','pending_cancellation','unverified']){
    const db=fakeDb(seed());
    db.data.users.op.insuranceMonitoring.status=bad;
    const out=await accept(db);
    check('INSURANCE after offer '+bad+' P'+pass+': refuse the Travel',
      out.status===409 && String(out.body?.code||'').startsWith('insurance_'),JSON.stringify(out));
    check('INSURANCE after offer '+bad+' P'+pass+': no acceptance or invented charge',
      db.data.rides.r1.status==='assigned' && !db.data.rides.r1.acceptedAt &&
      !db.data.rides.r1.paymentIntentId);
    check('INSURANCE after offer '+bad+' P'+pass+': take Operator out of service',
      db.data.operators.op.available===false);
  }
  {
    const db=fakeDb(seed());
    // A policy expiry at the exact acceptance decision always outranks a
    // new/old fleet expiry and a prior insurer confirmation.
    db.data.users.op.insuranceMonitoring.expirationDate='2026-09-21';
    const out=await accept(db);
    check('INSURANCE expiry after offer blocks new acceptance',
      out.status===409&&db.data.rides.r1.status==='assigned'&&db.data.operators.op.available===false,
      JSON.stringify(out));
  }
  {
    const db = fakeDb(seed());
    const out = await accept(db);
    check('an eligible operator accepts', out.status === 200 && db.data.rides.r1.status === 'accepted' && db.data.rides.r1.acceptedAt === NOW, JSON.stringify(out));
    const twice = await accept(db);
    check('a lost response reuses the already accepted Travel without a second transition',
      twice.status === 200 && twice.body.reused === true && db.data.rides.r1.acceptedAt === NOW);
    const disabled = await accept(db, { externals: { ...OK, account: { disabled: true } } });
    check('an account disabled since the acceptance receives no success on retry', disabled.status === 409);
  }
  {
    const paidRide = { bookingFingerprint: 'same-booking', travelerUid: 'traveler',
      paymentIntentId: 'pi_one', costCents: 1825 };
    const db = fakeDb(seed({}, { currentRideId: 'r1' }, paidRide));
    const payment = { id: 'pi_one', status: 'succeeded', currency: 'usd', amount_received: 1825,
      metadata: { uid: 'traveler', rideId: 'r1' } };
    const real = await accept(db, { externals: { ...OK, payment } });
    const retried = await accept(db, { externals: { ...OK, payment } });
    check('paid lost-response retry succeeds on the same Operator, same Stripe receipt and same Travel',
      real.status === 200 && retried.status === 200 && retried.body.reused === true && db.data.rides.r1.acceptedAt === NOW);
    const wrong = await accept(db, { externals: { ...OK, payment: { ...payment, amount_received: 1 } } });
    check('paid retry cannot reuse a payment with a different captured amount', wrong.status === 409);
  }
  {
    const db = fakeDb(seed({}, {}, { operatorId: 'someone-else' }));
    const out = await accept(db);
    check('a travel offered to somebody else cannot be taken', out.body.code === 'not_offered' && db.data.rides.r1.status === 'assigned' && !db.data.rides.r1.releasedAt);
  }
  {
    const db = fakeDb(seed({}, {}, { status: 'cancelled' }));
    const out = await accept(db);
    check('a cancelled travel cannot be accepted', out.body.code === 'not_open' && db.data.rides.r1.status === 'cancelled');
  }
  {
    const db = fakeDb(seed());
    const out = await accept(db, { externals: { ...OK, payouts: { enabled: false } } });
    check('a network-check refusal (Stripe / account) releases the travel too', out.body.code === 'payouts_not_ready' && db.data.rides.r1.status === 'assigned' && db.data.rides.r1.releasedAt === NOW);
  }
  {
    const db = fakeDb(seed({ suspension: { active: true, note: 'x' } }));
    const out = await accept(db);
    check('suspended at acceptance → refused', out.body.code === 'suspended' && db.data.rides.r1.status === 'assigned');
    const db2 = fakeDb(seed({}, {}, {}));
    const out2 = await accept(db2, { externals: { ...OK, account: { disabled: true } } });
    check('account disabled at acceptance → refused and released', out2.body.code === 'account_disabled' && db2.data.rides.r1.releasedAt === NOW);
  }

  // ——— the wiring ———————————————————————————————————————————————————————————————
  const root = path.join(__dirname, '..');
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const opRule = (rules.match(/allow update: if drivesExisting\(\)[\s\S]*?;\n/) || [''])[0];
  check('rules: the operator update rule was found', opRule.length > 0);
  check("rules: a phone cannot write 'accepted'", opRule.length > 0 && !/'accepted', 'arrived'/.test(opRule.split('resource.data.status in')[0]) && !/request\.resource\.data\.status in\s*\[\s*'accepted'/.test(opRule));
  check('rules: a phone cannot write acceptedAt', !/'acceptedAt'/.test(opRule));
  check('rules: a phone can publish telemetry but cannot progress Travel state',
    /touchesOnly\(\['opLat', 'opLng', 'opAt', 'stillSince'\]\)/.test(opRule) && /!changes\('status'\)/.test(opRule));
  check("rules: a phone cannot author 'declined' either", !/status == 'declined'/.test(opRule));
  const progress = fs.readFileSync(path.join(__dirname, 'travelprogress.js'), 'utf8');
  check('server: Operator progress is an exact accepted → arrived → onboard → completed state machine',
    /declined: \['assigned'\]/.test(progress) && /arrived: \['accepted'\]/.test(progress) && /onboard: \['arrived'\]/.test(progress) && /completed: \['onboard'\]/.test(progress));

  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const route = (server.match(/app\.post\('\/travel\/accept'[\s\S]*?\n\}\);/) || [''])[0];
  check('POST /travel/accept exists and requires sign-in', /app\.post\('\/travel\/accept', requireAuth/.test(server));
  check('it runs the network checks (Firebase account, Stripe) before the transaction', /qualificationChecks\(uid, u\)/.test(route));
  const qc = (server.match(/async function qualificationChecks[\s\S]*?\n\}/) || [''])[0];
  check('…which ask Firebase Auth and Stripe', /accountDisabled\(uid\)/.test(qc) && /connectAccountStatus\(/.test(qc));
  check('it commits through acceptOffer', /acceptOffer\(/.test(route));

  const monitor = fs.readFileSync(path.join(__dirname, 'monitor.js'), 'utf8');
  check('the re-offer sweep does not wait out the window on a released travel',
    /since < ANSWER_WINDOW_SEC && !ride\.releasedAt/.test(monitor));
  const booking = fs.readFileSync(path.join(__dirname, 'booking.js'), 'utf8');
  check('a re-offer clears the release in the paid transactional assignment',
    /assignPaidTravel\(/.test(monitor) && /releasedAt: null/.test(booking) && /tx\.update\(ref, fields\)/.test(booking));

  const online = (server.match(/app\.post\('\/operator\/online'[\s\S]*?\n\}\);/) || [''])[0];
  check('/operator/online stamps screeningCheckedAt ONLY for a current screening',
    /screeningCheckedAt: screened \? Date\.now\(\) : null/.test(online) && !/screeningCheckedAt: Date\.now\(\)/.test(online));

  check('/operator/online: every eligibility refusal goes through refuse(), which takes the operator out of dispatch',
    /const refuse = async/.test(online) && /available: false, offDutyReason: body\.code/.test(online) &&
    (online.match(/return res\.status\(409\)/g) || []).length === 1);
  check('/operator/online runs the same assessment, context online, and refuses on any blocker',
    /assessOperator\(\{[\s\S]*?context: 'online'/.test(online) && /if \(!assessment\.eligible\)/.test(online));
  check('/operator/online no longer reads a stored approval', !/\.commission\b|commissionCurrent/.test(online));
  check('/operator/online: a disabled account is refused at go-on-duty and at every renewal',
    /accountDisabled\(req\.uid\)\) !== false/.test(online) && /code: 'account_disabled'/.test(online));

  const inbox = fs.readFileSync(path.join(root, 'src', 'backend', 'operatorInbox.ts'), 'utf8');
  check('the app accepts through the server, not a direct write',
    /\/travel\/accept/.test(inbox) && !/setStatus\(rideId, 'accepted'/.test(inbox));

  let bad = 0;
  for (const r of R) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '  — ' + (r.d || '')}`); }
  console.log(`\n${R.length - bad}/${R.length} passed`);
  process.exit(bad ? 1 : 0);
})();
