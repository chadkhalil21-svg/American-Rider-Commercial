// Smart Travel client — asks the server for a transit-assisted plan. The server plans it with
// OpenTripPlanner on Miami-Dade GTFS and prices the car legs; this file only carries the answer.
//
// THREE ANSWERS, never an exception (founders, 9 Sept 2026):
//   ok           a plan, with its numbers, whether or not it beats driving — the screen decides
//                emphasis, the server does not decide what a traveler may see
//   none         no transit route exists for this trip — Smart Travel is shown greyed
//   unavailable  the planner is not answering (503, network, malformed) — the screen says so
import { PAYMENT_SERVER_URL, SMART_TRAVEL_NEW_BOOKINGS_ENABLED } from '../config';
import type { FeeLine } from '../data';

export type SmartLegKind = 'walk' | 'car' | 'transit';
export type SmartLegMode = 'walk' | 'car' | 'bus' | 'subway' | 'tram' | 'rail' | 'ferry';

export type SmartPlace = { name: string; lat: number; lng: number; stopId?: string };

/** The GTFS route a transit leg rides, as OTP names it. */
export type SmartRoute = {
  gtfsId: string;
  shortName: string;
  longName: string;
  agency: string;
  agencyId?: string;
};

export type SmartLeg = {
  kind: SmartLegKind;
  mode: SmartLegMode;
  route?: SmartRoute;
  /** Government fees on a car leg (an airport pickup, say), included in its price. */
  feeLines?: FeeLine[];
  governmentFeeCents?: number;
  headsign?: string;
  /** Plain factual English from the server; screens localise from `mode` and `route`. */
  label: string;
  detail: string;
  from: SmartPlace;
  to: SmartPlace;
  minutes: number;
  /** Car legs: what American Rider charges. Transit legs: the agency's fare. Walks: 0. */
  cents: number;
  miles?: number;
  /** Transit legs: intermediate stops passed. */
  stops?: number;
  /** The agency's fare is not known to the server (Tri-Rail, Brightline); `cents` is 0. */
  fareUnknown?: boolean;
};

/** The boarding (`from`) and alighting (`to`) stops; `id` is the GTFS stop id. */
export type SmartStop = { id: string; name: string; lat: number; lng: number };

export type SmartPlan = {
  status: 'ok';
  /** A compatible continuation after the first car Travel was already paid. */
  revision?: boolean;
  from: SmartStop;
  to: SmartStop;
  legs: SmartLeg[];
  /** What American Rider charges across the real car Travels, including their coordinated platform fees. */
  smartCents: number;
  feeCents: number;
  carCents: number;
  /** Transit fares, paid by the traveler to the agency. Never billed by us. */
  transitFareCents: number;
  /** Older name for transitFareCents. */
  railFareCents: number;
  /** smartCents + transitFareCents — what the journey actually costs the traveler. */
  journeyCents: number;
  directCents: number;
  saveCents: number;
  smartMin: number;
  directMin: number;
  saveMin: number;
  /** ISO 8601. */
  departAt: string;
  arriveAt: string;
  /** At least one transit leg's fare is not known to the server. */
  transitFareUnknown?: boolean;
};

export type SmartQuoteStatus = 'ok' | 'none' | 'unavailable';

export type SmartQuote =
  | { status: 'ok'; plan: SmartPlan }
  | { status: 'none'; plan: null }
  | { status: 'unavailable'; plan: null };

export async function fetchSmartQuote(
  pickup: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): Promise<SmartQuote> {
  if (!SMART_TRAVEL_NEW_BOOKINGS_ENABLED) return { status: 'unavailable', plan: null };
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/smart-quote`, {
      method: 'POST',
      // Names the contract this app speaks. A server that has never seen this header is the
      // older one, whose plan carries no `status` and is treated as unavailable below; the
      // newer server, in turn, answers older apps (no header) exactly as the old server did.
      headers: { 'Content-Type': 'application/json', 'X-AR-Smart': '2' },
      body: JSON.stringify({ pickup, dest }),
    });
    if (!res.ok) return { status: 'unavailable', plan: null };
    const body = (await res.json()) as { status?: string; legs?: unknown };
    if (body.status === 'none') return { status: 'none', plan: null };
    if (body.status !== 'ok' || !Array.isArray(body.legs)) return { status: 'unavailable', plan: null };
    return { status: 'ok', plan: body as SmartPlan };
  } catch {
    return { status: 'unavailable', plan: null };
  }
}


export type SmartRevalidation =
  | { status: 'ok'; changed: boolean; checkedAt: string; departAt: string | null; arriveAt: string | null; routeSignature: string; replacementPlan?: SmartPlan }
  | { status: 'none'; reason?: string }
  | { status: 'unavailable'; reason?: string };

export async function revalidateSmartTransit(plan: SmartPlan, destination?: { lat: number; lng: number }): Promise<SmartRevalidation> {
  try {
    const res = await fetch(`${PAYMENT_SERVER_URL}/smart-revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AR-Smart': '2' },
      body: JSON.stringify({ plan, destination }),
    });
    const body = await res.json().catch(() => null) as SmartRevalidation | null;
    if (!body || !['ok', 'none', 'unavailable'].includes(body.status)) return { status: 'unavailable', reason: 'malformed_response' };
    if (!res.ok && body.status !== 'unavailable') return { status: 'unavailable', reason: 'planner_error' };
    return body;
  } catch {
    return { status: 'unavailable', reason: 'network_error' };
  }
}
