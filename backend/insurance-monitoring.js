// Continuing commercial-insurance status for Operators.
//
// A declarations page proves what a policy says at the moment it is issued. It cannot prove that
// a carrier did not cancel the policy mid-term. This module keeps those two facts separate:
//   document compliance  -> backend/qualification.js
//   continuing status    -> this file
//
// The platform accepts evidence from any qualifying carrier/agent/broker. It is deliberately
// carrier-neutral: local commercial/livery markets, surplus-lines placements and national
// carriers are treated identically when the policy satisfies the jurisdiction's requirements.
//
// No AI model is allowed to invent "active". AI may read carrier/broker evidence; a deterministic
// state machine decides whether that evidence is fresh enough to permit service.
const { createHash, randomUUID } = require('node:crypto');
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_INTERVAL_DAYS = 60;
const STATUS_GRACE_DAYS = 5;
const STATUS_DUE_MS = STATUS_INTERVAL_DAYS * DAY_MS;
const STATUS_MAX_AGE_MS = (STATUS_INTERVAL_DAYS + STATUS_GRACE_DAYS) * DAY_MS;

const ADVERSE = new Set([
  'pending_cancellation',
  'cancelled',
  'nonrenewed',
  'coverage_reduced',
  'vehicle_removed',
  'unverified',
]);

function cleanStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  return [
    'verified_active',
    'verification_due',
    'pending_cancellation',
    'cancelled',
    'nonrenewed',
    'coverage_reduced',
    'vehicle_removed',
    'unverified',
  ].includes(s) ? s : 'unverified';
}

function policyIdentityFromDocument(doc = {}) {
  const i = doc?.evidence?.insurance || {};
  return {
    insurer: String(i.insurer || '').trim(),
    policyNumber: String(i.policyNumber || '').trim(),
    effectiveDate: String(i.effectiveDate || '').trim(),
    expirationDate: String(i.expirationDate || doc?.expiry || '').trim(),
  };
}

function initialMonitoringFromDocument(doc, now = Date.now()) {
  const p = policyIdentityFromDocument(doc);
  // OCR/document checks prove what a paper says, not that the policy is
  // currently in force. First qualification requires an authenticated insurer
  // or independently verified broker confirmation; never manufacture the
  // 60-day clock merely by accepting a document upload.
  return {
    status: 'unverified',
    source: 'onboarding_document_unconfirmed',
    lastVerifiedAt: null,
    operatorAttestedAt: null,
    nextVerificationDueAt: now,
    statusMaxAgeDays: STATUS_INTERVAL_DAYS + STATUS_GRACE_DAYS,
    ...p,
  };
}

function continuingStatus(user, now = Date.now()) {
  const m = user?.insuranceMonitoring || null;
  if (!m) {
    return {
      ok: false,
      code: 'insurance_status_unverified',
      status: 'unverified',
      reason: 'Current insurance status has not been verified.',
      nextVerificationDueAt: null,
    };
  }

  const status = cleanStatus(m.status);
  if (ADVERSE.has(status)) {
    const reasons = {
      pending_cancellation: 'A pending cancellation was reported. New Travel is paused until verified coverage is confirmed.',
      cancelled: 'The insurance policy is reported cancelled. New Travel is paused.',
      nonrenewed: 'The insurance policy is reported nonrenewed.',
      coverage_reduced: 'The policy changed and must be checked again before service.',
      vehicle_removed: 'The registered vehicle is no longer confirmed on the policy.',
      unverified: 'Current insurance status cannot be verified.',
    };
    // A self-report or licensed provider may originate the same adverse event.
    // Never identify the insurer as the reporter without authentic evidence.
    const reason = reasons[status];
    return { ok: false, code: `insurance_${status}`, status, reason, nextVerificationDueAt: m.nextVerificationDueAt || null };
  }

  // A future-dated or malformed independent confirmation is not evidence
  // that a carrier verified an Operator today. Never allow a negative age to
  // masquerade as a fresh carrier verification after a bad clock/import.
  const verifiedAt = Number(m.lastVerifiedAt);
  if (!Number.isSafeInteger(verifiedAt) || verifiedAt <= 0 || verifiedAt > now) {
    return {
      ok: false, code: 'insurance_status_unverified', status: 'unverified',
      reason: 'Independent insurance verification has an invalid or future date.',
      nextVerificationDueAt: m.nextVerificationDueAt || null,
    };
  }

  // The documented policy end-date is a hard stop even when a recent broker
  // confirmation was recorded. Do not confuse a fresh *message* with a policy
  // that is still in force; qualification also checks document expiry.
  const expiryText = String(m.expirationDate || '').trim();
  if (expiryText) {
    const expiryAt = /^\d{4}-\d{2}-\d{2}$/.test(expiryText)
      ? Date.parse(`${expiryText}T23:59:59.999Z`) : NaN;
    if (!Number.isFinite(expiryAt) || expiryAt < now) {
      return {
        ok: false, code: 'insurance_policy_expired', status: 'unverified',
        reason: 'The recorded insurance policy has expired or its expiry date is invalid.',
        nextVerificationDueAt: m.nextVerificationDueAt || null,
      };
    }
  }

  const age = now - verifiedAt;
  if (age > STATUS_MAX_AGE_MS) {
    return {
      ok: false,
      code: 'insurance_status_stale',
      status: 'unverified',
      reason: 'Current policy status is due for independent re-verification before service can continue.',
      nextVerificationDueAt: m.nextVerificationDueAt || null,
    };
  }

  // THROUGH DAY 60: no Operator attestation. Independent carrier/broker status is still required.
  if (age <= STATUS_DUE_MS) {
    return {
      ok: true,
      code: null,
      status: 'verified_active',
      reason: null,
      source: m.source || null,
      lastVerifiedAt: verifiedAt,
      operatorAttestedAt: Number(m.operatorAttestedAt) || null,
      nextVerificationDueAt: m.nextVerificationDueAt || verifiedAt + STATUS_DUE_MS,
      operatorActionRequired: false,
    };
  }

  // DAYS 61–65: if independent confirmation has not arrived, one in-app attestation opens only
  // the short grace window while American Rider seeks fresh independent evidence. It does not
  // reset lastVerifiedAt and therefore cannot extend the grace indefinitely.
  const attestedAt = Number(m.operatorAttestedAt) || 0;
  if (!attestedAt || attestedAt < verifiedAt + STATUS_DUE_MS) {
    return {
      ok: false,
      code: 'insurance_attestation_due',
      status: 'verification_due',
      reason: 'Confirm that your policy remains active and unchanged while American Rider obtains fresh independent verification.',
      source: m.source || null,
      lastVerifiedAt: verifiedAt,
      operatorAttestedAt: attestedAt || null,
      nextVerificationDueAt: m.nextVerificationDueAt || verifiedAt + STATUS_DUE_MS,
      operatorActionRequired: true,
      graceUntil: verifiedAt + STATUS_MAX_AGE_MS,
    };
  }

  return {
    ok: true,
    code: null,
    status: 'verification_due',
    reason: 'Independent insurance confirmation is being refreshed.',
    source: m.source || null,
    lastVerifiedAt: verifiedAt,
    operatorAttestedAt: attestedAt,
    nextVerificationDueAt: m.nextVerificationDueAt || verifiedAt + STATUS_DUE_MS,
    operatorActionRequired: false,
    graceUntil: verifiedAt + STATUS_MAX_AGE_MS,
  };
}

function applyOperatorAttestation(monitoring, now = Date.now()) {
  const m = monitoring || {};
  return {
    ...m,
    operatorAttestedAt: now,
    operatorAttestation: {
      at: now,
      statement: 'Coverage remains active and unchanged; no cancellation, nonrenewal, vehicle removal, or material reduction has been received.',
    },
  };
}

function applyIndependentConfirmation(monitoring, {
  status = 'verified_active',
  source = 'broker',
  actor = null,
  note = null,
  now = Date.now(),
} = {}) {
  const s = cleanStatus(status);
  return {
    ...(monitoring || {}),
    status: s,
    source: String(source || 'broker').slice(0, 40),
    lastVerifiedAt: now,
    nextVerificationDueAt: now + STATUS_INTERVAL_DAYS * DAY_MS,
    statusMaxAgeDays: STATUS_INTERVAL_DAYS + STATUS_GRACE_DAYS,
    // New independent verification begins a new request cycle. Without resetting
    // these counters an Operator who used three reminders would NEVER receive
    // future automated refresh requests, even after a verified renewal.
    verificationRequestCount: 0,
    verificationRequestedAt: null,
    verificationIssue: null,
    confirmation: { at: now, source: String(source || 'broker').slice(0, 40), actor, note: note || null },
  };
}

// One action reminder, then one stale-status reminder per independently verified
// policy cycle. Store delivery bookkeeping outside insuranceMonitoring so a
// provider's status update cannot overwrite it with an older policy snapshot.
// A push acceptance is NOT delivery proof or insurance eligibility evidence.
function insuranceReminderPlan(user, now = Date.now()) {
  const m = user?.insuranceMonitoring;
  if (!m || !['verified_active', 'verification_due'].includes(m.status)) return null;
  const state = continuingStatus(user, now);
  const verifiedAt = Number(m.lastVerifiedAt);
  if (!Number.isSafeInteger(verifiedAt) || verifiedAt <= 0 || verifiedAt > now) return null;
  const stage = state.code === 'insurance_status_stale' ? 'stale'
    : state.code === 'insurance_attestation_due' ? 'due' : null;
  if (!stage) return null;
  const cycle = createHash('sha256').update(JSON.stringify([
    m.insurer, m.policyNumber, m.effectiveDate, m.expirationDate, verifiedAt,
  ])).digest('hex');
  const prior = user.insuranceReminder?.cycle === cycle ? user.insuranceReminder : null;
  const attempt = prior?.stages?.[stage];
  if (attempt?.acceptedAt || Number(attempt?.attempts) >= 3 || Number(attempt?.nextAttemptAt) > now) return null;
  return { cycle, stage, prior, attempts: (Number(attempt?.attempts) || 0) + 1 };
}

async function sendInsuranceReminder({ db, uid, notify, now = Date.now() }) {
  if (typeof notify !== 'function') return { ok: false, skipped: true };
  const ref = db.collection('users').doc(uid);
  const claimId = randomUUID();
  // Claim before I/O; transaction retries must never send notifications.
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const plan = snap.exists ? insuranceReminderPlan(snap.data(), now) : null;
    if (!plan) return null;
    tx.update(ref, { insuranceReminder: { cycle: plan.cycle, stages: {
      ...(plan.prior?.stages || {}), [plan.stage]: {
        claimId, attempts: plan.attempts, attemptedAt: now,
        nextAttemptAt: now + 15 * 60 * 1000 * (4 ** (plan.attempts - 1)),
      },
    } } });
    return plan;
  });
  if (!claim) return { ok: false, skipped: true };
  let result;
  try {
    result = await notify({ uid, kind: 'insurance_verification_due',
      title: 'Insurance status confirmation',
      body: claim.stage === 'stale'
        ? 'Independent insurance confirmation is overdue. Obtain current insurer or broker confirmation before commencing operations or accepting new Travel.'
        : 'Confirm that your commercial coverage is unchanged while American Rider refreshes it with your insurer or broker.',
      data: { screen: '/operator/insurance' },
    });
  } catch { result = { ok: false }; }
  const accepted = result?.ok === true && typeof result.id === 'string' && !!result.id.trim();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const receipt = snap.data().insuranceReminder;
    const attempt = receipt?.stages?.[claim.stage];
    if (receipt?.cycle !== claim.cycle || attempt?.claimId !== claimId) return;
    tx.update(ref, { insuranceReminder: { ...receipt, stages: {
      ...receipt.stages, [claim.stage]: { ...attempt,
        outcome: accepted ? 'accepted' : 'not_accepted',
        ...(accepted ? { acceptedAt: now, ticketId: result.id } : {}),
      },
    } } });
  });
  return { ok: accepted, skipped: false };
}

async function sweepInsuranceMonitoring({ db, requestConfirmation, notify, now = Date.now(), limit = 250 } = {}) {
  if (!db) return { ok: false, reason: 'no database', considered: 0, requested: 0, reminded: 0 };
  const report = { ok: true, considered: 0, requested: 0, reminded: 0, failed: [] };
  const requestWindow = now + 10 * DAY_MS;
  // Do not repeatedly select the oldest 250 due Operators. Long-overdue
  // policy cases are deliberately still eligible for reminders, but may NOT
  // starve new users forever. Persist an indexed cursor across leased sweeps.
  const cursorRef = db.collection('insurance_monitor_cursor').doc('v1');
  let snap;
  try {
    const cursorSnap = await cursorRef.get();
    const cursor = cursorSnap.exists ? cursorSnap.data() : null;
    const size = Math.max(1, Math.min(500, Number(limit) || 250));
    const readPage = async (after) => {
      let query = db.collection('users')
        .where('insuranceMonitoring.nextVerificationDueAt', '<=', requestWindow)
        .orderBy('insuranceMonitoring.nextVerificationDueAt')
        .orderBy('__name__')
        .limit(size);
      if (after && Number.isFinite(after.lastDueAt) && after.lastUserId)
        query = query.startAfter(after.lastDueAt, after.lastUserId);
      return query.get();
    };
    snap = await readPage(cursor);
    // On reaching the end, wrap in the same sweep so capacity is not wasted.
    if (!snap.docs.length && cursor?.lastUserId) snap = await readPage(null);
  } catch (e) {
    return { ok: false, reason: e.message, considered: 0, requested: 0, reminded: 0 };
  }

  for (const doc of snap.docs) {
    report.considered += 1;
    const u = doc.data() || {};
    const m = u.insuranceMonitoring || {};
    if (!['verified_active', 'verification_due'].includes(cleanStatus(m.status))) continue;
    const due = Number(m.nextVerificationDueAt) || 0;
    const lastRequest = Number(m.verificationRequestedAt) || 0;
    const contact = m.contact || null;
    const operatorName = String(u.legalName || u.name || 'the Operator').slice(0, 100);
    const policy = String(m.policyNumber || u.documents?.insurance?.evidence?.insurance?.policyNumber || '');
    const last4 = policy ? policy.slice(-4) : 'not shown';

    // Once a broker/agent/carrier address is known, American Rider initiates the refresh.
    // The Operator does not have to remember a monthly chore.
    const requestCount = Math.max(0, Number(m.verificationRequestCount) || 0);
    if (contact?.email && requestCount < 3 && (!lastRequest || now - lastRequest >= 5 * DAY_MS)) {
      try {
        const result = await requestConfirmation?.({
          uid: doc.id,
          user: u,
          contact,
          now,
          reason: due && now > due ? 'verification_due' : 'scheduled_refresh',
        });
        if (result?.ok) {
          report.requested += 1;
        } else {
          report.failed.push({ uid: doc.id, reason: result?.reason || 'request failed' });
        }
      } catch (e) {
        report.failed.push({ uid: doc.id, reason: e.message });
      }
    }

    // Check the page snapshot first to avoid transaction reads on every minute's
    // sweep. Recheck current state inside the claim to exclude stale page data.
    if (insuranceReminderPlan(u, now)) {
      try {
        const result = await sendInsuranceReminder({ db, uid: doc.id, notify, now });
        if (result.ok) report.reminded += 1;
        else if (!result.skipped) report.failed.push({ uid: doc.id, reason: 'insurance_reminder_not_accepted' });
      } catch {
        report.failed.push({ uid: doc.id, reason: 'insurance_reminder_unavailable' });
      }
    }
  }
  // Only the cursor is checkpointed. Eligibility always remains derived
  // from live insurance status and never from this scheduler checkpoint.
  if (snap.docs.length) {
    const last = snap.docs[snap.docs.length-1];
    try {
      await cursorRef.set({
        lastDueAt:Number(last.data()?.insuranceMonitoring?.nextVerificationDueAt),
        lastUserId:last.id, progressedAt:now,
      },{merge:false});
    } catch (e) {
      report.ok=false;
      report.failed.push({reason:'insurance_monitor_cursor_unavailable'});
    }
  }
  return report;
}

function providerInstructions() {
  return {
    publicOperatorContact: 'relations@americanrider.app',
    insuranceEvidenceContact: 'insurance@americanrider.app',
    cadenceDays: STATUS_INTERVAL_DAYS,
    graceDays: STATUS_GRACE_DAYS,
    acceptedSources: [
      'carrier or managing general agent',
      'licensed insurance agent or broker',
      'commercial/livery insurance provider',
      'eligible insurance-monitoring network',
    ],
  };
}

module.exports = {
  DAY_MS,
  STATUS_INTERVAL_DAYS,
  STATUS_GRACE_DAYS,
  STATUS_DUE_MS,
  STATUS_MAX_AGE_MS,
  cleanStatus,
  policyIdentityFromDocument,
  initialMonitoringFromDocument,
  continuingStatus,
  applyOperatorAttestation,
  applyIndependentConfirmation,
  providerInstructions,
  sweepInsuranceMonitoring,
  insuranceReminderPlan,
  sendInsuranceReminder,
};
