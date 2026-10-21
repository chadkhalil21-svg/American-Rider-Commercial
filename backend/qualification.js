// Operator qualification and eligibility — ONE function, derived from authoritative state.
//
// WHAT THIS REPLACES. On 22 Sept 2026 an operator became "commissioned" when a person clicked
// Approve on /ops, and that stored `commission.status: 'approved'` was then read as proof of
// eligibility. Two faults: every clean operator waited on a routine click, and a stored flag
// said nothing about the present (an insurance policy that lapsed the next day left it
// standing). Now nothing stores the answer as authority. assessOperator() derives it from the
// records every time it is asked — at every document reading, every status check, every
// enter-service and 90-second renewal, and every travel acceptance.
//
// TWO KINDS OF GATE, one function.
//   qualification — what makes an operator fit to carry travelers at all: the three documents,
//                   the insurance cover, the background screening (live money), the account,
//                   and no suspension or unresolved hold. All pass → qualified, automatically.
//   duty          — what must also hold at the moment travel is taken: the §627.748(8)(a)
//                   disclosure in force, Stripe payouts, being in service, the policy date the
//                   operator recorded. These are not qualification because the app reaches the
//                   payout and duty screens only after qualifying.
//
// THE AI READING IS EVIDENCE, NOT AUTHORITY. backend/documents.js returns a verdict and the
// structured fields it read. An `accept` is necessary and not sufficient: this file re-checks in
// code everything that can be checked in code — that the document is the one requested and
// legible, that it carries an expiry and it has not passed, and for insurance that it covers
// carrying passengers for hire at no less than the jurisdiction's limit.
//
// A PERSON DECIDES ONLY THE EXCEPTIONS. `review` from the reader, an insurance limit that cannot
// be read, a screening result the approved provider marks for review — those wait on /ops. A person's decision is
// recorded beside the reading (never over it), is authenticated and audit-logged (see
// resolveDocument / setSuspension), and still passes the same date and coverage checks.
const { disclosureCurrent } = require('./disclosure');
const { currentConnectFeeConsent } = require('./connect-fee-consent');
const { screeningCurrent } = require('./screening');
const { coverageLapsed } = require('./matching');
const { continuingStatus } = require('./insurance-monitoring');
const { coverageUnsafeForNewTravel } = require('./insurance-horizon');
const { forState: insuranceForState } = require('./insurance-jurisdictions');
const { markets } = require('./markets');
const { policyForState: screeningPolicyForState, reviewPolicyFor } = require('./screening-jurisdictions');

/**
 * The documents that gate an operator: the three the app asks for (app/operator/documents.tsx).
 * Not inspection — the founders removed it on 30 Aug 2026 because §627.748 requires none; one
 * filed anyway is read and gates nothing.
 */
const REQUIRED_DOCS = ['license', 'registration', 'insurance'];

// FLORIDA TNC INSURANCE, as configured rules the code applies to what the reader extracted.
// The reader never decides compliance; these numbers do.
//
// SOURCE: Fla. Stat. §627.748(7), as quoted by the founders on 22 Sept 2026 (the statute site
// could not be reached from the build environment to re-read it). Every field names the
// subsection it comes from. No alternative formulation is encoded: an earlier version accepted
// a $125,000 combined single limit for the logged-on period, which no subsection of §627.748
// authorizes, and it was removed. CONFIRM WITH FLORIDA COUNSEL; change figures here only.
function insuranceRuleForUser(user) {
  const marketId = user?.operatingMarket?.id || null;
  const market = marketId ? markets().find((m) => m.id === marketId) || null : null;
  return { market, rule: insuranceForState(market?.state) };
}

// Compatibility exports for existing Florida tests and migration code. Qualification itself
// resolves the rule from the Operator's declared operating market.
const FL_TNC_INSURANCE = insuranceForState('FL');
const FL_CARRYING_LIMIT_DOLLARS = FL_TNC_INSURANCE.ride.primaryLiabilityMinDollars;

/** Every dollar figure in a limits string. Bare small numbers ("50/100/25") are not guessed at. */
function dollarFigures(text) {
  const out = [];
  const re = /(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(million|mm|m|thousand|k)?\b/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const [, dollar, digits, unit] = m;
    let n = Number(digits.replace(/,/g, ''));
    const u = (unit || '').toLowerCase();
    if (u === 'million' || u === 'mm' || u === 'm') n *= 1e6;
    else if (u === 'thousand' || u === 'k') n *= 1e3;
    else if (!dollar && !digits.includes(',')) continue; // "50/100/25": not read as dollars
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function expiredOn(expiry, now) {
  const end = Date.parse(`${expiry}T23:59:59Z`);
  return !Number.isNaN(end) && end < now;
}

const finding = (gate, kind, code, item, reason) => ({ gate, kind, code, item: item || null, reason: reason || '' });

const top = (text) => Math.max(0, ...dollarFigures(text));
const surname = (x) => String(x || '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/).filter(Boolean).pop() || '';
const plateKey = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isoDate = (x) => (x && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) ? String(x) : '');

/**
 * The insurance evidence as one normalized record: what the reader extracted, overlaid by what
 * a person on /ops verified (decision.verified). A person's values are held to the same rules.
 */
function insuranceEvidence(d, human) {
  const ins = d.evidence?.insurance || null;
  const v = (human && human.verified) || {};
  const lim = (L) => ({
    perPerson: top(L?.bodilyInjuryPerPerson),
    perIncident: top(L?.bodilyInjuryPerIncident),
    propertyDamage: top(L?.propertyDamage),
    combinedSingle: top(L?.combinedSingleLimit),
  });
  const any = (L) => L.perPerson || L.perIncident || L.propertyDamage || L.combinedSingle;
  const loggedOnRead = lim(ins?.loggedOnLimits);
  const general = lim(ins?.generalLimits);
  return {
    structured: !!ins || !!human,
    insureds: [...(ins?.namedInsureds || []), ...(ins?.listedDrivers || [])],
    insuredConfirmed: v.insuredConfirmed === true,
    vehicles: ins?.vehicles || [],
    vehicleConfirmed: v.vehicleConfirmed === true,
    effective: isoDate(v.effectiveDate) || isoDate(ins?.effectiveDate),
    expiration: isoDate(ins?.expirationDate),
    tnc: v.tncUse === 'yes' ? 'yes' : ins?.tncEndorsement === 'yes' || ins?.forHireUse === 'yes' ? 'yes'
      : ins?.tncEndorsement === 'no' && ins?.forHireUse === 'no' ? 'no' : 'unknown',
    rideCombined: Number(v.rideCombinedDollars) || top(ins?.rideLimits?.combinedSingleLimit) || general.combinedSingle,
    loggedOn: Number(v.loggedOnPerPersonDollars) || Number(v.loggedOnPerIncidentDollars) || Number(v.loggedOnPropertyDamageDollars)
      ? { perPerson: Number(v.loggedOnPerPersonDollars) || 0, perIncident: Number(v.loggedOnPerIncidentDollars) || 0, propertyDamage: Number(v.loggedOnPropertyDamageDollars) || 0, combinedSingle: 0 }
      : any(loggedOnRead) ? loggedOnRead : general,
    pip: v.pipDollars ? { shown: 'yes', amount: Number(v.pipDollars) } : { shown: ins?.pip?.shown || 'not_shown', amount: top(ins?.pip?.amount) },
    um: v.uninsuredMotorist || ins?.uninsuredMotorist?.shown || 'not_shown',
  };
}

/** Every configured jurisdiction's TNC insurance rule, applied in code. */
function insuranceFindings(d, human, ctx, now) {
  const out = [];
  const F = (k, code, reason) => out.push(finding('qualification', k, code, 'insurance', reason));
  const { market, rule: R } = insuranceRuleForUser(ctx.user);
  if (!market) {
    F('incomplete', 'insurance_market_required', 'Choose the market where you will operate before American Rider verifies insurance.');
    return out;
  }
  if (!R) {
    F('incomplete', 'insurance_jurisdiction_not_configured', `Insurance requirements for ${market.state} have not yet been activated.`);
    return out;
  }
  const e = insuranceEvidence(d, human);
  if (!e.structured) {
    F('exception', 'insurance_structured_evidence_missing', 'The policy has not been read in the structured form the configured jurisdiction rules need.');
    return out;
  }
  // Who is insured: the account holder must be a named insured or listed driver.
  const who = surname(ctx.user?.legalName || ctx.user?.name);
  if (!e.insuredConfirmed) {
    if (!e.insureds.length) F('exception', 'insurance_insured_missing', 'No named insured or listed driver could be read.');
    else if (!who) F('exception', 'insurance_identity_unverified', 'The account has no name to compare with the policy.');
    else if (!e.insureds.some((n) => surname(n) === who)) F('exception', 'insurance_insured_mismatch', 'The account holder is not a named insured or listed driver on the policy.');
  }
  // Which vehicle: the registered vehicle must be on the policy.
  if (!e.vehicleConfirmed) {
    const reg = ctx.user?.documents?.registration?.evidence?.fields || {};
    const plate = plateKey(reg.plate);
    const vin = plateKey(reg.vin);
    if (!e.vehicles.length) F('exception', 'insurance_vehicle_missing', 'No covered vehicle could be read.');
    else if (!plate && !vin) F('exception', 'insurance_vehicle_unverified', 'The registration gives no plate or VIN to compare.');
    else if (!e.vehicles.some((x) => (vin && plateKey(x.vin) === vin) || (plate && plateKey(x.plate) === plate))) {
      F('exception', 'insurance_vehicle_mismatch', 'The registered vehicle is not listed on the policy.');
    }
  }
  // When: in force now.
  if (!e.effective) F('exception', 'insurance_effective_date_missing', 'The policy start date could not be read.');
  else if (Date.parse(`${e.effective}T00:00:00Z`) > now) F('incomplete', 'insurance_not_yet_effective', `The policy starts ${e.effective}.`);
  const exp = (human && human.expiry) || d.expiry;
  if (e.expiration && exp && e.expiration !== exp) F('exception', 'insurance_dates_inconsistent', 'The policy end date differs between two readings.');
  // For what: transportation network company or for-hire use must be stated.
  if (e.tnc === 'no') F('refused', 'insurance_no_tnc_use', 'The policy states no TNC or for-hire coverage.');
  else if (e.tnc !== 'yes') F('exception', 'insurance_tnc_use_unverified', 'TNC or for-hire coverage is not stated.');
  // §627.748(7)(c): during a prearranged ride, at least $1,000,000 primary liability.
  if (!e.rideCombined) F('exception', 'insurance_ride_limit_unreadable', 'The liability limit during a prearranged ride could not be read.');
  else if (e.rideCombined < R.ride.primaryLiabilityMinDollars) F('refused', 'insurance_ride_limit_insufficient', `$${e.rideCombined.toLocaleString('en-US')} during a ride; §627.748(7)(c) requires $1,000,000.`);
  // §627.748(7)(b): logged on, not engaged — 50,000 / 100,000 / 25,000, as split limits.
  const L = e.loggedOn;
  const need = R.loggedOn;
  const read3 = L.perPerson && L.perIncident && L.propertyDamage;
  if (read3) {
    if (L.perPerson < need.perPerson || L.perIncident < need.perIncident || L.propertyDamage < need.propertyDamage) {
      F('refused', 'insurance_logged_on_limits_insufficient', 'The limits while logged on are below $50,000 / $100,000 / $25,000 (§627.748(7)(b)).');
    }
  } else if (L.perPerson || L.perIncident || L.propertyDamage) {
    F('exception', 'insurance_logged_on_limits_incomplete', 'Not every limit for the logged-on period could be read.');
  } else if (L.combinedSingle) {
    // A combined figure is not what §627.748(7)(b) states. A person decides it.
    F('exception', 'insurance_logged_on_split_limits_not_shown', 'The logged-on period shows only a combined limit; §627.748(7)(b) states split limits.');
  } else {
    F('exception', 'insurance_logged_on_limits_unreadable', 'The limits while logged on and not on a ride could not be read.');
  }
  // PIP.
  if (e.pip.shown === 'no') F('refused', 'insurance_no_pip', 'The policy states no personal injury protection.');
  else if (e.pip.shown !== 'yes') F('exception', 'insurance_pip_not_shown', 'Personal injury protection is not shown.');
  else if (!e.pip.amount) F('exception', 'insurance_pip_amount_unreadable', 'The personal injury protection amount could not be read.');
  else if (e.pip.amount < R.pipMinDollars) F('refused', 'insurance_pip_insufficient', `PIP of $${e.pip.amount.toLocaleString('en-US')}; the minimum is $10,000.`);
  // Uninsured / underinsured motorist.
  if (e.um === 'rejected' || e.um === 'rejected_in_writing') {
    if (!R.umRejectionAccepted()) F('exception', 'insurance_um_rejected', 'Uninsured motorist coverage is rejected on the policy; whether that satisfies the TNC rule is awaiting counsel.');
  } else if (e.um !== 'yes') {
    F('exception', 'insurance_um_not_shown', 'Uninsured / underinsured motorist coverage is not shown.');
  }
  return out;
}

/**
 * What stands between one document and qualification: a list, empty when nothing does.
 *
 * `d` is users/{uid}.documents[kind]: the reader's verdict, reasons and evidence, plus
 * `decision` when a person on /ops has decided it. `ctx.user` is the whole account, for the
 * checks that compare documents (the insured's name, the registered vehicle).
 */
function documentFindings(kind, d, now, ctx = {}) {
  const Q = (k, code, reason) => [finding('qualification', k, code, kind, reason)];
  if (!d || !d.verdict) return Q('incomplete', 'document_missing', 'Not submitted.');
  if (d.reuploadRequired && !d.decision) return Q('incomplete', 'document_reupload_required', d.reuploadReason || 'Submit this document again.');
  const human = d.decision && ['accept', 'refuse'].includes(d.decision.verdict) ? d.decision : null;
  const verdict = human ? human.verdict : d.verdict;
  const reasons = (Array.isArray(d.reasons) ? d.reasons : []).join(' ');

  if (verdict === 'refuse') return Q('refused', 'document_refused', human?.note || reasons || 'Refused.');
  if (verdict !== 'accept') return Q('exception', 'document_review', reasons || 'Held for a person to check.');

  // ACCEPTED — now the parts code can check for itself.
  const ev = d.evidence || {};
  if (!human && (ev.isTheRequestedDocument !== true || ev.legible !== true)) {
    return Q('exception', 'document_evidence_inconsistent', 'The reading does not confirm the document type and legibility.');
  }
  const expiry = (human && human.expiry) || d.expiry;
  if (!expiry || Number.isNaN(Date.parse(`${expiry}T00:00:00Z`))) {
    return Q('exception', 'document_expiry_unknown', 'No expiry date is on record.');
  }
  if (expiredOn(expiry, now)) return Q('incomplete', 'document_expired', `Expired ${expiry}. Submit a current one.`);

  if (kind === 'insurance') {
    // The checks the platform has always made, unchanged: commercial use, and $1,000,000.
    const use = human ? human.commercialUse : ev.fields?.commercialUse;
    if (use === 'no') return Q('refused', 'insurance_personal_use', 'Personal-use policy; carrying passengers for hire needs commercial, livery or for-hire cover.');
    if (use !== 'yes') return Q('exception', 'insurance_use_unverified', 'Whether the policy covers carrying passengers for hire is not confirmed.');
    const limit = human ? Number(human.limitDollars) : Math.max(0, ...dollarFigures(ev.fields?.limits));
    if (!(limit > 0)) return Q('exception', 'insurance_limits_unreadable', 'The coverage limits could not be read.');
    const { market, rule } = insuranceRuleForUser(ctx.user);
    if (!market) return Q('incomplete', 'insurance_market_required', 'Choose the market where you will operate before American Rider verifies insurance.');
    if (!rule) return Q('incomplete', 'insurance_jurisdiction_not_configured', `Insurance requirements for ${market.state} have not yet been activated.`);
    if (limit < rule.ride.primaryLiabilityMinDollars) {
      return Q('refused', 'insurance_limits_insufficient', `Highest liability limit shown is ${limit.toLocaleString('en-US')}; ${rule.statute} requires at least ${rule.ride.primaryLiabilityMinDollars.toLocaleString('en-US')} during a prearranged Travel.`);
    }
    // And the full jurisdiction rule set on the structured reading.
    return insuranceFindings(d, human, ctx, now);
  }
  return [];
}

/** Human-accepted insurance must pass ALL underlying statutory document checks.
 * This is separate from continuing insurer status, which is checked every time.
 */
function qualifyingInsuranceDocument(user, now = Date.now()) {
  return !!user?.documents?.insurance &&
    documentFindings('insurance', user.documents.insurance, now, { user }).length === 0;
}

/** The first finding for one document, or null — kept for callers that want one answer. */
function documentFinding(kind, d, now, ctx = {}) {
  return documentFindings(kind, d, now, ctx)[0] || null;
}

/**
 * Assess an operator.
 *
 * @param user      users/{uid} — authoritative; the app can write only its profile fields there
 * @param fleet     operators/{uid}, or null — server-written, no client writes at all
 * @param context   'qualify' (qualification gates only) | 'online' | 'accept' (both kinds)
 * @param liveMoney Stripe key is live. Background screening is required from then on, the same
 *                  line /operator/online has always drawn.
 * @param account   { disabled: true | false | null } — from Firebase Auth. null = cannot tell.
 * @param payouts   { enabled: boolean } — from Stripe. Required for 'online' and 'accept'.
 *
 * Returns { qualified, eligible, status, blockers[] }. `status` describes qualification:
 * suspended > refused > exception > incomplete > qualified. Never reads a stored approval.
 */
function assessOperator({ user, fleet = null, context = 'qualify', liveMoney = false, account, payouts, now = Date.now(), travelMinutes = null }) {
  const blockers = [];
  const add = (f) => f && blockers.push(f);
  const u = user || null;

  // ---- qualification ---------------------------------------------------------------------
  if (!u) add(finding('qualification', 'incomplete', 'no_account', null, 'This account has no operator record.'));
  if (!account || account.disabled === true) {
    add(finding('qualification', 'suspended', 'account_disabled', null, 'This account is disabled.'));
  } else if (account.disabled !== false) {
    add(finding('qualification', 'incomplete', 'account_unverifiable', null, 'The account status could not be confirmed.'));
  }
  if (u?.suspension?.active) {
    add(finding('qualification', 'suspended', 'suspended', null, u.suspension.note || 'Suspended.'));
  }
  if (u) for (const k of REQUIRED_DOCS) documentFindings(k, u.documents?.[k], now, { user: u }).forEach(add);

  // CONTINUING INSURANCE STATUS. A compliant declarations page is a point-in-time fact.
  // Monthly independent confirmation and the Operator's own attestation are separate facts.
  // Any adverse carrier/broker status, or status older than 35 days, blocks qualification.
  // The raw OCR verdict is deliberately "review". A named human may accept the
  // original, but that does not prove it remains insured. Check continuing
  // source status after EITHER a valid original read or independent human
  // acceptance; otherwise manual review silently bypasses cancellation checks.
  if (u?.documents?.insurance &&
      (u.documents.insurance.verdict === 'accept' ||
       u.documents.insurance.decision?.verdict === 'accept')) {
    const live = continuingStatus(u, now);
    if (!live.ok) {
      add(finding(
        'qualification',
        live.status === 'cancelled' || live.status === 'nonrenewed' ? 'refused' : 'incomplete',
        live.code,
        'insurance',
        live.reason,
      ));
    }
  }

  const s = u?.screening || null;
  // A previously clear Florida report cannot silently authorize an Operator
  // who changes their selected operating jurisdiction. The old FL-only cases
  // are compatible only when the selected county still belongs to Florida.
  if (s?.decision === 'pass') {
    const marketId = u?.operatingMarket?.id;
    const market = marketId ? markets().find(m => m.id === marketId) : null;
    const requiredPolicy = screeningPolicyForState(market?.state);
    const reportPolicy = reviewPolicyFor(s);
    if (!requiredPolicy || !reportPolicy || requiredPolicy.id !== reportPolicy.id) {
      add(finding('qualification', 'incomplete', 'screening_jurisdiction_mismatch', 'screening',
        'The screening is not cleared for the selected operating jurisdiction.'));
    }
  }
  if (s?.decision === 'refuse') {
    add(finding('qualification', 'refused', 'screening_refused', 'screening', s.summary || 'Background screening refused.'));
  } else if (s?.decision === 'review') {
    add(finding('qualification', 'exception', 'screening_review', 'screening', s.summary || 'Background screening needs a decision.'));
  } else if (s?.decision === 'pre_adverse') {
    add(finding('qualification', 'incomplete', 'screening_pre_adverse', 'screening', s.summary || 'Background screening is in the required pre-adverse notice and dispute period.'));
  } else if (['in_progress','invited','ordered','awaiting_provider','awaiting_agency','expired'].includes(s?.decision)) {
    add(finding('qualification', 'incomplete', 'screening_incomplete', 'screening', s.summary || 'Background screening is not complete.'));
  } else if (fleet?.screeningBlocked) {
    // Set by a refusal or a hold (both handled above from the account record) and by the
    // three-year sweep, which leaves decision 'pass' in place: that one is a re-check owed.
    add(s?.decision === 'pass'
      ? finding('qualification', 'incomplete', 'screening_expired', 'screening', fleet.screeningReason || 'The background screening must be repeated.')
      : finding('qualification', 'refused', 'screening_blocked', 'screening', fleet.screeningReason || 'Background screening does not permit travel.'));
  }
  if (liveMoney && !blockers.some((b) => b.item === 'screening')) {
    if (!s) add(finding('qualification', 'incomplete', 'screening_required', 'screening', 'A background screening is required.'));
    else if (!screeningCurrent(s, now)) {
      add(finding('qualification', 'incomplete', 'screening_expired', 'screening', 'The background screening is more than three years old and must be repeated.'));
    }
  }

  // ---- duty ------------------------------------------------------------------------------
  if (context !== 'qualify') {
    const D = (code, reason) => finding('duty', 'duty', code, null, reason);
    if (u && !disclosureCurrent(u.insuranceDisclosure)) {
      add(D('disclosure_required', 'The insurance disclosure has changed. Read the current one before accepting travel.'));
    }
    if (!payouts || payouts.enabled !== true || fleet?.payoutsEnabled === false) {
      add(D('payouts_not_ready', 'Stripe has not cleared this account for payouts.'));
    }
    // New paid work is conditional on prior explicit fee agreement. Existing
    // earned money remains withdrawable/settleable through independent routes.
    // Require only when live-money Stripe account exists; demo fixtures without
    // a connected payout account are not evidence of an approved real Operator.
    if (liveMoney && u?.stripeAccountId && !currentConnectFeeConsent(u.stripeFeeConsent, now)) {
      add(D('payout_fee_consent_required',
        'Review the separately billed Connect account and payout costs before accepting new Travel. Existing earnings remain payable.'));
    }
    // Duty and acceptance require coverage beyond the minimum advance margin.
    // Also check the server's routed trip duration if it exceeds the margin.
    const insuranceDoc = u?.documents?.insurance;
    const policyExpiry = insuranceDoc?.expiry || insuranceDoc?.evidence?.insurance?.expirationDate;
    if (coverageUnsafeForNewTravel(policyExpiry, now, travelMinutes)) {
      add(D('insurance_renewal_required', 'Insurance expires too soon for new Travel. Submit independently verified renewal coverage.'));
    }
    if (context === 'accept') {
      if (!fleet || fleet.available !== true) add(D('not_on_duty', 'You are not in service. Commence operations to accept travel.'));
      if (fleet && coverageLapsed(fleet, now)) add(D('coverage_expired', 'Your commercial coverage has expired.'));
      if (fleet && coverageUnsafeForNewTravel(fleet.insuranceExpiry, now, travelMinutes)) {
        add(D('insurance_renewal_required', 'The recorded fleet policy expires too soon for this Travel. Renew and verify it before accepting.'));
      }
      if (fleet?.documentBlocked) add(D('document_blocked', 'A document on file is not accepted.'));
    }
  }

  const q = blockers.filter((b) => b.gate === 'qualification');
  const rank = ['suspended', 'refused', 'exception', 'incomplete'];
  const status = rank.find((k) => q.some((b) => b.kind === k)) || 'qualified';
  // THE ORDER A PERSON IS TOLD: the most serious first.
  blockers.sort((a, b) => {
    const r = (x) => (x.gate === 'duty' ? 4 : rank.indexOf(x.kind));
    return r(a) - r(b);
  });
  return { qualified: q.length === 0, eligible: blockers.length === 0, status, blockers };
}

/**
 * Assess and record the result on the account, for /ops and for the app to read.
 *
 * THE RECORD IS A SNAPSHOT, NEVER AUTHORITY. Nothing reads `qualification` back to decide
 * anything; every gate calls assessOperator afresh. It exists so the exception queue can be
 * queried and the operator can be told where they stand.
 *
 * @param checks async (uid, user) => ({ account, payouts }) — the network half (Firebase Auth,
 *               Stripe), injected so this can run in a test.
 */
async function assessAndRecord({ db, uid, checks, context = 'qualify', liveMoney = false, now = Date.now() }) {
  const userRef = db.collection('users').doc(String(uid));
  const opRef = db.collection('operators').doc(String(uid));
  const [uSnap, oSnap] = await Promise.all([userRef.get(), opRef.get()]);
  const user = uSnap.exists ? uSnap.data() : null;
  const fleet = oSnap.exists ? oSnap.data() : null;
  const ext = await checks(uid, user);
  const a = assessOperator({ user, fleet, context, liveMoney, account: ext.account, payouts: ext.payouts, now });
  const prev = user?.qualification || {};
  const blockers = a.blockers.filter((b) => b.gate === 'qualification');
  // /operator/qualification is a STATUS VIEW, not a document-renewal event.
  // Keep the reply fresh on every request but avoid rewriting the same state
  // (and waking listeners / reindexing the account) on every foreground poll.
  // Periodic six-hour snapshots preserve a bounded diagnostic last-seen time;
  // a refusal, expired check or newly cleared Operator is written immediately.
  const evaluated = Number(prev.evaluatedAt);
  const oldBlockers = Array.isArray(prev.blockers) ? prev.blockers : [];
  const changed = prev.status !== a.status || prev.qualified !== a.qualified ||
    JSON.stringify(oldBlockers) !== JSON.stringify(blockers);
  const snapshotDue = !Number.isFinite(evaluated) || evaluated <= 0 ||
    evaluated > now || now - evaluated >= 6 * 60 * 60_000;
  if (user && (changed || snapshotDue)) {
    await userRef.set(
      {
        qualification: {
          status: a.status,
          qualified: a.qualified,
          blockers,
          evaluatedAt: now,
          qualifiedAt: a.qualified ? prev.qualifiedAt || now : null,
        },
      },
      { merge: true },
    );
  }
  // Loss is immediate and enforced from CURRENT evidence on every call.
  // Avoid multiple identical off-duty writes while an Operator remains blocked.
  if (!a.qualified && fleet) {
    const reason = a.blockers[0]?.code || null;
    if (fleet.available !== false || fleet.commissioned !== false ||
        String(fleet.offDutyReason || '') !== String(reason || '')) {
      await opRef.set({ available: false, commissioned: false,
        offDutyReason: reason, offDutyAt: now }, { merge: true });
    }
  }
  return a;
}

// ---- the exception console's actions --------------------------------------------------------
//
// EVERY ONE IS AUTHENTICATED BY THE CALLER (backend/ops.js checks the /ops session) AND WRITES
// ITS OWN AUDIT ENTRY IN THE SAME TRANSACTION AS THE CHANGE — so there is no change without an
// entry and no entry without a change. `audit_log` is server-only (firestore.rules denies every
// client read and write by default).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function auditEntry({ actor, action, uid, item, before, after, note, now }) {
  return {
    at: now,
    actor: { name: actor?.name || 'unknown', ip: actor?.ip || null, userAgent: actor?.userAgent || null, session: actor?.session || null },
    action,
    subject: String(uid),
    item: item || null,
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
    note,
  };
}

/**
 * A person decides one document — a held one, or reconsiders a refused one.
 *
 * An accept still passes every deterministic check in documentFinding: the person supplies the
 * expiry when the reading had none, and for insurance confirms commercial use and states the
 * limit they read, which is then held to the jurisdiction's figure like any other.
 */
async function resolveDocument({ db, uid, kind, action, actor, note, expiry, commercialUse, limitDollars, verified, now = Date.now() }) {
  if (!REQUIRED_DOCS.includes(kind)) return { ok: false, status: 400, error: 'Unknown document' };
  if (!['accept', 'refuse'].includes(action)) return { ok: false, status: 400, error: 'Unknown action' };
  const why = String(note || '').trim().slice(0, 500);
  if (!why) return { ok: false, status: 400, error: 'A note is required for every decision' };
  if (expiry && !ISO_DATE.test(String(expiry))) return { ok: false, status: 400, error: 'Expiry must be YYYY-MM-DD' };
  // A PERSON ACCEPTING INSURANCE STATES WHAT THEY READ, field by field, and the same rules then
  // judge it: they can resolve what the reader could not read, not waive a minimum.
  let verifiedIns = null;
  if (action === 'accept' && kind === 'insurance') {
    const v = verified || {};
    if (commercialUse !== 'yes') return { ok: false, status: 400, error: 'Confirm the policy covers carrying passengers for hire' };
    if (!(Number(limitDollars) > 0)) return { ok: false, status: 400, error: 'State the liability limit shown on the policy' };
    if (v.effectiveDate && !ISO_DATE.test(String(v.effectiveDate))) return { ok: false, status: 400, error: 'Policy start must be YYYY-MM-DD' };
    verifiedIns = {
      insuredConfirmed: v.insuredConfirmed === true,
      vehicleConfirmed: v.vehicleConfirmed === true,
      ...(v.effectiveDate ? { effectiveDate: String(v.effectiveDate) } : {}),
      ...(v.tncUse === 'yes' ? { tncUse: 'yes' } : {}),
      rideCombinedDollars: Number(v.rideCombinedDollars) || Number(limitDollars),
      ...(Number(v.loggedOnPerPersonDollars) > 0 ? { loggedOnPerPersonDollars: Number(v.loggedOnPerPersonDollars) } : {}),
      ...(Number(v.loggedOnPerIncidentDollars) > 0 ? { loggedOnPerIncidentDollars: Number(v.loggedOnPerIncidentDollars) } : {}),
      ...(Number(v.loggedOnPropertyDamageDollars) > 0 ? { loggedOnPropertyDamageDollars: Number(v.loggedOnPropertyDamageDollars) } : {}),
      ...(Number(v.pipDollars) > 0 ? { pipDollars: Number(v.pipDollars) } : {}),
      ...(['yes', 'rejected_in_writing'].includes(v.uninsuredMotorist) ? { uninsuredMotorist: v.uninsuredMotorist } : {}),
    };
  }
  const userRef = db.collection('users').doc(String(uid));
  const auditRef = db.collection('audit_log').doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const d = snap.exists ? snap.data().documents?.[kind] : null;
    if (!d) return { ok: false, status: 404, error: 'No such document' };
    const decision = {
      verdict: action,
      by: actor?.name || 'unknown',
      at: now,
      note: why,
      ...(expiry ? { expiry: String(expiry) } : {}),
      ...(kind === 'insurance' && action === 'accept' ? { commercialUse: 'yes', limitDollars: Number(limitDollars), verified: verifiedIns } : {}),
    };
    tx.set(userRef, { documents: { [kind]: { decision } } }, { merge: true });
    tx.set(auditRef, auditEntry({ actor, action: `document_${action}`, uid, item: kind, before: d.decision || { readerVerdict: d.verdict }, after: decision, note: why, now }));
    return { ok: true, decision };
  });
}

/** Suspend (fraud, safety, administrative) or reinstate. Suspension ends duty at once. */
async function setSuspension({ db, uid, active, actor, note, now = Date.now() }) {
  const why = String(note || '').trim().slice(0, 500);
  if (!why) return { ok: false, status: 400, error: 'A note is required for every decision' };
  const userRef = db.collection('users').doc(String(uid));
  const opRef = db.collection('operators').doc(String(uid));
  const auditRef = db.collection('audit_log').doc();
  return db.runTransaction(async (tx) => {
    const [snap, opSnap] = await Promise.all([tx.get(userRef), tx.get(opRef)]);
    if (!snap.exists) return { ok: false, status: 404, error: 'No such operator' };
    const before = snap.data().suspension || null;
    const after = { active: !!active, by: actor?.name || 'unknown', at: now, note: why };
    tx.set(userRef, { suspension: after }, { merge: true });
    if (active && opSnap.exists) tx.set(opRef, { available: false, commissioned: false, offDutyReason: 'suspended', offDutyAt: now }, { merge: true });
    tx.set(auditRef, auditEntry({ actor, action: active ? 'suspend' : 'reinstate', uid, before, after, note: why, now }));
    return { ok: true };
  });
}

module.exports = {
  REQUIRED_DOCS,
  FL_CARRYING_LIMIT_DOLLARS,
  FL_TNC_INSURANCE,
  dollarFigures,
  documentFinding,
  documentFindings,
  qualifyingInsuranceDocument,
  insuranceFindings,
  assessOperator,
  assessAndRecord,
  resolveDocument,
  setSuspension,
};
