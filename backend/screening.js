// Operator screening — statutory adjudication, renewal and provider-neutral evidence review.
//
// Florida launch rule set: Fla. Stat. §627.748 requires the TNC to conduct or have conducted
// the specified criminal-background searches and to obtain/review driving history before
// authorization, with recurring checks every three years. Procurement is external; this
// module never treats payment, a vendor brand, or an Operator declaration as qualification.
//
// Other states must supply their own activated jurisdiction rule set before operation. Unknown
// jurisdictions fail closed elsewhere in the qualification/market gates.

const { readKey } = require('./env');
const { adminDb } = require('./firebase-admin');
const { fileTicket } = require('./tickets');

// Screening procurement is deliberately provider-neutral. American Rider does not collect a
// screening payment or sell a report. The approved CRA workflow is configured externally and
// the Operator pays that provider directly. Existing reports are never accepted from an
// Operator declaration alone; authoritative provider evidence must be reviewed first.
//
// Florida's three-year interval is the recurrence duty after a qualifying American Rider
// check. It is not treated as automatic portability for another end user's report.

const REQUIRED_ELEMENTS = [
  'nationwide_criminal', // §627.748(12)(a)2.a — Multi-State/Multi-Jurisdiction or similar
  'sex_offender',        // §627.748(12)(a)2.b — the National Sex Offender Public Website
  'driving_history',     // §627.748(12)(a)3   — the driving history research report
];

const YEAR = 365 * 24 * 60 * 60 * 1000;

/** Florida requires the whole check again every three years. */
const RECHECK_MS = 3 * YEAR;

// ---- THE STANDARD -------------------------------------------------------------------------
// Written from §627.748 and applied identically to everybody. An operator is refused if, in
// the stated window, the report shows any of these. Nothing here is discretionary, and nothing
// outside it disqualifies anybody: a record that is not on this list is not our business.
// CORRECTED 23 Aug 2026, against §627.748(12)(d) read in full. The first version of this list
// was written from memory and was WRONG IN TWO PLACES, both of them in the direction that lets
// somebody drive who may not:
//   - the violent-offence window was 3 years. The statute says FIVE. A battery conviction four
//     years old passed.
//   - driving on a suspended or revoked licence within 3 years was missing altogether.
// Both are now here, and every window below is quoted from the statute rather than recalled.
const DISQUALIFIERS = [
  // (12)(d)1. "A felony" — within 5 years.
  { id: 'felony', years: 5, test: (r) => r.type === 'felony' },
  // (12)(d)2. "A misdemeanor for driving under the influence of drugs or alcohol, for reckless
  // driving, for hit and run, or for fleeing or attempting to elude a law enforcement officer".
  {
    id: 'driving_misdemeanor',
    years: 5,
    test: (r) => r.type === 'misdemeanor' && /dui|driving under the influence|reckless|hit and run|hit-and-run|flee|eluding/i.test(r.charge || ''),
  },
  // (12)(d)3. "A misdemeanor for a violent offense or sexual battery, or a crime of lewdness or
  // indecent exposure under chapter 800". Five years, not three. Felonies of the same kind are
  // already caught above.
  {
    id: 'violent',
    years: 5,
    test: (r) => /assault|battery|homicide|murder|manslaughter|robbery|kidnap|sexual|rape|weapon|firearm|domestic violence|lewd|indecent exposure/i.test(r.charge || ''),
  },
  // (12)(d)4. "Has been convicted, within the past 3 years, of driving with a suspended or
  // revoked license." Its own window, and its own rule.
  {
    id: 'suspended_license',
    years: 3,
    test: (r) => /suspend|revok/i.test(r.charge || '') && /licen[sc]e|driving/i.test(r.charge || ''),
  },
];

/**
 * Decide a report.
 *
 * @param report {
 *   status,               'clear' | 'consider' | 'suspended'
 *   records: [{ type, charge, disposition, date }],
 *   sexOffender: bool,
 *   license: { valid, state },
 *   movingViolations3y: number,
 * }
 *
 * Returns { decision: 'pass'|'refuse'|'review', reasons: [], summary }.
 *
 * `review` is deliberately rare and always safe: nobody drives on a `review`.
 */
function adjudicate(report, { now = Date.now() } = {}) {
  const reasons = [];

  // The two absolute bars. Both are stated in the statute without a time window.
  if (report.sexOffender) {
    reasons.push('Listed on the National Sex Offender Public Website.');
  }
  if (report.license && report.license.valid === false) {
    reasons.push('No valid driver license.');
  }
  // More than three moving violations in the previous three years.
  if (Number(report.movingViolations3y) > 3) {
    reasons.push(`${report.movingViolations3y} moving violations in the previous three years.`);
  }

  const records = Array.isArray(report.records) ? report.records : [];
  const unplaceable = [];

  for (const r of records) {
    // A charge that did not result in a conviction is not a conviction. The statute
    // disqualifies on what a check "reveals" as an offence; a dismissal reveals none.
    if (/dismiss|nolle|acquit|not guilty|expunge|seal/i.test(r.disposition || '')) continue;

    const when = Date.parse(r.date || '');
    if (Number.isNaN(when)) {
      // No date means the rules cannot place it in a window. NOT waved through and NOT
      // refused — this is exactly what `review` is for.
      unplaceable.push(r);
      continue;
    }
    const yearsAgo = (now - when) / YEAR;
    for (const d of DISQUALIFIERS) {
      if (yearsAgo <= d.years && d.test(r)) {
        reasons.push(
          `${r.charge || d.id} (${r.type || 'record'}), ${yearsAgo.toFixed(1)} years ago.`,
        );
        break;
      }
    }
  }

  if (reasons.length) {
    return {
      decision: 'refuse',
      reasons,
      summary: `Does not meet Florida's requirements for a transportation network operator.`,
    };
  }
  if (report.status === 'suspended') {
    return {
      decision: 'review',
      reasons: ['The screening company suspended the report.'],
      summary: 'The screening could not be completed.',
    };
  }
  // A provider may flag a report even when the normalized findings are unavailable. Never turn
  // an unreadable flagged result into a pass.
  if (report.status === 'consider' && records.length === 0) {
    return {
      decision: 'review',
      reasons: ['The screening company flagged this report, but its findings could not be read by the standard.'],
      summary: 'Flagged by the screening company; authoritative findings are unavailable. Source clarification is required before qualification can continue.',
    };
  }
  if (unplaceable.length) {
    return {
      decision: 'review',
      reasons: unplaceable.map((r) => `${r.charge || 'record'} — no date on the record.`),
      summary: 'A record on this report has no usable date and cannot be placed in a statutory window. Source clarification is required.',
    };
  }
  return { decision: 'pass', reasons: [], summary: 'Meets Florida’s requirements.' };
}

/**
 * Record a decision against the operator, and set the three-year clock.
 *
 * A REFUSAL IS NOT A DELETION. The record stands, with its reasons, because the FCRA requires
 * us to be able to tell the person what the report said and to give them a chance to dispute
 * it — and because "we simply do not have you" is not an answer anybody can act on.
 */
/** The authoritative provider's conducted date anchors the recurring-check clock. */
async function recordDecision({ uid, decision, reasons, summary, reportId, provider, issuedAt, adverseAction = null }) {
  const db = adminDb();
  if (!db) return { ok: false, reason: 'no database' };
  const now = Date.now();
  const conductedAt = Number(issuedAt) > 0 ? Number(issuedAt) : now;
  const storedDecision = decision === 'refuse' ? 'pre_adverse' : decision;
  try {
    await db.collection('users').doc(String(uid)).set(
      {
        screening: {
          decision: storedDecision,
          proposedDecision: decision === 'refuse' ? 'refuse' : null,
          reasons: reasons || [],
          summary: summary || '',
          reportId: reportId || null,
          provider: provider || 'approved_cra',
          checkedAt: now,
          conductedAt,
          // §627.748(12)(b), from the date the check was actually conducted.
          recheckDue: conductedAt + RECHECK_MS,
          ...(adverseAction ? { adverseAction } : {}),
        },
      },
      { merge: true },
    );
    // A refused or held operator must not be dispatchable, whatever else is true of them.
    if (storedDecision !== 'pass') {
      await db.collection('operators').doc(String(uid)).set(
        { available: false, screeningBlocked: true, screeningReason: summary || '' },
        { merge: true },
      );
    } else {
      await db.collection('operators').doc(String(uid)).set(
        { screeningBlocked: false, screeningReason: null, screeningCheckedAt: now },
        { merge: true },
      );
    }

    if (decision === 'review') {
      await fileTicket({
        uid,
        kind: 'support',
        reason: 'Operator screening needs source clarification',
        description:
          `A screening result could not be placed by the statutory standard.\n${summary}\n` +
          `${(reasons || []).join('\n')}\nReport ${reportId || '—'}. Nobody drives until the ` +
          `authoritative source is clarified or the exception is resolved.`,
      });
    }
    return { ok: true, decision: storedDecision, proposedDecision: decision === 'refuse' ? 'refuse' : null };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function recordAdverseState({ uid, state, actionId = null, reportId = null, final = false, note = null }) {
  const db = adminDb();
  if (!db) return { ok: false, reason: 'no database' };
  const now = Date.now();
  await db.collection('users').doc(String(uid)).set({
    screening: {
      adverseAction: { state, actionId, reportId, updatedAt: now, ...(note ? { note } : {}) },
      ...(final ? { decision: 'refuse', proposedDecision: null, finalizedAt: now } : {}),
    },
  }, { merge: true });
  await db.collection('operators').doc(String(uid)).set({
    available: false,
    screeningBlocked: true,
    screeningReason: note || 'Background screening is not cleared.',
  }, { merge: true });
  return { ok: true };
}

/**
 * Existing screening evidence is a review route, never automatic qualification. The provider
 * must deliver authoritative evidence to American Rider under a legally appropriate CRA/FCRA
 * workflow. Compliance review then verifies provenance, permissible purpose, date, required
 * components and the active jurisdiction before any decision is recorded.
 */
function evaluateExistingReport({ source, issuedAt, elements }) {
  const has = new Set(Array.isArray(elements) ? elements : []);
  const missing = REQUIRED_ELEMENTS.filter((e) => !has.has(e));
  if (source !== 'agency') {
    return { accept: false, review: true, missing, reason: 'The authoritative report must come from the screening provider.' };
  }
  if (!Number.isFinite(Number(issuedAt)) || Number(issuedAt) <= 0) {
    return { accept: false, review: true, missing, reason: 'The provider report date must be verified before it can be evaluated.' };
  }
  return {
    accept: false,
    review: true,
    missing,
    reason: missing.length
      ? 'Preserve every qualifying component and obtain only the components still required by the active jurisdiction.'
      : 'All declared components are present, but the provider report still requires provenance, permissible-purpose, jurisdiction and freshness review before qualification.',
  };
}

// A paid Travel must not begin within 24 hours of the check's renewal deadline.
// This is an American Rider operating margin, not a statutory renewal interval.
const SCREENING_ADVANCE_MARGIN_MS = 24 * 60 * 60 * 1000;
/** A current provider-reviewed pass AND at least 24 hours before recheck. */
function screeningCurrent(screening, now = Date.now()) {
  if (!screening || screening.decision !== 'pass' || !Number.isFinite(now)) return false;
  const due = Number(screening.recheckDue);
  return Number.isFinite(due) && due > now + SCREENING_ADVANCE_MARGIN_MS;
}

/** Screening is provider-neutral. A vendor URL is optional and never proof.
 * The release gate refers to the whole authenticated external-CRA evidence process,
 * including a demonstrated provider-to-Operations transfer, FCRA handling and an
 * approved end-to-end pilot. The owner must independently attest to that evidence;
 * a checkbox or environment flag is NOT the evidence itself.
 */
const screeningReady = () => readKey('SCREENING_EVIDENCE_WORKFLOW_VERIFIED') === 'true';

// How far ahead of the three-year deadline the operator is warned. Thirty days: enough to
// pay and complete a new check without losing a single day on the road, short enough that
// the warning still feels like it is about something.
const RECHECK_WARN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The recheck clock, actually operated. §627.748(12)(b) requires the whole check again every
 * three years, and screeningCurrent() already stops dispatch the day the clock runs out —
 * but a stop with no warning is an operator who silently fell off the road and does not know
 * why. One sweep tick:
 *
 *   - inside the 30-day window and not yet warned  → push, once, marked so it stays once
 *   - within 24h of deadline and not yet acted on  → dispatch flag set, push, case filed
 *
 * Both writes are idempotent by marker (recheckWarnedAt / recheckExpiredAt).
 * This six-hour renewal sweep sends reminders and cases; it never orders a new
 * provider background report. Real-time paid eligibility independently checks
 * screeningCurrent() and the 24-hour advance lockout at each acceptance.
 */
// A durable rotating scan prevents old screening records from occupying the first
// page forever. Only the screening evidence/current time determine eligibility; the
// cursor is an operational checkpoint, never an authorization.
async function sweepScreening({
  now = Date.now(), db = adminDb(), notify: sendNotice, fileTicket: createTicket = fileTicket,
  limit = 500, // bounded throughput despite less frequent reminder polling
} = {}) {
  if (!db) return { ok: false, reason: 'no database' };
  const send = sendNotice || require('./push').notify;
  const cutoff = now + RECHECK_WARN_MS;
  const pageSize = Math.max(1, Math.min(500, Math.floor(Number(limit)) || 200));
  const cursorRef = db.collection('screening_renewal_cursor').doc('v1');
  let snap;
  try {
    const stored = await cursorRef.get();
    const cursor = stored.exists ? stored.data() : null;
    const readPage = async (after) => {
      let q = db.collection('users')
        .where('screening.recheckDue', '<=', cutoff)
        .orderBy('screening.recheckDue')
        .orderBy('__name__')
        .limit(pageSize);
      if (after && Number.isFinite(after.lastDueAt) && after.lastUserId)
        q = q.startAfter(after.lastDueAt, after.lastUserId);
      return q.get();
    };
    snap = await readPage(cursor);
    if (!snap.docs.length && cursor?.lastUserId) snap = await readPage(null);
  } catch (e) {
    return { ok: false, reason: e.message, warned: 0, expired: 0, scanned: 0 };
  }

  let warned = 0, expired = 0;
  try {
    for (const doc of snap.docs) {
      const s = doc.data().screening || {};
      const due = Number(s.recheckDue);
      if (s.decision !== 'pass' || !Number.isFinite(due) || due <= 0) continue;
      const uid = doc.id;
      // The old "At" markers were written without a cycle identifier. Accept an
      // old marker only if it belongs to THIS due-date window; renewal never
      // inherits the prior check's notification/suspension marker.
      const warnedThisCycle = Number(s.recheckWarnedForDue) === due ||
        (!s.recheckWarnedForDue && Number(s.recheckWarnedAt) >= due - RECHECK_WARN_MS &&
          Number(s.recheckWarnedAt) < due);
      const expiredThisCycle = Number(s.recheckExpiredForDue) === due ||
        (!s.recheckExpiredForDue && Number(s.recheckExpiredAt) >= due - SCREENING_ADVANCE_MARGIN_MS);
      if (due <= now + SCREENING_ADVANCE_MARGIN_MS && !expiredThisCycle) {
        // The 24h lockout blocks dispatch in advance, regardless of notification.
        await db.collection('operators').doc(uid).set(
          { available: false, screeningBlocked: true,
            screeningReason: 'Background check renewal required before new Travels.' },
          { merge: true },
        );
        // Durable, retry-safe case comes before the one-cycle checkpoint. An
        // email-only notification is not a stored exception. If case storage
        // fails, retain the expired block and try again on a later sweep.
        const caseResult = await createTicket({
          uid, kind: 'support', reason: 'Operator screening renewal deadline approaching',
          idempotencyKey: `screening-renewal-${due}`,
          description: `Operator ${uid}'s background screening conducted ${new Date(Number(s.conductedAt || due - RECHECK_MS)).toISOString().slice(0, 10)} is due ${new Date(due).toISOString().slice(0, 10)}. New Travels are held from 24 hours before that date/time until a current check passes.`,
        });
        if (caseResult?.stored !== true)
          throw new Error('screening_renewal_case_not_stored');
        await doc.ref.set({ screening: { recheckExpiredAt: now, recheckExpiredForDue: due } }, { merge: true });
        await send({
          uid, kind: 'screening_due', title: 'Background check renewal required',
          body: 'A current background check is required to resume operations. Renew it in the app.',
        });
        expired++;
      } else if (due > now && !warnedThisCycle) {
        await doc.ref.set({ screening: { recheckWarnedAt: now, recheckWarnedForDue: due } }, { merge: true });
        await send({
          uid, kind: 'screening_due', title: 'Background check renewal due soon',
          body: `Your background check renewal is due ${new Date(due).toISOString().slice(0, 10)}. Renew it in the app to avoid a pause.`,
        });
        warned++;
      }
    }
    // A failed page never advances the cursor past unprocessed records.
    if (snap.docs.length) {
      const last = snap.docs[snap.docs.length - 1];
      await cursorRef.set({
        lastDueAt: Number(last.data().screening.recheckDue),
        lastUserId: last.id, progressedAt: now,
      }, { merge: false });
    }
    return { ok: true, warned, expired, scanned: snap.docs.length };
  } catch (e) {
    return { ok: false, reason: e.message, warned, expired, scanned: snap.docs.length };
  }
}

module.exports = {
  adjudicate,
  evaluateExistingReport,
  REQUIRED_ELEMENTS,
  recordDecision, recordAdverseState,
  screeningCurrent,
  screeningReady,
  sweepScreening,
  RECHECK_MS,
  RECHECK_WARN_MS,
  SCREENING_ADVANCE_MARGIN_MS,
  DISQUALIFIERS,
};
