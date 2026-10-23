// What an operator has actually been given.
//
// THE DEFECT THIS CLOSES. Dispatch has always written a real travel to `rides` with the
// matched operator on it — but the operator app never read it. It ran a timer that invented a
// request every few seconds from a scripted list (SIM_REQUESTS), so an operator on duty saw
// journeys that did not exist while the traveler who really booked one waited for somebody who
// was never told. Two halves of the same company, neither aware of the other.
//
// It could not have read them anyway: until 19 Aug 2026 the Firestore rule on `rides` matched
// the traveler only, so a real assignment was unreadable to the person assigned to it.
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { fareFromTotal } from '../data';
import { PAYMENT_SERVER_URL } from '../config';
import { type OperatorStatus } from './rideStatusWrite';
import { auth, db } from '../firebase';
import { t } from '../i18n';

export type AssignedTravel = {
  rideId: string;
  /** Whose travel it is. Needed so the operator can write into their message thread — the
   *  security rule lets each side write only as themselves and read only threads they are on,
   *  so the counterparty's uid has to travel with the assignment. */
  travelerUid: string;
  /** Empty when the traveler has not set a name. Never substituted with an invented one. */
  travelerName: string;
  bookedForAnother?: boolean;
  minor?: boolean;
  teen?: boolean;
  guardianName?: string | null;
  pinRequired?: boolean;
  tripNo: string;
  dep: string;
  dest: string;
  travelClass: string;
  /** Server-route estimates for the passenger journey only, not the Operator's approach. */
  miles: number | null;
  routedMinutes: number | null;
  cabinPreferences?: {
    climate: 'Cool' | 'Moderate' | 'Warm';
    music: 'None' | 'Traveler Choice';
    quiet: boolean;
    charging: boolean;
    luggage: boolean;
  };
  costCents: number;
  /** Authoritative Travel Fare before Platform Fee/pass-throughs. */
  travelCostCents: number;
  /** Toll pass-through, reimbursed 100% to the Operator. */
  tollCents: number;
  status: string;
  releasedAt?: number | null;
  createdAt: number;
  /** When the status last changed. Distinguishes a journey underway from one that never
   *  closed — see ACTIVE_RESTORE_MAX_MS in OperatorContext. */
  statusAt: number;
  /** Existing server arrival stamp, reused for a local countdown. */
  arrivedAt?: number | null;
  /** Raised by route monitoring when this vehicle has stopped for longer than a long light.
   *  Written only by the server; answered through POST /travel/check-in. */
  monitor?: {
    state?: string;
    question?: string;
    note?: string;
    askedOperatorAt?: number;
    operatorReply?: string;
  } | null;
};

/**
 * What the operator keeps, from what the traveler paid.
 *
 * `costCents` on a ride record is the ALL-IN price — the fare plus the platform fee. The
 * operator's 99% is of the fare alone, so the fee comes off first. Taking 1% off the
 * total instead would quote an operator 99% of American Rider's fee as well as of their own
 * fare.
 */
// SUBTRACTING A FLAT $1.50 IS ONLY RIGHT BELOW $30. Above that the platform fee is 5% of the
// fare, so taking $1.50 off the total overstates the fare — and therefore overstates what the
// operator is told they earned, on precisely the largest travels.
export const travelFareCents = (costCents: number) =>
  Math.round(fareFromTotal(costCents / 100) * 100);
export const operatorShareCents = (costCents: number) => {
  const fare = travelFareCents(costCents);
  return fare - Math.floor(fare * 0.01);
};

/**
 * Watch for travel dispatched to the signed-in operator.
 *
 * Subscribe only to live Travels using the already-declared (operatorId, status)
 * composite Firestore index. Do not load every completed Travel into the listener.
 * No arbitrary result cap may hide an older live Travel; query errors remain visible.
 *
 * Returns an unsubscribe function. A terminal listener error is NOT an empty
 * inbox. Preserve the last known assignments, report the outage, and reattach
 * with bounded backoff until a healthy server snapshot replaces that data.
 */
export function watchAssignedTravel(
  onChange: (travels: AssignedTravel[]) => void,
  onError?: (reason: string) => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChange([]);
    onError?.(t('traveler.errNotSignedIn'));
    return () => {};
  }
  let disposed = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopListening: (() => void) | null = null;
  let generation = 0;
  const stillOwner = () => !disposed && auth.currentUser?.uid === uid;
  const retry = (reason: string) => {
    if (!stillOwner()) return;
    onError?.(reason);
    if (retryTimer !== null) return;
    // Firestore's error callback TERMINATES that listener; retry must create
    // a fresh identical per-Operator query. No whole-fleet polling or new vendor.
    const delay = Math.min(3_000 * 2 ** Math.min(failures++, 6), 120_000);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      listen();
    }, delay);
  };
  const listen = () => {
    if (!stillOwner()) return;
    const myGeneration = ++generation;
    try {
      const q = query(collection(db, 'rides'),
        where('operatorId', '==', uid),
        where('status', 'in', ['assigned', 'accepted', 'arrived', 'onboard']));
      stopListening = onSnapshot(
      q,
      (snap) => {
        if (!stillOwner() || myGeneration !== generation) return;
        failures = 0;
        onError?.('');
        const open = snap.docs
          .map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              rideId: d.id,
              travelerUid: String(x.travelerUid ?? ''),
              travelerName: String(x.travelerName ?? ''),
              bookedForAnother: (x.party as any)?.bookedForAnother === true,
              teen: (x.party as any)?.teen === true,
              guardianName: typeof (x.party as any)?.guardianName === 'string' ? (x.party as any).guardianName : null,
              pinRequired: (x.party as any)?.pinRequired === true,
              tripNo: String(x.tripNo ?? ''),
              dep: String(x.dep ?? ''),
              dest: String(x.dest ?? ''),
              travelClass: String(x.travelClass ?? 'Standard'),
              // These were already stored by server pricing, but the request sheet never
              // received them. Do not confuse journey length with pickup distance or ETA.
              miles: Number.isFinite(Number(x.miles)) && Number(x.miles) > 0
                ? Number(x.miles) : null,
              routedMinutes: Number.isFinite(Number(x.routedMinutes)) && Number(x.routedMinutes) > 0
                ? Math.round(Number(x.routedMinutes)) : null,
              cabinPreferences: x.cabinPreferences && typeof x.cabinPreferences === 'object'
                ? {
                    climate: ['Cool', 'Moderate', 'Warm'].includes(String((x.cabinPreferences as any).climate))
                      ? (String((x.cabinPreferences as any).climate) as 'Cool' | 'Moderate' | 'Warm')
                      : 'Moderate',
                    music: ['None', 'Traveler Choice'].includes(String((x.cabinPreferences as any).music))
                      ? (String((x.cabinPreferences as any).music) as 'None' | 'Traveler Choice')
                      : 'None',
                    quiet: (x.cabinPreferences as any).quiet !== false,
                    charging: (x.cabinPreferences as any).charging === true,
                    luggage: (x.cabinPreferences as any).luggage === true,
                  }
                : undefined,
              costCents: Number(x.costCents ?? 0),
              travelCostCents: Number(x.travelCostCents ?? 0),
              tollCents: Number(x.tollCents ?? 0),
              status: String(x.status ?? ''),
              releasedAt: Number(x.releasedAt) || null,
              createdAt: Number(x.createdAt ?? 0),
              statusAt: Number(x.statusAt ?? 0),
              arrivedAt: Number(x.arrivedAt) || null,
              monitor: (x.monitor as AssignedTravel['monitor']) ?? null,
            };
          })
          // EVERY travel dispatched to this operator, not just the unanswered ones. The
          // caller decides: 'assigned' is a request to answer, and accepted/arrived/onboard
          // is a journey underway — which the operator app currently keeps only in local
          // state, so it is lost if the app restarts mid-travel.
          .sort((a, b) => b.createdAt - a.createdAt);
        onChange(open);
      },
      // NOT SWALLOWED. The first version of this reported an empty inbox on any failure, so a
      // denied query and a quiet night looked identical — an operator would sit on
      // "Matching you with nearby travelers" while travels were being dispatched to them.
      // That is the same shape as the firebase-admin outage that hid for weeks because the
      // failure was reported honestly at every step except the one that mattered.
      (e) => {
        if (!stillOwner() || myGeneration !== generation) return;
        // A terminal listener error is not permission to erase previously
        // observed assignments. An unreadable inbox stays visibly unavailable.
        stopListening?.();
        stopListening = null;
        retry(e?.message || t('traveler.errReadTravel'));
      },
    );
    } catch (e) {
      if (stillOwner()) {
        retry(typeof (e as { message?: unknown })?.message === 'string'
          ? (e as { message: string }).message : t('traveler.errReadTravel'));
      }
    }
  };
  listen();
  return () => {
    disposed = true;
    generation++;
    if (retryTimer !== null) clearTimeout(retryTimer);
    stopListening?.();
  };
}

/**
 * Move a travel along. The rule permits an operator these statuses and nothing else — not the
 * fare, not the traveler, not who it belongs to.
 *
 * Returns whether the write landed, and never throws. The caller decides what to tell the
 * operator; it must not claim a travel was accepted if the database refused.
 */
async function setStatus(rideId: string, status: OperatorStatus): Promise<boolean> {
  if (!rideId) return false;
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) return false;
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rideId, status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      console.error(`[inbox] server refused travel ${rideId} -> ${status}:`, d?.code || d?.error || res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[inbox] could not request travel ${rideId} -> ${status}:`, (e as Error)?.message);
    return false;
  }
}

/**
 * Accept the travel offered to this operator — through the server, never a direct write.
 *
 * firestore.rules refuses 'accepted' from a phone. POST /travel/accept re-checks, at the moment
 * of acceptance, everything that made the operator eligible when the travel was offered: the
 * insurance disclosure version, approval, documents, insurance, screening, the account and
 * Stripe payouts. A refusal comes back with a code, and the travel goes to somebody else.
 * Never throws; an unreachable server is a refusal, not an acceptance.
 */
export async function acceptTravel(
  rideId: string,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  if (!rideId) return { ok: false, error: 'No travel' };
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ rideId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: d?.error || `Server error ${res.status}`, code: d?.code };
    return { ok: true };
  } catch {
    return { ok: false, error: t('traveler.errReachDispatch') };
  }
}
export const declineTravel = (rideId: string) => setStatus(rideId, 'declined');
export const markArrived = (rideId: string) => setStatus(rideId, 'arrived');
export async function markOnboard(rideId: string, teenPickupCode?: string): Promise<boolean> {
  if (!rideId) return false;
  if (teenPickupCode) {
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch(`${PAYMENT_SERVER_URL}/travel/teen-pickup/verify`, { method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body:JSON.stringify({rideId,pin:teenPickupCode}) });
      if (!res.ok) return false;
    } catch { return false; }
  }
  return setStatus(rideId, 'onboard');
}
export const markCompleted = (rideId: string) => setStatus(rideId, 'completed');

/** Release an accepted preboarding Travel on the server. No new payment or Travel. */
export async function withdrawAcceptedTravel(rideId: string): Promise<{ok:boolean;code?:string}> {
  if (!rideId) return {ok:false,code:'missing_travel'};
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) return {ok:false,code:'not_authenticated'};
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/operator-withdraw`,{
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({rideId}),
    });
    const data=await res.json().catch(()=>({}));
    return {ok:res.ok&&data.ok===true,
      code:res.ok?undefined:String(data.code||'withdraw_unavailable')};
  } catch { return {ok:false,code:'network_unavailable'}; }
}


// An exceptional Operator action. No charge, refund or terminal status is
// written by the phone. The authenticated server decides eligibility and money.
export async function markNoShow(rideId: string): Promise<{ok:boolean;code?:string;refundPending?:boolean}> {
  if (!rideId) return {ok:false,code:'missing_travel'};
  try {
    const token=await auth.currentUser?.getIdToken();
    if (!token) return {ok:false,code:'not_authenticated'};
    const res=await fetch(`${PAYMENT_SERVER_URL}/travel/no-show`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({rideId}),
    });
    const out=await res.json().catch(()=>({}));
    return {ok:res.ok && out.ok===true,
      code:res.ok?undefined:String(out.code||'no_show_unavailable'),
      refundPending:out.refundPending===true};
  } catch { return {ok:false,code:'network_unavailable'}; }
}

