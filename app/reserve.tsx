// Travel Confirmation — the one sheet between a destination and a car.
//
// WHY ONE SHEET. Chad, 13–14 September 2026: four screens stood between naming a destination
// and an operator being sent — Travel Summary, Travel Options, Cabin Environment, Travel
// Confirmation — each ending in Continue. "It is subpar to have four screens before a car is
// on its way." They are combined here: the route on a map, the departure time, the vehicle
// class with the price of each, the saved cabin environment, the Complete Travel Cost, and one
// control that does what it says. Cabin Environment stays as a sub-screen for changing the
// saved settings and returns here; Schedule stays as the sub-screen for a later departure.
//
// The demo's search screen is kept whole inside it: editable pickup (with the map pin), the
// destination field and its results, and the live server quote. While a field is being edited
// the sheet shows only the fields and their results; the rest returns with the pick.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../src/components/AppText';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { destinationsNear, type Destination } from '../src/backend/destinations';
import { searchPlaces, type PlaceSuggestion } from '../src/backend/placeSearch';
import { fetchQuote, geocodePlace, isUnavailable, recordVisibleStandardQuote, type QuoteFailureCode } from '../src/backend/fares';
import { joinWaitlist } from '../src/backend/connect';
import { fetchSmartQuote } from '../src/backend/smart';
import { useGoBack } from '../src/components/nav';
import { RouteMap } from '../src/components/RouteMap';
import {
  Card,
  Chev,
  LetterheadBar,
  Num,
  PrimaryButton,
  Screen,
  SectionLabel,
  Sub,
  Title,
} from '../src/components/UI';
import {
  prettyPlace,
  classNameKey,
  BOOKABLE_CLASSES,
  Place,
} from '../src/data';
import { modeLine } from '../src/smartLegs';
import { useCabinPrefs } from '../src/state/cabinPrefs';
import { useRide } from '../src/state/RideContext';
import { paymentModeNote, usePaymentConfig } from '../src/state/PaymentConfigContext';
import { useLanguage } from '../src/state/LanguageContext';
import { useAuth } from '../src/state/AuthContext';
import { colors, fmt } from '../src/theme';
import { fetchFamily, type FamilyLink } from '../src/backend/family';
import { travelPartyReady } from '../src/travelPartyReadiness';
import { LEGAL_URL, SMART_TRAVEL_NEW_BOOKINGS_ENABLED } from '../src/config';

// The demo's search-field magnifier: 18px, muted stroke 1.7.
function Magnifier() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={colors.muted} strokeWidth={1.7} />
      <Path d="M20 20l-3.2-3.2" stroke={colors.muted} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

// The demo's rail icon: 19px, white stroke 1.7 on the solid tile.
function RailIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={3} width={12} height={13} rx={3} stroke="#fff" strokeWidth={1.7} />
      <Path
        d="M6 10h12M9 20l2-3M15 20l-2-3"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// '24 min' → '24'; the sentence supplies the unit in the traveler's own language.
const minutesOf = (meta: string) => (meta.match(/\d+/)?.[0] ?? meta);

export default function TravelConfirmation() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const { user, accountName } = useAuth();
  const payConfig = usePaymentConfig();
  const cabin = useCabinPrefs();
  const params = useLocalSearchParams<{ search?: string; q?: string; scheduling?: string; pickup?: string }>();

  const [searching, setSearching] = useState(params.search === '1' && params.pickup !== '1');
  const [searchingDep, setSearchingDep] = useState(params.pickup === '1');
  const [query, setQuery] = useState('');
  const [queryDep, setQueryDep] = useState('');
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyName, setPartyName] = useState(ride.travelParty.travelerName || '');
  const [familyLinks,setFamilyLinks]=useState<FamilyLink[]>([]);
  useEffect(()=>{fetchFamily().then(x=>setFamilyLinks(x.filter(f=>f.role==='guardian'&&f.status==='active'&&f.eligible))).catch(()=>setFamilyLinks([]));},[]);

  // navigate() can update params on an already-mounted screen — reopen search then too.
  useEffect(() => {
    if (params.pickup === '1') {
      setSearchingDep(true);
      setSearching(false);
      setQueryDep('');
    } else if (params.search === '1') {
      setSearching(true);
      setSearchingDep(false);
      // A destination handed in by name — a receipt's "Travel to … again" for a place that is
      // not one of the shortcuts — arrives as the search already typed, so the traveler is one
      // tap from the sheet rather than back at an empty field.
      if (typeof params.q === 'string' && params.q) setQuery(params.q);
    }
  }, [params.search, params.pickup, params.q]);

  const [pricing, setPricing] = useState(false);
  const [priceFailed, setPriceFailed] = useState(false);
  const [quoteFailure, setQuoteFailure] = useState<QuoteFailureCode | null>(null);
  // Somewhere we do not go. Kept apart from priceFailed because the two need different words:
  // one asks the traveler to try again, the other must not.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  // WHERE THE WAITLIST WOULD RECORD INTEREST: the pickup, and only when it is the pickup that is
  // outside the active counties. Recording it starts nothing but one record on the server.
  const [waitlistAt, setWaitlistAt] = useState<{ lat: number; lng: number } | null>(null);
  const [waitlisted, setWaitlisted] = useState<'idle' | 'sent' | 'failed'>('idle');

  // Only the LATEST quote request may apply its result — without this, the automatic
  // pricing that runs when the screen opens could come back late and overwrite a
  // destination the traveler picked in the meantime.
  const priceReq = React.useRef(0);

  // Choosing a destination shows it straight away, then asks the SERVER what it costs.
  // We never price the trip on the phone — see src/backend/fares.ts for why.
  const chooseDestination = React.useCallback(
    async (place: Place, opts?: { keepSearchOpen?: boolean }) => {
      const req = ++priceReq.current;
      // A destination change invalidates every quote-derived fact immediately. Keeping the
      // previous quote (or falling back to place.cost === 0) while the new server quote is in
      // flight makes the platform-fee floor look like a complete Travel price.
      ride.setQuotedFareCents(null);
      ride.setQuotedFeeLines([]);
      ride.setResearchQuoteToken(null);
      ride.setTripCoords(null);
      ride.setArrival(place);
      if (!opts?.keepSearchOpen) {
        setSearching(false);
        setQuery('');
      }
      setPricing(true);
      setPriceFailed(false);
      setQuoteFailure(null);
      setUnavailable(null);

      // ANCHORED TO THE TRAVELER, NOT TO MIAMI. A loose destination name is resolved against
      // the city they are standing in — "las olas" means the one four miles away, not the
      // first match the world offers.
      const anchor =
        ride.pickupPin ??
        (ride.departure.lat != null && ride.departure.lng != null
          ? { lat: ride.departure.lat, lng: ride.departure.lng }
          : null);
      let dest = place.lat != null && place.lng != null
        ? { lat: place.lat, lng: place.lng }
        : await geocodePlace(place.name, anchor);
      // Apple can fail to geocode a named neighborhood even when our server can
      // resolve it. Consult the existing place search only on that failure.
      // Exact-name matching avoids silently choosing a different destination.
      if (!dest) {
        const options = await searchPlaces(place.name, anchor);
        const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
        const exact = options.find((item) => normalize(item.title) === normalize(place.name));
        if (exact) dest = { lat: exact.lat, lng: exact.lng };
      }
      // Pickup, most precise source first: a dropped pin is exact; a named place carries its
      // own coordinates; only a hand-typed pickup needs the geocoder. Labels like "Current
      // location — Brickell" must never be geocoded — they aren't addresses, and when the
      // geocoder shrugged, the trip silently lost its coordinates (no pins, route, or car).
      const pickup =
        ride.pickupPin ??
        (ride.departure.lat != null && ride.departure.lng != null
          ? { lat: ride.departure.lat, lng: ride.departure.lng }
          : await geocodePlace(ride.departure.name, ride.pickupPin ?? null));
      // No name-only pricing: the server requires both real coordinates.
      // A failed location lookup must not become an apparently cheap fare.
      if (!pickup || !dest) {
        if (req === priceReq.current) {
          setQuoteFailure('route_geometry_required');
          setPriceFailed(true);
          setPricing(false);
        }
        return;
      }
      const quote = await fetchQuote({
        pickup,
        dest,
        travelClass:ride.travelClass,
        onFailure: (code) => { if (req === priceReq.current) setQuoteFailure(code); },
      });

      if (req !== priceReq.current) return; // a newer pick superseded this quote

      if (isUnavailable(quote)) {
        setUnavailable(quote.unavailable);
        setWaitlistAt(quote.waitlistAt ?? null);
        setWaitlisted('idle');
        setPriceFailed(false);
      } else if (quote) {
        setUnavailable(null);
        ride.setArrival({
          ...place,
          cost: quote.travelCostCents / 100,
          meta: quote.miles != null ? `${quote.miles} mi` : place.meta,
          ...(dest ? { lat: dest.lat, lng: dest.lng } : {}),
        });
        // Remember both ends so the payment can be priced the same way the quote was.
        ride.setTripCoords(pickup && dest ? { pickup, dest } : null);
        // This response is current for the requested route and class.
        classQuoteKey.current=[pickup?.lat,pickup?.lng,dest?.lat,dest?.lng,
          ride.travelClass,'ordinary',''].join('|');
        // Both class Fare and the ONE all-in Total must come from the server.
        ride.setQuotedServerPrice(quote.travelCostCents,quote.travelerPays,ride.travelClass);
        // Government fees the server fenced for this trip — an airport pickup fee, say. They
        // are inside the one price, and the sheet names them.
        ride.setQuotedFeeLines(quote.feeLines);
        ride.setResearchQuoteToken(quote.researchQuoteToken??null);
      } else {
        setPriceFailed(true);
      }
      setPricing(false);
    },
    [ride],
  );

  // Price the preset destination the moment the sheet opens. A suggestion tapped on Home
  // arrives already quoted (tripCoords set) and is not priced twice; a named place that is
  // not yet quoted is, so the sheet never shows the canned demo price or a route with no
  // coordinates. Booking must price identically no matter how you arrived here.
  const pricedOnOpen = React.useRef(false);
  useEffect(() => {
    if (pricedOnOpen.current) return;
    pricedOnOpen.current = true;
    // keepSearchOpen: this is background pricing, not a pick — if the traveler arrived
    // through the search card, their search box must stay open.
    if (!ride.tripCoords && ride.arrival.name.trim()) chooseDestination(ride.arrival, { keepSearchOpen: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A SMART TRAVEL LEG IS ALREADY PRICED AND ROUTED. Its ends and fare come from the journey
  // plan (beginSmartLeg), so the route is not editable here, the class is the journey's, and
  // the Smart Travel card — the journey this leg belongs to — is not offered again.
  const smartLeg = !!ride.smartJourney;
  // Request only the SELECTED class, never five paid/slow routing calls merely
  // to decorate a list. This re-quotes whenever class/pickup/Smart leg changes.
  const classQuoteKey=React.useRef<string|null>(null);
  const {tripCoords:quotedCoords,pickupPin:actualPin}=ride;
  const smartStage=ride.smartJourney?.stage;
  const smartFirst=ride.smartJourney?.leg1No;
  useEffect(()=>{
    if(!quotedCoords)return undefined;
    if(ride.quotedForClass===ride.travelClass&&ride.quotedTotalCents!=null)return undefined;
    const pickup=actualPin??quotedCoords.pickup,dest=quotedCoords.dest;
    const journeyNo=smartStage==='leg2'?smartFirst??null:null;
    const key=[pickup.lat,pickup.lng,dest.lat,dest.lng,ride.travelClass,
      smartStage??'ordinary',journeyNo??''].join('|');
    if(classQuoteKey.current===key)return undefined;
    classQuoteKey.current=key;
    const seq=++priceReq.current;
    let live=true;
    ride.setQuotedFareCents(null);
    ride.setQuotedFeeLines([]);
    ride.setResearchQuoteToken(null);
    setPricing(true);setPriceFailed(false);setQuoteFailure(null);setUnavailable(null);
    void fetchQuote({pickup,dest,travelClass:ride.travelClass,journeyNo,
      onFailure: (code) => { if (live && seq === priceReq.current) setQuoteFailure(code); },
    })
      .then(q=>{
        if(!live||seq!==priceReq.current)return;
        if(q&&!isUnavailable(q)){
          ride.setQuotedServerPrice(q.travelCostCents,q.travelerPays,ride.travelClass);
          ride.setQuotedFeeLines(q.feeLines);
          ride.setResearchQuoteToken(q.researchQuoteToken??null);
        } else if(q && isUnavailable(q)) {
          setUnavailable(q.unavailable);
          setPriceFailed(false);
        } else setPriceFailed(true);
      })
      .catch(()=>{if(live&&seq===priceReq.current)setPriceFailed(true);})
      .finally(()=>{if(live&&seq===priceReq.current)setPricing(false);});
    return ()=>{live=false;};
    // Quote generation, not ride object identity, governs which result may win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quotedCoords,actualPin,ride.travelClass,smartStage,smartFirst]);

  // SMART TRAVEL IS ALWAYS SHOWN, WITH ITS NUMBERS (Chad, 9 Sept 2026): with the journey's
  // price and time when the planner found a transit route, and greyed — saying which — when
  // there is no transit route for this travel or the planner cannot be reached. The server
  // plans on the region's own timetable (OpenTripPlanner); this sheet only reports what it said.
  const { tripCoords, setSmartPlan, setSmartStatus } = ride;
  useEffect(() => {
    if (smartLeg) return undefined;
    let live = true;
    setSmartPlan(null);
    if (!tripCoords) {
      setSmartStatus('idle');
      return undefined;
    }
    if (!SMART_TRAVEL_NEW_BOOKINGS_ENABLED) {
      setSmartStatus('unavailable');
      return undefined; // No planner calls, additional service or Firestore reads.
    }
    setSmartStatus('checking');
    fetchSmartQuote(tripCoords.pickup, tripCoords.dest).then((q) => {
      if (!live) return;
      setSmartStatus(q.status);
      setSmartPlan(q.status === 'ok' ? q.plan : null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripCoords, smartLeg]);

  const smart = SMART_TRAVEL_NEW_BOOKINGS_ENABLED ? ride.smartPlan : null;
  // A JOURNEY WHOSE TRANSIT FARE WE DO NOT KNOW (Brightline, Tri-Rail) is not given a total.
  // The card shows what American Rider charges and says the transit fare is on top; a "less
  // than direct" line built without that fare would be a false comparison.
  const fareUnknown = !!smart?.transitFareUnknown;
  const smartDiff = smart ? smart.directCents - smart.journeyCents : 0;
  const smartCompare = !smart
    ? ''
    : fareUnknown
      ? t('traveler.plusTransitFare')
      : smartDiff > 0
        ? t('traveler.lessThanDirect', { amount: fmt(smartDiff / 100) })
        : smartDiff < 0
          ? t('traveler.moreThanDirect', { amount: fmt(-smartDiff / 100) })
          : t('traveler.samePriceAsDirect');
  const smartOffText =
    ride.smartStatus === 'checking'
      ? t('traveler.busyChecking')
      : ride.smartStatus === 'unavailable'
        ? t('traveler.transitUnavailable')
        : t('traveler.noTransitRoute');

  // Never imply that an unquoted vehicle class carries a verified price.
  // The active class always displays the server's exact all-in Total.
  const authoritativePriceReady = ride.quotedFareCents != null &&
    ride.quotedTotalCents != null && ride.quotedForClass===ride.travelClass &&
    !pricing && !ride.repricing && !priceFailed && !unavailable;
  const allIn = (key: string) =>
    authoritativePriceReady&&key===ride.travelClass&&ride.quotedTotalCents!==null
      ? ride.quotedTotalCents/100 : null;
  const displayClassPrice = (key: string) => {
    const amount = allIn(key);
    return amount == null ? '—' : fmt(amount);
  };

  // `meta` carries the server's measured distance as "18.7 mi" once a quote has landed; a
  // named-place fallback carries a duration instead, and that must not be printed as miles.
  // A distance the server rounded to nothing — a pickup on top of its destination — is not
  // stated either: "Route distance: 0 miles" is a number that says the wrong thing.
  const routeMiles = (() => {
    const m = /^([\d.]+)\s*mi$/.exec(ride.arrival.meta ?? '')?.[1];
    return m && parseFloat(m) >= 0.05 ? m : null;
  })();

  // The shortcuts for where this traveler actually is. Twenty, not five: this is a search
  // field and the list is filtered by what they type, where the home screen shows a fixed few.
  const [nearby, setNearby] = useState<Destination[]>([]);
  const depLat = ride.departure.lat;
  const depLng = ride.departure.lng;
  useEffect(() => {
    let live = true;
    if (depLat == null || depLng == null) { setNearby([]); return () => { live = false; }; }
    destinationsNear({ lat: depLat, lng: depLng }, 20).then((r) => { if (live) setNearby(r.destinations); });
    return () => { live = false; };
  }, [depLat, depLng]);

  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeSearchBusy, setPlaceSearchBusy] = useState(false);
  useEffect(() => {
    if (!searching || query.trim().length < 2) { setPlaceSuggestions([]); setPlaceSearchBusy(false); return undefined; }
    setPlaceSearchBusy(true);
    const controller = new AbortController();
    const anchor = ride.pickupPin ?? (depLat != null && depLng != null ? { lat: depLat, lng: depLng } : null);
    const timer = setTimeout(() => {
      searchPlaces(query, anchor, controller.signal).then((results) => {
        if (!controller.signal.aborted) { setPlaceSuggestions(results); setPlaceSearchBusy(false); }
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searching, depLat, depLng, ride.pickupPin]);

  const q = query.trim().toLowerCase();
  // THE SHORTCUTS ARE THE SERVER'S, FOR THE REGION THE TRAVELER IS IN. They were a Miami-Dade
  // list compiled into the app: a traveler in Fort Lauderdale — inside our market — typed "b"
  // and was offered Brickell and Bayside, twenty-five miles away. Typing a real address always
  // worked anywhere, because that path geocodes; it was only the shortcuts that knew one city.
  //
  // Places we hold no permit for never appear, because the server does not list them.
  const matched = nearby.filter((p) => q === '' || p.name.toLowerCase().includes(q)).slice(0, 4);
  const liveMatched = q.length >= 2 ? placeSuggestions.slice(0, 6) : [];
  // Anything the traveler types that isn't one of our shortcuts is still a real place —
  // offer to look it up rather than dead-ending with "no places found".
  const typedPlace: Place | null =
    q !== '' && !placeSearchBusy && matched.length === 0 && liveMatched.length === 0
      ? { name: query.trim(), short: query.trim(), cost: 0, meta: 'Looking up…' }
      : null;
  // The demo capitalizes the typed place for display; the booked name stays as typed
  // so the geocoder sees exactly what the traveler wrote.
  const typedDisplay = query.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const qd = queryDep.trim().toLowerCase();
  const [depSuggestions, setDepSuggestions] = useState<PlaceSuggestion[]>([]);
  const [depSearchBusy, setDepSearchBusy] = useState(false);
  useEffect(() => {
    if (!searchingDep || qd.length < 2) { setDepSuggestions([]); setDepSearchBusy(false); return undefined; }
    setDepSearchBusy(true);
    const controller = new AbortController();
    const anchor = ride.pickupPin ?? (depLat != null && depLng != null ? { lat: depLat, lng: depLng } : null);
    const timer = setTimeout(() => {
      searchPlaces(queryDep, anchor, controller.signal).then((results) => {
        if (!controller.signal.aborted) { setDepSuggestions(results); setDepSearchBusy(false); }
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [queryDep, searchingDep, qd, depLat, depLng, ride.pickupPin]);
  const depMatched = depSuggestions.slice(0, 6);

  // One factual line, whatever the demand: what the operator's arrival is estimated at.
  const waitNote = ride.pickupWait > 0 ? t('traveler.approxMinToPickup', { n: ride.pickupWait }) : null;
  // Reads the server's real key mode instead of a hardcoded "nothing is charged yet", which
  // would become a lie on the sheet a traveler reads before money moves. Null once the server
  // holds a live key; the Terms promise the app says which mode it is in at payment.
  const modeNote = paymentModeNote(payConfig);

  const editing = searching || searchingDep;
  // NOT WHILE THE PRICE IS MOVING. Confirming during a quote would agree to the amount this
  // sheet happens to be showing while the server is computing a different one. And a travel
  // that cannot be charged, or that American Rider does not make, is not one to confirm.
  const busy = pricing || ride.repricing;
  const partyReady = travelPartyReady(ride.travelParty);
  const canReserve = payConfig.canTakePayment && partyReady && authoritativePriceReady && !!ride.tripCoords && !busy && !priceFailed && !unavailable;
  // A Traveler choosing a destination for a future reservation must never
  // accidentally trigger the immediate booking/payment button.
  const selectingScheduledTravel = params.scheduling === '1';
  const canContinueScheduling = partyReady && authoritativePriceReady &&
    !!ride.tripCoords && !busy && !priceFailed && !unavailable;
  const quoteFailureText = quoteFailure === 'toll_unavailable' ? t('traveler.quoteTollUnavailable')
    : quoteFailure === 'route_geometry_required' ? t('traveler.quoteLocationUnresolved')
    : quoteFailure === 'network_unavailable' ? t('traveler.errNetwork')
    : t('traveler.quoteServiceUnavailable');
  // Explicit informed consent, not a background price quote or a passive screen
  // render, is the only way the research endpoint receives a view observation.
  // This checkbox never affects payment, route selection or booking eligibility.
  const [approvedResearchToken,setApprovedResearchToken]=useState<string|null>(null);
  const joinQuoteStudy=()=>{
    const token=ride.researchQuoteToken;
    if(!token||editing||smartLeg||!authoritativePriceReady||
       ride.travelClass!=='standard'||approvedResearchToken===token)return;
    setApprovedResearchToken(token);
    void recordVisibleStandardQuote(token);
  };
  const confirm = () => {
    if (!canReserve) return;
    ride.confirmRide();
    // Home stays at the stack root so Back from the travel goes home instead of exiting.
    router.dismissAll();
    router.navigate('/ride');
  };

  // The saved cabin environment, as the operator will receive it.
  const climateLabel = {
    Cool: t('traveler.prefCool'),
    Moderate: t('traveler.prefModerate'),
    Warm: t('traveler.prefWarm'),
  }[cabin.climate];
  const requests = [
    ride.tripPrefs.charging ? t('traveler.charger') : null,
    ride.tripPrefs.luggage ? t('traveler.luggage') : null,
  ].filter((r): r is string => !!r);

  return (
    <Screen scroll={false}>
      <LetterheadBar onBack={goBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Title>{t('traveler.travelConfirmation')}</Title>
          {!editing && <Sub>{t('traveler.reviewAndConfirm')}</Sub>}

          {!editing && !smartLeg && (
            <>
              <SectionLabel style={{ marginTop: 20, marginBottom: 10 }}>{t('traveler.travelerLabel')}</SectionLabel>
              <Card style={{ paddingHorizontal: 20, paddingVertical: 4 }}>
                <Pressable onPress={() => setPartyOpen(!partyOpen)}>
                  <View style={[styles.slotRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotLabel}>{t('traveler.whoIsTraveling')}</Text>
                      <Text style={styles.slotValue}>
                        {ride.travelParty.mode === 'self' ? (user?.displayName?.trim() || accountName || t('traveler.me')) : ride.travelParty.travelerName || t('traveler.anotherAdult')}
                      </Text>
                    </View>
                    <Chev />
                  </View>
                </Pressable>
                {partyOpen && (
                  <View style={[styles.slot, styles.hair]}>
                    <Pressable onPress={() => { ride.setTravelParty({ mode: 'self', travelerName: '' }); setPartyOpen(false); }}>
                      <Text style={styles.modify}>{t('traveler.me')}</Text>
                    </Pressable>
                    <Pressable onPress={() => ride.setTravelParty({ mode: 'other_adult', travelerName: partyName })}>
                      <Text style={[styles.modify,{marginTop:14}]}>{t('traveler.anotherAdult')}</Text>
                    </Pressable>
                    <TextInput value={partyName} onChangeText={(v) => { setPartyName(v); if (ride.travelParty.mode === 'other_adult') ride.setTravelParty({ mode: 'other_adult', travelerName: v }); }} placeholder={t('traveler.travelerName')} placeholderTextColor={colors.muted} style={styles.input} />
                    {familyLinks.map(f=><Pressable key={f.id} onPress={()=>{ride.setTravelParty({mode:'teen',travelerName:f.teenName||t('traveler.familyTeenTraveler'),familyLinkId:f.id});setPartyOpen(false);}}><Text style={[styles.modify,{marginTop:14}]}>{t('traveler.familyTeenTravel')} · {f.teenName||t('traveler.familyTeenTraveler')}</Text></Pressable>)}
                  </View>
                )}
              </Card>
            </>
          )}

          {!editing && (
            <RouteMap pickup={ride.tripCoords?.pickup} dest={ride.tripCoords?.dest} route={ride.route} />
          )}

          <Card style={styles.tripCard}>
            {searchingDep ? (
              <View style={[styles.slot, styles.slotDivider]}>
                <Text style={styles.slotLabel}>{t('traveler.pickupLabel')}</Text>
                <TextInput
                  autoFocus
                  value={queryDep}
                  onChangeText={setQueryDep}
                  placeholder={t('traveler.searchPickup')}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.ink}
                  style={styles.input}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={smartLeg}
                onPress={() => {
                  setSearchingDep(true);
                  setSearching(false);
                  setQueryDep('');
                }}
              >
                <View style={[styles.slotRow, styles.slotDivider]}>
                  <View style={[styles.pin, { backgroundColor: colors.ink }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotLabel}>{t('traveler.pickupLabel')}</Text>
                    <Text style={styles.slotValue}>{prettyPlace(ride.departure.name)}</Text>
                  </View>
                </View>
              </Pressable>
            )}

            {searching ? (
              <View style={[styles.slot, styles.searchSlot]}>
                <Magnifier />
                <TextInput
                  autoFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('traveler.searchPlace')}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.ink}
                  style={[styles.input, { flex: 1, paddingTop: 0 }]}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={smartLeg}
                onPress={() => {
                  setSearching(true);
                  setSearchingDep(false);
                  setQuery('');
                }}
              >
                <View style={styles.slotRow}>
                  <View style={[styles.pin, { backgroundColor: colors.ink }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotLabel}>{t('traveler.whereTo')}</Text>
                    <Text style={styles.slotValue}>{ride.arrival.name}</Text>
                  </View>
                </View>
              </Pressable>
            )}

            {/* THE DEPARTURE TIME IS PART OF THE ITINERARY, so it is a row of this card rather
                than a card of its own (one itinerary box, Chad, 13 Sept 2026). Two lines,
                because two labels did not fit on one. A Smart Travel leg departs now. */}
            {!editing && !smartLeg && (
              <Pressable accessibilityRole="button" onPress={() => router.navigate('/schedule')}>
                <View style={[styles.slot, styles.hair]}>
                  <Text style={styles.whenText}>{t(params.scheduling === '1'
                    ? 'traveler.schedReturnToPickup' : 'traveler.leavingNow')}</Text>
                  <Text style={styles.modify}>{t(params.scheduling === '1'
                    ? 'traveler.schedContinue' : 'traveler.change')} ›</Text>
                </View>
              </Pressable>
            )}
          </Card>

          {/* The demo's results card: pin rows with the estimated travel time. */}
          {searching && (liveMatched.length > 0 || matched.length > 0 || typedPlace) && (
            <Card style={styles.resultsCard}>
              {liveMatched.map((p, i) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => chooseDestination({ name: p.title, short: p.title, cost: 0, meta: '', lat: p.lat, lng: p.lng })}>
                  <View style={[styles.resultRow, i > 0 && styles.hair]}>
                    <View style={[styles.pin, { backgroundColor: colors.ink }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{p.title}</Text>
                      {!!p.subtitle && <Text style={styles.resultMeta}>{p.subtitle}</Text>}
                    </View>
                    <Chev />
                  </View>
                </Pressable>
              ))}
              {matched.filter((p) => !liveMatched.some((s) => Math.abs(s.lat-p.lat) < 0.00001 && Math.abs(s.lng-p.lng) < 0.00001)).map((p, i) => (
                <Pressable
                  key={p.name}
                  accessibilityRole="button"
                  // A server destination carries no price and no baked-in time — both belong
                  // to the chosen route, and the sheet quotes it the moment this is tapped.
                  onPress={() => chooseDestination({ name: p.name, short: p.short, cost: 0, meta: '', lat: p.lat, lng: p.lng })}
                >
                  <View style={[styles.resultRow, i > 0 && styles.hair]}>
                    <View style={[styles.pin, { backgroundColor: colors.ink }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{p.name}</Text>
                      {/* The time from WHERE THIS TRAVELER IS, computed by the server against
                          their own coordinates, not a figure measured from Brickell and shown
                          to everybody. */}
                      <Text style={styles.resultMeta}>
                        {t('traveler.estimatedTravelTime', { n: p.minutes })}
                      </Text>
                    </View>
                    {/* NO PRICE HERE (Chad, 16 Aug). A price against every listed place turns
                        choosing a destination into comparison shopping, and it is not even a
                        quote yet — the server re-prices the chosen route. The amount appears
                        once, below, when a destination has actually been selected. */}
                    <Chev />
                  </View>
                </Pressable>
              ))}
              {typedPlace && (
                <Pressable accessibilityRole="button" onPress={() => chooseDestination(typedPlace)}>
                  <View style={styles.resultRow}>
                    <View style={[styles.pin, { backgroundColor: colors.ink }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{typedDisplay}</Text>
                      <Text style={styles.resultMeta}>{t('traveler.setAsDestination')}</Text>
                    </View>
                    <Chev />
                  </View>
                </Pressable>
              )}
            </Card>
          )}

          {searchingDep && (
            <Card style={styles.resultsCard}>
              {depMatched.map((p, i) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  onPress={() => {
                    // Replacing the pickup changes the route, not just its label.
                    // Invalidate the old price before the booking can be accepted.
                    const oldCoords = ride.tripCoords;
                    const currentPickup = ride.pickupPin ?? oldCoords?.pickup;
                    const pickupChanged = !oldCoords ||
                      oldCoords.pickup.lat !== p.lat || oldCoords.pickup.lng !== p.lng ||
                      !currentPickup || currentPickup.lat !== p.lat || currentPickup.lng !== p.lng;
                    if (pickupChanged) {
                      ride.setQuotedFareCents(null);
                      ride.setQuotedFeeLines([]);
                      ride.setResearchQuoteToken(null);
                      ride.setTripCoords(oldCoords
                        ? { pickup: { lat: p.lat, lng: p.lng }, dest: oldCoords.dest }
                        : null);
                    }
                    ride.setDeparture({ name: p.title, short: p.title, lat: p.lat, lng: p.lng });
                    ride.setPickupPin(null); // a named pickup replaces any dropped pin
                    setSearchingDep(false);
                    setQueryDep('');
                  }}
                >
                  <View style={[styles.resultRow, i > 0 && styles.hair]}>
                    <View style={[styles.pin, { backgroundColor: colors.ink }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{p.title}</Text>
                      {!!p.subtitle && <Text style={styles.resultMeta}>{p.subtitle}</Text>}
                    </View>
                  </View>
                </Pressable>
              ))}
              {qd.length >= 2 && !depSearchBusy && depMatched.length === 0 && (
                <Text style={styles.noResults}>{t('traveler.noPlacesFound')}</Text>
              )}
              {Platform.OS === 'ios' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSearchingDep(false);
                    setQueryDep('');
                    router.push('/pickup-map');
                  }}
                >
                  <View style={[styles.resultRow, depMatched.length > 0 && styles.hair]}>
                    <Text style={styles.mapPickText}>{t('traveler.setPickupOnMap')}</Text>
                    <View style={{ flex: 1 }} />
                    <Chev />
                  </View>
                </Pressable>
              )}
            </Card>
          )}

          {!editing && (
            <>
              {/* THE DISTANCE IS A FACT ABOUT THE ROUTE, NOT ABOUT THE CLASS (Chad, 13 Sept
                  2026). Stated once, under the route, and only when the server measured it. */}
              {routeMiles != null && (
                <Text style={styles.routeDistance}>{t('traveler.routeDistance', { miles: routeMiles })}</Text>
              )}

              {waitNote ? <Text style={styles.waitNote}>{waitNote}</Text> : null}

              {/* THE VEHICLE CLASS, ON THE SHEET (Chad, 13 Sept 2026: "Merge vehicle class
                  selection directly into the destination summary screen"). Each row states
                  its own Complete Travel Cost; the footer follows the chosen one. */}
              {!smartLeg && (
                <>
                  <SectionLabel style={styles.label}>{t('traveler.vehicleClassLabel')}</SectionLabel>
                  <Card style={styles.listCard}>
                    {BOOKABLE_CLASSES.map((cls, i) => {
                      const on = ride.travelClass === cls.key;
                      return (
                        <Pressable
                          key={cls.key}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`${t(classNameKey(cls.key))}, ${displayClassPrice(cls.key)}`}
                          onPress={() => ride.setTravelClass(cls.key)}
                        >
                          <View style={[styles.row, i > 0 && styles.hair]}>
                            {/* The demo's 8px class dot: ink when on, inside a 3px tinted ring. */}
                            <View style={[styles.dotRing, on && { backgroundColor: colors.border }]}>
                              <View
                                style={[styles.dot, { backgroundColor: on ? colors.ink : colors.border }]}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.rowTitle, { fontWeight: on ? '600' : '500' }]}>
                                {t(classNameKey(cls.key))}
                              </Text>
                              <Text style={styles.rowSub}>{t(cls.sub)}</Text>
                            </View>
                            <Num size={15} weight="600">
                              {displayClassPrice(cls.key)}
                            </Num>
                          </View>
                        </Pressable>
                      );
                    })}
                  </Card>

                  {ride.smartStatus !== 'idle' && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.navigate('/smart')}
                      disabled={!smart || !SMART_TRAVEL_NEW_BOOKINGS_ENABLED}
                      accessibilityState={{ disabled: !smart || !SMART_TRAVEL_NEW_BOOKINGS_ENABLED }}
                    >
                      {/* ONE FACT PER ROW: a head row that fits at 320 (tile · title · price),
                          then the mode line and the comparison each on their own line. */}
                      <View style={[styles.smartCard, !smart && styles.smartCardOff]}>
                        <View style={styles.smartHead}>
                          <View style={[styles.smartTile, !smart && styles.smartTileOff]}>
                            <RailIcon />
                          </View>
                          <Text
                            style={[
                              styles.smartTitle,
                              { flex: 1, minWidth: 0 },
                              !smart && styles.smartTitleOff,
                            ]}
                          >
                            {t('traveler.smartTravel')}
                          </Text>
                          {smart && (
                            <Num size={15} weight="600">
                              {fmt((fareUnknown ? smart.smartCents : smart.journeyCents) / 100)}
                            </Num>
                          )}
                        </View>
                        {smart ? (
                          <>
                            <Text style={styles.smartSub}>{modeLine(smart, t)}</Text>
                            <Text style={styles.smartMeta}>
                              {t('traveler.durMin', { n: smart.smartMin })} · {smartCompare}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.smartSub}>{smartOffText}</Text>
                        )}
                      </View>
                    </Pressable>
                  )}
                </>
              )}

              {/* THE CABIN ENVIRONMENT, ALREADY APPLIED (Chad, 13 Sept 2026: saved settings
                  applied by default, one control to adjust them). Each row names what it is
                  and what was chosen, as the operator will receive it. */}
              <SectionLabel style={styles.label}>{t('traveler.travelPreferences')}</SectionLabel>
              <Card style={styles.cabinCard}>
                <View style={styles.cabinRow}>
                  <Text style={styles.cabinLabel}>{t('traveler.climate')}</Text>
                  <Text style={styles.cabinValue}>{climateLabel}</Text>
                </View>
                <View style={[styles.cabinRow, styles.hair]}>
                  <Text style={styles.cabinLabel}>{t('traveler.atmosphere')}</Text>
                  <Text style={styles.cabinValue}>
                    {ride.tripPrefs.quiet ? t('traveler.prefQuiet') : t('traveler.prefConversation')}
                  </Text>
                </View>
                <View style={[styles.cabinRow, styles.hair]}>
                  <Text style={styles.cabinLabel}>{t('traveler.music')}</Text>
                  <Text style={styles.cabinValue}>
                    {cabin.music === 'None' ? t('traveler.prefMusicNone') : t('traveler.prefTravelerChoice')}
                  </Text>
                </View>
                {requests.length > 0 && (
                  <View style={[styles.cabinRow, styles.hair]}>
                    <Text style={styles.cabinLabel}>{t('traveler.additionalRequests')}</Text>
                    <Text style={[styles.cabinValue, { flex: 1, textAlign: 'right' }]}>
                      {requests.join(' · ')}
                    </Text>
                  </View>
                )}
                <Pressable accessibilityRole="button" onPress={() => router.navigate('/prefs')}>
                  <View style={[styles.cabinRow, styles.hair]}>
                    <Text style={styles.modify}>{t('traveler.modifyCabin')} ›</Text>
                  </View>
                </Pressable>
              </Card>

              {/* A GOVERNMENT FEE IS NAMED, BECAUSE IT IS SOMEBODY ELSE'S. The one price stays
                  one price; this says which part of it an airport or a port collects, and from
                  whom. Our own fee is never itemised here. */}
              {ride.quotedFeeLines.length > 0 && (
                <Card style={styles.govFeeCard}>
                  {ride.quotedFeeLines.map((l, i) => (
                    <View key={l.id ?? l.name} style={[styles.govFeeRow, i > 0 && styles.hair]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.govFeeName}>{l.name}</Text>
                        <Text style={styles.govFeeSub}>
                          {t('traveler.includedRemittedTo', { payee: l.payee })}
                        </Text>
                      </View>
                      <Num size={14} weight="600">
                        {fmt(l.cents / 100)}
                      </Num>
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </ScrollView>

        {/* THE PRICE AND THE ACTION STAY IN VIEW. On a sheet this long the amount a traveler
            is agreeing to must not scroll away from the control that agrees to it. An amount
            and a doubt about that amount never render together: while the server is quoting,
            or has refused, the amount is not shown at all and the control waits. */}
        {!editing && (
          <View style={styles.footer}>
            <Card style={styles.totalCard}>
              <Text style={styles.totalLabel}>{t('traveler.totalTravelCost')}</Text>
              {pricing ? (
                <Text style={styles.totalState}>{t('traveler.calculating')}</Text>
              ) : priceFailed || unavailable ? (
                <Text style={styles.totalState}>{t('traveler.unavailable')}</Text>
              ) : !authoritativePriceReady ? (
                <Text style={styles.totalState}>{t('traveler.calculating')}</Text>
              ) : (
                <Num size={20} weight="600">
                  {fmt(ride.travelerTotal)}
                </Num>
              )}
            </Card>
            {unavailable && !pricing && <Text style={styles.stateNote}>{unavailable}</Text>}
            {unavailable && !pricing && waitlistAt && (
              waitlisted === 'sent' ? (
                <Text style={styles.stateNote}>{t('traveler.waitlistRecorded')}</Text>
              ) : (
                <Pressable
                  hitSlop={8}
                  onPress={async () => setWaitlisted((await joinWaitlist(waitlistAt)) ? 'sent' : 'failed')}
                >
                  <Text style={styles.stateNote}>
                    {waitlisted === 'failed' ? t('traveler.waitlistFailed') : t('traveler.waitlistJoin')} ›
                  </Text>
                </Pressable>
              )
            )}
            {priceFailed && !unavailable && !pricing && (
              <View>
                <Text style={styles.stateNote}>{quoteFailureText}</Text>
                <Pressable accessibilityRole="button"
                  accessibilityLabel={t('traveler.retryTravelCost')}
                  onPress={() => { void chooseDestination(ride.arrival); }}
                  style={{ paddingVertical: 8 }}>
                  <Text style={styles.modify}>{t('traveler.retryTravelCost')} ›</Text>
                </Pressable>
              </View>
            )}
            {modeNote && <Text style={styles.payNote}>{modeNote}</Text>}
            {!!ride.researchQuoteToken && authoritativePriceReady &&
              ride.travelClass==='standard' && !smartLeg && (
                <View style={styles.studyRow}>
                  <Pressable accessibilityRole="checkbox"
                    accessibilityState={{checked:approvedResearchToken===ride.researchQuoteToken}}
                    onPress={joinQuoteStudy} style={styles.studyToggle}>
                    <Text style={styles.studyCheck}>
                      {approvedResearchToken===ride.researchQuoteToken?'☑':'□'}
                    </Text>
                    <Text style={styles.studyLabel}>{t('traveler.pricingResearchOptIn')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="link"
                    onPress={()=>void Linking.openURL(`${LEGAL_URL}/privacy?lang=${encodeURIComponent(language)}`)}>
                    <Text style={styles.studyPrivacy}>{t('traveler.privacy')}</Text>
                  </Pressable>
                </View>
              )}
            <PrimaryButton
              label={busy ? t('traveler.busyChecking')
                : t(selectingScheduledTravel ? 'traveler.schedContinueScheduling' : 'traveler.confirmTravel')}
              disabled={selectingScheduledTravel ? !canContinueScheduling : !canReserve}
              onPress={selectingScheduledTravel
                ? () => { if (canContinueScheduling) router.navigate('/schedule'); }
                : confirm}
              style={styles.confirm}
            />
            {!selectingScheduledTravel && (
              <Text style={styles.cancelTerms}>{t('traveler.cancellationGrace')}</Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 16 },
  // Demo field card: padding 2px 20px, rows at 16px 0 with 1px hairline dividers.
  tripCard: { marginTop: 16, paddingVertical: 2, paddingHorizontal: 20 },
  slot: { paddingVertical: 16 },
  searchSlot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  slotDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  slotLabel: { fontSize: 12, color: colors.muted },
  slotValue: { fontSize: 15, color: colors.ink, marginTop: 2 },
  pin: { width: 9, height: 9, borderRadius: 5 },
  input: { fontSize: 16.5, color: colors.ink, paddingTop: 6, padding: 0 },
  resultsCard: { marginTop: 14, paddingVertical: 2, paddingHorizontal: 20 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  resultName: { fontSize: 15, color: colors.ink },
  resultMeta: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
  noResults: { fontSize: 13.5, color: colors.muted, paddingVertical: 16 },
  mapPickText: { fontSize: 15, fontWeight: '600', color: colors.ink2 },
  routeDistance: { fontSize: 13, color: colors.ink2, marginTop: 8 },
  whenText: { fontSize: 15, color: colors.ink },
  // MONOCHROME, NOT A HYPERLINK (Chad, 13 Sept 2026). Weight and ink carry the control
  // instead of colour, which also keeps it legible to a reader who cannot separate two greys.
  modify: { fontSize: 13.5, fontWeight: '600', color: colors.ink2, marginTop: 4 },
  waitNote: { fontSize: 13, color: colors.ink2, marginTop: 12 },
  label: { marginTop: 22 },
  listCard: { marginTop: 10, paddingVertical: 2, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16 },
  dotRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 15.5, color: colors.ink },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 17 },
  // Demo Smart Travel promo: tinted card, padding 16/18, solid 36px rail tile radius 9.
  smartCard: {
    marginTop: 12,
    backgroundColor: colors.blueTint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  smartHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smartTile: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartTitle: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  smartSub: { fontSize: 12.5, color: colors.ink2, marginTop: 12 },
  smartMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  // Greyed, not hidden: the option exists, and the card says why it is not offered here.
  smartCardOff: { backgroundColor: colors.card, borderColor: colors.hairline },
  smartTileOff: { backgroundColor: colors.faint },
  smartTitleOff: { color: colors.muted },
  cabinCard: { marginTop: 10, paddingVertical: 2, paddingHorizontal: 18 },
  cabinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  cabinLabel: { fontSize: 13.5, color: colors.ink2 },
  cabinValue: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
  govFeeCard: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 18 },
  govFeeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  govFeeName: { fontSize: 13.5, color: colors.ink },
  govFeeSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  footer: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12 },
  totalCard: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: colors.ink },
  totalState: { fontSize: 15, color: colors.muted },
  stateNote: { fontSize: 13, color: colors.ink, marginTop: 8 },
  payNote: { fontSize: 12, color: colors.muted, marginTop: 8, textAlign: 'right', paddingHorizontal: 4 },
  studyRow: {marginTop: 10, gap: 5, paddingHorizontal: 5},
  studyToggle: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38},
  studyCheck: {fontSize: 21, color: colors.ink},
  studyLabel: {flex: 1, fontSize: 12, color: colors.ink2, lineHeight: 16},
  studyPrivacy: {fontSize: 12, color: colors.ink, textDecorationLine: 'underline', paddingVertical: 2},
  confirm: { marginTop: 12 },
  cancelTerms: { fontSize: 12, color: colors.ink2, marginTop: 10, lineHeight: 17.5, textAlign: 'center' },
});
