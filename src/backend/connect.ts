// App-side Stripe Connect — the operator's payout account.
//
// The app never learns or sends an account id. It says "onboard me" and the server decides
// which account that means from the caller's verified token, because a payout destination
// supplied by a client is a payout destination an attacker can choose.
import { PAYMENT_SERVER_URL } from '../config';
import { auth } from '../firebase';
import { t } from '../i18n';

export type ConnectStatus = {
  exists: boolean;
  /** Stripe's answer, not ours. An account that exists but is unfinished cannot be paid. */
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  feeConsentAccepted?: boolean;
  /** What Stripe is still waiting for, in its own field names. */
  due: string[];
};

const NONE: ConnectStatus = { exists: false, payoutsEnabled: false, chargesEnabled: false, due: [] };

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Never throws. Unreachable server reads as "cannot be paid", which is the safe direction. */
export async function connectStatus(): Promise<ConnectStatus> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/connect/status`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return NONE;
    const d = await res.json();
    return {
      exists: d?.exists === true,
      payoutsEnabled: d?.payoutsEnabled === true,
      chargesEnabled: d?.chargesEnabled === true,
      feeConsentAccepted: d?.feeConsentAccepted === true,
      due: Array.isArray(d?.due) ? d.due : [],
    };
  } catch {
    return NONE;
  }
}

/** Separate express consent; never imply it from opening the Stripe browser. */
export async function acceptConnectFees(): Promise<boolean> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/connect/fee-consent`,{
      method:'POST',headers:await authHeaders(),body:JSON.stringify({agreeFeePolicy:true}),
    });
    const d=await res.json().catch(()=>({}));
    return res.ok && d?.ok===true;
  } catch { return false; }
}

export type OnboardResult = { ok: true; url: string } | { ok: false; error: string };

/** Start or resume Stripe-hosted onboarding. Returns the single-use link to open. */
export async function startConnectOnboarding(): Promise<OnboardResult> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/connect/onboard`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d?.url) {
      return {
        ok: false,
        error:
          d?.code === 'no_admin_db'
            ? t('traveler.errPayoutNotOn')
            : d?.error || t('traveler.errPayoutStart'),
      };
    }
    return { ok: true, url: d.url };
  } catch {
    return { ok: false, error: t('traveler.errReachAR') };
  }
}

// ---- GOING ON DUTY ------------------------------------------------------------------------
//
// THE DEFECT THIS CLOSES. "Online" was a boolean in React state and "Commissioned" was a
// string in this phone's storage. Neither reached any other device, and nothing ever wrote the
// `operators` collection dispatch reads — so it always fell back to three hardcoded demo
// drivers. A real, fully onboarded operator could stand in Brickell with the app open and
// never be sent a single travel, because as far as dispatch was concerned they did not exist.
//
// Registration goes through the server, never straight to Firestore: the server is what can
// check Stripe says payouts are enabled before making somebody dispatchable, and the
// collection stays read-only to clients so no phone can invent a colleague or move one.
export async function goOnline(opts: {
  lat: number;
  lng: number;
  name?: string;
  car?: string;
  plate?: string;
  classes?: string[];
  /** The commercial policy's expiry date (YYYY-MM-DD). The server refuses a lapsed one. */
  insuranceExpiry?: string;
}): Promise<{ ok: boolean; error?: string; code?: string; due?: string[] }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/online`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ ...opts, available: true }),
    });
    const d = await res.json().catch(() => ({}));
    // The CODE as well as the message. A refusal an operator can act on needs the screen to
    // know which refusal it is — 'disclosure_required' is cleared by reading one page, and
    // pointing at that page is only possible if the reason survives the trip.
    if (!res.ok) {
      return { ok: false, error: d?.error || `Server error ${res.status}`, code: d?.code, due: d?.due };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: t('traveler.errReachDispatch') };
  }
}

// ---- QUALIFICATION -----------------------------------------------------------------------
//
// The server qualifies an operator automatically when every check passes; a person on /ops
// decides only the exceptions. The phone reads the result and never decides it.
export type QualificationStatus = {
  status: 'qualified' | 'exception' | 'refused' | 'suspended' | 'incomplete' | 'unknown';
  /** The first thing standing in the way, in words the operator can act on. */
  reason: string | null;
};

/** Never throws or waits indefinitely: unknown status never grants qualification. */
export async function qualificationStatus(): Promise<QualificationStatus> {
  const unknown: QualificationStatus = { status: 'unknown', reason: null };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // The deadline covers Firebase token retrieval, fetch AND parsing. Abort the
    // HTTP request if it is still underway, and always release the screen's busy
    // state even when the provider does not return.
    const request: Promise<QualificationStatus> = (async () => {
      const headers = await authHeaders();
      const res = await fetch(`${PAYMENT_SERVER_URL}/operator/qualification`, {
        headers,
        signal: controller.signal,
      });
      if (!res.ok) return unknown;
      const d = await res.json();
      const s = d?.status;
      const known = ['qualified', 'exception', 'refused', 'suspended', 'incomplete'];
      return {
        status: known.includes(s) ? s : 'unknown',
        reason: typeof d?.blockers?.[0]?.reason === 'string' ? d.blockers[0].reason : null,
      };
    })().catch(() => unknown);
    const deadline = new Promise<QualificationStatus>(resolve => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(unknown);
      }, 12_000);
    });
    return await Promise.race([request, deadline]);
  } catch {
    return unknown;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Submit the qualification. The server assesses it at once; incomplete comes back as a refusal. */
export async function submitForReview(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/qualification/submit`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: d?.error || `Server error ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: t('traveler.errReachAR') };
  }
}

// ---- OPERATING MARKET --------------------------------------------------------------------
//
// The county an operator will work in. The server unlocks document reading, screening and
// prelaunch intake needs separate evidence; full activation alone permits paid duty.
export type Market = { id: string; name: string; status: 'active' | 'onboarding' | 'waitlist' };
export type MarketState = { market: Market | null; active: Market[]; onboarding: Market[]; waitlist: Market[]; error?: string };

const EMPTY_MARKETS: MarketState = { market: null, active: [], onboarding: [], waitlist: [] };

/** Never throws. */
export async function getOperatingMarket(): Promise<MarketState> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/market`, { headers: await authHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ...EMPTY_MARKETS, error: typeof d?.error === 'string' ? d.error : t('traveler.couldNotSaveConn') };
    return { market: d?.market ?? null, active: Array.isArray(d?.active) ? d.active : [],
      onboarding: Array.isArray(d?.onboarding) ? d.onboarding : [],
      waitlist: Array.isArray(d?.waitlist) ? d.waitlist : [] };
  } catch {
    return { ...EMPTY_MARKETS, error: t('traveler.couldNotSaveConn') };
  }
}

/** Declare a county, or send a position for the server to place. Never throws. */
export async function setOperatingMarket(
  arg: { marketId: string } | { lat: number; lng: number },
): Promise<MarketState> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/market`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(arg),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ...EMPTY_MARKETS, error: typeof d?.error === 'string' ? d.error : t('traveler.couldNotSaveConn') };
    return { market: d?.market ?? null, active: Array.isArray(d?.active) ? d.active : [],
      onboarding: Array.isArray(d?.onboarding) ? d.onboarding : [],
      waitlist: Array.isArray(d?.waitlist) ? d.waitlist : [] };
  } catch {
    return { ...EMPTY_MARKETS, error: t('traveler.couldNotSaveConn') };
  }
}

/**
 * Register interest in a place American Rider does not serve yet. One record per account on
 * the server; nothing else starts. Never throws; true when it was recorded.
 */
export async function joinWaitlist(at: { lat: number; lng: number }, role: 'traveler' | 'operator' = 'traveler'): Promise<boolean> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/waitlist`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ lat: at.lat, lng: at.lng, role }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Optional, inexpensive interest record. County selection alone is not consent. */
export async function joinOperatorAreaWaitlist(marketId: string): Promise<boolean> {
  if (!marketId) return false;
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/waitlist`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ marketId, role: 'operator' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Stop being matchable. Never throws — going off duty must always be possible. */
/** Only a confirmed success means server dispatch eligibility was withdrawn.
 * A failed HTTP response is just as unconfirmed as a network exception.
 * Caller retains a durable pending-conclusion request for retry.
 */
export async function goOffline(): Promise<boolean> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/offline`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    if (!res.ok) return false;
    const result = await res.json().catch(() => null);
    return result?.ok === true;
  } catch {
    return false;
  }
}

/**
 * A recovery attempt has three distinct results: a verified response from the server,
 * a confirmed list of still-unpaid Travels, or an unconfirmed request. Neither an HTTP
 * failure nor a Stripe refusal is proof that the Operator has no outstanding fares.
 */
export type PayoutRecoveryResult =
  | { ok: true; settled: number; centsPaid: number; stillOwed: { tripNo: string | null; reason: string }[] }
  | { ok: false; code: string; error: string };

/** Ask the authenticated server to retry recorded unpaid Travel, without inventing success. */
export async function settlePendingPayouts(): Promise<PayoutRecoveryResult> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/settle-pending`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || d?.ok !== true) {
      return {
        ok: false,
        code: typeof d?.code === 'string' ? d.code : 'recovery_unconfirmed',
        error: typeof d?.error === 'string' ? d.error :
          typeof d?.reason === 'string' ? d.reason : t('traveler.errReachAR'),
      };
    }
    // A malformed server response is not a successful reconciliation either.
    const settled = Number(d.settled);
    const centsPaid = Number(d.centsPaid);
    if (!Number.isSafeInteger(settled) || settled < 0 ||
        !Number.isSafeInteger(centsPaid) || centsPaid < 0 ||
        !Array.isArray(d.stillOwed)) {
      return { ok: false, code: 'recovery_incomplete', error: t('traveler.errReachAR') };
    }
    return {
      ok: true,
      settled,
      centsPaid,
      stillOwed: d.stillOwed
        .filter((entry: unknown) => !!entry && typeof entry === 'object')
        .map((entry: any) => ({
          tripNo: typeof entry.tripNo === 'string' ? entry.tripNo : null,
          reason: typeof entry.reason === 'string' ? entry.reason : 'pending',
        })),
    };
  } catch {
    return { ok: false, code: 'recovery_unreachable', error: t('traveler.errReachAR') };
  }
}

/** Only server-recorded transfer status, not a Stripe bank deposit. */
export type OperatorPayoutRecord = {
  rideId: string;
  tripNo: string | null;
  completedAt: number | null;
  status: 'transfer_recorded' | 'reconciliation_needed';
  transferredCents: number | null;
};
export type OperatorPayoutPage =
  | { ok: true; records: OperatorPayoutRecord[]; hasMore: boolean; nextCursor: string | null }
  | { ok: false; error: string };

/** View one's own historical ledger one bounded page at a time. No money is moved. */
export async function operatorPayoutRecords(after: string | null = null): Promise<OperatorPayoutPage> {
  try {
    const uri = `${PAYMENT_SERVER_URL}/operator/payout-records` +
      (after ? `?after=${encodeURIComponent(after)}` : '');
    const res = await fetch(uri, { headers: await authHeaders() });
    const d = await res.json().catch(() => null);
    if (!res.ok || d?.ok !== true || !Array.isArray(d.records)) {
      return { ok: false, error: t('traveler.errReachAR') };
    }
    return {
      ok: true,
      records: d.records.filter((v: any) =>
        v && typeof v.rideId === 'string' &&
        (v.status === 'transfer_recorded' || v.status === 'reconciliation_needed')
      ).map((v: any): OperatorPayoutRecord => ({
        rideId: v.rideId,
        tripNo: typeof v.tripNo === 'string' ? v.tripNo : null,
        completedAt: Number.isSafeInteger(v.completedAt) ? v.completedAt : null,
        status: v.status,
        transferredCents: Number.isSafeInteger(v.transferredCents) && v.transferredCents >= 0 ?
          v.transferredCents : null,
      })),
      hasMore: d.hasMore === true,
      nextCursor: typeof d.nextCursor === 'string' ? d.nextCursor : null,
    };
  } catch {
    return { ok: false, error: t('traveler.errReachAR') };
  }
}

/**
 * A link into the operator's own Stripe dashboard, where their payouts actually live.
 *
 * American Rider never holds their money: the 99% goes to their connected account as each
 * travel completes, and Stripe pays it to their bank on its own schedule. Instant payouts are
 * taken there too, at Stripe's fee, by the operator — which is what Chad asked for, and it
 * needs no payout machinery of ours to be true.
 */
export async function openPayoutDashboard(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/connect/dashboard`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d?.url) return { ok: false, error: d?.error || `Server error ${res.status}` };
    return { ok: true, url: d.url };
  } catch {
    return { ok: false, error: t('traveler.paymentServerUnreachable') };
  }
}
