import type { SmartPlan } from '../backend/smart';
import { DEFAULT_DEPARTURE } from '../location';
import { scheduledDisplayTotal } from '../scheduledMoney';
import { smartSecondCarKey } from '../smartBookingKey';
import { SMART_TRAVEL_NEW_BOOKINGS_ENABLED } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { FeeLine } from '../data';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  APP_FEE,
  DEP_PLACES,
  DepPlace,
  ISSUES,
  PAY_FRIENDLY,
  Place,
  Trip,
  coordinationFee,
  fareFromTotal,
  operatorClassFor,
} from '../data';
import {
  dispatchRide,
  prepareRide,
  fetchMyRidesPage,
  fetchCompletedTravelStats,
  fetchRecoverableMyRide,
  type TravelCursor,
  MatchedOp,
  recordTravelReview,
  RideRecord,
  watchRide,
  type TravelMonitor,
  type LiveVehiclePosition,
  distanceMiles,
} from '../backend/dispatch';
import { Coords, fetchQuote, isUnavailable } from '../backend/fares';
import { auth } from '../firebase';
import { sendTravelMessage } from '../backend/messages';
import { cancelTravel, payForRide, settleTravel } from '../backend/payments';
import { answerCheckIn } from '../backend/checkin';
import {
  endTravelActivity,
  startTravelActivity,
  updateTravelActivity,
} from '../backend/liveActivity';
import {
  deleteScheduledRide,
  fetchScheduledRide,
  saveScheduledRide,
  watchScheduledRide,
  type ScheduledRide,
} from '../backend/scheduled';
import { fetchRoute, Route } from '../backend/route';
import { getCabinPrefs } from './cabinPrefs';
import { submitIssue, type SupportOutcome, type SupportTrip } from '../backend/support';
import { t as tr } from '../i18n';

export type Prefs = { quiet: boolean; charging: boolean; luggage: boolean; pet: boolean };
export type PayKey = 'ach' | 'apple' | 'gpay' | 'card';
export type Demand = 'quiet' | 'normal' | 'busy';
// `describing` is the rung that used to be missing: the traveler says what happened in their
// own words before anything is decided. The old flow went straight from a tapped category to
// a canned resolution, which is how the app came to answer complaints it had never read.
export type IssueState = null | 'describing' | 'resolving' | 'resolved';
export type Msg = { me: boolean; text: string };
export type SchedDate = 'today' | 'tomorrow' | 'pick';
export type SchedInfo = {
  when: string;
  time: string;
  period: string;
  arr: string;
  cost: number | null;
  /** The instant the travel is due. Without it a reservation cannot be read back as
   *  upcoming, which is why a scheduled travel used to vanish on the next launch. */
  atMs: number;
  pickupDate: string; // YYYY-MM-DD in the pickup market, not on the device
  pickupTimeZone: string; // IANA timezone confirmed by server market bootstrap
};
export type PaymentState = {
  status: 'idle' | 'processing' | 'paid' | 'failed';
  amountCents?: number;
  paymentIntentId?: string;
  // WHICH TRAVEL THIS PAYMENT IS FOR. Patron Support can refund against a PaymentIntent, and
  // this store only ever holds the most recent one — so a complaint about last week's travel
  // would have refunded today's charge. The id is only ever sent for its own travel.
  tripNo?: string;
  error?: string;
};
// How finding an operator is going: searching → matched, or none available / error (so the
// live screen can offer a retry instead of spinning on "Finding your operator…" forever).
export type DispatchState = 'idle' | 'preparing' | 'searching' | 'matched' | 'none' | 'error' | 'price_changed' | 'update_required';

const DEFAULT_PREFS: Prefs = { quiet: true, charging: false, luggage: false, pet: false };

const EMPTY_TRIP: Trip = {
  arr: '', dep: '', cost: 0, proc: 0, total: 0, opRev: 0,
  pay: '', no: '', date: '', subPrefix: '',
};

const nowLabel = () => {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
};

// Pickup ETA and demand are facts, not decoration. Until authoritative dispatch evidence
// exists, the traveler sees no invented wait time and demand remains neutral.
const UNKNOWN_PICKUP_WAIT = 0;

export type SmartStatus = 'idle' | 'checking' | 'ok' | 'none' | 'unavailable';

// THE JOURNEY IS TWO REAL TRAVELS. Smart Travel used to be a simulation: a timer advanced
// three legs on a 4.2-second cadence under a made-up Travel Number, and a screen labelled
// "Total Charged" showed an amount nobody had charged (release review, 6 Sept 2026, P0).
// Chad's instruction (9 Sept 2026) is to build it real: two dispatched car travels around a
// transit leg the traveler rides on their own ticket. This record ties them together. The
// journey has one combined platform-fee requirement sized for BOTH car PaymentIntents; leg 1
// carries the ordinary first-leg amount and leg 2 carries only the incremental remainder.
const SMART_JOURNEY_STORAGE_KEY = 'american-rider.smart-journey.v1';

export type SmartJourney = {
  plan: SmartPlan;
  /** Where the journey began and where it ends — the endpoints leg 2 needs to restore. */
  pickup: DepPlace;
  destination: Place;
  destCoords: Coords;
  stage: 'leg1' | 'leg2';
  leg1No?: string;
  leg2No?: string;
  /** Booker/Teen identity is frozen for the journey; leg 2 cannot silently become another party. */
  party: { mode: 'self' | 'other_adult' | 'teen'; travelerName: string; familyLinkId?: string };
};

export type RideStore = {
  // preferences
  defaultPrefs: Prefs;
  tripPrefs: Prefs;
  togglePref: (which: 'defaultPrefs' | 'tripPrefs', key: keyof Prefs) => void;

  // payment
  pay: PayKey;
  setPay: (p: PayKey) => void;

  // booking
  travelParty: { mode: 'self' | 'other_adult' | 'teen'; travelerName: string; familyLinkId?: string };
  setTravelParty: (p: { mode: 'self' | 'other_adult' | 'teen'; travelerName: string; familyLinkId?: string }) => void;
  arrival: Place;
  departure: DepPlace;
  setArrival: (p: Place) => void;
  setDeparture: (p: DepPlace) => void;
  // Where this trip actually runs between, once geocoded. The server needs BOTH ends to price
  // by distance; with either missing it falls back to its named-destination table.
  tripCoords: { pickup: Coords; dest: Coords } | null;
  setTripCoords: (c: { pickup: Coords; dest: Coords } | null) => void;
  // The street path for the current trip, or null while it loads / when routing fails.
  // Null is fine — the map falls back to a straight line.
  route: Route | null;
  // The operator's street path from where he was matched to the pickup — what the map
  // animates while he's on the way. Null until matched (or when routing fails, in which
  // case the map drives him along a straight line instead).
  approachRoute: Route | null;
  // An exact pickup point the traveler dropped on the map, which beats geocoding the pickup's
  // name. A mall or a stadium covers a lot of ground — "The Falls" geocodes to the middle of
  // the property, which can be a long walk from where the traveler is actually standing.
  // Null means we fall back to geocoding `departure.name`.
  pickupPin: Coords | null;
  setPickupPin: (c: Coords | null) => void;
  pickupWait: number;
  demand: Demand;
  // The web demo's Travel Options: a class NAME the server prices (never a client price).
  travelClass: string;
  smartPlan: import('../backend/smart').SmartPlan | null;
  setSmartPlan: (p: import('../backend/smart').SmartPlan | null) => void;
  /** What the transit planner said about the trip being booked. 'idle' = not asked yet. */
  smartStatus: SmartStatus;
  setSmartStatus: (s: SmartStatus) => void;
  /** A Smart Travel journey in progress: the plan, and which car travel is being taken. */
  smartJourney: SmartJourney | null;
  adoptSmartReplan: (plan: SmartPlan) => boolean;
  /**
   * Seed the booking screens for car travel 1 (pickup → boarding stop) or car travel 2
   * (alighting stop → destination). Each is a real travel with its own Travel Number and
   * operator; Travel Confirmation and dispatch run exactly as for any other travel. Returns
   * false when the plan has no such car leg (a stop within walking distance has none).
   */
  beginSmartLeg: (which: 1 | 2) => boolean;
  endSmartJourney: () => void;
  setTravelClass: (c: string) => void;
  // The server-quoted fare already includes the selected vehicle class.
  quotedFareCents: number | null;
  // This is the only authoritative amount to show before a booking.
  quotedTotalCents: number | null;
  quotedForClass: string | null;
  setQuotedServerPrice: (fareCents:number,totalCents:number,travelClass:string)=>void;
  researchQuoteToken: string | null;
  setResearchQuoteToken: (token: string | null) => void;
  /** THE all-in price for the travel currently being booked. Never recompute this. */
  travelerTotal: number;
  setQuotedFareCents: (n: number | null) => void;
  /** Government fees the server fenced for this trip (an airport pickup fee), inside the price. */
  quotedFeeLines: FeeLine[];
  setQuotedFeeLines: (lines: FeeLine[]) => void;
  /** True while the travel is being re-priced after the pickup moved. */
  repricing: boolean;
  startBooking: (arrival?: Place) => void; // seeds trip prefs + fresh quote
  /** Reverse a completed Travel with saved real endpoints; no earlier fare or charge is reused. */
  startReturnBooking: (tripNo: string) => boolean;

  // live ride
  status: number; // 0..5
  rideActive: boolean;
  confirmRide: () => void;
  boardRide: () => void; // "I'm in the car" — resumes the trip from the arrival hold
  cancelRide: () => Promise<boolean>;
  matchedOp: MatchedOp | null; // the real operator matched from the live database
  operatorLivePosition: LiveVehiclePosition | null; // fresh Operator GPS, or unknown
  dispatchState: DispatchState; // how the search for an operator is going
  retryDispatch: () => void; // try matching an operator again after none/error
  myRides: RideRecord[]; // the traveler's own rides, read from the live database
  refreshMyRides: (options?: { useCache?: boolean }) => void;
  /** A bounded page is fetched only when the Traveler requests older records. */
  loadOlderMyRides: () => Promise<void>;
  hasOlderMyRides: boolean;
  loadingOlderMyRides: boolean;
  payment: PaymentState; // the live payment for the ride being booked


  // current / viewed trip
  lastTrip: Trip;
  viewTrip: (Trip & { sub?: string }) | null;
  setViewTrip: (t: (Trip & { sub?: string }) | null) => void;
  pastTrips: (Trip & { sub: string; credit: boolean })[];
  stats: { trips: number; spent: number };
  /** Write the traveler's rating for the Travel that just finished. American Rider does not offer tipping. */
  submitReview: (stars: number) => Promise<boolean>;

  // messaging — one thread per travel, so an operator always knows which journey a
  // message concerns (and a lost item thread is not mixed into the live ride's).
  msgs: Msg[]; // the current travel's thread
  sendMsg: (text: string) => void;
  threadFor: (tripNo: string) => Msg[];
  sendMsgTo: (tripNo: string, text: string, lostItemId?: string | null) => Promise<boolean>;

  // help / issues
  issue: string | null;
  issueState: IssueState;
  issueTripNo: string;
  issueResult: SupportOutcome | null;
  openHelp: (tripNo?: string) => void;
  resetIssue: () => void;
  pickIssue: (key: string) => void;
  /** Send the traveler's own words to the server, which decides what happens. */
  submitDescription: (text: string) => Promise<boolean>;
  /** A refund Patron Support issued on a travel: which one, and how much. */
  credited: { no: string; cents: number } | null;

  // scheduling
  schedDate: SchedDate;
  setSchedDate: (d: SchedDate) => void;
  /** The actual pickup day chosen, frozen across midnight and screen navigation. */
  schedPickupDate: string | null;
  setSchedPickupDate: (date: string | null) => void;
  schedDay: string; // label like 'Wed, Jul 8'
  setSchedDay: (d: string) => void;
  schedPeriod: 'AM' | 'PM';
  setSchedPeriod: (p: 'AM' | 'PM') => void;
  schedTime: string;
  setSchedTime: (t: string) => void;
  customTime: string;
  setCustomTime: (t: string) => void;
  scheduled: boolean;
  /** Route monitoring's reading of the travel underway: a delay it can explain, or a question. */
  travelMonitor: TravelMonitor | null;
  respondToCheckIn: (reply: 'ok' | 'help') => Promise<boolean>;
  schedInfo: SchedInfo | null;
  /** null while saving · true stored on the account · false this screen only. */
  schedSaved: boolean | null;
  /** What the dispatcher has done with it: still waiting, operator sent, or why not. */
  schedState: ScheduledRide | null;
  scheduleRide: (info: SchedInfo) => Promise<boolean>;
  cancelScheduled: () => Promise<boolean>;

  // audio
  share: boolean;
  toggleShare: () => void;

  // misc
  stmtDone: boolean;
  markStmtDone: () => void;
};

// An operator's progress, as the traveler's screen numbers it.
//
//   0 Travel Confirmed · 1 Operator En Route · 2 Operator Arrived
//   3 Traveler Onboard · 4 Arrival · 5 Travel Complete
//
// 'assigned' is absent deliberately: it means dispatch has chosen somebody who has not
// answered yet, which is not progress to report. 4 has no operator action behind it — nobody
// presses "approaching" — so it stays where the timer left it.
const OPERATOR_STEP: Record<string, number> = {
  accepted: 1,
  arrived: 2,
  onboard: 3,
  completed: 5,
};

const RideContext = createContext<RideStore | null>(null);

export function RideProvider({ children }: { children: React.ReactNode }) {
  const [defaultPrefs, setDefaultPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [tripPrefs, setTripPrefs] = useState<Prefs>({ ...DEFAULT_PREFS });
  const [pay, setPay] = useState<PayKey>('ach');
  // Read from refreshMyRides, which must not re-create itself when the method changes.
  const payRef = useRef(pay);
  payRef.current = pay;
  const [travelClass, setTravelClass] = useState('standard');
  const [travelParty, setTravelParty] = useState<{ mode: 'self' | 'other_adult' | 'teen'; travelerName: string; familyLinkId?: string }>({ mode: 'self', travelerName: '' });
  const [smartPlan, setSmartPlan] = useState<import('../backend/smart').SmartPlan | null>(null);
  const [smartStatus, setSmartStatus] = useState<SmartStatus>('idle');
  const [smartJourney, setSmartJourney] = useState<SmartJourney | null>(null);
  const smartJourneyRef = useRef<SmartJourney | null>(null);
  smartJourneyRef.current = smartJourney;
  const smartJourneyHydrated = useRef(false);

  // A coordinated journey must survive a process death between its two car Travels. Persist only
  // the journey envelope; authoritative Travel/payment state is still reconstructed from the
  // server and leg 2 remains server-gated by the paid/completed first Travel.
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SMART_JOURNEY_STORAGE_KEY)
      .then((raw) => {
        if (!live || !raw) return;
        try {
          const saved = JSON.parse(raw) as SmartJourney;
          if (
            saved &&
            (saved.stage === 'leg1' || saved.stage === 'leg2') &&
            saved.plan?.status === 'ok' &&
            Array.isArray(saved.plan.legs) &&
            saved.destination &&
            saved.destCoords &&
            saved.party
          ) {
            smartJourneyRef.current = saved;
            setSmartJourney(saved);
            setSmartPlan(saved.plan);
            setSmartStatus('ok');
            setTravelParty({ ...saved.party });
          }
        } catch { /* corrupt local continuation is ignored; server authority is never reconstructed from it */ }
      })
      .finally(() => { smartJourneyHydrated.current = true; });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!smartJourneyHydrated.current) return;
    if (smartJourney) AsyncStorage.setItem(SMART_JOURNEY_STORAGE_KEY, JSON.stringify(smartJourney)).catch(() => {});
    else AsyncStorage.removeItem(SMART_JOURNEY_STORAGE_KEY).catch(() => {});
  }, [smartJourney]);
  const [quotedFareCents, setRawQuotedFareCents] = useState<number | null>(null);
  const [quotedTotalCents, setQuotedTotalCents] = useState<number | null>(null);
  const quotedTotalRef=useRef<number|null>(null);
  quotedTotalRef.current=quotedTotalCents;
  const [quotedForClass, setQuotedForClass] = useState<string | null>(null);
  // Any old quote is void after a route/class change, and only a complete server
  // answer may authorize a new amount. No class, fee or toll arithmetic on phone.
  const setQuotedFareCents = useCallback((n:number|null)=>{
    setRawQuotedFareCents(n);setQuotedTotalCents(null);setQuotedForClass(null);
  },[]);
  const setQuotedServerPrice = useCallback((fareCents:number,totalCents:number,cls:string)=>{
    if(!Number.isSafeInteger(fareCents)||fareCents<=0||
       !Number.isSafeInteger(totalCents)||totalCents<fareCents||!cls){
      setRawQuotedFareCents(null);setQuotedTotalCents(null);setQuotedForClass(null);return;
    }
    setRawQuotedFareCents(fareCents);setQuotedTotalCents(totalCents);setQuotedForClass(cls);
  },[]);
  const [researchQuoteToken, setResearchQuoteTokenState] = useState<string | null>(null);
  const researchQuoteRef = useRef<string | null>(null);
  const setResearchQuoteToken = useCallback((token:string|null)=>{
    researchQuoteRef.current=token;setResearchQuoteTokenState(token);
  },[]);
  const [quotedFeeLines, setQuotedFeeLines] = useState<FeeLine[]>([]);
  const [repricing, setRepricing] = useState(false);
  const quotedFeeLinesRef = useRef<FeeLine[]>([]);
  quotedFeeLinesRef.current = quotedFeeLines;

  const [arrival, setArrival] = useState<Place>({ name: '', short: '', cost: 0, meta: '' });

  // The server computes class Fare + dynamic Platform Fee + tolls + government
  // fees. Reconstructing that here drops tolls, can double-apply a class, and can
  // disagree for card-country or promoted market references. Treat its all-in
  // integer-cent Total as the sole display authority; unknown means NO price.
  const travelerTotal=useMemo(()=>
    quotedForClass===travelClass&&quotedTotalCents!==null
      ? quotedTotalCents/100 : 0,
    [quotedTotalCents,quotedForClass,travelClass]);
  const [tripCoords, setTripCoords] = useState<{ pickup: Coords; dest: Coords } | null>(null);
  const tripCoordsRef = useRef<{ pickup: Coords; dest: Coords } | null>(null);
  tripCoordsRef.current = tripCoords;
  const [pickupPin, setPickupPin] = useState<Coords | null>(null);

  // MOVING THE PIN MOVES THE PRICE. The pin re-drew the route and re-dispatched from the new
  // corner, but nothing re-quoted — so Travel Confirmation could show the price of the old
  // pickup while /create-payment-intent charged from the new one. The quoted amount and the
  // charged amount are the same number or they are a defect; this keeps them the same.
  const repriceSeq = useRef(0);
  useEffect(() => {
    // Invalidate outstanding pin quotes even when the pin is REMOVED. Otherwise
    // a late old-pin response can overwrite a fresh named-pickup server quote.
    const seq = ++repriceSeq.current;
    if (!pickupPin || rideActiveRef.current) {
      setRepricing(false);
      return undefined;
    }
    const dest =
      tripCoordsRef.current?.dest ??
      (arrival.lat != null && arrival.lng != null ? { lat: arrival.lat, lng: arrival.lng } : null);
    if (!dest) { setRepricing(false); return undefined; }
    let live = true;
    setQuotedFareCents(null);
    setQuotedFeeLines([]);
    setResearchQuoteToken(null);
    setRepricing(true);
    fetchQuote({ pickup: pickupPin, dest, destination: arrival.short, travelClass })
      .then((q) => {
        if (!live || seq !== repriceSeq.current) return;
        if (q && !isUnavailable(q)) {
          setQuotedServerPrice(q.travelCostCents, q.travelerPays, travelClass);
          setQuotedFeeLines(q.feeLines);
          setResearchQuoteToken(q.researchQuoteToken ?? null);
        }
      })
      .catch(() => {
        // No fallback fee arithmetic and no unhandled rejection on a failed quote.
        if (live && seq === repriceSeq.current) {
          setQuotedFareCents(null);
          setQuotedFeeLines([]);
          setResearchQuoteToken(null);
        }
      })
      .finally(() => {
        if (live && seq === repriceSeq.current) setRepricing(false);
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPin, arrival.short, travelClass]);
  // Read from runDispatch, which must not re-create itself when the traveler moves the pin.
  const pickupPinRef = useRef<Coords | null>(null);
  pickupPinRef.current = pickupPin;
  const [route, setRoute] = useState<Route | null>(null);
  // Read from confirmRide and dispatch, which must not re-create when the route loads.
  const routeRef = useRef<Route | null>(null);
  routeRef.current = route;
  // THE DISTANCE ON THE RECEIPT. Routed miles when the map has a street route for this
  // trip; otherwise the fare model's own estimate (straight line × 1.3), so the receipt
  // states the figure the price was built from rather than nothing.
  const tripMiles = (): number | undefined => {
    const r = routeRef.current;
    if (r && r.distanceMeters > 0) return Math.round((r.distanceMeters / 1609.344) * 10) / 10;
    const c = tripCoordsRef.current;
    if (!c) return undefined;
    return Math.round(distanceMiles(c.pickup, c.dest) * 1.3 * 10) / 10;
  };
  // When the traveler boarded, for the receipt's total time. Reset at every confirmation.
  const onboardAtRef = useRef<number | null>(null);

  // Fetch the street path whenever the trip's endpoints change — including a pickup-pin move
  // mid-dispatch, which re-keys this effect and redraws the route from the new spot. A stale
  // response from a superseded request is ignored rather than drawn.
  useEffect(() => {
    if (!tripCoords) {
      setRoute(null);
      return;
    }
    let live = true;
    setRoute(null);
    fetchRoute(tripCoords.pickup, tripCoords.dest).then((r) => {
      if (live) setRoute(r);
    });
    return () => {
      live = false;
    };
  }, [tripCoords]);

  const [departure, setDeparture] = useState<DepPlace>(DEFAULT_DEPARTURE);
  const [pickupWait, setPickupWait] = useState(UNKNOWN_PICKUP_WAIT);
  const [demand, setDemand] = useState<Demand>('normal');
  const [status, setStatus] = useState(0);
  const [rideActive, setRideActive] = useState(false);
  const [matchedOp, setMatchedOp] = useState<MatchedOp | null>(null);
  const [operatorLivePosition, setOperatorLivePosition] = useState<LiveVehiclePosition | null>(null);
  // A lost GPS stream must remove the last icon after 60 seconds, even when the
  // database emits no later change. One local timer, no polling/database reads.
  useEffect(() => {
    if (!operatorLivePosition) return;
    const ms = operatorLivePosition.at + 60000 - Date.now();
    if (ms <= 0) {
      setOperatorLivePosition(null);
      return;
    }
    const at = operatorLivePosition.at;
    const timeout = setTimeout(() => {
      setOperatorLivePosition((current) => current?.at === at ? null : current);
    }, ms + 1);
    return () => clearTimeout(timeout);
  }, [operatorLivePosition]);

  // The operator's approach: from where he was matched to the pickup. Re-fetched if the
  // traveler moves the pickup pin while he's en route (tripCoords re-keys this effect).
  const [approachRoute, setApproachRoute] = useState<Route | null>(null);
  useEffect(() => {
    if (!matchedOp || !tripCoords) {
      setApproachRoute(null);
      return;
    }
    let live = true;
    setApproachRoute(null);
    fetchRoute({ lat: matchedOp.lat, lng: matchedOp.lng }, tripCoords.pickup).then((r) => {
      if (live) setApproachRoute(r);
    });
    return () => {
      live = false;
    };
  }, [matchedOp, tripCoords]);
  const [dispatchState, setDispatchState] = useState<DispatchState>('idle');
  const [myRides, setMyRides] = useState<RideRecord[]>([]);
  const [hasOlderMyRides, setHasOlderMyRides] = useState(false);
  const [loadingOlderMyRides, setLoadingOlderMyRides] = useState(false);
  const ridesCursorRef = useRef<TravelCursor | null>(null);
  const olderInFlightRef = useRef(false);
  const recentRefreshInFlightUidRef = useRef<string | null>(null);
  const recentLoadedAtRef = useRef({ uid: '', at: 0 });
  const [payment, setPayment] = useState<PaymentState>({ status: 'idle' });
  const [tripSeq, setTripSeq] = useState(2047);
  const [lastTrip, setLastTrip] = useState<Trip>(EMPTY_TRIP);
  // Every completed ride, newest first — keeps old receipts reachable.
  // STARTS EMPTY. This began as [EMPTY_TRIP] — a fabricated $26.00 journey to Miami
  // International on July 6, travel number AR-2047-MIA — which every account carried as its
  // own completed travel, and which a receipt could be opened against.
  const [completedTrips, setCompletedTrips] = useState<Trip[]>([]);

  // The database has to learn what became of the travel. Before this, cancelling cleared
  // the screen and left the record saying 'assigned' — so the Travel Log listed cancelled
  // travels among completed ones and a receipt existed for a journey that never happened.
  const activeRideId = useRef<string | null>(null);
  // THE TRAVEL BEING WATCHED, which is not the same fact as "who is driving it".
  //
  // The status subscription below used to key on `matchedOp?.rideId`, so nulling matchedOp
  // tore down the watcher — and the 'declined' branch nulls matchedOp from inside that very
  // callback. The subscription unsubscribed itself from the travel it was watching. If the
  // re-dispatch then found nobody, the traveler sat on "No operator matched yet" while their
  // travel carried on in the database without them: on 29 Aug 2026 the operator drove
  // AR-2109-MIA to completion and the traveler was shown no arrival, no receipt and no entry
  // in their Travel Log, having paid $19.44.
  //
  // A travel is watched until it ENDS, not until its operator changes.
  const [watchedRideId, setWatchedRideId] = useState<string | null>(null);
  // Read by sendMsgTo, which must not re-create itself every time the watched ride changes.
  const watchedRideIdRef = useRef<string | null>(null);
  watchedRideIdRef.current = watchedRideId;
  // The travel that just finished, so its rating can be written to the same record.
  const reviewedRideId = useRef<string | null>(null);
  // The PaymentIntent this travel was charged on. Held so the operator's 99% can be released
  // against that exact charge when the travel completes — see settleTravel.
  const paidIntentRef = useRef<string | null>(null);
  // The completed travel waiting to be settled, and the ones already settled.
  const settleRideRef = useRef<string | null>(null);
  const settledRides = useRef<Set<string>>(new Set());
  // Prevent duplicate settlement while the same authoritative request is in flight.
  const settlementInFlightRef = useRef<string | null>(null);
  // Completion snapshots can replay after reconnect/foreground. Side effects run once per ride.
  const finishedRideIdsRef = useRef<Set<string>>(new Set());

  /**
   * Release the operator's 99% — but only once BOTH halves exist.
   *
   * THE DEFECT THIS CLOSES, found by running a real booking: settlement was attempted at the
   * moment the travel completed, and read the PaymentIntent from a ref that the payment
   * itself fills in later. The two are independent — the traveler is in Stripe's sheet while
   * the journey advances on its own clock — so a travel that finished before the card was
   * confirmed had no intent to settle against, and the call was silently skipped. Observed
   * exactly that: the traveler was charged $19.29 and the operator was paid nothing, with
   * nothing recorded as owed either, because the request that records it never ran.
   *
   * Now whichever half arrives second triggers it, and `settledRides` makes a travel
   * unsettleable twice no matter which order they land in.
   */
  const trySettle = useCallback(() => {
    const rideId = settleRideRef.current;
    const paymentIntentId = paidIntentRef.current;
    if (!rideId || !paymentIntentId || settledRides.current.has(rideId) || settlementInFlightRef.current === rideId) return;
    settlementInFlightRef.current = rideId;
    settleTravel({ rideId, paymentIntentId }).then((result) => {
      if (result.ok || result.owed) settledRides.current.add(rideId);
    }).finally(() => {
      if (settlementInFlightRef.current === rideId) settlementInFlightRef.current = null;
    });
  }, []);
  const [viewTrip, setViewTrip] = useState<(Trip & { sub?: string }) | null>(null);
  const [stats, setStats] = useState({ trips: 0, spent: 0 });
  // Threads keyed by Travel Number. The seed is the demo's opening line on the first trip.
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [issue, setIssue] = useState<string | null>(null);
  const [issueState, setIssueState] = useState<IssueState>(null);
  const [issueResult, setIssueResult] = useState<SupportOutcome | null>(null);
  // NO TRAVEL UNTIL THERE IS ONE. This was seeded with EMPTY_TRIP's number, so Patron
  // Support opened showing "Travel AR-2047-MIA" to a traveler who had never taken a journey —
  // the seeded demonstration one, printed as though it were theirs.
  //
  // THE GUARD EXISTED AND WAS ON THE WRONG SIDE. openHelp already refuses to SEND the seeded
  // trip (line ~1295 maps it to ''), and the emergency screen was fixed the same way on
  // 19 September. Both protected what the server receives. Neither protected what the traveler
  // READS, and the screen prints this value directly. Third screen, same fault, and the first
  // two fixes are the reason it looked handled.
  const [issueTripNo, setIssueTripNo] = useState('');
  const [credited, setCredited] = useState<{ no: string; cents: number } | null>(null);
  const [schedDate, setSchedDate] = useState<SchedDate>('tomorrow');
  const [schedPickupDate, setSchedPickupDate] = useState<string | null>(null);
  const [schedDay, setSchedDay] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });
  const [schedPeriod, setSchedPeriod] = useState<'AM' | 'PM'>('AM');
  const [schedTime, setSchedTime] = useState('6:00');
  const [customTime, setCustomTime] = useState('');
  const [scheduled, setScheduled] = useState(false);
  // What route monitoring makes of the travel underway. Null on an ordinary journey — this is
  // never furniture; it appears only when the platform has something to say.
  const [travelMonitor, setTravelMonitor] = useState<TravelMonitor | null>(null);
  const [schedInfo, setSchedInfo] = useState<SchedInfo | null>(null);
  // null while the write is in flight; false means it exists on this screen only.
  const [schedSaved, setSchedSaved] = useState<boolean | null>(null);
  const schedIdRef = useRef<string | null>(null);
  const schedLoadRef = useRef<'idle' | 'loading' | 'done'>('idle');
  // The id as STATE as well as a ref: the ref is what cancelling deletes, and the state is
  // what the watcher below subscribes to. A ref cannot start an effect.
  const [schedId, setSchedId] = useState<string | null>(null);
  // What the dispatcher has done with the reservation — written by backend/scheduler.js and
  // read here. This is how a traveler finds out an operator has been sent at 6:22 AM for a
  // 6:30 pickup: there is no push notification yet, so the record is the announcement.
  const [schedState, setSchedState] = useState<ScheduledRide | null>(null);
  const [share, setShare] = useState(true);
  const [stmtDone, setStmtDone] = useState(false);

  const rideTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const issueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever a case starts or is abandoned, so a late answer to an abandoned case
  // cannot render over a later one.
  const issueGen = useRef(0);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTotalRef = useRef(0);
  const lastTripRef = useRef<Trip>(EMPTY_TRIP);
  // The live payment, readable from a callback without re-creating it whenever it changes.
  const paymentRef = useRef<PaymentState>({ status: 'idle' });
  // Mirrors `status` so the ride tick keeps side effects out of state updaters
  // (updaters can be re-invoked under StrictMode/concurrent rendering).
  const statusRef = useRef(0);
  // Mirrors `rideActive` so sendMsgTo can tell the live demo ride from any other thread
  // without re-creating itself on every status change.
  const rideActiveRef = useRef(false);
  rideActiveRef.current = rideActive;
  // cancelRide is declared below confirmRide; the payment callback needs it when a traveler
  // closes the PaymentSheet, so it is reached through a ref rather than reordering the file.
  const cancelRideRef = useRef<() => Promise<boolean>>(async () => false);
  paymentRef.current = payment;

  useEffect(
    () => () => {
      if (rideTimer.current) clearInterval(rideTimer.current);
      if (issueTimer.current) clearTimeout(issueTimer.current);
      if (msgTimer.current) clearTimeout(msgTimer.current);
    },
    [],
  );

  const togglePref = useCallback((which: 'defaultPrefs' | 'tripPrefs', key: keyof Prefs) => {
    const set = which === 'defaultPrefs' ? setDefaultPrefs : setTripPrefs;
    set((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const startBooking = useCallback(
    (dest?: Place) => {
      // THE SAVED CABIN ENVIRONMENT IS APPLIED TO EVERY TRAVEL (Chad, 14 Sept 2026). This
      // copied `defaultPrefs`, which nothing could edit or persist, so atmosphere, the cable
      // and luggage assistance reset on every booking while the screen said they were saved.
      // src/state/cabinPrefs.ts is the saved set; this travel starts as a copy of it.
      const saved = getCabinPrefs();
      setTripPrefs({ ...defaultPrefs, quiet: saved.quiet, charging: saved.charging, luggage: saved.luggage });
      setPickupWait(UNKNOWN_PICKUP_WAIT);
      setDemand('normal');
      if (dest) setArrival(dest);
      setViewTrip(null);
      // Each booking starts with a clean slate. Without this, a pin dropped for LAST week's
      // trip greeted the next one with "Pickup pin set ✓" at some old address — and stale
      // coordinates from the previous ride could linger under the new one.
      setPickupPin(null);
      // KEEP A REAL POSITION. This unconditionally reset departure to DEP_PLACES[0] —
      // "Current location — Brickell", with fixed Brickell coordinates. The home screen
      // resolves the device's actual position and sets it, and this threw that away on the
      // very next line, at the start of every booking. Since the fare is quoted from the
      // departure coordinates, a traveler in Wynwood was collected from Brickell and priced
      // from Brickell. The stale-pin reset above is still right; the pickup is not stale
      // when the device just told us where it is.
      setDeparture((prev) => (prev?.resolved ? prev : DEFAULT_DEPARTURE));
      setTripCoords(null);
      setSchedPickupDate(null); // New journey gets a fresh pickup-day choice.
      setTravelClass('standard');
      setQuotedFareCents(null);
      setQuotedFeeLines([]);
      setResearchQuoteToken(null);
    },
    [defaultPrefs],
  );

  const startReturnBooking = useCallback((tripNo: string): boolean => {
    const previous = myRides.find((r) => r.tripNo === tripNo && r.status === 'completed');
    if (!previous?.dep || !previous.arr ||
        !Number.isFinite(previous.pickupLat) || !Number.isFinite(previous.pickupLng) ||
        !Number.isFinite(previous.destinationLat) || !Number.isFinite(previous.destinationLng)) return false;
    const pickup = { lat: previous.destinationLat as number, lng: previous.destinationLng as number };
    const dest = { lat: previous.pickupLat as number, lng: previous.pickupLng as number };
    // Book a distinct Travel through the same server quote → payment → offer path. The
    // traveler must confirm the precise pickup and current price on the Reserve screen.
    startBooking({name:previous.dep,short:previous.dep,cost:0,meta:'',...dest});
    setDeparture({name:previous.arr,short:previous.arr,...pickup,resolved:false});
    setTripCoords({pickup,dest});
    return true;
  },[myRides,startBooking]);

  const refreshMyRides = useCallback(async (options?: { useCache?: boolean }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setMyRides([]);
      ridesCursorRef.current = null;
      setHasOlderMyRides(false);
      recentLoadedAtRef.current = { uid: '', at: 0 };
      setStats({ trips: 0, spent: 0 });
      return;
    }
    if (recentLoadedAtRef.current.uid && recentLoadedAtRef.current.uid !== uid) {
      setMyRides([]);
      ridesCursorRef.current = null;
      setHasOlderMyRides(false);
      setStats({ trips: 0, spent: 0 });
      recentLoadedAtRef.current = { uid: '', at: 0 };
    }
    // Returning to Home or History within 30 seconds reuses the current window.
    // Payment/dispatch/safety callbacks continue to request fresh data by default.
    if (options?.useCache && recentLoadedAtRef.current.uid === uid &&
        Date.now() - recentLoadedAtRef.current.at < 30_000) return;
    // Context restoration and Home mounting may overlap on first sign-in. Reuse
    // the ongoing retrieval instead of making a second identical Firestore query.
    if (options?.useCache && recentRefreshInFlightUidRef.current === uid) return;
    recentRefreshInFlightUidRef.current = uid;
    try {
      const page = await fetchMyRidesPage();
      if (auth.currentUser?.uid !== uid) return;
      let rides = page.rides;
      // An unfinished Travel can predate 25 newer records. Preserve restore semantics
      // without ever fetching the complete historical collection.
      if (page.hasMore && !rideActiveRef.current && !activeRideId.current &&
          !rides.some((r) => ['assigned', 'accepted', 'arrived', 'onboard', 'awaiting_payment', 'awaiting_assignment'].includes(r.status))) {
        const recoverable = await fetchRecoverableMyRide().catch(() => null);
        if (auth.currentUser?.uid !== uid) return;
        if (recoverable && !rides.some((r) => r.id === recoverable.id)) rides = [...rides, recoverable];
      }
      setMyRides(rides);
      ridesCursorRef.current = page.cursor;
      setHasOlderMyRides(page.hasMore);
      recentLoadedAtRef.current = { uid, at: Date.now() };
      // If all history fits in one page, the local exact sum costs NO aggregation read.
      // Only older accounts need the server-side indexed count/sum query.
      if (!page.hasMore) {
        const done = rides.filter((r) => r.status === 'completed');
        setStats({ trips: done.length,
          spent: done.reduce((total, r) => total + r.totalCents, 0) / 100 });
      } else {
        // A missing index leaves the old value alone, never invents totals from 25 rows.
        void fetchCompletedTravelStats().then((totals) => {
          if (auth.currentUser?.uid === uid) setStats(totals);
        }).catch(() => {});
      }
      // Historic client-generated Travel Numbers must not restart at 2072 when an
      // account has 1,000 records but we load only 25. Carry forward the highest
      // real sequence visible in the most-recent chronological page.
      const maxObserved = rides.reduce((max, r) => {
        const match = /^AR-(\d+)-/.exec(r.tripNo);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 2047);
      setTripSeq((current) => Math.max(current, maxObserved));
      // A TRAVEL SURVIVES THE APP CLOSING. Everything about a live travel — that one is
      // running at all, its status, the matched operator, the trip record — was React state
      // and nothing else, so a traveler whose phone slept or whose app was swept away came
      // back to a home screen that said they had no travel while an operator was driving to
      // them. Firestore is the authority on whether a travel is live; this reads it back.
      // Never over a session already in progress, and never for a travel this phone just
      // finished: only when the store is empty and the record says the travel is assigned.
      if (!rideActiveRef.current && !activeRideId.current) {
        const live = rides.find((r) => ['assigned', 'accepted', 'arrived', 'onboard'].includes(r.status))
          ?? rides.find((r) => ['awaiting_payment', 'awaiting_assignment'].includes(r.status));
        if (live) {
          const total = live.totalCents / 100;
          const fare = fareFromTotal(+(total - (live.governmentFeeCents ?? 0) / 100).toFixed(2));
          const when = new Date(live.createdAt);
          lastTotalRef.current = total;
          const trip: Trip = {
            arr: live.arr,
            dep: live.dep,
            cost: fare,
            proc: 0,
            total,
            opRev: fare - coordinationFee(fare),
            pay: (() => {
              const p = live.paidWith;
              if (!p) return '';
              if (p.wallet === 'apple_pay') return p.last4 ? tr('traveler.cardEnding', { brand: 'Apple Pay', last4: p.last4 }) : 'Apple Pay';
              if (p.wallet === 'google_pay') return p.last4 ? tr('traveler.cardEnding', { brand: 'Google Pay', last4: p.last4 }) : 'Google Pay';
              if (p.type === 'us_bank_account') return p.last4 ? tr('traveler.bankEnding', { last4: p.last4 }) : tr('traveler.bankAccount');
              if (p.last4) {
                const brand = p.brand ? p.brand[0].toUpperCase() + p.brand.slice(1) : 'Card';
                return tr('traveler.cardEnding', { brand, last4: p.last4 });
              }
              return p.type || '';
            })(),
            no: live.tripNo || live.id,
            date: Number.isFinite(when.getTime()) ? when.toLocaleString() : '',
            subPrefix: Number.isFinite(when.getTime()) ? when.toLocaleDateString() : '',
            operator: live.operatorName || undefined,
            miles: live.miles,
            feeLines: live.feeLines,
          };
          lastTripRef.current = trip;
          setLastTrip(trip);
          // The operator's card is rebuilt from what dispatch recorded. A travel dispatched
          // before those fields existed restores without them rather than inventing a car.
          if (
            live.status !== 'assigned' &&
            live.operatorId && live.operatorCar && live.operatorPlate &&
            typeof live.operatorLat === 'number' && typeof live.operatorLng === 'number'
          ) {
            setMatchedOp({
              id: live.operatorId,
              demo: live.operatorDemo ?? false,
              name: live.operatorName,
              car: live.operatorCar,
              plate: live.operatorPlate,
              etaMin: live.operatorEtaMin ?? 0,
              miles: live.operatorMiles ?? 0,
              rideId: live.id,
              lat: live.operatorLat,
              lng: live.operatorLng,
            });
          } else {
            setMatchedOp(null);
          }
          const restoredStep = OPERATOR_STEP[live.status] ?? 0;
          statusRef.current = restoredStep;
          setStatus(restoredStep);
          setRideActive(true);
          activeRideId.current = live.id;
          preparedIdRef.current = live.id;
          paidIntentRef.current = live.paymentIntentId || null;
          if (live.paidAt || live.status === 'awaiting_assignment') {
            const restoredPayment = { status: 'paid' as const, amountCents: live.totalCents,
              paymentIntentId: live.paymentIntentId, tripNo: live.tripNo };
            paymentRef.current = restoredPayment; setPayment(restoredPayment);
          } else if (live.status === 'awaiting_payment') {
            const uncertain = { status: 'failed' as const, tripNo: live.tripNo };
            paymentRef.current = uncertain; setPayment(uncertain);
          }
          if (live.status === 'awaiting_assignment') setDispatchState('none');
          if (live.status === 'awaiting_payment') setDispatchState('error');
          settleRideRef.current = live.id;
          setWatchedRideId(live.id); // resume following the operator's own reports
        }
      }
    } catch {
      /* ignore — offline / no rides yet */
    } finally {
      if (recentRefreshInFlightUidRef.current === uid) recentRefreshInFlightUidRef.current = null;
    }
  }, []);

  const loadOlderMyRides = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !ridesCursorRef.current || olderInFlightRef.current) return;
    if (recentLoadedAtRef.current.uid !== uid) return;
    const startingCursor = ridesCursorRef.current;
    olderInFlightRef.current = true;
    setLoadingOlderMyRides(true);
    try {
      const page = await fetchMyRidesPage(startingCursor);
      if (auth.currentUser?.uid !== uid || ridesCursorRef.current !== startingCursor) return;
      setMyRides((previous) => {
        const seen = new Set(previous.map((r) => r.id));
        return [...previous, ...page.rides.filter((r) => !seen.has(r.id))];
      });
      ridesCursorRef.current = page.cursor;
      setHasOlderMyRides(page.hasMore);
    } catch {
      // Keep the cursor so the user may retry, rather than silently skipping a page.
    } finally {
      olderInFlightRef.current = false;
      setLoadingOlderMyRides(false);
    }
  }, []);

  // Retained across retries: no second booking or payment for one confirmation.
  const bookingKeyRef = useRef<string | null>(null);
  const preparedIdRef = useRef<string | null>(null);
  const dispatchInFlightRef = useRef<Promise<MatchedOp | null> | null>(null);
  // One booking intent may have retries, but only its newest dispatch response may mutate UI.
  const dispatchGenerationRef = useRef(0);
  const confirmInFlightRef = useRef(false);

  // The class the current booking was sold under. Held in a ref because runDispatch is
  // memoised and retried from the ride screen — reading state directly would dispatch last
  // booking's class after a retry.
  const travelClassRef = useRef('standard');
  const travelPartyRef = useRef(travelParty);
  const tripPrefsRef = useRef(tripPrefs);
  useEffect(() => {
    travelClassRef.current = travelClass;
  }, [travelClass]);
  useEffect(() => { travelPartyRef.current = travelParty; }, [travelParty]);
  useEffect(() => { tripPrefsRef.current = tripPrefs; }, [tripPrefs]);

  // The only on-demand sequence: one keyed booking -> PaymentSheet -> verified server offer.
  // Retry dispatch reuses the paid Travel; it never pays again or manufactures a second ride.
  const runDispatch = useCallback((): Promise<MatchedOp | null> => {
    if (dispatchInFlightRef.current) return dispatchInFlightRef.current;
    const generation = ++dispatchGenerationRef.current;
    const work = async (): Promise<MatchedOp | null> => {
      const trip = lastTripRef.current;
      const from = pickupPinRef.current ?? tripCoordsRef.current?.pickup ??
        (departure.lat != null && departure.lng != null ? { lat: departure.lat, lng: departure.lng } : null);
      const dest = tripCoordsRef.current?.dest;
      if (!from || !dest) {
        setDispatchState('error'); confirmInFlightRef.current = false; return null;
      }
      // A Travel has not been prepared or charged yet. Do not tell the user
      // we are searching the fleet until authoritative booking/payment pass.
      setMatchedOp(null); setDispatchState('preparing');
      try {
        if (!preparedIdRef.current) {
          if (smartJourneyRef.current?.stage === 'leg2') {
            const key = smartSecondCarKey(smartJourneyRef.current.leg1No);
            if (!key) throw new Error(tr('traveler.smartFirstCarRequired'));
            bookingKeyRef.current = key;
          } else bookingKeyRef.current ||= Crypto.randomUUID();
          const prepared = await prepareRide({
            bookingKey: bookingKeyRef.current, pickup: from, destinationPoint: dest,
            agreedTotalCents:quotedTotalRef.current,
            researchQuoteToken:researchQuoteRef.current,
            dep: departure.short, dest: arrival.short,
            cls: operatorClassFor(travelClassRef.current),
            journeyNo: smartJourneyRef.current?.stage === 'leg2' ? smartJourneyRef.current.leg1No ?? null : null,
            party: travelPartyRef.current,
            cabinPreferences: {
              ...getCabinPrefs(), quiet: tripPrefsRef.current.quiet,
              charging: tripPrefsRef.current.charging, luggage: tripPrefsRef.current.luggage,
            },
          });
          if (generation !== dispatchGenerationRef.current) return null;
          preparedIdRef.current = prepared.rideId;
          activeRideId.current = prepared.rideId;
          const canonical = { ...trip, no: prepared.tripNo, total: prepared.amountCents / 100 };
          lastTripRef.current = canonical; lastTotalRef.current = canonical.total;
          setLastTrip(canonical);
          const journey = smartJourneyRef.current;
          if (journey) {
            const stamped = journey.stage === 'leg1'
              ? { ...journey, leg1No: prepared.tripNo }
              : { ...journey, leg2No: prepared.tripNo };
            smartJourneyRef.current = stamped; setSmartJourney(stamped);
          }
        }
        const rideId = preparedIdRef.current;
        if (!rideId) throw new Error(tr('traveler.errGeneric'));
        let alreadyDispatched: MatchedOp | null | undefined;
        if (paymentRef.current.status === 'failed') {
          try {
            alreadyDispatched = await dispatchRide(rideId);
            const recovered = { status: 'paid' as const, amountCents: Math.round(lastTripRef.current.total * 100), tripNo: lastTripRef.current.no };
            paymentRef.current = recovered; setPayment(recovered);
          } catch (error) {
            if ((error as Error & { code?: string }).code !== 'payment_unconfirmed') throw error;
          }
        }
        if (paymentRef.current.status !== 'paid') {
          setPayment({ status: 'processing', tripNo: lastTripRef.current.no });
          const result = await payForRide({
            rideId, tripNo: lastTripRef.current.no,
            departure: departure.short, destination: arrival.short,
            travelClass: travelClassRef.current,
            pickup: from, dest,
            journeyNo: smartJourneyRef.current?.stage === 'leg2' ? smartJourneyRef.current.leg1No ?? null : null,
          });
          if (generation !== dispatchGenerationRef.current) return null;
          if (!result.ok) {
            const failed = { status: result.canceled ? 'idle' as const : 'failed' as const,
              error: result.error, tripNo: lastTripRef.current.no };
            paymentRef.current = failed; setPayment(failed);
            setDispatchState(result.canceled ? 'idle' : 'error');
            confirmInFlightRef.current = false;
            if (result.canceled && !await cancelRideRef.current()) {
              const unresolved = { status: 'failed' as const, tripNo: lastTripRef.current.no };
              paymentRef.current = unresolved; setPayment(unresolved);
              setDispatchState('error');
            }
            return null;
          }
          paidIntentRef.current = result.paymentIntentId ?? null;
          const paid = { status: 'paid' as const, amountCents: result.amountCents,
            paymentIntentId: result.paymentIntentId, tripNo: lastTripRef.current.no };
          paymentRef.current = paid; setPayment(paid);
          if (result.methodLabel) {
            lastTripRef.current = { ...lastTripRef.current, pay: result.methodLabel };
            setLastTrip(lastTripRef.current);
          }
        }
        setDispatchState('searching');
        const op = alreadyDispatched === undefined ? await dispatchRide(rideId) : alreadyDispatched;
        if (generation !== dispatchGenerationRef.current) return null;
        if (!op) {
          // A confirmed charge with no remaining supply is NOT an uncharged wait.
          // Keep its Travel id and explicit paid status for retry or authoritative refund.
          setDispatchState('none'); confirmInFlightRef.current = false;
          setWatchedRideId(rideId); refreshMyRides();
          return null;
        }
        setMatchedOp(op);
        activeRideId.current = rideId; setWatchedRideId(rideId);
        setDispatchState('matched'); confirmInFlightRef.current = false;
        refreshMyRides();
        return op;
      } catch(error) {
        if(generation===dispatchGenerationRef.current){
          const code=(error as Error & {code?:string})?.code;
          if(code==='travel_total_changed'){
            // No prepared booking or payment was created. Show a fresh price on
            // the confirmation sheet rather than retrying the stale agreement.
            setQuotedFareCents(null);
            setRideActive(false);
            setPayment({status:'idle'});
            setDispatchState('price_changed');
          }else if(code==='travel_price_confirmation_required'){
            // A stale client must never book at a new price it did not confirm.
            // The server refused the prepare operation before booking or payment.
            setRideActive(false);
            setPayment({status:'idle'});
            setDispatchState('update_required');
          }else if(code==='no_operator' && paymentRef.current.status==='idle'){
            // A fleet precheck failed BEFORE booking/payment; nothing to retry
            // via a nonexistent Travel id. Offer an honest no-supply outcome.
            setRideActive(false);
            setDispatchState('none');
          }else setDispatchState('error');
          confirmInFlightRef.current=false;
        }
        return null;
      }
    };
    const running = work().finally(() => {
      if (dispatchInFlightRef.current === running) dispatchInFlightRef.current = null;
    });
    dispatchInFlightRef.current = running;
    return running;
  }, [arrival, departure, refreshMyRides]);
  const adoptSmartReplan = useCallback((plan: SmartPlan): boolean => {
    const existing = smartJourneyRef.current;
    if (!existing || existing.stage !== 'leg1' || !existing.leg1No || rideActiveRef.current || !plan?.revision) return false;
    const oldFirst = existing.plan.legs.findIndex((l) => l.kind === 'transit');
    const newFirst = plan.legs.findIndex((l) => l.kind === 'transit');
    if (oldFirst < 1 || newFirst !== oldFirst || plan.from.id !== existing.plan.from.id ||
        plan.from.lat !== existing.plan.from.lat || plan.from.lng !== existing.plan.from.lng ||
        JSON.stringify(plan.legs.slice(0, newFirst)) !== JSON.stringify(existing.plan.legs.slice(0, oldFirst)) ||
        plan.legs.slice(newFirst).some((l) => l.kind === 'car' && l !== plan.legs.at(-1))) return false;
    const next = { ...existing, plan };
    smartJourneyRef.current = next;
    setSmartJourney(next);
    setSmartPlan(plan);
    setSmartStatus('ok');
    setQuotedFareCents(null);
    setTripCoords(null);
    return true;
  }, []);

  const beginSmartLeg = useCallback(
    (which: 1 | 2): boolean => {
      const plan = which === 1 ? smartPlan : smartJourneyRef.current?.plan ?? smartPlan;
      if (!plan) return false;
      const firstTransit = plan.legs.findIndex((l) => l.kind === 'transit');
      if (firstTransit < 0) return false;
      const stopPlace = (stop: { name: string; lat: number; lng: number }, cost: number): Place => ({
        name: stop.name,
        short: stop.name,
        cost,
        meta: '',
        lat: stop.lat,
        lng: stop.lng,
      });
      if (which === 1) {
        if (!SMART_TRAVEL_NEW_BOOKINGS_ENABLED) return false; // Block stale saved plans at action boundary.
        const leg = plan.legs[firstTransit - 1];
        if (!leg || leg.kind !== 'car' || !tripCoords) return false;
        const dest = stopPlace(plan.from, leg.cents / 100);
        setSmartJourney({
          plan,
          pickup: departure,
          destination: arrival,
          destCoords: tripCoords.dest,
          stage: 'leg1',
          party: {...travelPartyRef.current},
        });
        setArrival(dest);
        setTripCoords({ pickup: tripCoords.pickup, dest: { lat: plan.from.lat, lng: plan.from.lng } });
        setQuotedFareCents(leg.cents);
        setQuotedFeeLines(leg.feeLines ?? []);
        setTravelClass('standard');
        return true;
      }
      const journey = smartJourneyRef.current;
      // Smart leg 2 must be tied to a real first car, not a restored demo number
      // or a newly opened Smart screen without completed car-leg authority.
      if (!journey || !smartSecondCarKey(journey.leg1No)) return false;
      const lastTransit = plan.legs.map((l) => l.kind).lastIndexOf('transit');
      const leg = plan.legs[lastTransit + 1];
      if (!leg || leg.kind !== 'car') return false;
      const from = { lat: plan.to.lat, lng: plan.to.lng };
      const destination = journey?.destination ?? arrival;
      const destCoords = journey?.destCoords ?? tripCoords?.dest;
      if (!destCoords) return false;
      const next: SmartJourney = journey
        ? { ...journey, stage: 'leg2' }
        : { plan, pickup: departure, destination, destCoords, stage: 'leg2', party: {...travelPartyRef.current} };
      smartJourneyRef.current = next;
      setSmartJourney(next);
      setTravelParty({...next.party});
      // A manually moved pin belongs to the preceding Travel, not this second car leg.
      // Clear both the synchronous dispatch reference and the quote/UI state before
      // switching to the transit station's authoritative pickup coordinates.
      pickupPinRef.current = null;
      setPickupPin(null);
      setDeparture({ name: plan.to.name, short: plan.to.name, lat: from.lat, lng: from.lng, resolved: true });
      setArrival({ ...destination, cost: leg.cents / 100 });
      setTripCoords({ pickup: from, dest: destCoords });
      setQuotedFareCents(leg.cents);
      setQuotedFeeLines(leg.feeLines ?? []);
      setTravelClass('standard');
      return true;
    },
    [smartPlan, tripCoords, departure, arrival],
  );

  const endSmartJourney = useCallback(() => {
    smartJourneyRef.current = null;
    setSmartJourney(null);
    setSmartPlan(null);
    setSmartStatus('idle');
  }, []);

  const confirmRide = useCallback(() => {
    // Authority belongs at the action boundary, not merely in a disabled button. A second
    // tap, stale screen, or alternate caller cannot create another Travel or use a placeholder
    // fare. Exact coordinates and the current authoritative quote are prerequisites.
    if (confirmInFlightRef.current || quotedFareCents == null ||
        quotedTotalCents == null || quotedForClass!==travelClass ||
        !tripCoordsRef.current) return;
    confirmInFlightRef.current = true;
    // Clear AND null: the match-effect below only starts a timer when the ref is empty,
    // so a stale (already-cleared) id left in the ref would silently freeze the next ride.
    if (rideTimer.current) clearInterval(rideTimer.current);
    rideTimer.current = null;
    // The Fare and complete Total are both from the selected class's same
    // server response. No local platform fee/vehicle class computation.
    const costN=quotedFareCents/100;
    const coord=coordinationFee(costN);
    const nextSeq = tripSeq + 1;
    const total=quotedTotalCents/100;
    lastTotalRef.current = total;
    setTripSeq(nextSeq);
    statusRef.current = 0;
    setStatus(0);
    setRideActive(true);
    onboardAtRef.current = null;
    const trip: Trip = {
      arr: arrival.short,
      dep: departure.short,
      cost: costN,
      proc: 0,
      total,
      opRev: costN - coord,
      pay: PAY_FRIENDLY[pay],
      no: `AR-${nextSeq}-MIA`,
      date: `Today, ${nowLabel()}`,
      subPrefix: 'Today',
      miles: tripMiles(),
      feeLines: quotedFeeLinesRef.current,
    };
    lastTripRef.current = trip;
    setLastTrip(trip);
    // A Smart Travel car leg carries the journey's record of its own Travel Number.
    const journey = smartJourneyRef.current;
    if (journey) {
      const stamped =
        journey.stage === 'leg1' ? { ...journey, leg1No: trip.no } : { ...journey, leg2No: trip.no };
      smartJourneyRef.current = stamped;
      setSmartJourney(stamped);
    }
    // A restarted Smart leg 2 must reuse the identical booking key; a fresh
    // UUID would conflict with the server's single-use Smart continuation claim.
    // Ordinary car Travels retain independent random booking keys.
    bookingKeyRef.current = journey?.stage === 'leg2'
      ? smartSecondCarKey(journey.leg1No) : Crypto.randomUUID();
    preparedIdRef.current = null;
    paymentRef.current = { status: 'idle' };
    setPayment({ status: 'idle' });
    runDispatch();
    // NOTE: the ride's progress timer does NOT start here — it starts when an operator is
    // actually matched (see the effect below). Starting it at confirm meant the demo could
    // reach "Miguel is here" before Miguel was even found, skipping the whole approach
    // animation the traveler is watching for.
  }, [arrival, departure, pay, tripSeq, refreshMyRides, runDispatch,
      quotedFareCents, quotedTotalCents, quotedForClass, travelClass]);

  // Everything that happens when a travel finishes, wherever the news came from.
  //
  // This lived inside the demo timer's `next === 5` branch, which was fine while a stopwatch
  // was the only thing that could end a journey. A real operator can end one now, so the
  // outcome — the record, the settlement, the Travel Log — has to be reachable from both.
  const finishTravelRef = useRef<() => void>(() => {});
  const finishTravel = useCallback(() => {
    const terminalRideId = activeRideId.current;
    if (terminalRideId && finishedRideIdsRef.current.has(terminalRideId)) return;
    if (terminalRideId) finishedRideIdsRef.current.add(terminalRideId);
    if (rideTimer.current) {
      clearInterval(rideTimer.current);
      rideTimer.current = null;
    }
    setRideActive(false);
    // Account statistics are reconstructed from authoritative completed Travel records by
    // refreshMyRides(). Do not optimistically increment them here: completion snapshots may
    // replay after foreground/reconnect and would double-count the same Travel.
    // Boarding to completion, for the receipt. Unknown when nobody recorded boarding.
    const minutes = onboardAtRef.current
      ? Math.max(1, Math.round((Date.now() - onboardAtRef.current) / 60000))
      : undefined;
    const finished: Trip = { ...lastTripRef.current, minutes };
    lastTripRef.current = finished;
    setLastTrip(finished);
    setCompletedTrips((prev) => (prev[0]?.no === finished.no ? prev : [finished, ...prev]));
    if (!activeRideId.current) return;
    const ridePaid = activeRideId.current;
    // COMPLETION IS THE OPERATOR'S TO RECORD, not this phone's: firestore.rules no longer lets
    // a traveler write 'completed' (audit of e26adcb). The operator's app wrote it — that is
    // how this travel came to finish — so the Travel Log only needs reading again.
    refreshMyRides();
    // THE 99% IS RELEASED HERE, not when the card was charged. The operator is only known
    // after dispatch matched them, and the traveler's money is only truly ours once it
    // settles. Deliberately silent: the traveler has paid and finished, and our settlement
    // is not their business to succeed or fail at.
    settleRideRef.current = ridePaid;
    trySettle();
    // Kept, not cleared: the Travel Complete screen writes the rating against this
    // same record a moment later, and it needs the handle to do it.
    reviewedRideId.current = ridePaid;
    activeRideId.current = null;
    // The journey is over, so stop listening to it. Cleared HERE and on cancellation — the
    // two ways a travel ends — and nowhere else, so a change of operator can never detach
    // the subscription mid-journey again.
    setWatchedRideId(null);
    setOperatorLivePosition(null);
  }, [refreshMyRides, trySettle]);

  finishTravelRef.current = finishTravel;
  // The matched operator, reachable from callbacks that must not re-create when it changes.
  const matchedOpRef = useRef<typeof matchedOp>(null);
  matchedOpRef.current = matchedOp;
  // Read from the travel watcher, which must not re-subscribe when the destination changes.
  const arrivalRef = useRef<typeof arrival>(arrival);
  arrivalRef.current = arrival;
  // Read from a callback that must not re-create itself whenever the ride list changes.
  const myRidesRef = useRef<typeof myRides>([]);
  myRidesRef.current = myRides;

  // Advance the ride one step at a time — but HOLD at "Miguel is here" (status 2). He
  // waits for the traveler like a real driver would, which also gives the walk-to-your-car
  // finder time to be useful. boardRide() (the "I'm in the car" button) resumes the trip.
  const startTicker = useCallback(() => {
    if (rideTimer.current) return;
    rideTimer.current = setInterval(() => {
      const next = Math.min(statusRef.current + 1, 5);
      statusRef.current = next;
      setStatus(next);
      if (next === 2 && rideTimer.current) {
        clearInterval(rideTimer.current); // arrived at the pickup — wait to be boarded
        rideTimer.current = null;
      }
      // Through a ref, like cancelRideRef above: startTicker is memoised with no deps and
      // drives an effect, so closing over finishTravel directly would either freeze an old
      // copy of it or restart the timer every time its identity changed.
      if (next === 5) finishTravelRef.current();
    }, 2600);
  }, []);

  // The ride starts moving once an operator is matched — never before. This is what gives
  // the map its Uber moment: match → his car appears where he really is → he drives to you
  // (status 0→2) → then the trip runs (3→5). If dispatch fails there's no matched operator,
  // the timer never starts, and the ride screen offers a retry instead of pretending.
  useEffect(() => {
    if (!rideActive || !matchedOp) return;
    // ONLY A STAND-IN'S JOURNEY RUNS ON A CLOCK.
    //
    // The timer used to run for everybody, so a travel completed itself about thirteen
    // seconds after dispatch whether or not the operator had answered, moved, or existed.
    // With a real operator that is worse than a demonstration: it would mark a journey
    // complete — and release the 99% — for a travel nobody had driven, while the operator was
    // still deciding whether to accept. A real operator's progress is the only thing that
    // moves a real travel.
    if (!matchedOp.demo) return;
    startTicker();
  }, [rideActive, matchedOp, startTicker]);

  // A REAL OPERATOR DRIVES THIS SCREEN; THE STOPWATCH ONLY STANDS IN FOR ONE.
  //
  // The traveler's status advanced every 2.6 seconds regardless of where anybody was — it had
  // to, because the operator app could not be reached and invented its own journeys. Now that
  // an operator's progress is written to the travel, the screen follows the person driving.
  // The timer keeps running for the demo fleet, who cannot report anything; the first real
  // status to arrive stops it.
  //
  // Only ever forward. A late snapshot must not walk a traveler back from Onboard to
  // En Route.
  useEffect(() => {
    // Reset before attaching the replacement listener so a stale prior operator
    // cannot render while the new Travel's first snapshot arrives.
    setOperatorLivePosition(null);
    const rideId = watchedRideId;
    if (!rideId) return;
    return watchRide(rideId, (s) => {
      if (s === 'declined') {
        // Legacy declined records are never a reason to create another charged Travel.
        // Current server declines keep status assigned/released on this same document.
        setMatchedOp(null);
        setDispatchState('searching');
        return;
      }
      // THE LOCK SCREEN FOLLOWS THE OPERATOR, not a timer. This is the same event stream the
      // traveler's own screen runs on, so what shows on the lock screen and what shows in the
      // app can never disagree — which is the only way a second surface is worth having.
      const op = matchedOpRef.current;
      if (op) {
        const shape = {
          stage: s,
          operator: op.name || '',
          destination: arrivalRef.current?.short || '',
          // Only ever a figure we have. See TravelActivity — omitted rather than guessed.
          minutes: s === 'onboard' ? undefined : op.etaMin,
          tripNo: lastTripRef.current?.no || '',
        };
        if (s === 'accepted') startTravelActivity(shape);
        else if (s === 'arrived' || s === 'onboard') updateTravelActivity(shape);
        // A completed travel leaves the card up briefly; somebody glancing down after getting
        // out should still see which travel it was.
        else if (s === 'completed') endTravelActivity(false);
        else if (s === 'declined' || s === 'cancelled') endTravelActivity(true);
      }

      const step = OPERATOR_STEP[s];
      if (s === 'onboard' && !onboardAtRef.current) onboardAtRef.current = Date.now();
      if (step == null) return;
      if (rideTimer.current) {
        clearInterval(rideTimer.current);
        rideTimer.current = null;
      }
      if (step > statusRef.current) {
        statusRef.current = step;
        setStatus(step);
      }
      if (step === 5) finishTravelRef.current();
    },
    // ROUTE MONITORING'S READING OF THIS JOURNEY. Either something it can explain — the road
    // is stopped and other American Rider vehicles nearby are stopped in it — or, when it
    // cannot explain it and the operator has not answered, a question for the traveler.
    setTravelMonitor,
    (assignment) => {
      if (assignment) {
        setMatchedOp((current) => current?.id === assignment.id ? current : assignment);
        setDispatchState('matched');
      } else if (activeRideId.current === rideId) {
        setMatchedOp(null);
        setDispatchState((current) => current === 'none' ? current : 'searching');
      }
    },
    setOperatorLivePosition);
    // Keyed on the TRAVEL. It used to be [matchedOp], which re-subscribed on every operator
    // change and unsubscribed entirely when there was none.
  }, [watchedRideId]);

  /**
   * Answer the platform's check-in: 'ok' or 'help'.
   *
   * Cleared from the screen only once the server has it. A question that looks answered and
   * was not is the one state where silence is read as trouble.
   */
  const respondToCheckIn = useCallback(async (reply: 'ok' | 'help') => {
    const rideId = matchedOpRef.current?.rideId;
    if (!rideId) return false;
    const sent = await answerCheckIn(rideId, reply);
    if (sent) {
      setTravelMonitor((m) => (m ? { ...m, travelerReply: reply } : m));
    }
    return sent;
  }, []);

  // "I'm in the car" — the trip proper begins.
  const boardRide = useCallback(() => {
    if (!rideActive || statusRef.current !== 2) return;
    // Traveler input is not operational authority. For a real Travel, only the Operator's
    // server-backed onboard transition may advance status. The button can only advance an
    // explicit demo stand-in, where no real Operator exists to attest boarding.
    if (matchedOpRef.current?.demo !== true) return;
    statusRef.current = 3;
    setStatus(3);
    onboardAtRef.current = Date.now();
    startTicker();
  }, [rideActive, startTicker]);

  // Never let a DEMO ride stall forever at the curb: if the traveler doesn't tap
  // "I'm in the car" (or never sees the card — older screens), board automatically
  // after a generous pause.
  //
  // Demo only, deliberately. On a real travel this would declare a traveler aboard 25 seconds
  // after their operator arrived, whether or not they had reached the car — and the operator
  // is the one who actually knows.
  //
  // THE GUARD WAS INVERTED IN THE ONE CASE THAT MATTERS, found 29 Aug 2026 by watching a real
  // travel end. It read `if (matchedOp && !matchedOp.demo) return` — which correctly skips the
  // auto-board for a real operator, and FALLS THROUGH when matchedOp is null. Null does not
  // mean "a demonstration operator". It means NOBODY IS DRIVING: dispatch found no one, or the
  // operator declined and the match was cleared.
  //
  // So the single state in which advancing the journey is indefensible was the state that
  // advanced it automatically. AR-2105-MIA: the operator's request timed out and was declined,
  // the match was cleared, this timer fired 25 seconds later, the ticker ran 3 → 4 → 5, and
  // the traveler — who had just been charged $19.44 — was shown "Travel Complete" and asked to
  // rate a journey that never happened. No car ever moved.
  //
  // Now it advances only when we positively know we are driving a demonstration.
  useEffect(() => {
    if (!rideActive || status !== 2) return;
    if (!matchedOp || !matchedOp.demo) return;
    const t = setTimeout(boardRide, 25000);
    return () => clearTimeout(t);
  }, [rideActive, status, boardRide, matchedOp]);

  const cancelRide: () => Promise<boolean> = useCallback(async () => {
    const rideId = activeRideId.current;
    if (!rideId) {
      // The Traveler can leave an unsubmitted booking even if dispatch cannot be reached.
      // Payment and Operator assignment are only attempted AFTER prepareRide returns an ID.
      // Invalidate a late prepare response so it can never open PaymentSheet or dispatch
      // after Cancel. An eventual server-only awaiting_payment record cannot charge anyone.
      if (paymentRef.current.status !== 'idle' || preparedIdRef.current) return false;
      dispatchGenerationRef.current++;
      confirmInFlightRef.current = false;
      setDispatchState('idle');
    } else {
      // An acknowledged server cancellation is required whenever a Travel exists.
      // Do not misreport a lost network response as success or abandon a paid Travel.
      const result = await cancelTravel({ rideId });
      if (!result.ok) return false;
    }
    if (smartJourneyRef.current) {
      smartJourneyRef.current = null;
      setSmartJourney(null);
    }
    endTravelActivity(true);
    if (rideTimer.current) clearInterval(rideTimer.current);
    rideTimer.current = null;
    setRideActive(false);
    statusRef.current = 0;
    setStatus(0);
    paymentRef.current = { status: 'idle' };
    setPayment({ status: 'idle' });
    paidIntentRef.current = null;
    settleRideRef.current = null;
    preparedIdRef.current = null;
    bookingKeyRef.current = null;
    dispatchGenerationRef.current++;
    activeRideId.current = null;
    setWatchedRideId(null);
    refreshMyRides();
    return true;
  }, [refreshMyRides]);

  const threadFor = useCallback((tripNo: string) => threads[tripNo] ?? [], [threads]);

  const sendMsgTo = useCallback(
    async (tripNo: string, text: string, lostItemId?: string | null) => {
      const t = text.trim();
      if (!t || !tripNo) return false;
      // The message is written where the operator side reads it. Best-effort: the traveler's
      // words stay on screen either way, and no screen claims the operator has read them.
      // The operator on this travel, so the rule lets them read what was just written.
      const onTravel = myRidesRef.current?.find((r) => r.tripNo === tripNo);
      const stored = await sendTravelMessage({
        // The ride record, which the security rule reads to confirm who is on this travel.
        rideId: onTravel?.id ?? (tripNo === lastTripRef.current.no ? watchedRideIdRef.current : null),
        tripNo,
        text: t,
        from: 'traveler',
        operatorId: onTravel?.operatorId ?? matchedOpRef.current?.id ?? null,
        lostItemId,
      });
      if (!stored) return false;
      setThreads((m) => ({ ...m, [tripNo]: [...(m[tripNo] ?? []), { me: true, text: t }] }));

      // The scripted reply is the DEMO RIDE ONLY — it belongs to the simulated 2.6s-a-step
      // journey, where "Miguel" is a script. It must never fire on a lost item thread: an
      // invented "Got it — see you soon." over a bag nobody has looked for is precisely the
      // outcome-without-mechanism defect this build is removing.
      // Only a declared demonstration Operator without a persisted Travel
      // receives scripted replies. Real assigned Operators must answer for
      // themselves. A Lost Item thread is always a genuine communication.
      const isLiveDemoRide = rideActiveRef.current &&
        tripNo === lastTripRef.current.no &&
        matchedOpRef.current?.demo === true &&
        !onTravel?.id && !lostItemId;
      if (!isLiveDemoRide) return true;
      if (msgTimer.current) clearTimeout(msgTimer.current);
      msgTimer.current = setTimeout(() => {
        setThreads((m) => ({
          ...m,
          [tripNo]: [...(m[tripNo] ?? []), { me: false, text: tr('traveler.opGotIt') }],
        }));
      }, 1600);
      return true;
    },
    [],
  );

  const sendMsg = useCallback(
    (text: string) => sendMsgTo(lastTripRef.current.no, text),
    [sendMsgTo],
  );

  cancelRideRef.current = cancelRide;

  // Abandoning an in-flight issue must not let its timer resolve (and credit) later.
  // Stable identity so screens can call it from unmount cleanup (covers browser/
  // hardware back, which never hits the in-app Back handler).
  const resetIssue = useCallback(() => {
    if (issueTimer.current) clearTimeout(issueTimer.current);
    // Abandoning a case in flight must not let its answer arrive later and land on the
    // screen. The old flow protected itself by clearing a timer; a network round trip has
    // no timer to clear, so each case carries a generation and a stale one is dropped.
    // (The request itself is NOT cancelled — it was really sent, and the server should
    // finish handling it whatever the traveler chose to do next.)
    issueGen.current += 1;
    setIssue(null);
    setIssueState(null);
    setIssueResult(null);
  }, []);

  const openHelp = useCallback(
    (tripNo?: string) => {
      resetIssue();
      // May legitimately be empty: a new account with no travels can still need support, and
      // filing their case against a travel they never took is how the seeded journeys used to
      // hide. The issues screen handles an enquiry with no travel attached.
      //
      // NEVER THE SEEDED TRAVEL. Until 15 Sept 2026 a traveler with no live travel who opened
      // support from Safety or the travel screen had their case filed against AR-2047-MIA — a
      // journey nobody took — because lastTrip still held EMPTY_TRIP.
      const chosen = tripNo ?? (rideActiveRef.current ? lastTrip.no : '');
      setIssueTripNo(chosen === EMPTY_TRIP.no ? '' : chosen);
    },
    [lastTrip.no, resetIssue],
  );

  // Choosing a category no longer resolves anything. It used to start a 1.9-second timer
  // that then displayed a resolution written months earlier in src/data.ts — the app
  // answering a complaint it had not read. Now it opens the box the traveler writes in.
  const pickIssue = useCallback((key: string) => {
    if (!ISSUES[key]) return;
    setIssue(key);
    setIssueState('describing');
    setIssueResult(null);
  }, []);

  // The traveler's own words go to the server, which decides: an answer, a credit inside a
  // server-enforced cap and actually refunded, or a case filed to a person. Every one of
  // those is a real event; none of them is a flag flipped on this device.
  const submitDescription = useCallback(
    (text: string) => {
      const description = text.trim();
      if (!description || !issue) return Promise.resolve(false);
      const gen = ++issueGen.current;
      // THE TRAVEL THE CASE CONCERNS, from a record the app actually holds: this session's
      // travels first, then the account's stored records. Never a fallback to lastTrip — that
      // sent the seeded EMPTY_TRIP's figures ($26.00 to the airport, July 6) to the server
      // as "the real recorded figures" of a travel that never happened. With no matching
      // record the case goes without a travel, and the server reasons from the words alone.
      const sessionTrip = [lastTripRef.current, ...completedTrips].find(
        (t) => t.no === issueTripNo && t.no !== EMPTY_TRIP.no,
      );
      const record = myRidesRef.current.find((r) => r.tripNo === issueTripNo);
      const paymentFor = (no: string) =>
        paymentRef.current.tripNo === no ? paymentRef.current.paymentIntentId : undefined;
      const trip: SupportTrip | null = sessionTrip
        ? {
            rideId: record?.id,
            no: sessionTrip.no,
            dep: sessionTrip.dep,
            arr: sessionTrip.arr,
            totalCents: Math.round(sessionTrip.total * 100),
            date: sessionTrip.date,
            operator: sessionTrip.operator,
            // ONLY for the travel this payment actually belongs to. Without an id the server
            // cannot refund, so it routes any credit to a person rather than announcing money
            // that never moved — which is the right answer for an older travel.
            paymentIntentId: paymentFor(sessionTrip.no),
          }
        : record
          ? {
              rideId: record.id,
              no: record.tripNo,
              dep: record.dep,
              arr: record.arr,
              totalCents: record.totalCents,
              date: new Date(record.createdAt).toISOString(),
              operator: record.operatorName || undefined,
              paymentIntentId: paymentFor(record.tripNo),
            }
          : null;
      setIssueState('resolving');
      return submitIssue({
        category: issue,
        description,
        trip,
      }).then((outcome) => {
        // A credit that Stripe really issued is recorded whatever the traveler did next —
        // the money moved, so the receipt must say so even if they walked away from the
        // screen. Only the on-screen state is generation-gated.
        if (outcome.action === 'credit' && outcome.refunded && trip) {
          setCredited({ no: trip.no, cents: outcome.creditCents });
        }
        if (gen !== issueGen.current) return true; // this case was abandoned
        setIssueResult(outcome);
        setIssueState('resolved');
        return true;
      }).catch(() => {
        // Network/server failure is not a resolution. Return to the editable state so the
        // Traveler can retry instead of leaving the case in an endless “assessing” state.
        if (gen === issueGen.current) setIssueState('describing');
        return false;
      });
    },
    [issue, issueTripNo, completedTrips],
  );

  /**
   * Write the traveler's rating to the travel that just finished.
   *
   * Returns false when there is nothing to write to — a seeded demo travel, or a record the
   * database never accepted. The screen shows that answer rather than a check mark it has
   * not earned.
   */
  const submitReview = useCallback(async (stars: number) => {
    const rideId = reviewedRideId.current;
    if (!rideId) return false;
    // Ratings are feedback only. American Rider deliberately has no gratuity/tip product,
    // endpoint, stored tip amount or post-Travel money path.
    return recordTravelReview(rideId, { stars });
  }, []);

  // The reservation is written to the traveler's account, not just to this screen's memory.
  // It shows immediately either way — losing the write must not lose what they chose — but
  // `schedSaved` records whether it will still be there tomorrow, and the screen says so.
  const scheduleRide = useCallback(
    async (info: SchedInfo): Promise<boolean> => {
      // A reservation is a server fact. Do not display "Scheduled" before the server has
      // accepted the exact journey; a failed or stale write must never become local truth.
      setSchedSaved(null);

      // THE WHOLE JOURNEY GOES ON THE RESERVATION, not just the appointment.
      //
      // The reservation carries the route geometry and class needed by the server. The server
      // derives and stores the authoritative fare and Travel Number; local quote state is
      // presentation only and cannot become reservation authority.

      const saved = await saveScheduledRide({
        when: info.when,
        time: info.time,
        period: info.period === 'AM' ? 'AM' : 'PM',
        arr: info.arr,
        cost: info.cost,
        atMs: info.atMs,
        pickupDate: info.pickupDate,
        pickupTimeZone: info.pickupTimeZone,
        dep: departure.short,
        dest: arrival.short,
        // The map pin is the Traveler's authoritative selected pickup. If it has
        // moved, the same pin must be sent for scheduled price confirmation.
        pickupLat: pickupPin?.lat ?? tripCoords?.pickup?.lat ?? departure.lat,
        pickupLng: pickupPin?.lng ?? tripCoords?.pickup?.lng ?? departure.lng,
        destinationLat: tripCoords?.dest?.lat ?? arrival.lat,
        destinationLng: tripCoords?.dest?.lng ?? arrival.lng,
        travelClass: operatorClassFor(travelClass),
        party: travelParty,
      });
      if (!saved) {
        setSchedSaved(false);
        return false;
      }
      schedIdRef.current = saved.id;
      setSchedId(saved.id);
      setSchedInfo({
        ...info,
        cost: saved.cost,
      });
      setCustomTime('');
      setSchedState(saved);
      setSchedSaved(true);
      setScheduled(true);
      return true;
    },
    [arrival, departure, pickupPin, travelClass, tripCoords, travelParty],
  );

  const cancelScheduled = useCallback(async () => {
    const id = schedIdRef.current;
    if (!id) return false;
    // Keep the reservation visible unless the server atomically accepted cancellation.
    if (!(await deleteScheduledRide(id))) return false;
    setScheduled(false);
    setSchedInfo(null);
    setSchedSaved(null);
    setSchedState(null);
    setSchedId(null);
    schedLoadRef.current = 'done';
    schedIdRef.current = null;
    return true;
  }, []);

  // Read the reservation back once the traveler's own travel has loaded — which is what
  // makes "scheduled" survive a force-quit rather than being a card that disappears. Runs
  // at most once per session; `scheduled` is deliberately NOT a dependency, so cancelling
  // cannot retrigger it.
  useEffect(() => {
    if (schedLoadRef.current !== 'idle') return;
    schedLoadRef.current = 'loading';
    let live = true;
    fetchScheduledRide().then((r) => {
      schedLoadRef.current = 'done';
      if (!live || !r) return;
      schedIdRef.current = r.id;
      setSchedId(r.id);
      setSchedState(r);
      setSchedInfo({ when: r.when, time: r.time, period: r.period, arr: r.arr,
        cost: scheduledDisplayTotal(r),
        atMs: r.atMs, pickupDate: r.pickupDate || '', pickupTimeZone: r.pickupTimeZone || '' });
      setScheduled(true);
      setSchedSaved(true);
    });
    return () => {
      live = false;
    };
  }, [myRides.length]);

  // Follow the reservation while the app is open, so the moment the sweep turns it into a
  // travel the card says so — with the operator's name and how far away they are — instead of
  // still reading "Scheduled" while the car is outside.
  useEffect(() => {
    if (!schedId) return;
    return watchScheduledRide(schedId, (r) => {
      if (!r) return;
      setSchedState(r);
      // A dispatched reservation has become a real travel; the Travel Log should have it.
      if (r.status === 'dispatched') refreshMyRides();
    });
  }, [schedId, refreshMyRides]);


  const pastTrips = useMemo(() => {
    const decorate = (t: Trip) => ({
      ...t,
      sub: tr('traveler.tripSubFrom', { prefix: t.subPrefix, dep: t.dep }),
      credit: credited?.no === t.no,
      creditCents: credited?.no === t.no ? credited.cents : undefined,
    });
    // The in-progress ride shows while active; canceled rides never join history.
    const live = rideActive ? [decorate(lastTrip)] : [];
    const done = completedTrips.map(decorate);
    // THE SEEDED JOURNEYS ARE GONE. Three fabricated travels — June 28, June 21 and June 14,
    // with amounts, travel numbers, and a "$1.15 credit" on one of them — appeared in every
    // account as journeys that traveler had taken and paid for. A person could open a receipt
    // for a trip that never happened. The Travel Log already reads real records from
    // Firestore; this list is now only what actually occurred.
    return [...live, ...done];
  }, [rideActive, lastTrip, completedTrips, credited]);

  const value: RideStore = {
    tripCoords,
    setTripCoords,
    route,
    approachRoute,
    pickupPin,
    setPickupPin,
    defaultPrefs,
    tripPrefs,
    togglePref,
    pay,
    setPay,
    travelClass,
    setTravelClass,
    travelParty,
    setTravelParty,
    smartPlan,
    setSmartPlan,
    smartStatus,
    setSmartStatus,
    smartJourney,
    adoptSmartReplan,
    beginSmartLeg,
    endSmartJourney,
    quotedFareCents,
    quotedTotalCents,
    quotedForClass,
    setQuotedServerPrice,
    researchQuoteToken,
    setResearchQuoteToken,
    travelerTotal,
    setQuotedFareCents,
    repricing,
    quotedFeeLines,
    setQuotedFeeLines,
    arrival,
    departure,
    setArrival,
    setDeparture,
    pickupWait,
    demand,
    startBooking,
    startReturnBooking,
    status,
    rideActive,
    confirmRide,
    boardRide,
    cancelRide,
    matchedOp,
    operatorLivePosition,
    dispatchState,
    retryDispatch: runDispatch,
    myRides,
    refreshMyRides,
    loadOlderMyRides,
    hasOlderMyRides,
    loadingOlderMyRides,
    payment,
    lastTrip,
    viewTrip,
    setViewTrip,
    pastTrips,
    stats,
    submitReview,
    msgs: threads[lastTrip.no] ?? [],
    sendMsg,
    threadFor,
    sendMsgTo,
    issue,
    issueState,
    issueTripNo,
    issueResult,
    openHelp,
    resetIssue,
    pickIssue,
    submitDescription,
    credited,
    schedDate,
    setSchedDate,
    schedPickupDate,
    setSchedPickupDate,
    schedDay,
    setSchedDay,
    schedPeriod,
    setSchedPeriod,
    schedTime,
    setSchedTime,
    customTime,
    setCustomTime,
    scheduled,
    schedState,
    travelMonitor,
    respondToCheckIn,
    schedInfo,
    schedSaved,
    scheduleRide,
    cancelScheduled,
    share,
    toggleShare: () => setShare((s) => !s),
    stmtDone,
    markStmtDone: () => setStmtDone(true),
  };

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide(): RideStore {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used inside RideProvider');
  return ctx;
}

// Home place used by "ride again" when destination was Home.
