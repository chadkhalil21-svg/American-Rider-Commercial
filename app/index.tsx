import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import Svg, { Circle, Path } from 'react-native-svg';
import { accountName } from '../src/account';
import { destinationsNear, type Destination } from '../src/backend/destinations';
import { publicPickupMarket, type PickupMarket } from '../src/backend/markets';
import { joinWaitlist } from '../src/backend/connect';
import { loadSavedPlaces, type SavedPlace, type SavedPlaces } from '../src/savedPlaces';
import { RideRecord } from '../src/backend/dispatch';
import { travelDateShort } from '../src/dates';
import { receiptFromRide } from '../src/receipt';
import { resolveCurrentDeparture } from '../src/location';
import { LEGAL_URL } from '../src/config';
import { fetchQuote, isUnavailable } from '../src/backend/fares';
import { useNative } from '../src/components/anim';
import {
  Chev,
  Display,
  Drawer,
  DrawerRow,
  LetterheadBar,
  Mono,
  Num,
  Screen,
  SectionLabel,
  useNote,
} from '../src/components/UI';
import {
  canonicalPlaceName,
  prettyPlace,
  STATUS_LABELS,
  type Place,
  type FeeLine,
} from '../src/data';
import { useAuth } from '../src/state/AuthContext';
import { useOperator } from '../src/state/OperatorContext';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { HomeMap } from '../src/components/HomeMap';
import { legTitle } from '../src/smartLegs';
import { colors, fmt, radii } from '../src/theme';

// THE WEB DEMO, EXACTLY (Chad's call, 8 Aug 2026 — "he liked exactly what was on the web
// demo"): letterhead header with the person outline, "Begin Travel", plain grey letterspaced
// section labels (no rules), white cards with a 1px hairline border and NO shadow, the demo's
// restrained blue on action words only, and the solid-ink "Reserve Travel" CTA.
// The three words: institutional, authoritative, sophisticated.

function PulseDot({ color = colors.blueSoft }: { color?: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 1000, useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity: pulse,
      }}
    />
  );
}

// The demo's magnifier, traced from its SVG: 19×19 box, circle cx11 cy11 r7,
// handle from (20,20) to (16.8,16.8), stroke #8A8A82 at 1.7.
function Magnifier() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={colors.muted} strokeWidth={1.7} />
      <Path
        d="M20 20l-3.2-3.2"
        stroke={colors.muted}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// "24 min" as a number, so the sentence beside it can say "minutes" in full (Chad, 13 Sept
// 2026: truncations read as transactional). Falls back to the string when it holds no digits.
const minutesOf = (meta: string) => (meta.match(/\d+/)?.[0] ?? meta);

// Pictograms describe a place type; they are not live status lights or fictitious journeys.
function PlaceGlyph({ kind }: { kind: 'home' | 'work' | 'pin' }) {
  return (
    <View style={styles.placeGlyph}>
      <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
        {kind === 'home' ? (
          <Path d="M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7" stroke={colors.ink2} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        ) : kind === 'work' ? (
          <Path d="M3 8h18v12H3zM8 8V5h8v3M3 12h18" stroke={colors.ink2} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <><Path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" stroke={colors.ink2} strokeWidth={1.7} strokeLinejoin="round" /><Circle cx={12} cy={10} r={2.4} stroke={colors.ink2} strokeWidth={1.7} /></>
        )}
      </Svg>
    </View>
  );
}

export default function Home() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const ride = useRide();
  const { user, signOut } = useAuth();
  const operator = useOperator();

  // A commissioned account that closed the app in Operator view reopens in it —
  // the role flag persists ('ar:role'), per the demo's role-switching pattern.
  // Cold-restore only: switching views mid-session navigates itself.
  const restoredRole = useRef(false);
  useEffect(() => {
    if (restoredRole.current || !operator.ready) return;
    restoredRole.current = true;
    if (operator.role === 'operator' && operator.verification === 'commissioned') {
      router.replace('/operator');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator.ready, operator.role, operator.verification]);

  const rideOngoing = ride.rideActive && ride.status < 5;
  // WHAT THIS TRAVELER MAY BOOK, FROM WHERE THEY ARE. Asked of the server rather than shipped
  // in the app, so opening a new city is a server change and not an App Review. Empty until a
  // position resolves, and empty outside every region — both of which render no list at all,
  // which is the honest answer and the one that used to be a list of Miami.
  const [nearby, setNearby] = useState<Destination[]>([]);
  const depLat = ride.departure.lat;
  const depLng = ride.departure.lng;
  const [pickupMarket, setPickupMarket] = useState<PickupMarket | null>(null);
  const [marketAt, setMarketAt] = useState<string|null>(null);
  const [marketChecking, setMarketChecking] = useState(false);
  const [marketRetry, setMarketRetry] = useState(0);
  const [waitlistState, setWaitlistState] = useState<'idle'|'saving'|'recorded'|'failed'>('idle');
  const pickupKnown = depLat != null && depLng != null && Number.isFinite(depLat) && Number.isFinite(depLng);
  const marketKey=pickupKnown?`${depLat!.toFixed(3)},${depLng!.toFixed(3)}`:null;
  const latestMarketKey=useRef(marketKey);
  latestMarketKey.current=marketKey;
  const canOfferNewTravel = !pickupKnown || (!marketChecking && marketAt===marketKey && pickupMarket?.status === 'active');
  useEffect(() => {
    let live=true;
    setWaitlistState('idle');
    if(!pickupKnown){setPickupMarket(null);setMarketAt(null);setMarketChecking(false);return ()=>{live=false;};}
    setPickupMarket(null);setMarketAt(null);setMarketChecking(true);
    publicPickupMarket(depLat!,depLng!).then((m)=>{if(live){setPickupMarket(m);setMarketAt(marketKey);}})
      .catch(()=>{if(live){setPickupMarket({status:'unavailable',name:null});setMarketAt(marketKey);}})
      .finally(()=>{if(live)setMarketChecking(false);});
    return ()=>{live=false;};
  },[depLat,depLng,pickupKnown,marketKey,marketRetry]);
  useEffect(() => {
    let live = true;
    if (depLat == null || depLng == null || !canOfferNewTravel) { setNearby([]); return () => { live = false; }; }
    destinationsNear({ lat: depLat, lng: depLng }, 5).then((r) => {
      if (live) setNearby(r.destinations);
    });
    return () => { live = false; };
  }, [depLat, depLng, canOfferNewTravel]);

  // The most recent travel this traveler ACTUALLY took, for Patron Support to open against.
  // This read pastTrips[0], which — until the fabricated journeys were removed — was a
  // seeded trip nobody had been on, and is now simply absent for a new account.
  // The travel a case concerns by default: the most recent completed one, not merely the most
  // recent record, which may be a cancelled travel nobody took.
  const firstTripNo =
    ride.myRides.find((r) => r.status === 'completed')?.tripNo ||
    ride.myRides[0]?.tripNo ||
    ride.pastTrips[0]?.no;
  // ONE ROW PER DESTINATION (Chad, 13 Sept 2026: three identical airport rows clutter the
  // field without adding value). The list answers "where have I been", and a place answers
  // that once however many times it was visited; the most recent travel to it is the one
  // whose receipt the row opens. A traveler with three different destinations still sees
  // three rows, so nothing is hidden — only the repetition goes.
  const [mapExploring, setMapExploring] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancellingScheduled, setCancellingScheduled] = useState(false);
  const [confirmCancelScheduled, setConfirmCancelScheduled] = useState(false);
  const [scheduledCancelError, setScheduledCancelError] = useState<string | null>(null);
  const { note, showNote } = useNote();

  // The drawer head speaks for the signed-in account — named and initialed by the
  // one shared rule (src/account.ts), transcribed from the demo.
  const acctName = useMemo(() => accountName(user), [user]);
  // THE TRAVELER'S OWN PLACES — home, work, favourites — one tap from here (Adrian, 14 Sept
  // 2026). Re-read whenever Home is shown, so a place saved on the profile is here on return.
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>({ favorites: [] });
  useFocusEffect(
    useCallback(() => {
      let live = true;
      loadSavedPlaces().then((p) => live && setSavedPlaces(p));
      return () => {
        live = false;
      };
    }, []),
  );
  // Home and Work are useful setup actions for a new traveler, never invented addresses.
  // Real coordinates are required before a saved place can start a reservation.
  const savedRows: { key: string; title: string; place?: SavedPlace; which?: 'home' | 'work'; icon: 'home' | 'work' | 'pin' }[] = [
    { key: 'home', title: t('traveler.home'), place: savedPlaces.home, which: 'home', icon: 'home' },
    { key: 'work', title: t('traveler.placeWork'), place: savedPlaces.work, which: 'work', icon: 'work' },
    ...savedPlaces.favorites.map((f) => ({ key: `fav:${f.label}`, title: f.label, place: f, icon: 'pin' as const })),
  ];
  // The drawer head: the sign-up name, else the account's address — never the address's
  // local part passed off as a name ("chadkhalil21" was the founder's own inbox).
  const headName = useMemo(
    () => user?.displayName?.trim() || user?.email?.trim() || acctName,
    [user, acctName],
  );

  // Recent Travel rows open that trip's own receipt — same shaping the Travel Log uses,
  // so one trip can never render two different receipts (src/receipt.ts).
  const openReceipt = (r: RideRecord) => {
    ride.setViewTrip(receiptFromRide(r, language, t));
    router.navigate({ pathname: '/receipt', params: { from: 'home' } });
  };

  // Establish where the traveler actually is, once, on open. Until this resolves the
  // departure stays the named fallback — we never claim a location we have not confirmed.
  // Declining permission is a legitimate answer: the pickup simply stays the named place,
  // which the traveler can change on the booking screen.
  const askedLocation = useRef(false);
  useEffect(() => {
    if (askedLocation.current) return;
    askedLocation.current = true;
    resolveCurrentDeparture().then((here) => {
      if (here) ride.setDeparture(here);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load this traveler's real rides from the database once their account is ready.
  useEffect(() => {
    if (user) ride.refreshMyRides({ useCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // SUGGESTED TRAVEL is EARNED, never furniture (Adrian, 8 Aug): a brand-new account sees
  // nothing here. Once real trips exist, suggest the place this person actually goes —
  // most-booked destination, ties broken by most recent — and only if it maps to a place
  // the app can book in one tap. Shown price = what they paid last time (the booking screen
  // re-quotes fresh, and the quoted price is the fixed one).
  const suggestion = useMemo(() => {
    if (ride.myRides.length === 0) return null;
    const counts = new Map<string, { n: number; latest: number; totalCents: number }>();
    for (const t of ride.myRides) {
      const prev = counts.get(t.arr);
      const at = new Date(t.createdAt).getTime();
      if (!prev) counts.set(t.arr, { n: 1, latest: at, totalCents: t.totalCents });
      else {
        prev.n += 1;
        if (at > prev.latest) {
          prev.latest = at;
          prev.totalCents = t.totalCents;
        }
      }
    }
    let best: { arr: string; n: number; latest: number; totalCents: number } | null = null;
    for (const [arr, v] of counts) {
      if (!best || v.n > best.n || (v.n === best.n && v.latest > best.latest)) {
        best = { arr, ...v };
      }
    }
    if (!best) return null;
    // A past destination is a historical label, not a current geocoded destination.
    // Re-enter it through live place search so the server resolves and re-quotes it now.
    return { query: canonicalPlaceName(best.arr) };
  }, [ride.myRides]);

  // WHAT THIS TRAVEL COSTS NOW, not what it cost last time.
  //
  // The card printed `lastPaidCents` — the total from a previous journey — as a bare figure
  // beside "Select ›". A traveler read it as the price, tapped through, and met a different
  // one: $36.29 on the card against $19.29 on Travel Options, for the same two places on the
  // same afternoon. Fares move with distance and class, so a past total is not a quote and
  // must not be dressed as one.
  //
  // Null until the server answers, and null if it cannot. No price beats a wrong price: the
  // destination is still one tap from a real quote either way.
  // A PLACE APPEARS ONCE ON THE SCREEN, NOT ONCE PER LIST (Chad, 13 Sept 2026). The suggestion
  // is drawn from the same history, so the most-travelled destination was offered above and
  // then listed again directly beneath it. The suggested place is excluded here; the list
  // still fills to three from what remains.
  const recentDistinct = useMemo(() => {
    const seen = new Set<string>();
    if (suggestion) seen.add(canonicalPlaceName(suggestion.query));
    const out: typeof ride.myRides = [];
    for (const r of ride.myRides) {
      const key = canonicalPlaceName(r.arr);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length === 3) break;
    }
    return out;
  }, [ride.myRides, suggestion]);

  const go = (path: Parameters<typeof router.navigate>[0]) => {
    setMenuOpen(false);
    router.navigate(path);
  };

  // THE MENU IN THREE GROUPS (Chad, 14 Sept 2026: nine stacked rows are decision friction;
  // group them into account, travel and assistance). Each row is named for what it opens.
  //
  // WHAT LEFT THE MENU. "Become an Operator": recruiting does not belong in a traveler's
  // menu (Chad); an operator enters at the front door, where the Operator role opens the
  // qualification flow. An account already qualifying or Commissioned still sees its own
  // state below, because that is the account's fact, not a pitch. "Notifications": it is a
  // row inside Settings, and was listed twice.
  type Row = { label: string; onPress: () => void };
  const operatorRow: Row | null =
    operator.verification === 'commissioned'
      ? {
          label: t('traveler.switchToOperator'),
          onPress: () => {
            setMenuOpen(false);
            operator.setRole('operator');
            if (router.canDismiss()) router.dismissAll();
            router.replace('/operator');
          },
        }
      : operator.verification === 'pending'
        ? { label: t('traveler.finishOperatorQualification'), onPress: () => go('/operator/review') }
        : null;

  // A Traveler can add the Operator role later. The front-door role choice promises this,
  // so the signed-in account must provide a durable path back to qualification.
  // "Operate with American Rider" states the relationship without gig-app recruiting language.
  const operateWithUsRow: Row | null =
    operator.verification === 'commissioned' || operator.verification === 'pending'
      ? null
      : { label: t('traveler.operateWithUs'), onPress: () => go('/operator/qualify') };
  const MENU_GROUPS: { label: string; rows: Row[] }[] = [
    {
      label: t('traveler.account'),
      rows: [
        { label: t('traveler.paymentMethods'), onPress: () => go('/wallet') },
        { label: t('traveler.settings'), onPress: () => go('/settings') },
        { label: t('traveler.inviteFriends'), onPress: () => go('/invite') },
        ...(operatorRow ? [operatorRow] : []),
      ],
    },
    {
      label: t('traveler.travel'),
      rows: [
        // A travel that is live or reserved sits at the head of the group (Chad: an active
        // itinerary belongs in the menu). Each opens the screen that shows it.
        ...(ride.rideActive ? [{ label: t('traveler.travelInProgress'), onPress: () => go('/ride') }] : []),
        ...(ride.scheduled && !ride.rideActive
          ? [{ label: t('traveler.scheduledTravel'), onPress: () => go('/upcoming') }]
          : []),
        { label: t('traveler.travelLog'), onPress: () => go({ pathname: '/history', params: { from: 'home' } }) },
      ],
    },
    {
      label: t('traveler.assistance'),
      rows: [
        {
          label: t('traveler.patronSupport'),
          onPress: () => {
            ride.openHelp(firstTripNo);
            go({ pathname: '/issues', params: { from: 'home' } });
          },
        },
        { label: t('traveler.safeTravels'), onPress: () => go('/safety') },
      ],
    },
    {
      label: t('traveler.company'),
      rows: [
        ...(operateWithUsRow ? [operateWithUsRow] : []),
        {
          // Opens the real company page. It is also where the 99% belongs: the founders'
          // brief §10A puts the operator-retention statement in a permanent
          // company-information section, stated once as an institutional fact rather than
          // repeated through the journey.
          label: t('traveler.aboutAmericanRider'),
          onPress: () => {
            setMenuOpen(false);
            Linking.openURL(`${LEGAL_URL}/about`).catch(() => {
              router.navigate('/settings');
            });
          },
        },
      ],
    },
  ];

  return (
    <Screen note={note} scrollEnabled={!mapExploring}>
      {/* bar('menu') — the one shared letterhead, so home can never drift from the
          other screens again. It owns the demo's 24px gap below itself. */}
      <LetterheadBar onMenu={() => setMenuOpen(true)} />

      <Display style={styles.homeDisplay}>{t('traveler.beginTravel2')}</Display>

      {/* SPATIAL CONTEXT, NOT THE SUBJECT OF THE SCREEN (Chad, 13 Sept 2026, approved the
          same evening). It shows where the traveler is and nothing else: no operators we
          cannot see, no LIVE badge over a position the device gave us a moment ago. It draws
          only once a real fix has resolved, so it never presents a guessed location as a
          known one, and it is absent on web and Android until our own tiles exist. */}
      <HomeMap lat={ride.departure.lat} lng={ride.departure.lng}
        onExploringChange={setMapExploring} />

      {/* NO WELCOME BLOCK — removed 15 Aug 2026. Two independent standards condemned
          it. (1) Chad's web demo has no equivalent; it was an undisclosed addition that
          pushed the whole home screen down ~135px. (2) Its copy — "One all-in price — no
          surge, no surprises" — is precisely the promotional register the founders' design
          brief forbids (sections 8 and 31): American Rider does not reassure people that
          its price is trustworthy, it states the price and lets that carry the meaning.
          The 99% model belongs in About American Rider and once, quietly, on a completed
          receipt — not on the booking screen. The `ar:welcomed:v1` flag and dismissWelcome
          go with it. */}

      {rideOngoing && (
        <Pressable onPress={() => router.navigate('/ride')}>
          <View style={styles.ongoingCard}>
            <View style={styles.ongoingLeft}>
              <PulseDot />
              <View>
                <Text style={styles.ongoingTitle}>{STATUS_LABELS[ride.status]}</Text>
                <Text style={styles.ongoingSub}>{t('traveler.tapToSeeRide')}</Text>
              </View>
            </View>
            {/* No ETA is rendered until dispatch supplies authoritative timing. */}
          </View>
        </Pressable>
      )}

      {/* A Smart Travel journey between its two car travels: the traveler is on, or heading
          to, the transit leg, and the last car travel is still to be reserved. Without this
          row the plan was unreachable from anywhere once Travel Complete was dismissed. */}
      {!rideOngoing && ride.smartJourney && (
        <Pressable onPress={() => router.navigate('/smart')}>
          <View style={styles.ongoingCard}>
            <View style={styles.ongoingLeft}>
              <PulseDot />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ongoingTitle}>{t('traveler.smartTravel')}</Text>
                <Text style={styles.ongoingSub} numberOfLines={1}>
                  {(() => {
                    const legs = ride.smartJourney.plan.legs;
                    const next = legs.find((l) => l.kind === 'transit') ?? legs[legs.length - 1];
                    return t('traveler.smartNext', { leg: legTitle(next, t) });
                  })()}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      )}

      {/* The demo's Upcoming Travel card: blue-tinted, margin-top 18, padding 16/18,
          label in blue, destination 15.5/600, when · price 13 ink2, red Cancel. */}
      {/* THE CARD NOW REPORTS THE RESERVATION'S ACTUAL STATE, not only that one was made.
          Until backend/scheduler.js existed there was one state to report — "we wrote this
          down" — because nothing ever happened to a reservation afterwards. Now an operator
          is assigned, or the card was declined, or nobody was available, and each of those is
          something the traveler has to be told without being asked to guess from silence. */}
      {ride.scheduled && ride.schedInfo && (
        <View style={styles.upcomingCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <SectionLabel style={styles.upcomingLabel}>
                {ride.schedState?.status === 'dispatched' ? 'Operator Assigned' : 'Upcoming Travel'}
              </SectionLabel>
              <Text style={styles.upcomingDest}>{ride.schedInfo.arr}</Text>
              <Text style={styles.upcomingWhen}>
                {ride.schedInfo.when} {ride.schedInfo.time} {ride.schedInfo.period} ·{' '}
                {fmt(ride.schedInfo.cost)}
              </Text>
              {ride.schedState?.status === 'dispatched' && (
                <Text style={styles.upcomingWhen}>
                  {ride.schedState.operatorName}
                  {typeof ride.schedState.etaMin === 'number'
                    ? t('traveler.schedEtaToPickup', { n: ride.schedState.etaMin })
                    : ''}
                </Text>
              )}
              {/* The Travel Number exists from the moment the reservation is made, so it is
                  shown from that moment. Mono, as every travel number in the app is. */}
              {!!ride.schedState?.tripNo && (
                <Mono style={styles.upcomingNo}>{ride.schedState.tripNo}</Mono>
              )}
            </View>
            {/* Cancelling a reservation and cancelling a dispatched travel are different acts
                with different consequences, and this control can only honestly perform the
                first. Once an operator is on their way it points at the travel, where the
                terms of cancelling it are stated. */}
            {ride.schedState?.status === 'dispatched' ? (
              <Pressable onPress={() => router.navigate('/ride')} hitSlop={8}>
                <Text style={styles.upcomingOpen}>{t('traveler.view')} ›</Text>
              </Pressable>
            ) : ride.schedState?.status === 'reserved' && !confirmCancelScheduled ? (
              <Pressable
                accessibilityRole="button"
                disabled={cancellingScheduled}
                onPress={() => setConfirmCancelScheduled(true)}
                hitSlop={8}
              >
                <Text style={styles.upcomingCancel}>{t('traveler.cancel2')}</Text>
              </Pressable>
            ) : null}
          </View>

          {confirmCancelScheduled && ride.schedState?.status === 'reserved' && (
            <View style={styles.scheduledCancelReview}>
              <Text style={styles.scheduledCancelTitle}>{t('traveler.schedCancelConfirmTitle')}</Text>
              <Text style={styles.upcomingWhen}>{t('traveler.schedCancelConfirmBody')}</Text>
              <View style={styles.scheduledCancelActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={cancellingScheduled}
                  style={styles.scheduledKeepAction}
                  onPress={() => { setConfirmCancelScheduled(false); setScheduledCancelError(null); }}
                >
                  <Text style={styles.upcomingOpen}>{t('traveler.schedKeepTravel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={cancellingScheduled}
                  style={styles.scheduledKeepAction}
                  onPress={async () => {
                    if (cancellingScheduled || ride.schedState?.status !== 'reserved') return;
                    setCancellingScheduled(true);
                    setScheduledCancelError(null);
                    try {
                      const cancelled = await ride.cancelScheduled();
                      if (cancelled) setConfirmCancelScheduled(false);
                      else setScheduledCancelError(t('traveler.cancelFailed'));
                    } catch {
                      setScheduledCancelError(t('traveler.cancelFailed'));
                    } finally {
                      setCancellingScheduled(false);
                    }
                  }}
                >
                  <Text style={styles.upcomingCancel}>
                    {cancellingScheduled ? t('traveler.familyWorking') : t('traveler.schedCancelConfirmAction')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {ride.schedState?.status === 'unmatched' && (
            <Text style={styles.upcomingFail}>
              {ride.schedState.closedReason || t('traveler.noOperatorAvailable')} {t('traveler.noChargeMade')}
            </Text>
          )}
          {scheduledCancelError ? <Text style={styles.schedError}>{scheduledCancelError}</Text> : null}
          {ride.schedState?.status === 'payment_failed' && (
            <Text style={styles.upcomingFail}>
              {ride.schedState.paymentError || t('traveler.cardDeclined')} {t('traveler.noOperatorSent')}
            </Text>
          )}
          {ride.schedState?.status === 'needs_attention' && (
            <Text style={styles.upcomingFail}>
              {t('traveler.chargedNotCreated')}
            </Text>
          )}
          <Pressable accessibilityRole="button"
            style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 8 }}
            onPress={() => router.navigate('/upcoming')}>
            <Text style={styles.upcomingOpen}>{t('traveler.schedManageTravel')} ›</Text>
          </Pressable>
        </View>
      )}

      {/* DEPARTURE. Chad §20: a quoted price must be attached to the route that produced
          it, and every price on this screen is quoted FROM here. Stating it also makes the
          bottom of the page one block — from here, go — which is the job the CTA could not
          do alone. Reads the resolved position when we have one, the named fallback when
          we do not; it never asserts a location the app has not established. */}
      <View style={styles.depRow}>
        <Text style={styles.depLabel}>{t('traveler.departure')}</Text>
        {/* TWO LINES, NOT ONE. `numberOfLines={1}` truncated this to "Current location —
            Miami Financi…" once Dynamic Type was enabled — and a pickup a traveler cannot
            read is the one field on this screen that has to be legible. Options wraps the
            same string correctly; this row simply forbade it. Two lines is enough for every
            place name in the market at the 1.3 cap, and it still truncates beyond that
            rather than pushing the destination field down the screen. */}
        <Text style={styles.depValue} numberOfLines={2}>
          {prettyPlace(ride.departure.name)}
        </Text>
      </View>

      {pickupKnown && !canOfferNewTravel && (
        <View style={styles.marketCard} accessibilityRole="alert">
          <Text style={styles.marketTitle}>{t('traveler.marketServiceStatus')}</Text>
          <Text style={styles.marketBody}>
            {marketChecking || marketAt!==marketKey ? t('traveler.marketChecking') :
             pickupMarket?.status==='unavailable' ? t('traveler.marketStatusUnavailable') :
             t('traveler.marketNotServing',{name:pickupMarket?.name||t('traveler.marketArea')})}
          </Text>
          {!marketChecking && marketAt===marketKey && pickupMarket?.status==='unavailable' && (
            <Pressable accessibilityRole="button" style={styles.marketAction} onPress={()=>setMarketRetry((n)=>n+1)}>
              <Text style={styles.marketActionText}>{t('traveler.marketCheckAgain')}</Text>
            </Pressable>
          )}
          {!marketChecking && marketAt===marketKey && pickupMarket?.status!=='unavailable' && (
            waitlistState==='recorded'?<Text style={styles.marketBody}>{t('traveler.waitlistRecorded')}</Text>:
            <>
              <Text style={styles.marketBody}>{t('traveler.marketInterestPrivacy')}</Text>
              <Pressable accessibilityRole="button" style={styles.marketAction}
                disabled={waitlistState==='saving'} accessibilityState={{disabled:waitlistState==='saving'}}
                onPress={async()=>{
                  if(depLat==null||depLng==null||waitlistState==='saving')return;
                  const key=marketKey;setWaitlistState('saving');
                  const saved=await joinWaitlist({lat:depLat,lng:depLng},'traveler');
                  if(latestMarketKey.current===key)setWaitlistState(saved?'recorded':'failed');
                }}>
                <Text style={styles.marketActionText}>{t('traveler.waitlistJoin')}</Text>
              </Pressable>
              {waitlistState==='failed'&&<Text style={styles.marketBody}>{t('traveler.waitlistFailed')}</Text>}
            </>
          )}
        </View>
      )}

      {canOfferNewTravel && <Pressable
        onPress={() => {
          ride.startBooking();
          router.navigate({ pathname: '/reserve', params: { search: '1' } });
        }}
      >
        <View style={styles.searchCard}>
          <Magnifier />
          <Text style={styles.searchPlaceholder}>{t('traveler.destinationEntry')}</Text>
        </View>
      </Pressable>}

      {/* THE AI PLANNER IS WITHDRAWN, 4 Sept 2026, on the founders' decision — not shipping at
          launch, and possibly refined and reintroduced later.

          AGENTS.md recorded it as an explicit KEEP, which is why the link was here at all.
          That instruction is now superseded and AGENTS.md has been corrected in the same
          change; a stale instruction file is how a withdrawn feature comes back by accident.

          app/plan.tsx and src/backend/assistant.ts are deliberately left in place. The work is
          finished and the server route is live — deleting it would mean rebuilding it to
          reintroduce it. What is removed is the ENTRY POINT, which is the only thing that
          decides whether a traveler meets the feature. No traveler can reach it now.

          Home therefore offers exactly one way to name a destination: the field above. */}

      {/* The approved first concept: readable saved destinations with honest empty states.
          Unset Home/Work are setup actions, never synthetic account information. */}
      {canOfferNewTravel && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeading}>{t('traveler.savedPlaces')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/profile')} hitSlop={10}>
              <Text style={styles.sectionAction}>{t('traveler.edit')}</Text>
            </Pressable>
          </View>
          <View style={styles.listCard}>
            {savedRows.map((row, i) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                onPress={() => {
                  if (!row.place) {
                    router.navigate({ pathname: '/saved-place', params: { which: row.which || 'home' } });
                    return;
                  }
                  ride.startBooking({
                    name: row.place.label,
                    short: row.place.label,
                    cost: 0,
                    meta: '',
                    lat: row.place.lat,
                    lng: row.place.lng,
                  });
                  router.navigate('/reserve');
                }}
              >
                <View style={[styles.listRow, i > 0 && styles.listRowDivider]}>
                  <PlaceGlyph kind={row.icon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{row.title}</Text>
                    <Text style={styles.listMeta}>{row.place?.label ?? t('traveler.notSet')}</Text>
                  </View>
                  <Chev />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Earned, never furniture: no trips, no section. */}
      {canOfferNewTravel && suggestion && (
        <>
          <SectionLabel style={styles.labelSuggested}>{t('traveler.suggestedTravel')}</SectionLabel>
          <Pressable accessibilityRole="button" onPress={() => {
            ride.startBooking();
            router.navigate({ pathname: '/reserve', params: { search: '1', q: suggestion.query } });
          }}>
            <View style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{prettyPlace(suggestion.query)}</Text>
              </View>
              <Text style={styles.select}>{t('traveler.select')} ›</Text>
            </View>
          </Pressable>
        </>
      )}

      {recentDistinct.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeading}>{t('traveler.recentTravel')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/history')} hitSlop={10}>
              <Text style={styles.sectionAction}>{t('traveler.viewAll')}</Text>
            </Pressable>
          </View>
          <View style={styles.listCard}>
            {/* NO PRICE ON THESE ROWS — founders' call, 13 Aug 2026 (Chad: not on the
                home screen; Adrian: "have something like a receipt somewhere").
                The demo does print a price here, but it prints the LIVE fare for
                re-booking that route. Ours could only show what was paid on the day,
                and a stale number sitting on the booking screen is a trap: read
                $13.49, tap, get quoted $26 — the exact surprise "one all-in price, no
                surge, no surprises" promises never to deliver. So the row answers
                "where have I been", and the price lives on the receipt, where it is
                unambiguous. Tapping opens THAT trip's receipt (not the Travel Log). */}
            {recentDistinct.map((r, i) => (
              <Pressable key={r.id} accessibilityRole="button" onPress={() => openReceipt(r)}>
                <View style={[styles.listRow, i > 0 && styles.listRowDivider]}>
                  <PlaceGlyph kind="pin" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{canonicalPlaceName(r.arr)}</Text>
                    <Text style={styles.listMeta}>
                      {travelDateShort(r.createdAt, language)}{' '}
                      · {t('traveler.fromPlace', { place: prettyPlace(r.dep) })}
                    </Text>
                  </View>
                  <Chev />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* First-time accounts have no Recent Travel. When the server supplies valid nearby
          suggestions, show them under their actual name, not as fabricated past travels. */}
      {canOfferNewTravel && recentDistinct.length === 0 && nearby.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeading}>{t('traveler.nearbyDestinations')}</Text>
          </View>
          <View style={styles.listCard}>
            {nearby.slice(0, 3).map((place, i) => (
              <Pressable key={`${place.name}:${place.lat},${place.lng}`} accessibilityRole="button"
                onPress={() => {
                  ride.startBooking({ name: place.name, short: place.short || place.name,
                    cost: 0, meta: '', lat: place.lat, lng: place.lng });
                  router.navigate('/reserve');
                }}>
                <View style={[styles.listRow, i > 0 && styles.listRowDivider]}>
                  <PlaceGlyph kind="pin" />
                  <View style={{ flex: 1 }}><Text style={styles.listName}>{place.name}</Text></View>
                  <Chev />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* .spring — pushes the CTA to the bottom of a short screen. */}
      <View style={{ flex: 1 }} />

      {canOfferNewTravel && <Pressable
        onPress={() => {
          ride.startBooking();
          router.navigate({ pathname: '/reserve', params: { search: '1' } });
        }}
      >
        {/* SOLID INK — reverted 16 Aug. Chad tried the ghost treatment and rejected it:
            "the original color provided the screen with a fine balance." He is right that a
            pale button on pale paper loses the weight that anchors the page. The state
            worry it was meant to answer is handled instead by the departure line above it:
            the bottom of the screen now reads as one block — from here, go. */}
        <View style={styles.reserveBtn}>
          <Text style={styles.reserveBtnText}>{t('traveler.reserveTravel')}</Text>
        </View>
      </Pressable>}

      {/* SCHEDULE SITS BESIDE THE PRIMARY ACTION (Chad, 13 Sept 2026). The screen existed and
          was reachable only after a destination had been chosen, which is the wrong moment
          for a traveler who already knows they are arranging next Tuesday. */}
      {canOfferNewTravel && <Pressable
        onPress={() => {
          ride.startBooking();
          router.navigate('/schedule');
        }}
        hitSlop={8}
      >
        <Text style={styles.scheduleLink}>{t('traveler.scheduleForLater')}</Text>
      </Pressable>}

      {/* The demo's drawer: scrim + sliding left panel, hairline-topped rows, no spring.
          THE HEAD IS THE ACCOUNT'S NAME, NOT A HANDLE AND NOT A BUBBLE (Chad, 14 Sept 2026).
          The name the traveler gave at sign-up when there is one; otherwise the address the
          account is held under — a fact, never a username minted from it. No initials disc:
          the letterhead already carries the person mark, and a second one here was
          furniture. The link beneath is monochrome and named for what it opens. */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <Pressable onPress={() => go('/profile')} style={styles.drawerHead} accessibilityRole="button">
          <Text style={styles.drawerName} numberOfLines={1}>{headName}</Text>
          <Text style={styles.drawerProfileLink}>{t('traveler.accountDetails')} ›</Text>
        </Pressable>
        {MENU_GROUPS.map((group) => (
          <View key={group.label}>
            <SectionLabel style={styles.drawerLabel}>{group.label}</SectionLabel>
            {group.rows.map((item) => (
              <DrawerRow key={item.label} label={item.label} onPress={item.onPress} />
            ))}
          </View>
        ))}
        {/* Sign Out is an ordinary final row in the drawer, matching the other
            navigation rows. Its own top hairline provides enough separation without turning
            a reversible session action into a special or destructive control. */}
        <DrawerRow
          label={t('traveler.signOut')}
          color={colors.ink2}
          chev={false}
          onPress={() => {
            setMenuOpen(false);
            signOut();
          }}
        />
      </Drawer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The home heading is important, not theatrical. The shared 34pt Display remains
  // available for true hero moments; here 29pt gives the letterhead, departure context,
  // destination field and actions a calmer single hierarchy.
  homeDisplay: {
    fontSize: 29,
    lineHeight: 33,
    letterSpacing: -0.52,
  },
  marketCard:{marginTop:16,paddingVertical:16,paddingHorizontal:18,borderWidth:1,
    borderColor:colors.blueBorder,backgroundColor:colors.blueTint,borderRadius:radii.card},
  marketTitle:{fontSize:14,fontWeight:'700',color:colors.ink,marginBottom:6},
  marketBody:{fontSize:14,lineHeight:21,color:colors.ink2,marginTop:3},
  marketAction:{marginTop:12,minHeight:46,justifyContent:'center',alignSelf:'flex-start'},
  marketActionText:{fontSize:15,fontWeight:'700',color:colors.blue},
  ongoingCard: {
    marginTop: 18,
    backgroundColor: colors.ink,
    borderRadius: radii.card,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ongoingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ongoingTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  ongoingSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  // Demo: .card margin-top:18 padding:16px 18px background:--blue-t border:--blue-b
  upcomingCard: {
    marginTop: 18,
    backgroundColor: colors.blueTint,
    borderWidth: 1,
    borderColor: colors.blueBorder,
    borderRadius: radii.card,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  upcomingLabel: { color: colors.blue },
  upcomingDest: { fontSize: 15.5, fontWeight: '600', color: colors.ink, marginTop: 7 },
  upcomingWhen: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  scheduledCancelReview: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.blueBorder, paddingTop: 12 },
  scheduledCancelTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  scheduledCancelActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  scheduledKeepAction: { minHeight: 44, justifyContent: 'center', paddingVertical: 7 },
  // INK (Chad, 19 Sept 2026). Cancelling a reservation that has not been dispatched is an
  // ordinary correction, not a destructive act, and it sits on the home screen.
  upcomingCancel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  schedError: { fontSize: 13, color: colors.red, marginTop: 8 },
  upcomingOpen: { fontSize: 13, fontWeight: '600', color: colors.blue },
  upcomingNo: { fontSize: 11.5, color: colors.muted, marginTop: 6, letterSpacing: 0.6 },
  upcomingFail: { fontSize: 13, color: colors.ink2, marginTop: 11, lineHeight: 18.5 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  // Demo: .card margin-top:22 padding:17px 18px gap:13, 16.5px --muted placeholder
  searchCard: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    // Keep a generous target while reducing the visual mass of the field.
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  searchPlaceholder: { fontSize: 15.5, color: colors.muted },
  // Demo: 'Suggested Travel' margin-top:26 · 'Recent Travel' margin-top:28 · card mt 12
  labelSuggested: { marginTop: 26, marginBottom: 12 },

  labelRecent: { marginTop: 28, marginBottom: 12 },
  sectionHeader: { marginTop: 27, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeading: { fontSize: 16, fontWeight: '600', color: colors.ink },
  sectionAction: { fontSize: 13.5, fontWeight: '500', color: colors.accent, paddingVertical: 6 },
  placeGlyph: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.fill,
    alignItems: 'center', justifyContent: 'center' },
  // Demo: .card padding:18px 20px
  itemCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: { fontSize: 16.5, fontWeight: '600', color: colors.ink },
  select: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  itemMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  // Demo: .card padding:2px 20px, rows are .lrow{ padding:16px 0; gap:14 }
  listCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 2,
    paddingHorizontal: 18,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 64,
    gap: 14,
  },
  listRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  // The demo's recent rows are REGULAR weight at 15px — not bold at 16.
  listName: { fontSize: 14.5, color: colors.ink },
  listMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  rowRight: { alignItems: 'flex-end' },
  scheduleLink: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent,
    paddingVertical: 13,
  },
  rowAction: { fontSize: 12, fontWeight: '600', color: colors.blue, marginTop: 4 },
  // .btn.cta-space{ margin-top:24; border-radius:13; padding:18; 16/600/.01em }
  depRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  depLabel: { fontSize: 12, color: colors.muted },
  depValue: { fontSize: 13.5, color: colors.ink2, flexShrink: 1, textAlign: 'right' },
  reserveBtn: {
    marginTop: 12,
    backgroundColor: colors.solid,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  reserveBtnText: {
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: 0.16,
    color: colors.solidFg,
  },
  // The demo's drawer head: avatar · name/link, gap 13, air below — no rule (the
  // first row's top hairline draws the line).
  drawerHead: { paddingBottom: 16 },
  drawerName: { fontSize: 16.5, fontWeight: '600', color: colors.ink },
  // Monochrome, weight-carried; the profile entry remains secondary to the account name.
  drawerProfileLink: { fontSize: 12.5, fontWeight: '600', color: colors.accent, marginTop: 4 },
  drawerLabel: { marginTop: 16, marginBottom: 3, fontSize: 10.5, letterSpacing: 1.5 },
});
