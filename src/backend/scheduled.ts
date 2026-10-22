// Scheduled travel — the reservation, and what the clock did with it.
//
// WHAT THIS RECORD USED TO BE: a day, a time, a destination and a price. Enough to redraw the
// card on the home screen, and nowhere near enough to send anybody. There was no pickup on it,
// no class, no travel number and no fare — so even a server that read the collection could not
// have dispatched from it. The reservation described the appointment; it did not describe the
// journey.
//
// WHAT IT IS NOW: everything backend/scheduler.js needs to match an operator, charge the card
// on file and create the travel, plus the fields the sweep writes back — which is what lets
// the traveler's screen say what has actually happened rather than what was hoped for.
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  startAfter,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { showScheduledOnHome } from '../scheduledHomeState';
import { PAYMENT_SERVER_URL } from '../config';

/** Where a reservation has got to. Written by the sweep, never by the app. */
export type SchedStatus =
  | 'reserved' // waiting for its hour
  | 'dispatching' // scheduler's temporary claimed state, not an accepted Operator
  | 'dispatched' // an operator has been sent
  | 'unmatched' // nobody was available, and the hour has passed
  | 'payment_failed' // the card on file was declined
  | 'price_changed' // the price is no longer the agreed Total; no charge made
  | 'needs_attention' // payment or authorization needs provider/dispatch reconciliation — our responsibility
  | 'cancelled'; // cancelled before dispatch, including revoked Family authorization

export type ScheduledRide = {
  id: string;
  when: string; // 'Today' / 'Tomorrow' / 'Wed, Jul 8'
  time: string; // '6:00'
  period: 'AM' | 'PM';
  arr: string;
  /** Legacy dollar display amount. New server records persist costCents only. */
  cost?: number;
  /** When the travel is due, as a real instant — what decides whether it is still upcoming. */
  atMs: number;
  pickupDate?: string;
  pickupTimeZone?: string;
  /** Affirmative authorization consent for future off-session Travel. */
  offSessionPaymentConsent?: boolean;

  // ---- What the dispatcher needs. -------------------------------------------------------
  /** Pickup and destination as the traveler will read them. */
  dep?: string;
  dest?: string;
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  /** The operator-facing class, e.g. 'Standard' / 'Large Vehicle' / 'Pet Friendly'. */
  travelClass?: string;
  /** The FARE in cents, before the platform fee. The server re-derives the all-in price from
   *  it with the same quote() every other travel uses, so a scheduled travel cannot be priced
   *  by a different rule from a booked one. */
  travelCostCents?: number;
  /** The all-in price in cents, as quoted to the traveler when they reserved. */
  costCents?: number;
  /** Issued at reservation, so the traveler has a Travel Number for it immediately. */
  tripNo?: string;
  travelerName?: string;
  travelerEmail?: string;
  party?: { mode: 'self' | 'other_adult' | 'teen'; travelerName?: string; familyLinkId?: string };

  // ---- What the sweep writes back. ------------------------------------------------------
  status?: SchedStatus;
  rideId?: string;
  operatorName?: string;
  etaMin?: number;
  /** Set when the reservation ended without a journey. Shown to the traveler verbatim. */
  closedReason?: string;
  paymentError?: string;
};

/** Save the reservation. Returns the stored record, or null when nothing was written. */
export async function saveScheduledRide(
  info: Omit<ScheduledRide, 'id'> & { cost: number },
): Promise<(ScheduledRide & { cost: number }) | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    // undefined is not storable in Firestore and throws on write — which would have taken the
    // whole reservation with it. Dropped here rather than at each call site.
    const clean = Object.fromEntries(
      Object.entries(info).filter(([, v]) => v !== undefined),
    );
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...clean,
        costCents: Math.round(info.cost * 100),
        travelerName: info.party?.travelerName || auth.currentUser?.displayName || '',
        bookerName: auth.currentUser?.displayName || '',
        partyMode: info.party?.mode || 'self',
        familyLinkId: info.party?.familyLinkId,
        pickup: { lat: info.pickupLat, lng: info.pickupLng },
        destinationPoint: { lat: info.destinationLat, lng: info.destinationLng },
      }),
    });
    if (!res.ok) return null;
    const saved = await res.json();
    return { ...info, ...saved, cost: typeof saved.costCents === 'number' ? saved.costCents / 100 : info.cost } as ScheduledRide & { cost: number };
  } catch {
    return null;
  }
}

/** Bounded, ordered page of a Traveler's own appointments. Requires the
 * travelerUid/atMs composite index before this candidate can be released.
 * One page is at most twenty reservations; no historic full-collection scan.
 */
export type ScheduledPage = {
  rides: ScheduledRide[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function fetchScheduledRidesPage(
  after?: QueryDocumentSnapshot<DocumentData> | null,
): Promise<ScheduledPage | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    // Include recent failures and just-dispatched pickup times so an operator
    // sent shortly before pickup remains visible when the app reopens.
    const filters = [
      where('travelerUid', '==', uid),
      where('atMs', '>=', Date.now() - 90 * 60 * 1000),
      orderBy('atMs', 'asc'),
    ];
    const q = after
      ? query(collection(db, 'scheduled_rides'), ...filters, startAfter(after), limit(21))
      : query(collection(db, 'scheduled_rides'), ...filters, limit(21));
    const snap = await getDocs(q);
    const shown = snap.docs.slice(0, 20);
    return {
      rides: shown.map((d) => ({ id: d.id, ...(d.data() as Omit<ScheduledRide, 'id'>) })),
      nextCursor: shown.length === 20 ? shown[19] : null,
      hasMore: snap.docs.length > 20,
    };
  } catch {
    // Missing index, permission denial or offline must be shown as unavailable,
    // NEVER misrepresented as "no reservations".
    return null;
  }
}

/**
 * The traveler's next reservation, or null.
 *
 * "Next" now includes one that is already underway: a travel dispatched at 6:22 for a 6:30
 * pickup is still the thing the traveler cares about at 6:31, and dropping it the moment the
 * clock passed the appointed minute would clear the card just as the car arrived.
 *
 * Anything genuinely finished with is ignored rather than deleted: a reservation the traveler
 * made is their record, and quietly removing it would be one more thing the app did without
 * saying.
 */
export async function fetchScheduledRide(): Promise<ScheduledRide | null> {
  // Home is a compact summary; the dedicated Upcoming Travel screen can show
  // every reservation. This lookup uses bounded, indexed pages, never a
  // lifetime-wide query as the account's booking history grows.
  let after: ScheduledPage['nextCursor'] = null;
  for (let pageNo = 0; pageNo < 5; pageNo++) {
    const page = await fetchScheduledRidesPage(after);
    if (!page) return null; // network/index errors cannot become invented bookings
    const now = Date.now();
    const next = page.rides.find((r) => showScheduledOnHome(r, now));
    if (next) return next;
    if (!page.hasMore || !page.nextCursor) return null;
    after = page.nextCursor;
  }
  // The menu's full paginated Upcoming Travel screen remains available;
  // the small Home card does not expand into an unbounded historical scan.
  return null;
}

/**
 * Follow one reservation as the sweep works on it.
 *
 * A traveler with the app open at 6:22 AM should watch the reservation become a travel — the
 * card should not sit reading "Scheduled" until they think to pull down and refresh. The
 * reservation is the only place the dispatch is announced, because there is no push
 * notification yet.
 *
 * Returns an unsubscribe function. Never throws.
 */
export function watchScheduledRide(
  id: string,
  onChange: (r: ScheduledRide | null) => void,
): () => void {
  if (!id) return () => {};
  try {
    return onSnapshot(
      doc(db, 'scheduled_rides', id),
      (snap) => {
        if (!snap.exists()) return onChange(null);
        onChange({ id: snap.id, ...(snap.data() as Omit<ScheduledRide, 'id'>) });
      },
      () => {},
    );
  } catch {
    return () => {};
  }
}

/** Cancel only while the server still considers this a reservation. */
export async function deleteScheduledRide(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;
    const res = await fetch(`${PAYMENT_SERVER_URL}/travel/schedule/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch { return false; }
}
