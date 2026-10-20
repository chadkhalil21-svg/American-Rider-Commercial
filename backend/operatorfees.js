// Operator monthly Connect active-account recovery.
//
// Product rule: Stripe's $2 monthly active-account cost belongs to the Operator account that
// caused it, not to every Traveler. No 20-Travel waiver applies under the
// Founder-approved current policy. Operators must first consent to separate collection.
// The 99% fare share is untouched: this is a separate account-cost
// pass-through. Card collection cost is itemized and grossed up so American Rider does not
// subsidize the pass-through or earn a margin on it.
const { adminDb, adminStatus } = require('./firebase-admin');
const { notify } = require('./push');
const { postPlatformMessage } = require('./platforminbox');


const { ACCOUNT_COST_CENTS, FEE_CONSENT_VERSION, currentConnectFeeConsent } = require('./connect-fee-consent');
const DOMESTIC_CARD_PCT = 0.029;
const INTERNATIONAL_CARD_PCT = 0.044;
const CARD_FIXED_CENTS = 30;

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
function monthBounds(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key));
  if (!m) return null;
  const y = Number(m[1]), mon = Number(m[2]) - 1;
  const start = Date.UTC(y, mon, 1);
  const end = Date.UTC(y, mon + 1, 1);
  return { start, end };
}
const grossUp = (cost, pct) => Math.ceil((cost + CARD_FIXED_CENTS) / (1 - pct));
function accountFeeQuote(completedTravels, payoutSeen = true, cardCountry = null) {
  const waived = !payoutSeen;
  const costCents = waived ? 0 : ACCOUNT_COST_CENTS;
  // Unknown card country is international-safe for the same reason Traveler pricing is.
  const pct = String(cardCountry || '').toUpperCase() === 'US' ? DOMESTIC_CARD_PCT : INTERNATIONAL_CARD_PCT;
  const totalCents = waived ? 0 : grossUp(costCents, pct);
  return {
    waived,
    threshold: null,
    costCents,
    processingCents: totalCents - costCents,
    cardCountry: cardCountry || null,
    totalCents,
  };
}

async function uidByAccount(db, accountId) {
  if (!accountId) return null;
  const snap = await db.collection('users').where('stripeAccountId', '==', String(accountId)).limit(1).get();
  return snap.docs[0]?.id || null;
}

async function recordPayoutActivity({ accountId, createdAt = Date.now() }) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason };
  const uid = await uidByAccount(db, accountId);
  if (!uid) return { ok: true, ignored: true };
  const month = monthKey(createdAt);
  const ref = db.collection('operator_months').doc(month).collection('accounts').doc(uid);
  // Record the FIRST payout, not just the latest payout. Otherwise an Operator
  // who consents mid-month could be billed for an earlier unconsented payout.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const rec = snap.exists ? snap.data() || {} : {};
    const firstPayoutAt = Number.isSafeInteger(rec.firstPayoutAt)
      ? Math.min(rec.firstPayoutAt, createdAt)
      : Number.isSafeInteger(rec.lastPayoutAt)
        ? null // legacy monthly record: first payout cannot be proven; never back-bill
        : createdAt;
    tx.set(ref, {
      uid, month, payoutSeen: true,
      ...(firstPayoutAt === null ? {} : { firstPayoutAt }),
      lastPayoutAt: Math.max(Number(rec.lastPayoutAt) || 0, createdAt),
    }, { merge: true });
  });
  return { ok: true, uid, month };
}

async function completedTravelsInMonth(db, uid, month) {
  const b = monthBounds(month);
  if (!b) return 0;
  // Bound the read to this Operator's completed Travels and this month. The previous version
  // fetched the Operator's lifetime history and filtered in process, making a monthly $2
  // assessment progressively more expensive forever.
  try {
    const snap = await db.collection('rides')
      .where('operatorId', '==', String(uid))
      .where('status', '==', 'completed')
      .where('completedAt', '>=', b.start)
      .where('completedAt', '<', b.end)
      .get();
    return snap.size;
  } catch (e) {
    // Fail closed: never assess a fee from an incomplete count. The required composite index
    // is deployment configuration, not a reason to silently fall back to a lifetime scan.
    throw new Error(`completed-Travel count unavailable: ${e?.message || e}`);
  }
}

function previousMonth(now = Date.now()) {
  const d = new Date(now);
  return monthKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

async function sweepOperatorAccountFees({ charge, cardCountryFor = async () => null, now = Date.now() } = {}) {
  const db = adminDb();
  if (!db) return { ok: false, reason: adminStatus().reason };
  if (typeof charge !== 'function') return { ok: false, reason: 'charge function required' };
  const month = previousMonth(now);
  const snap = await db.collection('operator_months').doc(month).collection('accounts').get();
  let charged = 0, waived = 0, due = 0, failed = 0;
  for (const d of snap.docs) {
    const rec = d.data() || {};
    if (!rec.payoutSeen || rec.feeStatus === 'paid' || rec.feeStatus === 'waived') continue;
    if (rec.feeStatus === 'due' && Number(rec.lastAttemptAt || 0) > now - 24 * 60 * 60 * 1000) continue;
    // No historical Travels query is needed: the monthly account fee has no waiver.
    // Consent must predate that month's actual payout. Never back-bill a consent.
    const user = await db.collection('users').doc(d.id).get();
    const consent = user.exists ? user.data()?.stripeFeeConsent : null;
    if (!currentConnectFeeConsent(consent, now) ||
        !Number.isSafeInteger(rec.firstPayoutAt) ||
        consent.acceptedAt > rec.firstPayoutAt) {
      if (rec.feeStatus !== 'consent_required')
        await d.ref.set({ feeStatus:'consent_required', feeConsentVersion:FEE_CONSENT_VERSION }, { merge:true });
      due++;
      continue;
    }
    const email = user.exists ? (user.data()?.email || null) : null;
    const cardCountry = await cardCountryFor(d.id).catch(() => null);
    const q = accountFeeQuote(0, true, cardCountry);
    if (q.waived) {
      await d.ref.set({ feeStatus: 'waived', feeQuote: q, assessedAt: now }, { merge: true });
      waived++;
      continue;
    }
    const result = await charge({ uid: d.id, email, month, amountCents: q.totalCents, quote: q });
    if (result?.ok) {
      await d.ref.set({
        feeStatus: 'paid', feeQuote: q, assessedAt: now,
        paymentIntentId: result.paymentIntentId || null, paidAt: now, lastAttemptAt: now,
      }, { merge: true });
      charged++;
    } else {
      await d.ref.set({
        feeStatus: 'due', feeQuote: q, assessedAt: now, lastAttemptAt: now,
        lastChargeError: String(result?.error || 'payment method unavailable').slice(0, 500),
      }, { merge: true });
      due++; failed++;
      await notify({
        uid: d.id,
        kind: 'operator_account_fee_due',
        title: 'Operator account cost due',
        body: `The separately agreed $2 active-account cost for ${month} remains due. Your 99% Fare share is unchanged.`,
        data: { screen: '/operator/payouts' },
      });
      await postPlatformMessage({
        uid: d.id, category: 'payout', title: 'Operator account cost due',
        body: `The separately agreed $2 active-account cost for ${month} remains due. Your 99% Fare share is unchanged.`,
        action: { screen: '/operator/payouts' },
      }).catch(() => {});
    }
  }
  return { ok: true, month, considered: snap.docs.length, charged, waived, due, failed };
}

module.exports = {
  ACCOUNT_COST_CENTS, FEE_CONSENT_VERSION, monthKey, monthBounds, previousMonth,
  accountFeeQuote, recordPayoutActivity, sweepOperatorAccountFees,
};
