// Operator home — the operator demo's visual language carried into the real operating loop:
// the quiet wallet card, in-service presence, and the Operation Request sheet with a 15-second
// visible response window. Requests are never scripted in production; the sheet opens only for
// a server-assigned Travel.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import Svg, { Path, Rect } from 'react-native-svg';
import { useNative } from '../../src/components/anim';
import { OperatorBar, OperatorDrawer, OperatorScreen } from '../../src/components/operator';
import { Avatar, Card, Num, OutlineButton, PrimaryButton, useNote } from '../../src/components/UI';
import { SimRequest, earnOf, useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors, fmt, radii } from '../../src/theme';
import { coordinationFee, platformFee } from '../../src/data';

// A REPRESENTATIVE TRAVEL, NOT AN AVERAGE WE HAVE NOT MEASURED. This is the real Brickell
// to Miami International fare the platform quotes today; calling it "typical" would be a
// claim about journeys nobody has taken yet.
const SAMPLE_FARE = 17.94;
const SAMPLE_KEEP = +(SAMPLE_FARE - coordinationFee(SAMPLE_FARE)).toFixed(2);

const RESPOND_SECONDS = 15;

function Halo({ delay }: { delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 2400, useNativeDriver: useNative }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay]);
  return (
    <Animated.View
      style={[
        styles.halo,
        {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.9] }) }],
        },
      ]}
    />
  );
}

function WalletCard({ todayOps, onPress }: { todayOps: number; onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <Pressable onPress={onPress}>
      <View style={styles.walletCard}>
        <View style={styles.walletLeft}>
          <View style={styles.walletIcon}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Rect x={3} y={6} width={18} height={13} rx={3} stroke="#fff" strokeWidth={1.7} />
              <Path d="M3 10h18M16 15h2" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
            </Svg>
          </View>
          <View>
            <Text style={styles.walletTitle}>{t('traveler.wallet')}</Text>
            <Text style={styles.walletSub}>{t('traveler.opsTodayRevenue', { n: todayOps })}</Text>
          </View>
        </View>
        <Text style={styles.chev}>›</Text>
      </View>
    </Pressable>
  );
}

export default function OperatorHome() {
  const router = useRouter();
  const op = useOperator();
  const { t } = useLanguage();
  const { note, showNote } = useNote();
  const [menuOpen, setMenuOpen] = useState(false);
  const [request, setRequest] = useState<SimRequest | null>(null);
  // The open request, readable from callbacks without making them depend on it.
  const requestRef = useRef<SimRequest | null>(null);
  requestRef.current = request;
  const acceptingRef = useRef(false);
  const [accepting, setAccepting] = useState(false);
  const decliningRef = useRef(false);
  const [declining, setDeclining] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESPOND_SECONDS);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbar = useRef(new Animated.Value(1)).current;

  // Show the fare-share math before asking a new Operator to buy coverage.
  // This is orientation, never a shortcut around server qualification.
  useEffect(() => {
    if (op.ready && op.verification !== 'commissioned') {
      router.replace(op.verification === 'pending' ? '/operator/review' : '/operator/economics' as never);
    }
  }, [op.ready, op.verification, router]);

  const clearTimers = useCallback(() => {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = null;
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
  }, []);

  // A timer lapse does not explicitly decline a Travel. It used to only clear the screen, which was
  // harmless while requests were invented and is not now: a real travel left on one phone that
  // said nothing keeps a traveler waiting for an operator who already walked away.
  const closeRequest = useCallback(() => {
    if (acceptingRef.current) return;
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
    cbar.stopAnimation();
    // The decline happens OUTSIDE the state updater. Calling it inside meant a side effect ran
    // in a function React may invoke during render, which updated the operator provider from
    // this component's render pass — "Cannot update a component while rendering a different
    // component". A setState updater must be pure.
    const open = requestRef.current;
    setRequest(null);
    // A COUNTDOWN RUNNING OUT IS NOT A REFUSAL. This called declineRequest, which wrote
    // `status: 'declined'` on the travel and put the operator on its exclusion list — so a
    // paid travel was stranded fifteen seconds after being dispatched, by a timer, and could
    // not be re-offered to the only operator in the market. See lapseRequest.
    if (open) op.lapseRequest(open);
  }, [cbar, op]);

  // Visual dismissal is not a transport transition. Only an explicit Decline or an
  // observed timeout may lapse the offer; successful acceptance is decided by the server.
  const dismissAccepted = useCallback(() => {
    clearTimers();
    cbar.stopAnimation();
    setRequest(null);
    setAcceptError(null);
  }, [clearTimers, cbar]);

  const openRequest = useCallback((r: SimRequest) => {
    setRequest(r);
    setCountdown(RESPOND_SECONDS);
    cbar.setValue(1);
    Animated.timing(cbar, {
      toValue: 0,
      duration: RESPOND_SECONDS * 1000,
      easing: (t) => t,
      useNativeDriver: false, // animating width
    }).start();
    tickTimer.current = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
  }, [cbar]);

  // Only an intentional tap declines the offer with the server. A timed-out offer
  // remains eligible for re-offering; a tap must never be treated as a silent timeout.
  const explicitlyDecline = useCallback(async () => {
    const offered = requestRef.current;
    if (!offered || acceptingRef.current || decliningRef.current) return;
    decliningRef.current = true;
    setDeclining(true);
    clearTimers();
    cbar.stopAnimation();
    try {
      if (await op.declineRequest(offered)) {
        dismissAccepted();
      } else {
        setAcceptError(t('traveler.couldNotSaveConn'));
        openRequest(offered);
      }
    } catch {
      setAcceptError(t('traveler.couldNotSaveConn'));
      openRequest(offered);
    } finally {
      decliningRef.current = false;
      setDeclining(false);
    }
  }, [cbar, clearTimers, dismissAccepted, openRequest, op, t]);

  // THE COUNTDOWN ONLY RUNS WHILE THE APP IS IN FRONT OF SOMEBODY.
  //
  // At zero the request declines itself. That is right for an operator looking at the screen
  // and catastrophic for one with the phone in their pocket: every travel dispatched to them
  // was refused fifteen seconds later, by a countdown nobody saw, and the traveler was handed
  // from operator to operator by phones that had never been looked at. It is the single defect
  // that made the operator loop unusable in the field.
  //
  // Backgrounding now PAUSES it, and the window restarts on return so an operator who opens
  // the notification gets the full fifteen seconds rather than the remainder. The server is
  // the other half: an unanswered travel is re-offered to the next operator after 45 seconds
  // — see sweepAssignments in backend/monitor.js — so nothing hangs on a phone either way.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (requestRef.current && !acceptingRef.current && !decliningRef.current) {
          setCountdown(RESPOND_SECONDS);
          // Restore both the numeral and the visual bar after returning from another app.
          // A frozen bar beside a fresh 15-second countdown is misleading.
          cbar.setValue(1);
          Animated.timing(cbar, {
            toValue: 0,
            duration: RESPOND_SECONDS * 1000,
            easing: (value) => value,
            useNativeDriver: false,
          }).start();
          if (!tickTimer.current) {
            tickTimer.current = setInterval(() => setCountdown((c) => c - 1), 1000);
          }
        }
        return;
      }
      if (tickTimer.current) clearInterval(tickTimer.current);
      tickTimer.current = null;
      cbar.stopAnimation();
    });
    return () => sub.remove();
  }, [cbar]);

  useEffect(() => {
    if (request && countdown <= 0 && !accepting && !declining && AppState.currentState === 'active') closeRequest();
  }, [countdown, request, accepting, declining, closeRequest]);

  // A REQUEST APPEARS BECAUSE ONE WAS DISPATCHED, not because a timer fired.
  //
  // This used to arm a scripted request 2.6 seconds after going available and again after
  // every decline, so an operator on duty was shown a steady supply of journeys that did not
  // exist. It now opens when — and only when — dispatch has actually assigned this operator a
  // travel. With nobody booking, the screen says "Matching you with nearby travelers", which
  // is the truth.
  useEffect(() => {
    if (op.online && !request && op.incoming && op.incoming.rideId !== op.op?.rideId) openRequest(op.incoming);
  }, [op.online, op.op, op.incoming, request, openRequest]);

  useFocusEffect(clearTimers);

  const earn = request ? earnOf(request.fare) : 0;

  if (!op.ready || op.verification !== 'commissioned') {
    return (
      <OperatorScreen nav="home" note={note}>
        <Text style={styles.sub}>{t('operator.checking')}</Text>
      </OperatorScreen>
    );
  }

  return (
    <OperatorScreen nav="home" note={note}>
      <OperatorBar onMenu={() => setMenuOpen(true)} initials={op.opInitials} />

      {!op.online ? (
        <>
          {/* IN SERVICE, NOT ON DUTY (Chad, 3 Sept 2026).
              "On duty" is shift language — it belongs to somebody with a rota, which is
              precisely what an independent contractor does not have. §627.748(9) makes an
              operator an employee the moment we prescribe hours, so the word that describes a
              SHIFT is the wrong word for us on more than style grounds.
              "In service" describes the vehicle's state instead, and it is a century of
              transportation vernacular — a bus board reads NOT IN SERVICE. Institutional
              without being stiff, and true.
              Note the deliberate singular/plural split that runs through the operator surface:
              entering service commences operationS — the business of the day. Accepting one
              travel commences an operatioN — that journey. */}
          <Text style={styles.display}>{t('operator.ready')}</Text>
          <Text style={styles.sub}>
            {t('operator.readySub')}
          </Text>
          {/* AHEAD OF THE LAPSE, NOT AFTER IT. An operator whose policy runs out tomorrow
              finds out tomorrow, on the kerb, when travel stops arriving. A month's notice
              costs nothing and is the difference between renewing and losing a day's work. */}
          {op.coverageDaysLeft != null && op.coverageDaysLeft >= 0 && op.coverageDaysLeft <= 30 && (
            <Pressable onPress={() => router.navigate('/operator/insurance')}>
              <Card style={styles.coverWarn}>
                <Text style={styles.coverWarnText}>
                  {op.coverageDaysLeft === 0
                    ? t('traveler.coverageExpiresToday')
                    : op.coverageDaysLeft === 1
                      ? t('traveler.coverageExpiresInOneDay')
                      : t('traveler.coverageExpiresInDays', { n: op.coverageDaysLeft })}
                </Text>
              </Card>
            </Pressable>
          )}
          {/* STANDING, NOT RAISED ON A TAP. An operator used to press Go Available, watch it
              refuse, and be told once — so anyone opening the app to a screen that simply
              would not start had to guess why. Each block names itself and opens the screen
              that clears it. */}
          {/* WHAT THE ARITHMETIC ACTUALLY IS, shown where an operator meets the barrier.
              An operator who has not yet bought commercial coverage is being asked to spend
              money before earning any, and the honest answer to "why would I" is the fare
              split itself. So it is stated — the figures, not a claim about them. No
              comparison to another platform: we do not have their books, and a number we
              cannot source is worth less than the one we can.

              Shown only while a block stands. Once an operator is working, their real
              revenue screen is the truthful version of this and this would be furniture. */}
          {op.dutyBlocks.length > 0 && (
            <Card style={styles.retainCard}>
              <Text style={styles.retainLabel}>{t('operator.whatYouRetain')}</Text>
              <View style={styles.retainRow}>
                <Text style={styles.retainBody}>
                  {t('traveler.onATravel', { amount: fmt(SAMPLE_FARE + platformFee(SAMPLE_FARE)) })}
                </Text>
                <Num size={14.5} weight="600">{fmt(SAMPLE_KEEP)}</Num>
              </View>
              <Text style={styles.retainNote}>
                {t('traveler.retainNote', {
                  fare: fmt(SAMPLE_FARE),
                  comm: fmt(coordinationFee(SAMPLE_FARE)),
                  fee: fmt(platformFee(SAMPLE_FARE)),
                })}
              </Text>
            </Card>
          )}
          {op.dutyBlocks.map((b) => (
            <Pressable
              key={b.title}
              onPress={() => b.route && router.navigate(b.route as never)}
            >
              <Card style={styles.blockCard}>
                <Text style={styles.blockTitle}>{b.title}</Text>
                <Text style={styles.blockBody}>{b.detail}</Text>
              </Card>
            </Pressable>
          ))}
          <WalletCard todayOps={op.todayOps} onPress={() => router.navigate('/operator/revenue')} />
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/operator/market-research')} style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 14 }}>{t('operator.fareResearchLink')} ›</Text>
          </Pressable>
          <View style={{ marginTop: 'auto' }}>
            {/* Going available can be refused — Stripe has not cleared payouts, or this
                device will not give a position to be matched against. The switch used to
                flip back with no explanation, which reads as a broken button rather than
                as a condition the operator can act on. */}
            {/* A refusal an operator can act on. The insurance disclosure is the one gate
                that is cleared by reading one screen, so the refusal points straight at it
                rather than leaving somebody to hunt through a menu for the thing standing
                between them and working. */}
            {op.onlineError && <Text style={styles.dutyError}>{op.onlineError}</Text>}
            {op.onlineErrorCode === 'disclosure_required' && (
              <Pressable onPress={() => router.navigate('/operator/disclosure')} hitSlop={8}>
                <Text style={styles.dutyErrorLink}>{t('traveler.readDisclosure')} ›</Text>
              </Pressable>
            )}
            <PrimaryButton
              // COMMENCE OPERATIONS, PLURAL, AND THE PLURAL IS THE POINT (Chad, 4 Sept 2026).
              // This control opens the operator for business generally — it does not begin any
              // one journey. "Operations" is the whole undertaking; the singular belongs to a
              // single travel, which is why the request sheet accepts a travel rather than
              // commencing anything. The state this produces is In Service.
              label={op.onlineBusy ? t('operator.commencing') : t('operator.commence')}
              color={colors.green}
              onPress={() => op.setOnline(true)}
              disabled={op.onlineBusy}
              style={{ marginTop: 24 }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.availWrap}>
            <Halo delay={0} />
            <Halo delay={1200} />
            <View style={styles.core}>
              <Text style={styles.coreText}>{op.opInitials}</Text>
            </View>
          </View>
          <Text style={styles.availTitle}>{t('operator.inService')}</Text>
          {/* "Matching you with nearby travelers" is only true when we can actually see the
              travels assigned to this operator. If the inbox cannot be read, say so — an
              operator sitting on a reassuring sentence while work is dispatched elsewhere is
              the worst outcome this screen has. */}
          <Text style={[styles.sub, { textAlign: 'center', marginTop: 8 }]}>
            {op.inboxError ? op.inboxError : t('operator.matching')}
          </Text>
          {/* SAY IT RATHER THAN LET THEM FIND OUT BY EARNING NOTHING. Without background
              location this device holds presence only while the app is in front of somebody:
              lock the phone and iOS suspends the timer, and five minutes later dispatch
              correctly stops offering travel. An operator who does not know that puts the
              phone in their pocket and waits all evening for work that was never coming,
              with no way to tell that from a quiet night. */}
          {!op.backgroundPresence && (
            <Card style={styles.presenceWarn}>
              <Text style={styles.presenceWarnText}>{t('operator.foregroundOnly')}</Text>
            </Card>
          )}
          <WalletCard todayOps={op.todayOps} onPress={() => router.navigate('/operator/revenue')} />
          <View style={{ marginTop: 'auto' }}>
            <OutlineButton
              // The bookend to Commence Operations, and deliberately not "Stop" or "Go
              // Offline": an operator concludes their own operations, nobody switches them off.
              label={t('operator.conclude')}
              onPress={() => op.setOnline(false)}
              style={{ marginTop: 24 }}
            />
          </View>
        </>
      )}

      {/* The demo's Operation Request sheet: scrim, countdown bar, 15s window. */}
      <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => {
        // Android Back cannot silently refuse or locally hide an assigned, paid Travel.
      }}>
        {request && (
          <View style={styles.requestRoot}>
            <View style={styles.requestCard}>
              <View style={styles.cbar}>
                <Animated.View
                  style={[
                    styles.cbarFill,
                    {
                      width: cbar.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
              <Text style={styles.cbarText}>{t('operator.respondWithin', { seconds: Math.max(countdown, 0) })}</Text>
              <Text style={styles.requestTitle}>{t('operator.request')}</Text>
              <View style={styles.travelerRow}>
                <Avatar initials={request.tInit} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  {/* A traveler who has not set a name is identified by their Travel Number,
                      which is what the operator will actually check on arrival. No rating:
                      nothing in the product records one, and the star that used to sit here
                      was a fixed number from a script. */}
                  <Text style={styles.travelerName}>
                    {request.traveler || 'Traveler'}
                  </Text>
                  {request.teen ? (
                    <Text style={styles.travelerRating}>{t('operator.guardianTeenTravel')}{request.guardianName ? ` · ${request.guardianName}` : ''}</Text>
                  ) : request.bookedForAnother ? (
                    <Text style={styles.travelerRating}>{t('operator.bookedByAnother')}</Text>
                  ) : null}
                  {request.tRating != null && (
                    <Text style={styles.travelerRating}>★ {request.tRating}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.estLabel}>{t('operator.estimatedRevenue')}</Text>
                  <Num size={24} weight="600" color={colors.green} style={{ marginTop: 3 }}>
                    {fmt(earn)}
                  </Num>
                </View>
              </View>
              <View style={styles.routeCard}>
                <View style={styles.routeRow}>
                  <View style={styles.dot} />
                  <View>
                    {/* "3 min away" was scripted. A dispatched travel carries no operator ETA,
                        and telling somebody how far a pickup is when nobody measured it is
                        the same defect as a fare nobody charged. */}
                    <Text style={styles.routeMeta}>
                      {request.pickupMin != null ? t('traveler.opPickupMinAway', { n: request.pickupMin }) : t('traveler.pickup')}
                    </Text>
                    <Text style={styles.routePlace}>{request.pickup}</Text>
                  </View>
                </View>
                <View style={[styles.routeRow, styles.hair]}>
                  <View style={styles.dot} />
                  <View>
                    <Text style={styles.routeMeta}>
                      {request.tripMin != null && request.dist != null
                        ? t('traveler.opDestinationMeta', { min: request.tripMin, mi: request.dist })
                        : t('traveler.destination')}
                    </Text>
                    <Text style={styles.routePlace}>{request.dest}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.requestButtons}>
                <OutlineButton
                  label={t('operator.decline')}
                  textColor={colors.red}
                  borderColor={colors.redBorder}
                  onPress={() => { if (!acceptingRef.current && !decliningRef.current) void explicitlyDecline(); }}
                  style={{ flex: 1, opacity: accepting || declining ? 0.5 : 1 }}
                />
                <PrimaryButton
                  // ACCEPT TRAVELER, not Accept Travel (Chad, 4 Sept 2026, overruling me).
                  //
                  // I argued for "Travel" on consistency: it is the platform's noun for a
                  // journey, so the operator would accept the same object the traveler
                  // reserved. He is right and the consistency argument was the weaker one.
                  // What the operator is actually agreeing to is a PERSON — to meet a
                  // stranger, let them into their car and be responsible for them. Naming the
                  // cargo instead of the passenger is how a transport company starts thinking
                  // of people as freight, and the whole model here is the opposite of that.
                  //
                  // The refusal stays "Decline", unqualified, for the same reason inverted:
                  // an operator declines the REQUEST, and "Decline Traveler" would put a
                  // person's name on a rejection.
                  label={t('operator.acceptTraveler')}
                  color={colors.green}
                  onPress={async () => {
                    if (acceptingRef.current || decliningRef.current) return;
                    acceptingRef.current = true;
                    setAccepting(true);
                    setAcceptError(null);
                    clearTimers();
                    cbar.stopAnimation();
                    try {
                      if (await op.acceptRequest(request)) {
                        dismissAccepted();
                        router.navigate('/operator/pickup');
                      } else {
                        setAcceptError(t('traveler.couldNotSaveConn'));
                        openRequest(request);
                      }
                    } catch {
                      setAcceptError(t('traveler.couldNotSaveConn'));
                      openRequest(request);
                    } finally {
                      acceptingRef.current = false;
                      setAccepting(false);
                    }
                  }}
                  disabled={accepting || declining}
                  style={{ flex: 1.6 }}
                />
              </View>
              {acceptError && <Text accessibilityRole="alert" style={styles.dutyError}>{acceptError}</Text>}
            </View>
          </View>
        )}
      </Modal>

      <OperatorDrawer open={menuOpen} onClose={() => setMenuOpen(false)} onNote={showNote} />
    </OperatorScreen>
  );
}

const styles = StyleSheet.create({
  dutyErrorLink: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.blue,
    textAlign: 'center',
    marginTop: 10,
  },
  dutyError: { fontSize: 13, color: colors.red, lineHeight: 19 },
  presenceWarn: { marginTop: 14, backgroundColor: colors.blueTint, borderColor: colors.blueBorder },
  presenceWarnText: { fontSize: 13, color: colors.ink, lineHeight: 19 },

  blockCard: { marginTop: 14, paddingVertical: 16, paddingHorizontal: 20 },
  retainCard: { marginTop: 18, backgroundColor: colors.blueTint, borderColor: colors.blueBorder },
  retainLabel: {
    fontSize: 10.5,
    letterSpacing: 1.1,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 10,
  },
  retainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  retainBody: { fontSize: 14.5, color: colors.ink },
  retainNote: { fontSize: 12.5, color: colors.muted, marginTop: 8, lineHeight: 18 },

  blockTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  blockBody: { fontSize: 13.5, color: colors.muted, marginTop: 6, lineHeight: 20 },
  coverWarn: { marginTop: 14, paddingVertical: 15, paddingHorizontal: 18 },
  coverWarnText: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },
  display: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.64,
    lineHeight: 36.5,
    color: colors.ink,
  },
  sub: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 21 },
  availWrap: { marginTop: 20, height: 140, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
  },
  core: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreText: { fontSize: 20, fontWeight: '600', color: '#fff' },
  availTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  walletCard: {
    marginTop: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 13, flex: 1 },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletTitle: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  walletSub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  chev: { fontSize: 19, color: colors.faint },
  requestRoot: {
    flex: 1,
    backgroundColor: 'rgba(20,23,31,0.4)',
    justifyContent: 'flex-end',
    padding: 24,
    paddingBottom: 40,
  },
  requestCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: 22,
  },
  cbar: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  cbarFill: { height: '100%', backgroundColor: colors.ink },
  cbarText: {
    fontSize: 12,
    color: colors.ink2,
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.24,
  },
  requestTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, marginTop: 14 },
  travelerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  travelerName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  travelerRating: { fontSize: 13, color: colors.muted, marginTop: 2 },
  estLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, color: colors.ink2 },
  routeCard: {
    marginTop: 16,
    backgroundColor: colors.blueTint, // the demo's neutral --fill
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    paddingVertical: 2,
    paddingHorizontal: 18,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.ink },
  routeMeta: { fontSize: 12, color: colors.ink2 },
  routePlace: { fontSize: 15, color: colors.ink, marginTop: 2 },
  requestButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
