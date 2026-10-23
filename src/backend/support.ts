// App-side Patron Support. The app describes what happened; the SERVER decides what to do
// about it and whether a person is involved.
//
// WHAT THIS REPLACES: `escalate` in RideContext was `setIssueState('escalated')` — a flag in
// the phone's memory. The screen then said "A specialist is responding" and nobody had been
// told. Every function here returns what actually happened, including failure, so a screen
// can never claim more than took place.
import { PAYMENT_SERVER_URL } from '../config';
import { auth } from '../firebase';
import { i18n, t } from '../i18n';

/** The travel a case concerns. Sent so the server reasons from recorded facts, not guesses. */
export type SupportTrip = {
  /** Firestore Travel id. Monetary remedies are impossible without this authoritative key. */
  rideId?: string;
  no: string;
  dep: string;
  arr: string;
  totalCents: number;
  date: string;
  operator?: string;
  /** The Stripe PaymentIntent for this travel, when the app has one. Without it no credit
   *  can be refunded automatically and the server routes the case to a person instead. */
  paymentIntentId?: string;
};

export type SupportOutcome =
  | { action: 'explain'; message: string }
  | { action: 'credit'; message: string; creditCents: number; refunded: boolean }
  | { action: 'escalate'; message: string; caseNo: string | null; filed: boolean }
  // Reaching nobody at all is its own outcome and must read as one.
  | { action: 'unreachable'; message: string };

// Resolve language at the moment of a failure, not once at app startup.
// Travelers may change language without reloading the application.
const unreachable = (): SupportOutcome => ({
  action: 'unreachable',
  message: t('traveler.supportUnreachable'),
});

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Put a support case in front of the server.
 *
 * Never throws and never returns "resolved" on its own. If the request fails the traveler is
 * told the truth and given the address of an inbox a person reads.
 */
export async function submitIssue(args: {
  /** The matter the traveler chose: 'fare' | 'route' | 'cancel' | 'safety'. Context for the
   *  model — except Safety, which the server always hands to a person whatever the words. */
  category: string;
  description: string;
  /** The travel the case concerns, when the app holds its record; null when it does not.
   *  Never a seeded or guessed travel: the server reasons from these figures. */
  trip: SupportTrip | null;
}): Promise<SupportOutcome> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/support`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        description: args.description,
        rideId: args.trip?.rideId,
        trip: args.trip ?? undefined,
        category: args.category,
        // So every word the traveler reads back — the model's answer and our fixed lines — is
        // in their language, not English inside a Spanish screen.
        language: i18n.locale,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return unreachable();

    if (d.action === 'credit' && typeof d.credit_cents === 'number') {
      return {
        action: 'credit',
        message: String(d.message || ''),
        creditCents: d.credit_cents,
        refunded: d.refunded === true,
      };
    }
    if (d.action === 'explain') {
      return { action: 'explain', message: String(d.message || '') };
    }
    if (d.action === 'escalate') {
      return {
        action: 'escalate',
        message: String(d.message || ''),
        caseNo: d.caseNo ?? null,
        filed: d.filed === true,
      };
    }
    return unreachable();
  } catch {
    return unreachable();
  }
}

/** One of the traveler's own filed cases, as the server lists them (GET /support/cases). */
export type SupportCase = {
  caseNo: string;
  kind: 'support' | 'emergency';
  createdAt: number;
  tripNo: string | null;
  status: string;
  acknowledgedAt?: number | null;
};

/** The traveler's filed cases, newest first. Never throws; an unreachable server is said. */
export async function fetchMyCases(): Promise<{ cases: SupportCase[]; unavailable?: string; possiblyIncomplete?: boolean }> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/support/cases`, { headers: await authHeaders() });
    if (!res.ok) return { cases: [], unavailable: `server_${res.status}` };
    const d = (await res.json().catch(() => ({}))) as { cases?: SupportCase[]; possiblyIncomplete?: boolean };
    return { cases: Array.isArray(d.cases) ? d.cases : [], possiblyIncomplete: d.possiblyIncomplete === true };
  } catch {
    return { cases: [], unavailable: 'unreachable' };
  }
}

// An Emergency identifies the real Travel, not a pricing or refund request.
// Operators have their server-assigned Travel Number and route, but do not
// necessarily hold the Traveler Total or receipt date; never invent these.
export type EmergencyTrip = Pick<SupportTrip, 'no' | 'dep' | 'arr' | 'operator' | 'rideId'> &
  Partial<Pick<SupportTrip, 'totalCents' | 'date'>>;

export type VerifiedEmergencyTravel = {
  rideId: string;
  tripNo: string;
  dep: string;
  dest: string;
  operator: string;
  vehicle: string;
  plate: string;
  role: 'operator' | 'traveler';
  monitoredCase: { caseNo: string; stored: boolean; emailed: boolean } | null;
};

/** Only the backend may attest Emergency Travel identity or an existing incident.
 * An unavailable lookup never yields imaginary vehicle details. */
export async function fetchEmergencyTravelContext(
  rideId: string,
): Promise<VerifiedEmergencyTravel | null> {
  if (!/^[a-f0-9]{40}$/.test(rideId)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `${PAYMENT_SERVER_URL}/emergency/context?rideId=${encodeURIComponent(rideId)}`,
      { headers: await authHeaders(), signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.context;
    if (!v || v.rideId !== rideId || typeof v.tripNo !== 'string') return null;
    return {
      rideId, tripNo: v.tripNo, dep: typeof v.dep === 'string' ? v.dep : '',
      dest: typeof v.dest === 'string' ? v.dest : '',
      operator: typeof v.operator === 'string' ? v.operator : '',
      vehicle: typeof v.vehicle === 'string' ? v.vehicle : '',
      plate: typeof v.plate === 'string' ? v.plate : '',
      role: v.role === 'operator' ? 'operator' : 'traveler',
      monitoredCase: v.monitoredCase?.stored === true &&
        typeof v.monitoredCase.caseNo === 'string'
          ? { caseNo: v.monitoredCase.caseNo, stored: true,
              emailed: v.monitoredCase.emailed === true }
          : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type EmergencyReport = {
  ok: boolean;
  caseNo: string | null;
  stored: boolean;
  emailed: boolean;
};

/**
 * Tell American Rider that a traveler has opened the emergency screen.
 *
 * This is not a resolution flow and never asks a model anything: it files a case marked
 * emergency and returns whether that actually happened. The screen states the answer either
 * way — "notified, case AR-C-…" or "could not be reached" — because a person mid-emergency
 * must not be told help is coming when it is not.
 */
export async function alertEmergency(args: {
  requestId: string;
  rideId?: string | null;
  // NULL WHEN NO TRAVEL IS UNDERWAY. An emergency can be raised from the safety screen with
  // nothing booked, and until 19 Sept 2026 that case was filed against the seeded
  // demonstration journey because the screen read it out of `lastTrip`. A case describing a
  // trip to the airport on 6 July that never happened, sitting next to a real person in real
  // trouble, is worse than a case with no travel on it.
  trip: EmergencyTrip | null;
  operator: string;
  vehicle: string;
  plate: string;
  address: string | null;
  coords: { lat: number; lng: number } | null;
}): Promise<EmergencyReport> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/emergency`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(args),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, caseNo: null, stored: false, emailed: false };
    return { ok: d.stored === true && d.emailed === true, caseNo: d.caseNo ?? null,
      stored: d.stored === true, emailed: d.emailed === true };
  } catch {
    return { ok: false, caseNo: null, stored: false, emailed: false };
  }
}

/**
 * Keep an open emergency case current as the vehicle moves.
 *
 * Best-effort by design: the traveler is already told where the notification stands, and a
 * dropped update must not change that or interrupt the screen.
 */
export async function updateEmergencyLocation(args: {
  caseNo: string;
  address: string | null;
  coords: { lat: number; lng: number } | null;
}): Promise<void> {
  try {
    await fetch(`${PAYMENT_SERVER_URL}/emergency/location`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(args),
    });
  } catch {
    // Swallowed deliberately — see above.
  }
}

// ——— OPERATOR SUPPORT ————————————————————————————————————————————————————————————
// The operator's own path to the platform AI. It did not exist until 20 Sept 2026: Patron
// Support had answered travelers since 16 August and an operator whose traveler never appeared
// had nowhere to say so.
//
// THE REMEDY IS A PAYMENT, NOT A REFUND, which is why this is its own call and not a flag on
// the one above. Money goes out to the operator and it is American Rider's; a completed fare
// is never taken back from a traveler to settle an operator's complaint.

/** What the operator's case produced. `paid` is true only when a transfer actually settled. */
export type OperatorSupportOutcome = {
  action: 'explain' | 'pay' | 'escalate';
  message: string | null;
  paid?: boolean;
  payCents?: number;
  caseNo?: string | null;
  filed?: boolean;
  unreachable?: boolean;
};

const OP_UNREACHABLE: OperatorSupportOutcome = {
  action: 'escalate',
  message: null,
  unreachable: true,
};

/**
 * Put an operator's problem to the platform. Never throws: an unreachable server reads as
 * "this needs a person", which is the safe direction — the same rule the traveler's side
 * follows, and for the same reason. The one outcome that must never happen is somebody being
 * told nothing.
 */
export async function raiseOperatorIssue(args: {
  description: string;
  travel: SupportTrip | null;
}): Promise<OperatorSupportOutcome> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/support`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        description: args.description,
        travel: args.travel ?? undefined,
        language: i18n.locale,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return OP_UNREACHABLE;
    const action = d?.action === 'explain' || d?.action === 'pay' ? d.action : 'escalate';
    return {
      action,
      message: typeof d?.message === 'string' ? d.message : null,
      paid: d?.paid === true,
      payCents: typeof d?.pay_cents === 'number' ? d.pay_cents : undefined,
      caseNo: typeof d?.caseNo === 'string' ? d.caseNo : null,
      filed: d?.filed === true,
    };
  } catch {
    return OP_UNREACHABLE;
  }
}
