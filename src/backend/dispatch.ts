// American Rider — real dispatch (in-app). Reads operators from Firestore, matches the
// nearest available one who serves the requested class, and saves the ride. This is the
// same logic proven in the backend scripts, now wired into the real app.
import type { FeeLine } from '../data';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getAggregateFromServer,
  count,
  sum,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { PAYMENT_SERVER_URL } from '../config';
import { t } from '../i18n';
import { fetchPaymentConfig } from './payments';

export type Operator = {
  id: string;
  name: string;
  /** The commercial policy's expiry date (YYYY-MM-DD). Absent on the demonstration fleet. */
  insuranceExpiry?: string;
  lat: number;
  lng: number;
  available: boolean;
  /** When this operator's phone last said it was on duty. Absent on the demonstration fleet. */
  onlineAt?: number;
  /** Set by the server when a screening refuses somebody. Never cleared by a phone. */
  screeningBlocked?: boolean;
  classes: string[];
  car: string;
  plate: string;
};

// Mirrors PRESENCE_STALE_MS in backend/matching.js. THE TWO MUST NOT DRIFT — see the note
// there for what mirroring cost us in monitor.js, and see dispatchRide below for why this
// file has a second copy of the dispatch rules at all.
const PRESENCE_STALE_MS = 5 * 60 * 1000;

import { validLiveVehiclePosition, type LiveVehiclePosition } from '../liveVehiclePosition';
export type { LiveVehiclePosition } from '../liveVehiclePosition';

export type MatchedOp = {
  id: string;
  /**
   * True when this is one of the built-in demonstration operators, who cannot report
   * anything. The traveler's screen may only run on a timer for these.
   */
  demo: boolean;
  name: string;
  car: string;
  plate: string;
  etaMin: number;
  miles: number;
  rideId: string;
  tripNo?: string;
  // Where the operator was when matched — the live map animates his approach from here.
  lat: number;
  lng: number;
};

// A small starter fleet around Miami (real neighborhood coordinates).
//
// THESE PEOPLE DO NOT EXIST. They are here so the app can be demonstrated and tested with no
// operator on duty, and they must never stand in for a real driver — see loadFleet.


export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const etaMinutes = (miles: number) => Math.max(1, Math.round((miles / 22) * 60));

// Is real money moving? Asked once and remembered: it decides whether a demonstration
// stand-in is acceptable, and that answer does not change while the app is open.
let liveMoney: boolean | null = null;

// Read the operator fleet from Firestore. The app NEVER writes operators — operators join
// through the server (POST /operator/online), which checks Stripe has cleared them for
// payouts first — so security rules can keep `operators` read-only for clients.
//
// WHAT CHANGED, AND WHY IT MATTERS AT LAUNCH. This used to fall back to the demo fleet
// whenever the collection was empty, which it always was. In test mode that is a useful
// stand-in. In live mode it would match a paying traveler to Miguel D., who does not exist,
// will not arrive, and cannot be paid — so the fallback now stops at the door where real
// money starts. An empty fleet then means what it says: nobody is on duty, and the ride
// screen already has an honest state for that.

/**
 * Is a named operator still out there and free?
 *
 * Used by the lost item return, which tries the operator who drove the travel BEFORE it
 * dispatches anybody else. Returns null when they have finished for the day or left — which
 * is not a failure, it is simply the case where the second return path is the right one.
 */
/**
 * Who can bring a lost item back: the operator who drove the travel if they are still out
 * there, otherwise the nearest one to the point.
 *
 * THE SERVER DECIDES. These two questions used to be answered on the phone by loadFleet(),
 * which pulled every operator document down — position, plate, insurance expiry and screening
 * status, for every operator, to answer a question about one. That was the last reason the app
 * read the fleet at all. The answer now carries a name and a position and nothing else, and
 * the operator it names has passed the same gates as any dispatch.
 */
export async function returnOperator(args: {
  lostItemId: string;
  destination: { lat: number; lng: number };
}): Promise<{ path: 'original-operator' | 'any-operator'; op: Operator; costCents: number } | null> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  const res = await fetch(`${PAYMENT_SERVER_URL}/travel/return-operator`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ lostItemId: args.lostItemId, destination: args.destination }),
  });
  if (!res.ok) return null;
  const out = (await res.json()) as {
    path: 'original-operator' | 'any-operator' | null;
    operator: { id: string; name: string } | null;
    costCents?: number;
  };
  if (!out.path || !out.operator) return null;
  return {
    path: out.path,
    // Only the fields the return needs. There is no plate, no insurance date and no screening
    // state here, because the phone has no reason to hold any of them.
    op: {
      id: out.operator.id,
      name: out.operator.name,
      lat: 0,
      lng: 0,
      available: true,
      classes: ['Standard'],
      car: '',
      plate: '',
    } as Operator,
    costCents: Number(out.costCents) || 0,
  };
}

/**
 * Has this operator's commercial coverage run out?
 *
 * Checked at the moment of matching, not only when they went on duty. A policy that expires
 * at midnight during a shift would otherwise keep receiving travel until the operator happened
 * to go off duty and back on — and American Rider carries no coverage behind it.
 *
 * The demonstration fleet has no date and is never gated: it only exists in test mode, where
 * no real traveler is carried.
 */


// Book a real ride.
//
// THE MATCH HAPPENS ON THE SERVER NOW. This function used to read the whole `operators`
// collection onto the phone, choose an operator itself, and write rides/{id} with that choice
// — and firestore.rules accepted the write on one condition, that `travelerUid` was the
// signed-in user. Nothing checked the operator. So the screening, insurance and disclosure
// gates in backend/matching.js guarded the re-offer sweep and scheduled travel, and never the
// booking a traveler actually makes. See docs/SWEEP-2026-09-19.md, F-A.
//
// POST /travel/dispatch runs the same matchOperator every other caller uses and writes the
// travel with admin access. The phone now learns who is coming; it does not decide.
//
// The demonstration fleet lives on the server too (backend/server.js, /travel/dispatch), so
// this file no longer holds operator records of any kind.
export type PrepareOptions = {
  bookingKey: string;
  paymentMethodId?: string | null; // selected saved card as verified with the displayed quote
  agreedTotalCents?: number | null; // all-in amount the Traveler actually accepted
  cancellationFeeDisclosureVersion?: string | null; // version visibly presented at confirm
  researchQuoteToken?: string | null; // research-only; never a fare input
  pickup: { lat: number; lng: number };
  destinationPoint: { lat: number; lng: number };
  dep: string; dest: string; cls: string;
  journeyNo?: string | null;
  party?: { mode: 'self' | 'other_adult' | 'teen'; travelerName?: string; familyLinkId?: string };
  cabinPreferences?: {
    climate: 'Cool' | 'Moderate' | 'Warm'; music: 'None' | 'Traveler Choice';
    quiet: boolean; charging: boolean; luggage: boolean;
  };
};

async function travelRequest(path: string, body: object): Promise<any> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) throw new Error(t('traveler.errGeneric'));
  const response = await fetch(`${PAYMENT_SERVER_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(result?.error || `Travel request failed (${response.status})`)) as Error & { code?: string };
    error.code = typeof result?.code === 'string' ? result.code : undefined;
    throw error;
  }
  return result;
}

/** One keyed, authoritative fare/party/geometry document, before PaymentSheet opens. */
export async function prepareRide(opts: PrepareOptions): Promise<{
  rideId: string; tripNo: string; amountCents: number; status: string;
}> {
  return travelRequest('/travel/prepare', {
    ...opts, journeyNo: opts.journeyNo ?? null,
    travelerName: opts.party?.travelerName || auth.currentUser?.displayName || '',
    bookerName: auth.currentUser?.displayName || '',
    partyMode: opts.party?.mode || 'self', familyLinkId: opts.party?.familyLinkId,
  });
}

/** Retry only this exact already-paid Travel: never create another booking or charge here. */
export async function dispatchRide(rideId: string): Promise<MatchedOp | null> {
  const out = await travelRequest('/travel/dispatch', { rideId });
  if (!out.matched) return null;
  return {
    id: out.matched.id, demo: !!out.matched.demo,
    name: out.matched.name, car: out.matched.car, plate: out.matched.plate,
    etaMin: out.matched.etaMin, miles: Number(out.matched.miles) || 0,
    rideId: out.rideId, tripNo: out.tripNo,
    lat: out.matched.lat, lng: out.matched.lng,
  };
}

/** What paid for a travel, as the server read it from the charge at settlement. */
export type PaidWith = {
  /** 'card' | 'us_bank_account' | … — Stripe's method type. */
  type: string;
  /** The network, lowercase as Stripe gives it ('visa'); empty for a bank account. */
  brand: string;
  last4: string;
  /** 'apple_pay' | 'google_pay' | 'link' when the card came through a wallet; else null. */
  wallet: string | null;
  /** The bank's name as Stripe records it, when a bank account paid; else null. */
  bank: string | null;
};

const shapePaidWith = (p: unknown): PaidWith | undefined => {
  if (!p || typeof p !== 'object') return undefined;
  const o = p as Record<string, unknown>;
  const type = typeof o.type === 'string' ? o.type : '';
  const brand = typeof o.brand === 'string' ? o.brand : '';
  const last4 = typeof o.last4 === 'string' ? o.last4 : '';
  const wallet = typeof o.wallet === 'string' ? o.wallet : null;
  const bank = typeof o.bank === 'string' && o.bank ? o.bank : null;
  return type || brand || last4 ? { type, brand, last4, wallet, bank } : undefined;
};

export type RideRecord = {
  id: string;
  tripNo: string;
  dep: string;
  arr: string;
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  operatorName: string;
  // Which operator, not just their name — a lost item has to be routed back to the person
  // who drove the travel, and two operators can share a first name and an initial.
  operatorId: string;
  totalCents: number;
  status: string;
  createdAt: number;
  paymentIntentId?: string;
  paidAt?: number;
  authorizationState?: 'held' | 'captured' | 'released';
  refundPending?: boolean;
  /** Road miles recorded at dispatch; absent on travels before 9 Sept 2026. */
  miles?: number;
  /** Stamped by the operator's app when the traveler boards and when the travel ends. */
  onboardAt?: number;
  completedAt?: number;
  feeLines?: FeeLine[];
  governmentFeeCents?: number;
  /** The car, so a relaunch can rebuild the live screen. Absent on travels before 12 Sept 2026. */
  operatorCar?: string;
  operatorPlate?: string;
  operatorDemo?: boolean;
  operatorLat?: number;
  operatorLng?: number;
  operatorEtaMin?: number;
  operatorMiles?: number;
  /** The class the traveler paid for, as operators declare it ('Standard', 'Large Vehicle').
   *  Written at dispatch since the first real dispatch (6e96036, 21 July 2026); read back only
   *  since 15 Sept 2026, which is why the Travel Log could not name it before. */
  travelClass?: string;
  /** What paid, written by the server at settlement from the charge Stripe recorded. Absent
   *  until settlement, and on every travel settled before 15 Sept 2026. */
  paidWith?: PaidWith;
  /** When the server emailed the traveler their receipt (backend/server.js, at settlement).
   *  Absent when no copy was sent. */
  receiptSentAt?: number;
};

// A fixed, index-backed page prevents one long-standing account from loading years of
// Firestore documents whenever the home screen appears. Never use offset(), which charges
// for skipped records. A cursor stays tied to the last row actually presented.
export const TRAVEL_PAGE_SIZE = 25;
export type TravelCursor = QueryDocumentSnapshot<DocumentData>;
export type TravelPage = { rides: RideRecord[]; cursor: TravelCursor | null; hasMore: boolean };

function rideFromSnapshot(d: QueryDocumentSnapshot<DocumentData>): RideRecord {
  const x = d.data() as any;
  return {
    id: d.id,
    tripNo: x.tripNo ?? '',
    dep: typeof x.dep === 'string' ? x.dep : '',
    arr: x.dest ?? '',
    pickupLat: typeof x.pickupLat === 'number' ? x.pickupLat : undefined,
    pickupLng: typeof x.pickupLng === 'number' ? x.pickupLng : undefined,
    destinationLat: typeof x.destinationLat === 'number' ? x.destinationLat : undefined,
    destinationLng: typeof x.destinationLng === 'number' ? x.destinationLng : undefined,
    operatorName: x.operatorName ?? '',
    operatorId: x.operatorId ?? '',
    totalCents: x.costCents ?? 0,
    status: x.status ?? '',
    createdAt: x.createdAt ?? 0,
    paymentIntentId: typeof x.paymentIntentId === 'string' ? x.paymentIntentId : undefined,
    paidAt: typeof x.paidAt === 'number' ? x.paidAt : undefined,
    authorizationState:['held','captured','released'].includes(String(x.authorizationState))
      ? x.authorizationState as 'held' | 'captured' | 'released' : undefined,
    refundPending: x.refundPending === true,
    miles: typeof x.miles === 'number' ? x.miles : undefined,
    onboardAt: typeof x.onboardAt === 'number' ? x.onboardAt : undefined,
    completedAt: typeof x.completedAt === 'number' ? x.completedAt : undefined,
    feeLines: Array.isArray(x.feeLines) ? x.feeLines : undefined,
    operatorCar: typeof x.operatorCar === 'string' ? x.operatorCar : undefined,
    operatorPlate: typeof x.operatorPlate === 'string' ? x.operatorPlate : undefined,
    operatorDemo: typeof x.operatorDemo === 'boolean' ? x.operatorDemo : undefined,
    operatorLat: typeof x.operatorLat === 'number' ? x.operatorLat : undefined,
    operatorLng: typeof x.operatorLng === 'number' ? x.operatorLng : undefined,
    operatorEtaMin: typeof x.operatorEtaMin === 'number' ? x.operatorEtaMin : undefined,
    operatorMiles: typeof x.operatorMiles === 'number' ? x.operatorMiles : undefined,
    governmentFeeCents: typeof x.governmentFeeCents === 'number' ? x.governmentFeeCents : undefined,
    travelClass: typeof x.travelClass === 'string' ? x.travelClass : undefined,
    paidWith: shapePaidWith(x.paidWith),
    receiptSentAt: typeof x.receiptSentAt === 'number' ? x.receiptSentAt : undefined,
  };
}

export async function fetchMyRidesPage(cursor: TravelCursor | null = null, pageSize = TRAVEL_PAGE_SIZE): Promise<TravelPage> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { rides: [], cursor: null, hasMore: false };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('invalid-travel-page-size');
  const first = query(collection(db, 'rides'),
    where('travelerUid', '==', uid), orderBy('createdAt', 'desc'), limit(pageSize + 1));
  const snap = await getDocs(cursor ? query(first, startAfter(cursor)) : first);
  const visible = snap.docs.slice(0, pageSize);
  return {
    rides: visible.map(rideFromSnapshot),
    cursor: snap.docs.length > pageSize ? (visible[visible.length - 1] ?? null) : null,
    hasMore: snap.docs.length > pageSize,
  };
}

// Bounded compatibility method for callers that need only the current travel window.
export async function fetchMyRides(): Promise<RideRecord[]> {
  return (await fetchMyRidesPage()).rides;
}

// An unfinished Travel must remain recoverable even if 25 newer documents exist.
// This is a SECOND narrowly indexed query, never an unbounded history scan.
// Kept separate from the History cursor so old active records cannot corrupt paging.
export async function fetchRecoverableMyRide(): Promise<RideRecord | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const q = query(collection(db, 'rides'),
    where('travelerUid', '==', uid),
    where('status', 'in', ['assigned', 'accepted', 'arrived', 'onboard', 'awaiting_payment', 'awaiting_assignment']),
    limit(12));
  const snap = await getDocs(q);
  return snap.docs.map(rideFromSnapshot).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

// True all-time figures, without reading every Travel document onto a telephone.
// Aggregations charge indexed reads and require the matching deployed Firestore index.
export async function fetchCompletedTravelStats(): Promise<{ trips: number; spent: number }> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { trips: 0, spent: 0 };
  const q = query(collection(db, 'rides'), where('travelerUid', '==', uid), where('status', '==', 'completed'));
  const snap = await getAggregateFromServer(q, { trips: count(), cents: sum('costCents') });
  const data = snap.data();
  return { trips: data.trips, spent: Number((data.cents / 100).toFixed(2)) };
}

/**
 * Record the traveler's review of a completed travel.
 *
 * Ratings are feedback only; no gratuity amount is stored or collected.
 */
export async function recordTravelReview(
  rideId: string,
  review: { stars: number },
): Promise<boolean> {
  if (!rideId) return false;
  try {
    await updateDoc(doc(db, 'rides', rideId), {
      rating: review.stars || null,
      reviewedAt: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

// setRideStatus WAS HERE: the traveler's phone wrote 'completed' or 'cancelled' onto its travel.
// Removed (independent audit of e26adcb, 22 Sept 2026): firestore.rules no longer allows it.
// Cancellation is POST /travel/cancel, which refunds from the travel's own payment; completion
// is recorded by the operator's app.

/**
 * Follow one travel's status as the OPERATOR moves it along.
 *
 * The traveler's screen ran entirely on a 2.6-second timer: it advanced from En Route to
 * Arrived to Onboard on a clock, regardless of where the operator actually was. That was the
 * only option while the operator app could not be reached — it invented its own journeys too.
 * Now that an operator's progress is written to the travel, the traveler's screen can follow
 * the person driving instead of a stopwatch.
 *
 * Returns an unsubscribe function. Never throws: if the listener cannot attach, the caller
 * keeps whatever it was doing rather than freezing on a screen that has stopped updating.
 */
export type TravelMonitor = {
  state?: string;
  note?: string;
  travelerQuestion?: string;
  travelerReply?: string;
  vehiclesStopped?: number;
  stillMin?: number;
  /** Set once a person at American Rider has been brought in. */
  caseNo?: string | null;
};

export function watchRide(
  rideId: string,
  onStatus: (status: string, releasedForReassignment?: boolean) => void,
  // Route monitoring's reading of this journey — a known delay it can explain, or a question
  // for the traveler. Optional so existing callers are unaffected.
  onMonitor?: (m: TravelMonitor | null) => void,
  onAssignment?: (matched: MatchedOp | null) => void,
  onPosition?: (position: LiveVehiclePosition | null) => void,
): () => void {
  if (!rideId) return () => {};
  try {
    return onSnapshot(
      doc(db, 'rides', rideId),
      (snap) => {
        const data = snap.data() as {
          status?: unknown; monitor?: TravelMonitor; releasedAt?: number;
          operatorId?: string; operatorName?: string; operatorCar?: string; operatorPlate?: string;
          operatorLat?: number; operatorLng?: number; operatorEtaMin?: number;
          operatorMiles?: number; operatorDemo?: boolean; tripNo?: string;
          opLat?: number; opLng?: number; opAt?: number;
        } | undefined;
        // Reuse this existing Travel listener: no extra Firestore reads per GPS fix.
        onPosition?.(validLiveVehiclePosition(data));
        if (onAssignment) {
          onAssignment(data?.operatorId && !data.releasedAt &&
            ['assigned', 'accepted', 'arrived', 'onboard'].includes(String(data.status)) ? {
            id: data.operatorId, demo: data.operatorDemo === true,
            name: data.operatorName || '', car: data.operatorCar || '', plate: data.operatorPlate || '',
            lat: Number(data.operatorLat), lng: Number(data.operatorLng),
            etaMin: Number(data.operatorEtaMin) || 0, miles: Number(data.operatorMiles) || 0,
            rideId, tripNo: data.tripNo,
          } : null);
        }
        const s = data?.status;
        if (typeof s === 'string' && s) onStatus(s, s === 'assigned' && !!data?.releasedAt);
        onMonitor?.(data?.monitor ?? null);
      },
      () => {},
    );
  } catch {
    return () => {};
  }
}
