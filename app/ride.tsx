// The live ride — the web demo's "searching" and "enroute" screens on top of the app's
// REAL machinery. Demo-exact: the centered radar search with Estimated Search Time, the
// phase titles/subs with the plain Arrival figure (no pill), the operator card with the
// quiet VERIFIED label, the bare 4-segment step bars, the Safe Travels card, the Travel
// Number row, "Communicate" + "Patron Support", and the quiet "Cancel Travel" link.
// Deliberately better than the demo: a real Apple Map (not a drawn one), the
// walk-to-your-car finder, the movable pickup pin, venue meet-spot notes, and live
// payment state.
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useTravelVoice } from '../src/state/VoiceContext';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useNative } from '../src/components/anim';
import { FindMiguel } from '../src/components/FindMiguel';
import { LiveMap } from '../src/components/LiveMap';
import {
  Card,
  Chev,
  LetterheadBar,
  Mono,
  Num,
  OutlineButton,
  PrimaryButton,
  Screen,
  SectionLabel,
} from '../src/components/UI';
import { prettyPlace, STATUS_LABELS, VENUE_NOTES } from '../src/data';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, fmt, radii } from '../src/theme';
import { followLink } from '../src/backend/follow';

// Called during render and handed the screen's own `t`, so the line changes with the
// language instead of freezing at whatever locale was current when this module loaded.
const STATUS_SUBS = (t: (k: string) => string) => [
  t('traveler.rideStepPreparing'),
  t('traveler.rideStepOnWay'),
  t('traveler.rideStepOutside'),
  t('traveler.rideStepInProgress'),
  t('traveler.rideStepApproaching'),
  t('traveler.rideStepComplete'),
];

// The demo's matching radar, exactly: 92px, two hairline rings (r34 / r21), a 4px ink
// center dot, and a sweeping needle with its faint wedge.
function Radar() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: useNative,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={styles.radarWrap}>
      <Svg width={92} height={92} viewBox="0 0 92 92" style={StyleSheet.absoluteFill}>
        <Circle cx={46} cy={46} r={34} stroke={colors.hairline} strokeWidth={2} fill="none" />
        <Circle cx={46} cy={46} r={21} stroke={colors.hairline} strokeWidth={2} fill="none" />
        <Circle cx={46} cy={46} r={4} fill={colors.ink} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={92} height={92} viewBox="0 0 92 92">
          <Path d="M46 46 L46 10 A36 36 0 0 1 74 30 Z" fill={colors.ink} opacity={0.12} />
          <Line
            x1={46}
            y1={46}
            x2={46}
            y2={12}
            stroke={colors.ink}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

// The demo's Safe Travels shield: 22px, accent stroke 1.8.
function Shield() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7.5 3v5.5c0 5-3.3 8.4-7.5 10.5C7.8 19.9 4.5 16.5 4.5 11.5V6z"
        stroke={colors.blue}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9.2 12.2l2 2 3.6-3.8"
        stroke={colors.blue}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// A thin map-pin outline for the set-your-pickup card (no emoji in the letterhead world).
function PinIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-6.5-5.5-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.5 12 21 12 21z"
        stroke={colors.ink}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10.8} r={2.3} stroke={colors.ink} strokeWidth={1.6} />
    </Svg>
  );
}

export default function RideScreen() {
  const voice = useTravelVoice();
  const { t } = useLanguage();
  const router = useRouter();
  const ride = useRide();
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);

  // The live map's car eases into the pickup over a few seconds after the status flips to
  // "Operator Arrived" — hold the walk-to-your-car finder until it has visibly parked.
  const [carParked, setCarParked] = useState(false);
  useEffect(() => {
    if (ride.status !== 2) {
      setCarParked(false);
      return;
    }
    const t = setTimeout(() => setCarParked(true), 3500);
    return () => clearTimeout(t);
  }, [ride.status]);

  const st = ride.status;
  const arrivalFact = (() => {
    if (st === 1 && ride.matchedOp && ride.matchedOp.etaMin > 0) return t('traveler.durMin', { n: ride.matchedOp.etaMin });
    if (st === 2) return t('traveler.rideStepOutside');
    // Total route duration is not remaining duration. Without live progress telemetry there is
    // no defensible countdown after boarding, so display no invented arrival estimate.
    return null;
  })();
  const subs = STATUS_SUBS(t);
  const complete = st >= 5;
  const canCancel = st <= 2;
  const preparing = !ride.matchedOp && ride.dispatchState === 'preparing';
  const searching = !ride.matchedOp && ride.dispatchState === 'searching';
  const noOperator = !ride.matchedOp && (ride.dispatchState === 'none' || ride.dispatchState === 'error');
  // Assignment alone is not Operator acceptance. No En Route progress is earned at step 0.
  const stepIdx = st === 0 ? -1 : st === 1 ? 0 : st === 2 ? 1 : st <= 4 ? 2 : 3;
  const steps = [t('traveler.phaseEnRoute'), t('traveler.phaseArrived'), t('traveler.phaseOnboard'), t('traveler.arrival')];

  useEffect(() => {
    if (!canCancel && cancelAsk) setCancelAsk(false);
  }, [canCancel, cancelAsk]);

  // The demo auto-advances to Travel Complete; so do we, once.
  const wentComplete = useRef(false);
  useEffect(() => {
    if (complete && !wentComplete.current) {
      wentComplete.current = true;
      router.navigate('/complete');
    }
  }, [complete, router]);

  // When a prepayment rate change requires a newer app, do not mislead the
  // Traveler with an ordinary Operator-search error. No booking was created.
  if(ride.dispatchState==='update_required'){
    return (
      <Screen>
        <LetterheadBar onBack={()=>router.replace('/')}/>
        <View style={{flex:1,justifyContent:'center',paddingHorizontal:24,gap:14}}>
          <Text style={styles.searchTitle}>{t('traveler.updateRequiredTitle')}</Text>
          <Text style={styles.searchSub}>{t('traveler.updateRequiredBody')}</Text>
          <PrimaryButton
            label={t('traveler.returnHome')}
            onPress={()=>router.replace('/')}
          />
        </View>
      </Screen>
    );
  }

  // A price change before booking is not an Operator search failure. Nothing
  // has been charged, so return the Traveler to the newly quoted confirmation.
  if(ride.dispatchState==='price_changed'){
    return (
      <Screen>
        <LetterheadBar onBack={()=>router.replace('/reserve')}/>
        <View style={{flex:1,justifyContent:'center',paddingHorizontal:24,gap:14}}>
          <Text style={styles.searchTitle}>{t('traveler.priceChangedTitle')}</Text>
          <Text style={styles.searchSub}>{t('traveler.priceChangedBody')}</Text>
          <PrimaryButton
            label={t('traveler.reviewUpdatedTotal')}
            onPress={()=>router.replace('/reserve')}
          />
        </View>
      </Screen>
    );
  }

  // ---- The demo's searching screen: centered radar, estimate, quiet cancel. ----
  if (preparing || searching || noOperator) {
    return (
      <Screen>
        <LetterheadBar onMenu={() => router.navigate('/account')} />
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center' }}>
          {(preparing || searching) && <Radar />}
          <Text style={styles.searchTitle}>
            {preparing ? t('traveler.rideStepPreparing') : searching ? t('traveler.rideFindingBest')
              : ride.dispatchState === 'none' ? t('traveler.noOperatorAvailable') : t('traveler.dispatchUnavailable')}
          </Text>
          {(preparing || searching) ? (
            <Text style={styles.searchSub}>
              {preparing ? t('traveler.busyChecking') : t('traveler.matchingNearest')}
            </Text>
          ) : (
            <>
              {ride.dispatchState === 'none' && (
                <Text style={styles.searchSub}>{t('traveler.noOperatorsNearby')}</Text>
              )}
              {ride.payment.status === 'paid' ? (
                <Text style={styles.searchSub}>{t('traveler.chargedAwaitingOperator')}</Text>
              ) : ride.payment.status === 'processing' || ride.payment.status === 'failed' ? (
                <Text style={styles.searchSub}>{t('traveler.paymentStatusUnverified')}</Text>
              ) : null}
              {/* THREE WAYS OUT, NOT ONE (founders, 5 Sept 2026, from their own screenshot).
                  
                  This offered "Try again" and, at the bottom, "Cancel Travel". A traveler who
                  simply wanted a different destination — or to go back and think — had to
                  CANCEL THE TRAVEL to leave the screen. Cancelling is a decision about a
                  booking; leaving a page is not, and making somebody take the first to do the
                  second is a dead end wearing a button.
                  
                  Change Travel keeps the booking and returns to the destination screen.
                  Cancel remains, at the bottom, unchanged and still confirmed — the heaviest
                  action stays the least prominent. */}
              <Pressable onPress={ride.retryDispatch} hitSlop={8}>
                <Text style={styles.retryLink}>{t('traveler.tryAgain')}</Text>
              </Pressable>
              {ride.payment.status === 'idle' ? (
                <Pressable onPress={() => router.replace('/reserve')} hitSlop={8}>
                  <Text style={styles.retryLink}>{t('traveler.changeTravel')}</Text>
                </Pressable>
              ) : null}
              {/* Leaving the view never tells the server to cancel an existing booking. */}
              <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} hitSlop={8}>
                <Text style={styles.retryLink}>{t('traveler.returnHome')}</Text>
              </Pressable>
            </>
          )}
        </View>
        {cancelAsk ? (
          <View style={styles.cancelCard}>
            <Text style={styles.cancelTitle}>{t('traveler.cancelThisTravel')}</Text>
            {/* "Free to cancel — no operator has been assigned yet" gave the old $3-fee
                logic as its reason, and was written when the card had already been charged
                by this point. Nothing is charged until an operator is matched now, so this
                states the money position instead of reassuring about it. */}
            <Text style={styles.cancelNote}>{t(ride.payment.status === 'paid'
              ? 'traveler.chargedAwaitingOperator'
              : ride.payment.status === 'processing' || ride.payment.status === 'failed'
                ? 'traveler.paymentStatusUnverified' : 'traveler.notCharged')}</Text>
            <View style={styles.cancelBtns}>
              <Pressable onPress={() => setCancelAsk(false)} style={styles.keepBtn}>
                <Text style={styles.keepBtnText}>{t('traveler.keepTravel')}</Text>
              </Pressable>
              <Pressable
                disabled={cancelBusy}
                onPress={async () => {
                  if (cancelBusy) return;
                  setCancelBusy(true);
                  setCancelFailed(false);
                  const ok = await ride.cancelRide();
                  setCancelBusy(false);
                  if (ok) router.dismissTo('/');
                  else setCancelFailed(true);
                }}
                style={styles.yesCancelBtn}
              >
                <Text style={styles.yesCancelText}>{cancelBusy ? t('traveler.familyWorking') : t('traveler.yesCancel')}</Text>
              </Pressable>
            </View>
            {cancelFailed ? (
              <View>
                <Text style={styles.cancelNote}>{t('traveler.cancelFailed')}</Text>
                <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={styles.retryLink}>{t('traveler.returnHome')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: '/issues', params: { from: 'status' } })} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={styles.retryLink}>{t('traveler.contactSupport')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('traveler.cancelTravel')}
            onPress={() => setCancelAsk(true)}
            style={{ minHeight: 44, justifyContent: 'center', marginTop: 12 }}
            hitSlop={10}
          >
            <Text style={styles.searchCancel}>{t('traveler.cancelTravel')}</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {/* Safety is available from the moment a Travel is confirmed, not only after an
            Operator has been found. A Traveler searching for an Operator may still need to
            share their plans, contact a trusted person, or use Emergency Assistance. */}
        <Pressable onPress={() => router.navigate('/safety')}>
          <View style={[styles.safetyCard, { marginBottom: 18 }]}>
            <Shield />
            <View style={{ flex: 1 }}>
              <Text style={styles.safetyTitle}>{t('traveler.safeTravels')}</Text>
              <Text style={styles.safetySub}>{t('traveler.safetySearchRow')}</Text>
            </View>
            <Chev />
          </View>
        </Pressable>

      </Screen>
    );
  }

  const shareBookedTravel = async () => {
    if (ride.travelParty.mode !== 'other_adult' || !ride.matchedOp?.rideId) return;
    const link = await followLink(ride.matchedOp.rideId);
    const op = ride.matchedOp;
    const message = [
      t('traveler.safetyShareIntro', { place: ride.lastTrip.arr }),
      t('traveler.safetyOperatorLine', { name: op.name, car: op.car, plate: op.plate }),
      t('traveler.safetyArrivingIn', { n: op.etaMin }),
      t('traveler.safetyTravelNumber', { no: ride.lastTrip.no }),
      link && t('traveler.safetyFollowHere', { link }),
    ].filter(Boolean).join(' ');
    try {
      await Share.share({ message });
    } catch {
      // The Booker dismissed the native share sheet.
    }
  };

  return (
    <Screen>
      <LetterheadBar onMenu={() => router.navigate('/account')} />
      {/* The demo's enroute head: 23px phase title + sub, plain ARRIVAL figure. */}
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{STATUS_LABELS[st]}</Text>
          <Text style={styles.statusSub}>{subs[st]}</Text>
        </View>
        <View style={styles.etaWrap}>
          <SectionLabel style={styles.etaLabel}>{t('traveler.arrival')}</SectionLabel>
          <Num size={18} weight="600" style={{ marginTop: 3 }}>
            {/* While riding, show time left from the ACTUAL route rather than the canned
                demo text — the real drive time scaled by how much trip remains. */}
            {arrivalFact ?? '—'}
          </Num>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <LiveMap />
      </View>

      {/* He's here: the walk-to-your-car finder (arrow + distance on iPhone), with the
          "Confirm Boarding" button that lets the travel begin. */}
      {st === 2 && carParked && ride.tripCoords && (
        <FindMiguel
          target={ride.pickupPin ?? ride.tripCoords.pickup}
          driverName={ride.matchedOp?.name || 'Your operator'}
          car={ride.matchedOp?.car || ''}
          onBoard={ride.boardRide}
        />
      )}

      {/* Picking someone up at a big venue? Tell them exactly where to stand. */}
      {st <= 2 && VENUE_NOTES[ride.departure.short] && (
        <View style={styles.venueCard}>
          <Text style={styles.venueTitle}>{t('traveler.whereToMeet')}</Text>
          <Text style={styles.venueBody}>{t(VENUE_NOTES[ride.departure.short])}</Text>
        </View>
      )}

      {st <= 1 && Platform.OS === 'ios' && (
        <Pressable onPress={() => router.push('/pickup-map')}>
          <View style={styles.adjustPickupCard}>
            <PinIcon />
            <View style={{ flex: 1 }}>
              {ride.pickupPin ? (
                <>
                  <Text style={styles.adjustPickupTitle}>{t('traveler.pickupPinSet')}</Text>
                  <Text style={styles.adjustPickupBody}>
                    {t('traveler.pinTapToMove', { place: prettyPlace(ride.departure.name) })}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.adjustPickupTitle}>{t('traveler.setExactPickup')}</Text>
                  <Text style={styles.adjustPickupBody}>
                    {t('traveler.dragPinToStanding', {
                      name: ride.matchedOp?.name || t('traveler.yourOperatorFallback'),
                    })}
                  </Text>
                </>
              )}
            </View>
          </View>
        </Pressable>
      )}

      {/* The demo's operator card: avatar · name · vehicle · plate | rating · VERIFIED. */}
      {/* An assigned offer is not yet an accepted Operator. Only show identifying
          arrival details once the Operator has accepted through the verified server. */}
      {ride.matchedOp && st >= 1 && !complete && (
        <Card style={styles.opCard}>
          <View style={styles.opAvatar}>
            <Text style={styles.opAvatarText}>
              {(ride.matchedOp.name || 'Operator')
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.opName}>{ride.matchedOp.name}</Text>
            <Text style={styles.opMeta}>
              {ride.matchedOp.car} · {ride.matchedOp.plate}
            </Text>
          </View>
          {/* THE RATING IS GONE, DELIBERATELY. Name, vehicle and plate all come from the
              operator dispatch actually matched — the rating did not. It read DRIVER.rating,
              the demo operator's 4.98, and printed it beside whoever turned up. No operator
              record carries a rating: reviews are written onto the travel, never aggregated
              to a person. So this stated a specific number about an identified individual
              that was not that individual's, next to the word Verified. Restore it when
              operators carry a real one — never before. "Verified" stays because it is
              something we can substantiate: their documents are checked. */}
          <View style={{ alignItems: 'flex-end' }}>
            <SectionLabel style={styles.opVerified}>{t('operator.verified')}</SectionLabel>
          </View>
        </Card>
      )}

      {/* The demo's step bars: four bare 3px segments, labels underneath — no card. */}
      <View style={styles.stepBars}>
        {steps.map((label, i) => (
          <View
            key={label}
            style={[
              styles.stepBar,
              { backgroundColor: i <= stepIdx ? colors.blue : colors.border },
            ]}
          />
        ))}
      </View>
      <View style={styles.stepLabels}>
        {steps.map((label, i) => (
          <Text
            key={label}
            style={{
              fontSize: 11,
              color: i === stepIdx ? colors.ink : colors.faint,
              fontWeight: i === stepIdx ? '600' : '400',
            }}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* ROUTE MONITORING. Never furniture — this block is absent on an ordinary journey and
          appears only when the platform has something to say about this one.

          THE ORDER MATTERS MORE THAN THE WORDING. A car stopped for six minutes is usually a
          car at a light, so the platform explains it when it can (other American Rider
          vehicles in the same half-mile are stopped in the same road) and asks the OPERATOR
          before it ever asks the traveler. By the time this question reaches a traveler, the
          operator has already been asked and has not answered. Asking someone whether they
          are safe is not a thing to do lightly, and an app that does it at every red light
          will be ignored at the one that matters. */}
      {ride.travelMonitor?.state === 'congestion' && (
        <Card style={styles.monitorCard}>
          <SectionLabel>{t('traveler.route')}</SectionLabel>
          <Text style={styles.monitorNote}>{ride.travelMonitor.note}</Text>
        </Card>
      )}

      {(ride.travelMonitor?.state === 'asked_traveler' ||
        ride.travelMonitor?.state === 'escalated') &&
        !!ride.travelMonitor.travelerQuestion && (
          <Card style={styles.monitorCard}>
            <SectionLabel>{t('traveler.checkIn')}</SectionLabel>
            <Text style={styles.monitorNote}>{ride.travelMonitor.travelerQuestion}</Text>
            {ride.travelMonitor.travelerReply === 'ok' ? (
              <Text style={styles.monitorAnswered}>{t('traveler.answeredAllWell')}</Text>
            ) : ride.travelMonitor.travelerReply === 'help' ? (
              <Text style={styles.monitorAnswered}>
                {t('traveler.teamHasTravel', {
                  case: ride.travelMonitor.caseNo
                    ? t('traveler.underCaseNo', { no: ride.travelMonitor.caseNo })
                    : '',
                })}
              </Text>
            ) : (
              <View style={styles.monitorBtns}>
                <Pressable
                  style={styles.monitorOk}
                  onPress={() => ride.respondToCheckIn('ok')}
                  hitSlop={6}
                >
                  <Text style={styles.monitorOkText}>{t('traveler.everythingAlright')}</Text>
                </Pressable>
                <Pressable onPress={() => ride.respondToCheckIn('help')} hitSlop={6}>
                  <Text style={styles.monitorHelp}>{t('traveler.iNeedHelp')}</Text>
                </Pressable>
              </View>
            )}
          </Card>
        )}

      {/* The demo's Safe Travels card: shield · promise · chevron, one tap to safety. */}
      <Pressable onPress={() => router.navigate('/safety')}>
        <View style={styles.safetyCard}>
          <Shield />
          <View style={{ flex: 1 }}>
            <Text style={styles.safetyTitle}>{t('traveler.safeTravels')}</Text>
            <Text style={styles.safetySub}>{t('traveler.safetyRow')}</Text>
          </View>
          <Chev />
        </View>
      </Pressable>

      <Card style={styles.tripNoCard}>
        <Text style={styles.tripNoLabel}>{t('traveler.travelNumber')}</Text>
        <Mono size={13}>{ride.lastTrip.no}</Mono>
      </Card>

      {/* Booking for another adult stays intentionally lightweight: name at booking, then one
          native share action once a real Travel exists. The guest needs no American Rider
          account and receives no authority over the Booker's payment or account. The shared
          bearer link is the same short-lived, Travel-scoped capability used by Safe Travels. */}
      {ride.travelParty.mode === 'other_adult' && ride.matchedOp?.rideId && (
        <Pressable onPress={shareBookedTravel} accessibilityRole="button">
          <Card style={styles.guestShareCard}>
            <Text style={styles.guestShareTitle}>{t('traveler.shareTravelBtn')}</Text>
            <Text style={styles.guestShareChev}>›</Text>
          </Card>
        </Pressable>
      )}

      {ride.payment.status !== 'idle' && (
        <Card style={styles.payCard}>
          {/* NO TICK ON A STATEMENT OF FACT, and this codebase has now had that argument
              three times — see the "Ticket ✓" note in smartride.tsx for the first two.
              "$19.44 charged" is complete. The ✓ adds nothing except reassurance, which is
              what an app does when it expects to be doubted; on a money line it is the worst
              place to do it. State the amount and stop. */}
          <Text style={styles.tripNoLabel}>{t('traveler.payment')}</Text>
          {ride.payment.status === 'processing' ? (
            <Text style={styles.payProcessing}>{t('traveler.processing')}</Text>
          ) : ride.payment.status === 'paid' ? (
            <Num size={13} color={colors.green}>
              {ride.payment.amountCents != null
                ? `${fmt(ride.payment.amountCents / 100)} charged`
                : 'Charged'}
            </Num>
          ) : (
            <Text style={styles.payFailed}>{ride.payment.error || t('traveler.ridePaymentIncomplete')}</Text>
          )}
        </Card>
      )}

      {cancelAsk && canCancel ? (
        <View style={styles.cancelCard}>
          <Text style={styles.cancelTitle}>{t('traveler.cancelThisTravel')}</Text>
          {/* WHAT THIS SAID, AND WHY IT COULD NOT STAND. "Free to cancel" was untrue of the
              money: the fare is charged at confirmation, and cancelling refunded nothing. The
              other branch offered a "$3 fee — it goes to them, not us" that was never charged
              and never paid, promised to the operator in the Terms as well. Both are now one
              sentence that matches what the server actually does. The $3 returns when the
              operator app reports arrival and the money can follow it. */}
          {/* Status-aware, because the answer genuinely differs. Before the operator arrives
              the fare comes back whole. Once they are at the kerb they have driven there and
              spent the journey waiting, and $3 of the fare goes to them — which the server can
              now substantiate, because the operator reported arriving. */}
          <Text style={styles.cancelNote}>
            {ride.payment.status !== 'paid'
              ? t('traveler.rideNotCharged')
              : st >= 2
                ? t('traveler.rideFareReturnedLessArrival', {
                    name: ride.matchedOp?.name ?? t('traveler.yourOperatorFallback'),
                  })
                : t('traveler.rideFareReturned')}
          </Text>
          <View style={styles.cancelBtns}>
            <Pressable onPress={() => setCancelAsk(false)} style={styles.keepBtn}>
              <Text style={styles.keepBtnText}>{t('traveler.keepTravel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={cancelBusy}
              onPress={async () => {
                if (cancelBusy) return;
                setCancelBusy(true);
                setCancelFailed(false);
                try {
                  if (await ride.cancelRide()) router.dismissTo('/');
                  else setCancelFailed(true);
                } catch {
                  setCancelFailed(true);
                } finally {
                  setCancelBusy(false);
                }
              }}
              style={styles.yesCancelBtn}
            >
              <Text style={styles.yesCancelText}>{cancelBusy ? t('traveler.familyWorking') : t('traveler.yesCancel')}</Text>
            </Pressable>
          </View>
          {cancelFailed ? (
                <View>
                  <Text style={styles.cancelNote}>{t('traveler.cancelFailed')}</Text>
                  <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={styles.retryLink}>{t('traveler.returnHome')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: '/issues', params: { from: 'status' } })} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={styles.retryLink}>{t('traveler.contactSupport')}</Text>
                  </Pressable>
                </View>
              ) : null}
        </View>
      ) : complete ? (
        <PrimaryButton
          label={t('traveler.travelComplete')}
          onPress={() => router.navigate('/complete')}
          style={{ marginTop: 'auto' }}
        />
      ) : (
        <View style={{ marginTop: 'auto' }}>
          <View style={styles.actionRow}>
            <PrimaryButton
              label={t('traveler.communicate')}
              onPress={() => router.navigate('/message')}
              style={{ flex: 1 }}
            />
            <OutlineButton
              label={t('traveler.patronSupport')}
              onPress={() => {
                ride.openHelp();
                router.navigate({ pathname: '/issues', params: { from: 'status' } });
              }}
              style={{ flex: 1 }}
            />
          </View>
          {ride.matchedOp?.rideId && voice.available && voice.activeId === ride.matchedOp.rideId && (
            <OutlineButton
              label={t('common.voiceCallOperator')}
              onPress={() => { void voice.start(ride.matchedOp!.rideId!); }}
              style={{ marginTop: 12 }}
            />
          )}
          {canCancel && (
            <Pressable onPress={() => setCancelAsk(true)} hitSlop={10}>
              <Text style={styles.cancelLink}>{t('traveler.cancelTravel')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ---- searching (the demo's radar screen) ----
  radarWrap: { width: 92, height: 92 },
  searchTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.44,
    color: colors.ink,
    marginTop: 28,
    textAlign: 'center',
  },
  searchSub: {
    fontSize: 14.5,
    color: colors.muted,
    marginTop: 9,
    lineHeight: 21.75,
    textAlign: 'center',
  },
  retryLink: { fontSize: 14, fontWeight: '600', color: colors.ink, marginTop: 10 },
  searchCancel: {
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontWeight: '500',
    color: colors.muted,
    fontSize: 15,
  },
  // ---- enroute ----
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusTitle: { fontSize: 21, fontWeight: '600', letterSpacing: -0.46, color: colors.ink },
  statusSub: { fontSize: 14.5, color: colors.muted, marginTop: 9, lineHeight: 21.75 },
  etaWrap: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 12 },
  etaLabel: { fontSize: 9.5, letterSpacing: 1.425 },
  venueCard: {
    marginTop: 14,
    backgroundColor: colors.blueTint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  venueTitle: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 3 },
  venueBody: { fontSize: 14, color: colors.ink2, lineHeight: 20 },
  adjustPickupCard: {
    marginTop: 14,
    backgroundColor: colors.blueTint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  adjustPickupTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  adjustPickupBody: { fontSize: 12.5, color: colors.ink2, marginTop: 2, lineHeight: 18 },
  opCard: {
    marginTop: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  opAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opAvatarText: { color: '#fff', fontSize: 16.5, fontWeight: '600' },
  opName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  opMeta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  opRating: { fontSize: 15, fontWeight: '600', color: colors.ink },
  opVerified: { fontSize: 9, letterSpacing: 1.35, marginTop: 2 },
  stepBars: { flexDirection: 'row', gap: 6, marginTop: 18 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  monitorCard: { marginTop: 18 },
  monitorNote: { fontSize: 14.5, color: colors.ink, marginTop: 8, lineHeight: 20 },
  monitorAnswered: { fontSize: 13.5, color: colors.ink2, marginTop: 10, lineHeight: 19 },
  monitorBtns: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  monitorOk: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  monitorOkText: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  // INK (Chad, 19 Sept 2026). "I need help" reaches a person; the control that reaches
  // emergency services is Call 911 on the safety screen, and that one stays red.
  monitorHelp: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  safetyCard: {
    marginTop: 16,
    backgroundColor: colors.blueTint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  safetyTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  safetySub: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  tripNoCard: {
    marginTop: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripNoLabel: { fontSize: 13.5, color: colors.ink2 },
  guestShareCard: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guestShareTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  guestShareChev: { fontSize: 18, color: colors.muted },
  payCard: {
    marginTop: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  payProcessing: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  payFailed: {
    fontSize: 13,
    color: colors.red,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  cancelCard: {
    marginTop: 'auto',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  cancelTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  cancelNote: { fontSize: 13.5, color: colors.muted, marginTop: 6, lineHeight: 20 },
  cancelBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  keepBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: 13,
    padding: 14,
    alignItems: 'center',
  },
  keepBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  yesCancelBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 13,
    padding: 14,
    alignItems: 'center',
  },
  // INK (Chad, 19 Sept 2026). Red is reserved for Call 911 and the final confirmation of
  // account termination. Cancelling a travel is reversible by booking another.
  yesCancelText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelLink: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
    paddingTop: 14,
    paddingHorizontal: 10,
  },
});
