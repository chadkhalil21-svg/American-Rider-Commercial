// Automated, exception-driven qualification.
// Run: node backend/qualification.test.js
//
// The ten cases the founders asked for (22 Sept 2026), plus the deterministic checks behind them.
const fs = require('fs');
const path = require('path');
const { assessOperator, assessAndRecord, resolveDocument, dollarFigures, REQUIRED_DOCS } = require('./qualification');
const { acceptOffer } = require('./eligibility');
const { DISCLOSURE_VERSION } = require('./disclosure');

const R = [];
const check = (l, c, d) => R.push({ l, ok: !!c, d });

// ——— a Firestore stand-in: get/set on refs, auto-id docs, queries by one field, transactions ——
function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const counts = { writes: 0, users: 0, operators: 0 };
  let n = 0;
  const merge = (a, b) => {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v;
    }
    return out;
  };
  const snap = (col, id) => {
    const v = data[col]?.[id];
    return { exists: !!v, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined) };
  };
  const write = (col, id, f, opts) => {
    counts.writes++;
    if (col === 'users' || col === 'operators') counts[col]++;
    data[col] = data[col] || {};
    data[col][id] = opts?.merge ? merge(data[col][id], f) : { ...f };
  };
  const ref = (col, id) => ({
    col, id,
    get: async () => snap(col, id),
    set: async (f, opts) => write(col, id, f, opts),
  });
  return {
    data, counts,
    collection: (col) => ({
      doc: (id) => ref(col, id ?? `auto${++n}`),
      where: (field, op, val) => ({
        get: async () => ({
          docs: Object.entries(data[col] || {})
            .filter(([, v]) => field.split('.').reduce((o, k) => o?.[k], v) === val)
            .map(([id]) => ({ id, data: () => snap(col, id).data() })),
        }),
      }),
    }),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (r) => snap(r.col, r.id),
        update: (r, f) => writes.push(() => write(r.col, r.id, f, { merge: true })),
        set: (r, f, opts) => writes.push(() => write(r.col, r.id, f, opts)),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
}

const NOW = Date.parse('2026-09-22T15:00:00Z');
const read = (kind, fields = {}) => ({
  verdict: 'accept',
  reasons: [],
  expiry: '2028-01-31',
  evidence: {
    documentType: kind,
    isTheRequestedDocument: true,
    legible: true,
    fields: { expiry: '2028-01-31', commercialUse: '', limits: '', ...fields },
  },
});
// A complete Florida TNC policy, as the structured reader returns it.
const L = (pp, pi, pd, csl) => ({ bodilyInjuryPerPerson: pp, bodilyInjuryPerIncident: pi, propertyDamage: pd, combinedSingleLimit: csl });
const fullPolicy = (over = {}) => ({
  insurer: 'Example Mutual',
  policyNumber: 'TNC-123',
  namedInsureds: ['Ana M. Operator'],
  listedDrivers: [],
  effectiveDate: '2026-01-01',
  expirationDate: '2028-01-31',
  vehicles: [{ description: '2022 Toyota Camry', vin: '4T1B11HK5NU000001', plate: 'KTR 4821' }],
  useStatements: ['Transportation Network Company endorsement'],
  tncEndorsement: 'yes',
  forHireUse: 'not_shown',
  loggedOnLimits: L('$50,000', '$100,000', '$25,000', ''),
  rideLimits: L('', '', '', '$1,000,000'),
  generalLimits: L('', '', '', ''),
  pip: { shown: 'yes', amount: '$10,000' },
  uninsuredMotorist: { shown: 'yes', amount: '$50,000/$100,000' },
  ...over,
});
const insuranceRead = (over = {}, fields = {}) => {
  const d = read('insurance', { commercialUse: 'yes', limits: '$1,000,000 combined single limit', ...fields });
  d.evidence.insurance = fullPolicy(over);
  return d;
};
const cleanDocs = () => ({
  license: read('license'),
  registration: read('registration', { plate: 'KTR-4821', vin: '4T1B11HK5NU000001' }),
  insurance: insuranceRead(),
});
const cleanUser = (over = {}) => ({
  name: 'Ana Operator',
  operatingMarket: { id: 'fl-miami-dade' },
  documents: cleanDocs(),
  screening: { decision: 'pass', recheckDue: NOW + 1e10 },
  insuranceDisclosure: { version: DISCLOSURE_VERSION, at: NOW - 1000 },
  insuranceMonitoring: {
    status: 'verified_active',
    source: 'onboarding_document',
    lastVerifiedAt: NOW - 1000,
    nextVerificationDueAt: NOW + 30 * 864e5,
  },
  ...over,
});
const OK = { account: { disabled: false }, payouts: { enabled: true } };
const A = (user, o = {}) => assessOperator({ user, now: NOW, liveMoney: true, ...OK, ...o });
const codes = (a) => a.blockers.map((b) => b.code);

(async () => {
  // ——— 1. clean automated qualification ——————————————————————————————————————————
  {
    const a = A(cleanUser());
    check('1. clean operator: qualified with no person involved', a.qualified && a.status === 'qualified', JSON.stringify(a.blockers));
    const db = fakeDb({ users: { op: cleanUser() }, operators: {} });
    const r = await assessAndRecord({ db, uid: 'op', checks: async () => OK, liveMoney: true, now: NOW });
    check('1. …and recorded as qualified with a timestamp', r.qualified && db.data.users.op.qualification.status === 'qualified' && db.data.users.op.qualification.qualifiedAt === NOW);
  }

  // ——— 1b. Read-only unchanged assessments, immediate adverse status ————————————
  {
    const db = fakeDb({ users: { op: cleanUser() },
      operators: { op: { available:true, commissioned:true } } });
    const run = async at => assessAndRecord({db,uid:'op',checks:async()=>OK,liveMoney:true,now:at});
    await run(NOW);
    check('1b. first qualification creates one current snapshot',db.counts.users===1);
    const previous = db.counts.writes;
    await run(NOW+120_000);
    await run(NOW+4*60*60_000);
    check('1b. repeated unchanged foreground status is read-only (no repeated write)',
      db.counts.writes===previous);
    await run(NOW+6*60*60_000);
    check('1b. unchanged six-hour diagnostic refresh is bounded',
      db.counts.users===2 && db.counts.operators===0);
    // A newly adverse source record must take effect on the NEXT request,
    // rather than hiding behind the six-hour snapshot interval.
    db.data.users.op.screening.decision='refuse';
    await run(NOW+6*60*60_000+1000);
    check('1b. refused screening immediately records changed evidence and goes off duty',
      db.data.users.op.qualification.status==='refused' &&
      db.data.operators.op.available===false &&
      db.data.operators.op.commissioned===false &&
      db.counts.users===3 && db.counts.operators===1);
    const lossWrites=db.counts.writes;
    await run(NOW+6*60*60_000+120000);
    check('1b. already recorded refusal produces no duplicate off-duty or qualification writes',
      db.counts.writes===lossWrites);
  }

  // ——— 2. one document held for review ———————————————————————————————————————————
  {
    const u = cleanUser();
    u.documents.registration = { ...u.documents.registration, verdict: 'review', reasons: ['The plate does not match.'] };
    const a = A(u);
    check('2. one review document: not qualified', !a.qualified);
    check('2. …status exception, only that item queued', a.status === 'exception' && a.blockers.length === 1 && a.blockers[0].item === 'registration' && a.blockers[0].code === 'document_review', JSON.stringify(a.blockers));
  }

  // ——— 3. one document refused ——————————————————————————————————————————————————
  {
    const u = cleanUser();
    u.documents.license = { ...u.documents.license, verdict: 'refuse', reasons: ['Expired 2025-01-01.'] };
    const a = A(u);
    check('3. one refused document: not qualified, machine-readable reason', !a.qualified && a.status === 'refused' && codes(a).includes('document_refused'));
  }

  // ——— 4. expired insurance ——————————————————————————————————————————————————————
  {
    const u = cleanUser();
    u.documents.insurance = { ...u.documents.insurance, expiry: '2026-09-01' };
    const a = A(u);
    check('4. expired insurance: not qualified (document_expired)', !a.qualified && codes(a).includes('document_expired') && a.blockers[0].item === 'insurance');
    // …and the Florida limit, checked in code, not taken from the verdict
    const low = cleanUser();
    low.documents.insurance.evidence.fields.limits = '$50,000 / $100,000 / $25,000';
    check('4. an "accept" whose limits are below $1,000,000 is refused in code', codes(A(low)).includes('insurance_limits_insufficient'));
    const unread = cleanUser();
    unread.documents.insurance.evidence.fields.limits = '50/100/25';
    check('4. limits that cannot be read as dollars go to a person, not through', codes(A(unread)).includes('insurance_limits_unreadable'));
    const personal = cleanUser();
    personal.documents.insurance.evidence.fields.commercialUse = 'no';
    check('4. personal-use cover is refused', codes(A(personal)).includes('insurance_personal_use'));
    const unsure = cleanUser();
    unsure.documents.insurance.evidence.fields.commercialUse = 'unclear';
    check('4. unconfirmed commercial use is an exception', codes(A(unsure)).includes('insurance_use_unverified'));
  }

  // ——— 4b. Florida TNC insurance rules, applied in code to the structured reading ————————————
  {
    const withPolicy = (over, fields) => { const u = cleanUser(); u.documents.insurance = insuranceRead(over, fields); return u; };
    const C = (over, fields) => codes(A(withPolicy(over, fields)));
    check('4b. a complete policy passes every rule', A(withPolicy({})).qualified);
    check('4b. no structured reading (older reader) → exception', (() => { const u = cleanUser(); delete u.documents.insurance.evidence.insurance; return codes(A(u)).includes('insurance_structured_evidence_missing'); })());
    check('4b. account holder not insured or listed → exception', C({ namedInsureds: ['Somebody Else'] }).includes('insurance_insured_mismatch'));
    check('4b. listed driver counts', A(withPolicy({ namedInsureds: ['Somebody Else'], listedDrivers: ['Ana Operator'] })).qualified);
    check('4b. no insured readable → exception', C({ namedInsureds: [] }).includes('insurance_insured_missing'));
    check('4b. registered vehicle not on the policy → exception', C({ vehicles: [{ description: 'x', vin: 'OTHER', plate: 'ZZZ 999' }] }).includes('insurance_vehicle_mismatch'));
    check('4b. no vehicle readable → exception', C({ vehicles: [] }).includes('insurance_vehicle_missing'));
    check('4b. start date missing → exception', C({ effectiveDate: '' }).includes('insurance_effective_date_missing'));
    check('4b. starts in the future → not yet', C({ effectiveDate: '2027-01-01' }).includes('insurance_not_yet_effective'));
    check('4b. two end dates disagree → exception', C({ expirationDate: '2027-06-30' }).includes('insurance_dates_inconsistent'));
    check('4b. no TNC or for-hire use stated → exception', C({ tncEndorsement: 'not_shown', forHireUse: 'not_shown' }).includes('insurance_tnc_use_unverified'));
    check('4b. TNC and for-hire use both stated absent → refused', C({ tncEndorsement: 'no', forHireUse: 'no' }).includes('insurance_no_tnc_use'));
    check('4b. for-hire use alone is enough', A(withPolicy({ tncEndorsement: 'not_shown', forHireUse: 'yes' })).qualified);
    check('4b. ride-period limit below $1,000,000 → refused', C({ rideLimits: L('', '', '', '$500,000') }).includes('insurance_ride_limit_insufficient'));
    check('4b. ride-period limit unreadable → exception', C({ rideLimits: L('', '', '', '') }).includes('insurance_ride_limit_unreadable'));
    check('4b. a general $1,000,000 CSL meets the ride-period rule (7)(c)',
      !C({ rideLimits: L('', '', '', ''), generalLimits: L('', '', '', '$1,000,000 CSL') }).some((c) => c.startsWith('insurance_ride_limit')));
    check('4b. a combined limit alone for the logged-on period is an exception, not a pass — no $125,000 formula',
      C({ rideLimits: L('', '', '', ''), loggedOnLimits: L('', '', '', ''), generalLimits: L('', '', '', '$1,000,000 CSL') }).includes('insurance_logged_on_split_limits_not_shown'));
    check('4b. …and a $125,000 combined logged-on limit does not pass', !A(withPolicy({ loggedOnLimits: L('', '', '', '$125,000') })).qualified);
    const { FL_TNC_INSURANCE } = require('./qualification');
    check('4b. the rule set cites (7)(b) for logged on and (7)(c) for the ride, and has no combined logged-on figure',
      FL_TNC_INSURANCE.loggedOn.statute.endsWith('(7)(b)') && FL_TNC_INSURANCE.ride.statute.endsWith('(7)(c)') &&
      FL_TNC_INSURANCE.loggedOn.perPerson === 50000 && FL_TNC_INSURANCE.loggedOn.perIncident === 100000 &&
      FL_TNC_INSURANCE.loggedOn.propertyDamage === 25000 && FL_TNC_INSURANCE.ride.primaryLiabilityMinDollars === 1000000 &&
      !('combinedSingle' in FL_TNC_INSURANCE.loggedOn));
    check('4b. a person can resolve the logged-on limits only with the three split figures, held to the same minimums', (() => {
      const u = withPolicy({ loggedOnLimits: L('', '', '', ''), generalLimits: L('', '', '', '$1,000,000 CSL') });
      u.documents.insurance.decision = { verdict: 'accept', commercialUse: 'yes', limitDollars: 1000000,
        verified: { loggedOnPerPersonDollars: 50000, loggedOnPerIncidentDollars: 100000, loggedOnPropertyDamageDollars: 20000 } };
      return codes(A(u)).includes('insurance_logged_on_limits_insufficient');
    })());
    check('4b. logged-on limits below 50/100/25 → refused', C({ loggedOnLimits: L('$25,000', '$50,000', '$10,000', '') }).includes('insurance_logged_on_limits_insufficient'));
    check('4b. logged-on limits partly unreadable → exception', C({ loggedOnLimits: L('$50,000', '', '', '') }).includes('insurance_logged_on_limits_incomplete'));
    check('4b. logged-on limits absent → exception', C({ loggedOnLimits: L('', '', '', '') }).includes('insurance_logged_on_limits_unreadable'));
    check('4b. PIP not shown → exception', C({ pip: { shown: 'not_shown', amount: '' } }).includes('insurance_pip_not_shown'));
    check('4b. PIP stated absent → refused', C({ pip: { shown: 'no', amount: '' } }).includes('insurance_no_pip'));
    check('4b. PIP below $10,000 → refused', C({ pip: { shown: 'yes', amount: '$5,000' } }).includes('insurance_pip_insufficient'));
    check('4b. PIP amount unreadable → exception', C({ pip: { shown: 'yes', amount: '' } }).includes('insurance_pip_amount_unreadable'));
    check('4b. UM not shown → exception', C({ uninsuredMotorist: { shown: 'not_shown', amount: '' } }).includes('insurance_um_not_shown'));
    check('4b. UM rejected → exception until counsel confirms', C({ uninsuredMotorist: { shown: 'rejected', amount: '' } }).includes('insurance_um_rejected'));
    process.env.INSURANCE_UM_REJECTION_ACCEPTED = '1';
    check('4b. …and accepted once configured', A(withPolicy({ uninsuredMotorist: { shown: 'rejected', amount: '' } })).qualified);
    delete process.env.INSURANCE_UM_REJECTION_ACCEPTED;
    check('4b. the legacy summary limit remains a conservative pre-check while structured statutory evidence is also enforced', C({}, { limits: '$300,000' }).includes('insurance_limits_insufficient'));
    const src = fs.readFileSync(path.join(__dirname, 'documents.js'), 'utf8');
    check('4b. ordinary document review uses local OCR and never calls a metered model',
      /require\('\.\/localocr'\)/.test(src) && !/Anthropic|messages\.create|ANTHROPIC_API_KEY/.test(src));
    check('4b. clean OCR may pass document-reading, but insurance still requires independent current carrier/broker verification',
      /extractLocalDocument\(bytes, ocr\)/.test(src) && /continuingStatus\(u, now\)/.test(fs.readFileSync(path.join(__dirname,'qualification.js'),'utf8')));
  }

  // ——— 4c. The real human-review path must not bypass active insurer evidence —————
  {
    const reviewed = cleanUser();
    reviewed.documents.insurance.verdict = 'review';
    reviewed.documents.insurance.decision = {
      verdict: 'accept', note: 'Original policy reviewed',
      expiry: '2028-01-31', commercialUse: 'yes', limitDollars: 1000000,
      verified: {
        insuredConfirmed: true, vehicleConfirmed: true,
        effectiveDate: '2026-01-01', tncUse: 'yes', rideCombinedDollars: 1000000,
        loggedOnPerPersonDollars: 50000, loggedOnPerIncidentDollars: 100000,
        loggedOnPropertyDamageDollars: 25000, pipDollars: 10000,
        uninsuredMotorist: 'yes',
      },
    };
    reviewed.insuranceMonitoring = null;
    const missing = A(reviewed);
    check('4c. person accepts policy, but no independent insurer evidence => not qualified',
      !missing.qualified && codes(missing).includes('insurance_status_unverified'),
      JSON.stringify(missing.blockers));
    const { qualifyingInsuranceDocument } = require('./qualification');
    check('4c. document human approval is valid independently from active insurance', qualifyingInsuranceDocument(reviewed, NOW));
    reviewed.insuranceMonitoring = {
      status: 'verified_active', source: 'verified_broker',
      lastVerifiedAt: NOW - 1000, nextVerificationDueAt: NOW + 30 * 864e5,
    };
    check('4c. human-accepted full policy plus independently current insurer status qualifies',
      A(reviewed).qualified, JSON.stringify(A(reviewed).blockers));
    reviewed.insuranceMonitoring.status = 'cancelled';
    check('4c. carrier cancellation after human document approval immediately disqualifies',
      !A(reviewed).qualified && codes(A(reviewed)).includes('insurance_cancelled'));
    const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    check('4c. authorize and attest require effective human-reviewed policy',
      server.includes('qualifyingInsuranceDocument(u)') &&
      server.includes('documentApproved: qualifyingInsuranceDocument(u)'));
    check('4c. even a held replacement document invalidates old insurer status',
      server.includes("if (kind === 'insurance') {") &&
      server.includes('initialMonitoringFromDocument(monitoringDoc)'));
  }

  // ——— 5. Checkr screening in production ————————————————————————————————————————————
  {
    check('5. no screening, live money: not qualified', codes(A(cleanUser({ screening: null }))).includes('screening_required'));
    check('5. screening older than three years, live money: not qualified',
      codes(A(cleanUser({ screening: { decision: 'pass', recheckDue: NOW - 1 } }))).includes('screening_expired'));
    check('5. screening refused: not qualified, in any mode',
      codes(A(cleanUser({ screening: { decision: 'refuse', summary: 'x' } }), { liveMoney: false })).includes('screening_refused'));
    check('5. screening held for review: exception, in any mode',
      A(cleanUser({ screening: { decision: 'review' } }), { liveMoney: false }).status === 'exception');
    check('5. pre-adverse screening is a blocked incomplete state, not a final refusal',
      !A(cleanUser({ screening: { decision: 'pre_adverse' } }), { liveMoney: false }).qualified && codes(A(cleanUser({ screening: { decision: 'pre_adverse' } }), { liveMoney: false })).includes('screening_pre_adverse'));
    check('5. provider screening in progress is not qualified',
      !A(cleanUser({ screening: { decision: 'in_progress' } }), { liveMoney: false }).qualified && codes(A(cleanUser({ screening: { decision: 'in_progress' } }), { liveMoney: false })).includes('screening_incomplete'));
    check('5. a missing screening is never silently converted into a pass in production',
      !A(cleanUser({ screening: null }), { liveMoney: true }).qualified);
  }

  // ——— 6. disabled account ———————————————————————————————————————————————————————
  {
    check('6. disabled account: not qualified (suspended)', A(cleanUser(), { account: { disabled: true } }).status === 'suspended');
    check('6. account status unknown: not qualified', !A(cleanUser(), { account: { disabled: null } }).qualified);
    check('6. account not checked at all: not qualified', !assessOperator({ user: cleanUser(), now: NOW, payouts: OK.payouts }).qualified);
    check('6. suspended by a person: not qualified', A(cleanUser({ suspension: { active: true, note: 'fraud' } })).status === 'suspended');
  }

  // ——— 7. resolving the final held item qualifies automatically ——————————————————————
  {
    const u = cleanUser();
    u.documents.insurance = { ...u.documents.insurance, verdict: 'review', reasons: ['Name differs.'] };
    const db = fakeDb({ users: { op: u }, operators: {} });
    const before = await assessAndRecord({ db, uid: 'op', checks: async () => OK, liveMoney: true, now: NOW });
    check('7. held insurance: in the exception queue', before.status === 'exception' && db.data.users.op.qualification.status === 'exception');
    const out = await resolveDocument({
      db, uid: 'op', kind: 'insurance', action: 'accept', note: 'Name matches the licence; middle name only.',
      commercialUse: 'yes', limitDollars: 1000000, actor: { name: 'alice' }, now: NOW,
    });
    check('7. a person resolves it', out.ok, JSON.stringify(out));
    const after = await assessAndRecord({ db, uid: 'op', checks: async () => OK, liveMoney: true, now: NOW });
    check('7. …and the operator is qualified with no Approve click', after.qualified && db.data.users.op.qualification.status === 'qualified');
    const expired = cleanUser();
    expired.documents.license = { ...expired.documents.license, verdict: 'review', expiry: '' };
    const db2 = fakeDb({ users: { op: expired } });
    await resolveDocument({ db: db2, uid: 'op', kind: 'license', action: 'accept', note: 'ok', expiry: '2020-01-01', actor: { name: 'alice' }, now: NOW });
    check('7. a person\'s accept still has to pass the date check', codes(A(db2.data.users.op)).includes('document_expired'));
    const db3 = fakeDb({ users: { op: cleanUser() } });
    const low = await resolveDocument({ db: db3, uid: 'op', kind: 'insurance', action: 'accept', note: 'ok', commercialUse: 'yes', limitDollars: 300000, actor: { name: 'alice' }, now: NOW });
    check('7. …and the Florida limit: a person cannot accept $300,000', low.ok && codes(A(db3.data.users.op)).includes('insurance_limits_insufficient'));
  }

  // ——— 8. later loss of eligibility prevents acceptance —————————————————————————————
  {
    const fleet = { available: true, onlineAt: NOW, commissioned: true, disclosureVersion: DISCLOSURE_VERSION, insuranceExpiry: '2028-01-31', lat: 25.76, lng: -80.19 };
    const ride = { operatorId: 'op', status: 'assigned', createdAt: NOW - 5000 };
    const cases = [
      ['insurance expired after qualifying', (u) => { u.documents.insurance.expiry = '2026-09-21'; }, {}, 'document_expired'],
      ['insurance invalidated by a person', (u) => { u.documents.insurance.decision = { verdict: 'refuse', note: 'cancelled by insurer' }; }, {}, 'document_refused'],
      ['screening refused after qualifying', (u) => { u.screening = { decision: 'refuse' }; }, {}, 'screening_refused'],
      ['account disabled after qualifying', () => {}, { account: { disabled: true } }, 'account_disabled'],
      ['disclosure version moved on', (u) => { u.insuranceDisclosure = { version: '2026-08-29.1', at: 1 }; }, {}, 'disclosure_required'],
      ['suspended by a person', (u) => { u.suspension = { active: true, note: 'safety' }; }, {}, 'suspended'],
      ['payouts restricted by Stripe', () => {}, { payouts: { enabled: false } }, 'payouts_not_ready'],
    ];
    for (const [label, mutate, ext, code] of cases) {
      const u = cleanUser({ qualification: { status: 'qualified', qualified: true } });
      mutate(u);
      const db = fakeDb({ users: { op: u }, operators: { op: { ...fleet } }, rides: { r1: { ...ride } } });
      const out = await acceptOffer({ db, uid: 'op', rideId: 'r1', externals: { ...OK, ...ext }, liveMoney: true, now: () => NOW });
      check(`8. ${label} → acceptance refused (${code})`, out.status === 409 && out.body.code === code && db.data.rides.r1.status === 'assigned', JSON.stringify(out.body));
    }
    const db = fakeDb({ users: { op: cleanUser() }, operators: { op: { ...fleet } }, rides: { r1: { ...ride } } });
    const out = await acceptOffer({ db, uid: 'op', rideId: 'r1', externals: OK, liveMoney: true, now: () => NOW });
    check('8. control: the same operator, nothing lost, accepts', out.status === 200 && db.data.rides.r1.status === 'accepted');
    // Loss is recorded immediately, not at the next renewal.
    const lost = cleanUser();
    lost.documents.license.expiry = '2026-09-01';
    const db2 = fakeDb({ users: { op: lost }, operators: { op: { ...fleet } } });
    await assessAndRecord({ db: db2, uid: 'op', checks: async () => OK, liveMoney: true, now: NOW });
    check('8. an assessment that finds a loss takes the operator out of dispatch at once',
      db2.data.operators.op.available === false && db2.data.operators.op.commissioned === false);
  }

  // ——— 8b. Known insurance expiry: lock BEFORE new Travel, not after ———————————————
  {
    const now = NOW;
    const short = cleanUser();
    short.documents.insurance = insuranceRead({ expirationDate:'2026-09-22' }, { expiry:'2026-09-22' });
    short.documents.insurance.expiry = '2026-09-22';
    const duty = A(short,{context:'online'});
    check('8b. duty blocked in the final 24 hours before documented expiry',
      !duty.eligible && codes(duty).includes('insurance_renewal_required'),JSON.stringify(duty.blockers));

    const fleet = { available:true,onlineAt:now,commissioned:true,disclosureVersion:DISCLOSURE_VERSION,
      insuranceExpiry:'2028-01-31',lat:25.76,lng:-80.19 };
    const ride={operatorId:'op',status:'assigned',createdAt:now-5000};
    const db = fakeDb({ users:{op:short},operators:{op:fleet},rides:{r1:ride} });
    const accepted = await acceptOffer({db,uid:'op',rideId:'r1',externals:OK,liveMoney:true,now:()=>now});
    check('8b. acceptance blocked despite stale fleet policy expiry',
      accepted.status===409 && accepted.body.code==='insurance_renewal_required',
      JSON.stringify(accepted.body));

    const long = cleanUser();
    long.documents.insurance = insuranceRead({ expirationDate:'2026-09-23' }, { expiry:'2026-09-23' });
    long.documents.insurance.expiry = '2026-09-23';
    const longRide={...ride,routedMinutes:36*60};
    const dbLong = fakeDb({users:{op:long},operators:{op:{...fleet,insuranceExpiry:'2026-09-23'}},rides:{r1:longRide}});
    const longResult=await acceptOffer({db:dbLong,uid:'op',rideId:'r1',externals:OK,liveMoney:true,now:()=>now});
    check('8b. route projection over policy end blocks acceptance',
      longResult.status===409 && longResult.body.code==='insurance_renewal_required',
      JSON.stringify(longResult.body));

    const dbRenewed = fakeDb({users:{op:cleanUser()},operators:{op:fleet},rides:{r1:ride}});
    const renewed = await acceptOffer({db:dbRenewed,uid:'op',rideId:'r1',externals:OK,liveMoney:true,now:()=>now});
    check('8b. independently verified replacement with future expiry may accept',
      renewed.status===200,JSON.stringify(renewed.body));
  }

  // ——— 9. the client cannot grant itself qualification ———————————————————————————————
  {
    const forged = cleanUser({
      documents: {},
      qualification: { status: 'qualified', qualified: true },
      commission: { status: 'approved' },
    });
    check('9. a stored "qualified" or "approved" is never read as qualification', !A(forged).qualified);
    const src = fs.readFileSync(path.join(__dirname, 'qualification.js'), 'utf8');
    const body = src.slice(src.indexOf('function assessOperator'), src.indexOf('async function assessAndRecord'));
    check('9. assessOperator reads neither user.qualification nor user.commission',
      !/\.qualification\b/.test(body) && !/\.commission\b/.test(body));
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const own = (rules.match(/function userFieldsAreOwn\(\) \{[\s\S]*?\}/) || [''])[0];
    check('9. rules: the app may write only its profile and push fields on its record', own.includes("'name', 'mobile', 'email'") && !/qualification|documents|suspension|screening|commission/.test(own));
    check('9. rules: audit_log has no client rule (deny-all applies)', !/match \/audit_log/.test(rules) && /match \/\{document=\*\*\} \{\s*allow read, write: if false;/.test(rules));
    const app = ['src/backend/connect.ts', 'app/operator/review.tsx', 'src/state/OperatorContext.tsx'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    check('9. the app writes no qualification, documents or suspension field', !/(qualification|suspension|documents)\s*:\s*\{/.test(app.replace(/\/\/.*$/gm, '')));
  }

  // ——— 10. /ops overrides: authorization and audit log ——————————————————————————————
  {
    process.env.OPS_USERS = 'alice:correct-horse-battery,bob:another-long-secret';
    const ops = require('./ops');
    const routes = {};
    const fakeApp = { get: (p, ...h) => (routes[`GET ${p}`] = h[h.length - 1]), post: (p, ...h) => (routes[`POST ${p}`] = h[h.length - 1]) };
    const u = cleanUser();
    u.documents.license = { ...u.documents.license, verdict: 'review', reasons: ['Glare over the number.'] };
    const db = fakeDb({ users: { op: u }, operators: {} });
    ops.mount(fakeApp, { urlencoded: () => () => {} }, { db: () => db, checks: async () => OK, liveMoney: () => true });
    const res = () => {
      const r = { code: 200, body: null, location: null };
      r.status = (c) => { r.code = c; return r; };
      r.type = () => r;
      r.send = (b) => { r.body = b; return r; };
      r.json = (b) => { r.body = b; return r; };
      r.redirect = (c, l) => { r.code = typeof c === 'number' ? c : 302; r.location = l || c; return r; };
      r.setHeader = () => r;
      return r;
    };
    const doc = routes['POST /ops/operators/document'];
    const body = { uid: 'op', kind: 'license', action: 'accept', note: 'Number legible on the second photo.' };

    const anon = res();
    await doc({ headers: {}, body }, anon);
    check('10. no session: refused (401), nothing written', anon.code === 401 && !db.data.audit_log && !db.data.users.op.documents.license.decision);

    const forgedCookie = res();
    await doc({ headers: { cookie: 'ar_ops=alice.' + 'f'.repeat(64) }, body }, forgedCookie);
    check('10. a forged session: refused (401)', forgedCookie.code === 401 && !db.data.audit_log);

    const cookie = `ar_ops=${encodeURIComponent('alice.' + ops.tokenFor({ name: 'alice', pw: 'correct-horse-battery' }))}`;
    const noNote = res();
    await doc({ headers: { cookie }, body: { ...body, note: '' } }, noNote);
    check('10. signed in but no note: refused (400), nothing written', noNote.code === 400 && !db.data.audit_log);

    const good = res();
    await doc({ headers: { cookie, 'user-agent': 'test' }, ip: '203.0.113.9', body }, good);
    const entries = Object.values(db.data.audit_log || {});
    check('10. signed in with a note: accepted', good.code === 303, `${good.code} ${good.body}`);
    check('10. exactly one audit entry, naming the person', entries.length === 1 && entries[0].actor.name === 'alice' && entries[0].actor.ip === '203.0.113.9');
    check('10. the entry records action, subject, item, before, after and note',
      entries[0].action === 'document_accept' && entries[0].subject === 'op' && entries[0].item === 'license' &&
      entries[0].before?.readerVerdict === 'review' && entries[0].after?.verdict === 'accept' && entries[0].note === body.note && entries[0].at > 0);
    check('10. the reader\'s verdict is kept beside the decision, not overwritten',
      db.data.users.op.documents.license.verdict === 'review' && db.data.users.op.documents.license.decision.by === 'alice');
    check('10. resolving the last held item qualified the operator on the spot', db.data.users.op.qualification.status === 'qualified');

    const susp = res();
    await routes['POST /ops/operators/suspension']({ headers: { cookie }, body: { uid: 'op', action: 'suspend', note: 'Safety report under investigation.' } }, susp);
    const e2 = Object.values(db.data.audit_log);
    check('10. suspension is audited and ends qualification', susp.code === 303 && e2.length === 2 && e2[1].action === 'suspend' && db.data.users.op.qualification.status === 'suspended');

    const auditAnon = res();
    await routes['GET /ops/audit']({ headers: {}, query: { uid: 'op' } }, auditAnon);
    check('10. the audit log itself needs a session', auditAnon.code === 401);
    const auditOk = res();
    await routes['GET /ops/audit']({ headers: { cookie }, query: { uid: 'op' } }, auditOk);
    check('10. …and returns every decision about the operator',
      Array.isArray(auditOk.body) && auditOk.body.length === 2 && auditOk.body.map((e) => e.action).sort().join() === 'document_accept,suspend');

    const opsSrc = fs.readFileSync(path.join(__dirname, 'ops.js'), 'utf8');
    check('10. no routine Approve route remains on /ops', !/\/ops\/operators\/commission/.test(opsSrc));
    delete process.env.OPS_USERS;

    // THE SHARED PASSWORD IS NOT A PRODUCTION PATH.
    process.env.OPS_PASSWORD = 'shared-secret-long';
    delete process.env.RENDER;
    check('10b. shared password outside production: allowed, named "ops-shared-dev"', ops.opsAccounts().map((a) => a.name).join() === 'ops-shared-dev');
    process.env.RENDER = 'true';
    check('10b. shared password in production: refused', ops.opsAccounts().length === 0 && /disabled/.test(ops.opsAuthMode()));
    const prodLogin = res();
    await doc({ headers: { cookie: `ar_ops=${encodeURIComponent('ops-shared-dev.' + ops.tokenFor({ name: 'ops-shared-dev', pw: 'shared-secret-long' }))}` }, body }, prodLogin);
    check('10b. a dev-mode session does not work in production', prodLogin.code === 401);
    for (const v of ['true', '1', 'yes', 'on', 'EMERGENCY', 'emergency-please', '']) {
      process.env.OPS_ALLOW_SHARED_PASSWORD = v;
      check(`10b. OPS_ALLOW_SHARED_PASSWORD=${JSON.stringify(v)} does not open the shared password in production`, ops.opsAccounts().length === 0);
    }
    delete process.env.OPS_ALLOW_SHARED_PASSWORD;
    check('10b. unset (the default) keeps it closed in production', ops.opsAccounts().length === 0 && ops.sharedMode() === 'off');
    process.env.OPS_SESSION_SECRET = 'qualified-operations-session-key-for-tests-only';
    process.env.OPS_MFA_SECRETS = 'ops-shared-emergency:GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ,alice:GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    process.env.OPS_ALLOW_SHARED_PASSWORD = 'emergency';
    check('10b. production emergency switch: allowed, recorded as "ops-shared-emergency"', ops.opsAccounts().map((a) => a.name).join() === 'ops-shared-emergency' && ops.opsAuthMode() === 'shared-emergency');
    process.env.OPS_USERS = 'alice:correct-horse-battery';
    check('10b. named users win over the shared password everywhere', ops.opsAccounts().map((a) => a.name).join() === 'alice' && ops.opsAuthMode() === 'named');
    for (const k of ['OPS_USERS', 'OPS_PASSWORD', 'OPS_ALLOW_SHARED_PASSWORD', 'RENDER', 'OPS_SESSION_SECRET', 'OPS_MFA_SECRETS']) delete process.env[k];
  }

  // ——— the pieces ————————————————————————————————————————————————————————————————
  check('dollar figures: $1,000,000 CSL', dollarFigures('$1,000,000 CSL').includes(1000000));
  check('dollar figures: 1M', dollarFigures('BI 1M combined').includes(1000000));
  check('dollar figures: $1 million', dollarFigures('$1 million per accident').includes(1000000));
  check('dollar figures: 50/100/25 is not guessed at', dollarFigures('50/100/25').length === 0);
  check('the required documents are the three the app asks for', JSON.stringify(REQUIRED_DOCS) === JSON.stringify(['license', 'registration', 'insurance']));
  const screen = fs.readFileSync(path.join(__dirname, '..', 'app', 'operator', 'documents.tsx'), 'utf8');
  const asked = [...(screen.match(/const DOCUMENTS[\s\S]*?\n\];/) || [''])[0].matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
  check('…and they match the documents screen exactly', asked.length === 3 && asked.every((k) => REQUIRED_DOCS.includes(k)), JSON.stringify(asked));
  // A valid <=5 MiB PDF or unreadable image may need manual review, not re-upload.
  // Server-authoritative qualification retains it as an actionable exception.
  {
    const held = cleanUser();
    held.documents.insurance = {
      verdict: 'review',
      reasons: ['PDF received; original awaits named review.'],
      summary: 'Waiting for a qualified person to review the original document.',
      objectKey: 'operator-documents/test/insurance-declarations-pdf',
      evidence: { documentType: 'unidentified', isTheRequestedDocument: false, legible: false, fields: {} },
    };
    const a = A(held);
    check('submitted original awaiting review is neither missing nor refused',
      a.status === 'exception' && a.blockers.some(b => b.item === 'insurance' && b.code === 'document_review')
      && !a.blockers.some(b => b.item === 'insurance' && ['document_missing','document_refused','document_reupload_required'].includes(b.code)),
      JSON.stringify(a.blockers));
    const context = fs.readFileSync(path.join(__dirname, '..', 'src/state/OperatorContext.tsx'), 'utf8');
    const qualify = fs.readFileSync(path.join(__dirname, '..', 'app/operator/qualify.tsx'), 'utf8');
    const documents = fs.readFileSync(path.join(__dirname, '..', 'app/operator/documents.tsx'), 'utf8');
    const insurance = fs.readFileSync(path.join(__dirname, '..', 'app/operator/insurance.tsx'), 'utf8');
    check('submitted original persists separate under-review checklist state',
      context.includes("'todo' | 'checking' | 'review' | 'ok'") &&
      /out\.verdict === 'review' \? 'review' : 'todo'/.test(context) &&
      qualify.includes("st === 'review'") &&
      qualify.includes("t('traveler.underReview')") &&
      documents.includes("state === 'review'") &&
      insurance.includes("st === 'review'"));
    check('only accepted Operator documents contribute to verified count',
      context.includes("QUAL_DOCS.filter((d) => docs[d.key] === 'ok')"));
  }

  const noEvidence = cleanUser();
  delete noEvidence.documents.license.evidence;
  check('an "accept" with no stored reading is an exception, not a pass', codes(A(noEvidence)).includes('document_evidence_inconsistent'));
  const wrongType = cleanUser();
  wrongType.documents.registration.evidence.isTheRequestedDocument = false;
  check('an "accept" whose reading says it is the wrong document is an exception', codes(A(wrongType)).includes('document_evidence_inconsistent'));

  let bad = 0;
  for (const r of R) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.l}${r.ok ? '' : '  — ' + (r.d || '')}`); }
  console.log(`\n${R.length - bad}/${R.length} passed`);
  process.exit(bad ? 1 : 0);
})();
