// Turning a place the traveler picked into the ONE all-in price they'll pay.
//
// TWO STEPS, and the second one is the important one:
//   1. Geocode — ask Apple where that place actually is (lat/lng). Happens on the phone.
//   2. Quote   — ask OUR SERVER what that trip costs. Happens on the server, always.
//
// The app never calculates a price. It only ever says WHERE the traveler is going. That is
// what stops a tampered copy of the app from deciding its own fare, and it is why the fare
// constants live in backend/fares.js and nowhere else.
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { auth } from '../firebase';
import { fetchPaymentMethods } from './payments';
import { PAYMENT_SERVER_URL } from '../config';
import type { FeeLine } from '../data';
import { t } from '../i18n';

export type Coords = { lat: number; lng: number };
export type QuoteFailureCode =
  | 'toll_unavailable' | 'production_not_ready' | 'route_geometry_required'
  | 'request_throttled' | 'network_unavailable' | 'server_unavailable' | 'invalid_quote';

export type Quote = {
  travelerPays: number; // cents — the ONE price shown to the traveler (fare + platform fee)
  researchQuoteToken?: string; // optional signed research reference; no fare authority
  selectedPaymentMethodId?: string; // Stripe-owned saved card used for this exact quote
  /** The journey time the fare was computed from, when the server priced by coordinates. */
  minutes?: number;
  operatorGets: number; // cents — 99% of the fare
  travelCostCents: number; // cents — the fare itself, before our platform fee
  miles: number | null; // null when priced from the old named-place table
  /** Government per-trip fees the server fenced from the coordinates, included in travelerPays. */
  governmentFeeCents: number;
  feeLines: FeeLine[];
};

// ——— WHERE A LOOSE SEARCH IS ANCHORED ——————————————————————————————————————————
//
// This was `const MARKET_SUFFIX = ', Miami, FL'` — appended to every loose search, for every
// traveler, everywhere. Adrian, 20 Sept 2026: "if someone opens the app in New York City, what
// would they see?" They would type "times square" and we would ask Apple for "times square,
// Miami, FL" FIRST. A traveler in Fort Lauderdale typing "las olas" — a street four miles from
// them, inside our own market — was asked about Miami before their own city.
//
// THE ANCHOR IS THE TRAVELER'S OWN CITY, read from their coordinates. It costs nothing (the
// device's own reverse geocoder), needs no service, no key and no rate limit, and it is
// correct in every city on earth rather than in one. Apple's geocoder has always been
// national; only this constant was not.
//
// A SEARCH IS THE MECHANISM; A LIST OF PLACES IS NOT. Anything curated by hand is a cost that
// grows with every market and is maintained, at the fiftieth city, by nobody. backend/places.js
// exists as a first-run affordance for launch markets — a traveler with no history has to be
// shown that the app accepts something — and it must not become the way destinations work.
let anchorCache: { lat: number; lng: number; suffix: string } | null = null;

/**
 * ", City, ST" for wherever these coordinates are, or '' when it cannot be established.
 *
 * EMPTY IS THE SAFE ANSWER, not a default city: an unanchored search asks Apple about the
 * whole world, which may return the wrong "Springfield" — while a WRONGLY anchored one
 * reliably returns a place in a city the traveler is not in, which is worse and is what
 * shipped until today.
 */
async function anchorFor(near: Coords | null): Promise<string> {
  if (!near || Platform.OS === 'web') return '';
  // Reverse geocoding is a real call; a traveler does not move city between keystrokes.
  if (anchorCache && Math.abs(anchorCache.lat - near.lat) < 0.2 && Math.abs(anchorCache.lng - near.lng) < 0.2) {
    return anchorCache.suffix;
  }
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: near.lat, longitude: near.lng });
    const city = place?.city || place?.subregion || null;
    const state = place?.region || null;
    const suffix = city ? `, ${city}${state ? `, ${state}` : ''}` : '';
    anchorCache = { lat: near.lat, lng: near.lng, suffix };
    return suffix;
  } catch {
    return '';
  }
}

const looksSpecific = (q: string) => /\d/.test(q) || /,/.test(q);

// Ask Apple where a place is. Returns null if it can't find it, or on web (where the OS
// geocoder isn't available — the browser preview falls back to the named-place path).
export async function geocodePlace(query: string, near: Coords | null = null): Promise<Coords | null> {
  const q = query.trim();
  if (!q) return null;
  if (Platform.OS === 'web') return null;

  // A bare neighbourhood name needs the city appended; a full street address does not.
  const suffix = await anchorFor(near);
  const attempts = suffix
    ? (looksSpecific(q) ? [q, `${q}${suffix}`] : [`${q}${suffix}`, q])
    : [q];

  for (const attempt of attempts) {
    try {
      const results = await Location.geocodeAsync(attempt);
      if (results?.length) {
        return { lat: results[0].latitude, lng: results[0].longitude };
      }
    } catch {
      // Geocoding is best-effort — a failure just means we try the next form, then give up.
    }
  }
  return null;
}

// Ask the server what a trip costs. Pass coordinates when we have them; fall back to a known
// destination name (the old fixed table) when we don't — e.g. in the web preview.
/** Somewhere American Rider does not go. Distinct from a quote that failed to arrive. */
export type Unavailable = {
  unavailable: string;
  /** Set when the PICKUP is outside every active market — the one case a waitlist answers. */
  waitlistAt?: { lat: number; lng: number } | null;
};
export const isUnavailable = (q: Quote | Unavailable | null): q is Unavailable =>
  !!q && 'unavailable' in q;

async function fetchQuoteUnshared(args: {
  pickup?: Coords | null;
  dest?: Coords | null;
  destination?: string | null;
  travelClass?: string | null;
  preferSavedCard?: boolean; // only when Traveler chose Card, not wallet
  journeyNo?: string | null;
  /** A safe failure reason for the UI; this callback never changes fare authority. */
  onFailure?: (reason: QuoteFailureCode) => void;
}): Promise<Quote | Unavailable | null> {
  const base =
    args.pickup && args.dest
      ? { pickup: args.pickup, dest: args.dest }
      : args.destination
        ? { destination: args.destination }
        : null;
  if (!base) { args.onFailure?.('route_geometry_required'); return null; }
  // The class is a NAME, never a price — the server applies the multiplier.
  // Resolve the exact current default saved card BEFORE asking for the final
  // Total. Unknown/unavailable cards keep conservative issuer-safe pricing.
  const wallet=auth.currentUser&&args.preferSavedCard===true
    ?await fetchPaymentMethods().catch(()=>({methods:[],unavailable:'error'}))
    :{methods:[]};
  const selected=wallet.methods.find(m=>m.isDefault&&m.type==='card') ||
    wallet.methods.find(m=>m.type==='card') || null;
  const body = {
    ...base,
    ...(selected?.id?{paymentMethodId:selected.id}:{}),
    ...(args.travelClass ? {travelClass:args.travelClass} : {}),
    ...(args.journeyNo ? {journeyNo:args.journeyNo} : {}),
  };

  try {
    // SIGNED IN, SO THE QUOTE IS ON THE RIGHT FEE SCHEDULE. The platform fee depends on the
    // issuing country of the traveler's saved card (Chad, 20 Sept 2026), and only the server
    // may read it. Without this header the server cannot tell who is asking and quotes the
    // domestic schedule — which for a traveler holding a foreign card would mean a price here
    // that does not match the charge. The route stays open to a signed-out caller on purpose:
    // a price has to be visible before anybody signs in.
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${PAYMENT_SERVER_URL}/fare-quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => null);
    // OUT OF MARKET IS AN ANSWER, NOT A FAILURE, and the two must not look alike. The server
    // priced San Francisco to Miami at $6,228.25 until 28 Aug 2026; now it refuses, and a
    // refusal that arrived here as `null` would have shown "Select the destination again to
    // confirm the amount" — inviting the traveler to keep trying something that will never work.
    if (res.status === 409 && d?.code === 'outside_market') {
      const p = (args as { pickup?: { lat: number; lng: number } | null }).pickup ?? null;
      return {
        unavailable: String(d.error || t('traveler.errNotServedYet')),
        waitlistAt: (d?.where === 'pickup' || d?.where === 'both') && p ? { lat: p.lat, lng: p.lng } : null,
      };
    }
    // A PLACE WE HOLD NO PERMIT FOR IS THE SAME KIND OF ANSWER as one outside the market, and
    // the traveler is owed the same clarity: this cannot be booked, and it is not their doing.
    // The reason is translated here rather than taken from the server, because the server's
    // sentence is English and this one is read by somebody who chose another language.
    if (res.status === 409 && d?.code === 'permit_required') {
      return {
        unavailable:
          d?.where === 'pickup'
            ? t('traveler.errNoPickupPermit')
            : t('traveler.errNoDestinationPermit'),
      };
    }
    if (!res.ok) {
      const code = String(d?.code || '');
      args.onFailure?.(
        code === 'toll_unavailable' ? 'toll_unavailable' :
        code === 'production_not_ready' ? 'production_not_ready' :
        code === 'route_geometry_required' ? 'route_geometry_required' :
        res.status === 429 ? 'request_throttled' : 'server_unavailable'
      );
      return null;
    }
    // The app will display this EXACT amount; reject incomplete/fractional
    // quotes instead of deriving an apparently plausible lower total locally.
    if(!Number.isSafeInteger(d?.travelerPays)||d.travelerPays<=0||
       !Number.isSafeInteger(d?.travelCostCents)||d.travelCostCents<=0||
       d.travelerPays<d.travelCostCents){ args.onFailure?.('invalid_quote'); return null; }
    return {
      travelerPays: d.travelerPays,
      ...(typeof d.selectedPaymentMethodId==='string'&&
          /^pm_[A-Za-z0-9]+$/.test(d.selectedPaymentMethodId)
        ?{selectedPaymentMethodId:d.selectedPaymentMethodId}:{}),
      ...(typeof d.researchQuoteToken==='string'&&d.researchQuoteToken.length<=450?{researchQuoteToken:d.researchQuoteToken}:{}),
      minutes: typeof d.minutes === 'number' ? d.minutes : undefined,
      operatorGets: d.operatorGets,
      travelCostCents: d.travelCostCents,
      miles: typeof d.miles === 'number' ? d.miles : null,
      governmentFeeCents: typeof d.governmentFeeCents === 'number' ? d.governmentFeeCents : 0,
      feeLines: Array.isArray(d.feeLines)
        ? d.feeLines
            .filter((l: any) => l && typeof l.name === 'string' && typeof l.cents === 'number')
            .map((l: any) => ({ id: l.id, name: l.name, payee: String(l.payee || ''), cents: l.cents }))
        : [],
    };
  } catch {
    args.onFailure?.('network_unavailable');
    return null; // offline or unreachable server; never fabricate a price
  }
}

// One request per identical in-flight (user, route, class, journey). The Home
// context and Travel Confirmation can otherwise send the same quote twice on a
// pickup/class change, then race two independent routing/market-reference results.
// Do NOT cache after completion: freshness, toll and card-country may change.
// Subscribers retain their own typed failure feedback; no Firestore write here.
type QuoteArgs = Parameters<typeof fetchQuoteUnshared>[0];
type Flight = { promise: Promise<Quote | Unavailable | null>; listeners: Set<(code: QuoteFailureCode) => void> };
const pendingQuotes = new Map<string, Flight>();
export function fetchQuote(args: QuoteArgs): Promise<Quote | Unavailable | null> {
  const effectiveRoute = args.pickup && args.dest
    ? { pickup: args.pickup, dest: args.dest }
    : { destination: args.destination ?? null };
  const key = JSON.stringify({
    uid: auth.currentUser?.uid ?? null,
    route: effectiveRoute,
    travelClass: args.travelClass ?? null,
    preferSavedCard:args.preferSavedCard===true,
    journeyNo: args.journeyNo ?? null,
  });
  const previous = pendingQuotes.get(key);
  if (previous) {
    if (args.onFailure) previous.listeners.add(args.onFailure);
    return previous.promise;
  }
  const listeners = new Set<(code: QuoteFailureCode) => void>();
  if (args.onFailure) listeners.add(args.onFailure);
  const promise = fetchQuoteUnshared({
    ...args,
    onFailure: code => {
      for (const listener of listeners) {
        try { listener(code); } catch { /* observer cannot affect authoritative quote */ }
      }
    },
  }).finally(() => {
    if (pendingQuotes.get(key)?.promise === promise) pendingQuotes.delete(key);
  });
  pendingQuotes.set(key, { promise, listeners });
  return promise;
}

// The whole journey in one call: where is this place, and what does going there cost?
// `fallbackName` is the known-destination name to price by when geocoding isn't available.
export async function quoteForPlace(args: {
  pickupQuery: string;
  destQuery: string;
  fallbackName?: string | null;
  /** Where the traveler is, so a loose search is anchored to THEIR city and not to Miami. */
  near?: Coords | null;
  // Passes an out-of-market answer straight through, rather than flattening it to null — the
  // caller needs to tell those apart to know whether trying again could ever help.
}): Promise<Quote | Unavailable | null> {
  const [pickup, dest] = await Promise.all([
    geocodePlace(args.pickupQuery, args.near ?? null),
    geocodePlace(args.destQuery, args.near ?? null),
  ]);
  return fetchQuote({ pickup, dest, destination: args.fallbackName ?? null });
}

// Optional, best-effort signed-in quote-view research. No amount or coordinates are
// supplied by the app; only the server-issued signed reference is accepted.
export async function recordVisibleStandardQuote(token:string):Promise<boolean>{
 if(!token||token.length>450)return false;
 try{
  const id=await auth.currentUser?.getIdToken().catch(()=>null);
  if(!id)return false;
  const response=await fetch(`${PAYMENT_SERVER_URL}/pricing/research/view`,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${id}`},
    body:JSON.stringify({researchQuoteToken:token,consentToResearch:true,consentVersion:'quote-study-v1'}),
  });
  return response.ok;
 }catch{return false;}
}
