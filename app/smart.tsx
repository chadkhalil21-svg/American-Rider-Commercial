// Smart Travel — the journey, as planned by the OpenTripPlanner instance for the Travel's configured service region.
// Route: /smart (Travel Options, Travel Complete and Home open it). /smartride is gone with the
// simulation it carried.
//
// WHAT THIS SCREEN IS NOW. Until 9 Sept 2026 it was a simulation: three fixed legs advanced
// on a 4.2-second timer under a random Travel Number, then a "Total Charged" amount nobody
// had charged and a tip nobody received (release review, P0). Chad's instruction the same
// day: build it real. So this is a plan and two real reservations. The transit leg is the
// traveler's own — they pay the agency at the station or on board. Each car leg is an
// ordinary American Rider travel: Travel Confirmation, dispatch, an operator, a Travel
// Number, a receipt. The journey uses coordinated pricing across its separately charged car Travels; the preview must equal those actual charges.
//
// THE RUBRIC. Every amount is labelled with what it is and who receives it. Nothing here
// says "you saved"; the comparison with direct travel is stated in either direction, as a
// fact. No control is named after anything other than what it does.
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  Card,
  LetterheadBar,
  Mono,
  Num,
  OutlineButton,
  PrimaryButton,
  Screen,
  SectionLabel,
  Sub,
  Title,
} from '../src/components/UI';
import { revalidateSmartTransit, type SmartLeg, type SmartPlan, type SmartRevalidation } from '../src/backend/smart';
import { useGoBack } from '../src/components/nav';
import { prettyPlace } from '../src/data';
import { carLegs, clockTime, legTitle, placeName, transitLegs } from '../src/smartLegs';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, fmt } from '../src/theme';
import { SMART_TRAVEL_NEW_BOOKINGS_ENABLED } from '../src/config';

// The demo's glyphs: 19px, white 1.7 stroke on a solid tile (railIcon(), carIcon()),
// with a walking figure and a bus drawn to the same rule for the legs the demo never had.
function RailGlyph() {
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

function CarGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v6H5zM5 17v2M19 17v2"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BusGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4} width={14} height={14} rx={2.5} stroke="#fff" strokeWidth={1.7} />
      <Path
        d="M5 12h14M8 21v-3M16 21v-3M8.5 15.5h.01M15.5 15.5h.01"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function WalkGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 4.5a1.5 1.5 0 1 0 0-.01M10 21l2.2-6.2M14.5 21l-2-4.5-1.3-3 1.6-3.8 2.2 2.3 2.5.8M9.2 11.5l1.4-2.8 2.3-.7"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LegIcon({ leg }: { leg: SmartLeg }) {
  const glyph =
    leg.kind === 'walk' ? <WalkGlyph /> : leg.kind === 'car' ? <CarGlyph /> : leg.mode === 'bus' ? <BusGlyph /> : <RailGlyph />;
  return <View style={[styles.legIcon, leg.kind === 'transit' && styles.legIconTransit]}>{glyph}</View>;
}

/** What a leg costs the traveler, as a string, or null when the leg has no amount (a walk). */
function legAmount(leg: SmartLeg, t: (k: string, v?: Record<string, string | number>) => string) {
  if (leg.kind === 'walk') return null;
  if (leg.kind === 'transit' && leg.fareUnknown) {
    return t('traveler.fareSetBy', { agency: leg.route?.agency ?? t('traveler.transit') });
  }
  return fmt(leg.cents / 100);
}

/** The line comparing the journey with direct travel — stated in whichever direction is true,
 *  and not at all when a transit fare we do not know would be missing from it. */
function comparison(plan: SmartPlan, t: (k: string, v?: Record<string, string | number>) => string) {
  if (plan.transitFareUnknown) return t('traveler.plusTransitFare');
  const diff = plan.directCents - plan.journeyCents;
  if (diff > 0) return t('traveler.lessThanDirect', { amount: fmt(diff / 100) });
  if (diff < 0) return t('traveler.moreThanDirect', { amount: fmt(-diff / 100) });
  return t('traveler.samePriceAsDirect');
}

export default function SmartTravel() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const journey = ride.smartJourney;
  const plan = journey?.plan ?? ride.smartPlan;
  const [revalidation, setRevalidation] = useState<SmartRevalidation | null>(null);
  const [checkingTransit, setCheckingTransit] = useState(false);

  const checkTransit = useCallback(async () => {
    if (!journey?.plan || checkingTransit) return;
    setCheckingTransit(true);
    try { setRevalidation(await revalidateSmartTransit(journey.plan, journey.destCoords)); }
    finally { setCheckingTransit(false); }
  }, [journey?.plan, journey?.destCoords, checkingTransit]);

  useEffect(() => {
    if (journey?.stage === 'leg1' && journey.leg1No && !ride.rideActive && !revalidation && !checkingTransit) void checkTransit();
  }, [journey?.stage, journey?.leg1No, ride.rideActive, revalidation, checkingTransit, checkTransit]);

  if ((!SMART_TRAVEL_NEW_BOOKINGS_ENABLED && !journey) || !plan) {
    return (
      <Screen>
        <LetterheadBar onBack={goBack} />
        <Title>{t('traveler.smartTravelTitle')}</Title>
        <Sub>
          {!SMART_TRAVEL_NEW_BOOKINGS_ENABLED || ride.smartStatus === 'unavailable'
            ? t('traveler.transitUnavailable')
            : t('traveler.noTransitRoute')}
        </Sub>
      </Screen>
    );
  }

  const cars = carLegs(plan);
  const transit = transitLegs(plan);
  const firstIsCar = plan.legs.findIndex((l) => l.kind === 'transit') > 0 && plan.legs[0].kind === 'car';
  const lastIsCar = plan.legs[plan.legs.length - 1]?.kind === 'car';
  const depart = clockTime(plan.departAt);
  const arrive = clockTime(plan.arriveAt);
  const origin = journey ? prettyPlace(journey.pickup.name) : prettyPlace(ride.departure.name);
  const destination = journey ? prettyPlace(journey.destination.name) : prettyPlace(ride.arrival.name);
  const afterFirstCar = !!journey?.leg1No && journey.stage === 'leg1' && !ride.rideActive;

  // Transit money belongs to the transit provider, regardless of market. The UI must not
  // encode a home agency: fare amount and agency identity come from the regional feed record.
  const transitUnknown = transit.some((l) => l.fareUnknown);
  const agencies = [...new Set(transit.map((l) => l.route?.agency).filter(Boolean))];
  const transitLabel = agencies.length === 1
    ? t('traveler.transitPaidToNamedAgency', { agency: agencies[0] as string })
    : t('traveler.transitPaidToAgency');
  // The server names the journey's ends "Pickup" and "Destination"; the traveler's own
  // names for them are on this screen already.
  const endName = (name: string) =>
    name === 'Pickup' ? origin : name === 'Destination' ? destination : placeName(name);

  const reserve = (which: 1 | 2) => {
    if (ride.beginSmartLeg(which)) router.navigate('/reserve');
  };

  // Which action the journey is at. A second car Travel cannot begin while the first is
  // still under way — the app carries one live Travel — so leg 2 waits for leg 1 to finish.
  let action: React.ReactNode;
  if (!journey) {
    if (cars.length === 0) {
      action = <Text style={styles.actionNote}>{t('traveler.noCarTravelNeeded')}</Text>;
    } else if (firstIsCar) {
      action = (
        <>
          <Text style={styles.actionNote}>
            {t('traveler.firstTravelTo', { from: origin, to: placeName(plan.from.name) })}
          </Text>
          <PrimaryButton label={t('traveler.reserveFirstTravel')} onPress={() => reserve(1)} />
        </>
      );
    } else if (lastIsCar) {
      action = (
        <>
          <Text style={styles.actionNote}>
            {t('traveler.lastTravelTo', { from: placeName(plan.to.name), to: destination })}
          </Text>
          <PrimaryButton label={t('traveler.reserveLastTravel')} onPress={() => reserve(2)} />
        </>
      );
    }
  } else if (journey.stage === 'leg1') {
    action = (
      <>
        {journey.leg1No && (
          <View style={styles.reservedRow}>
            <Text style={styles.actionNote}>{t('traveler.firstTravelReserved')}</Text>
            <Mono size={13}>{journey.leg1No}</Mono>
          </View>
        )}
        {ride.rideActive ? (
          <OutlineButton label={t('traveler.viewTravel')} onPress={() => router.navigate('/ride')} />
        ) : lastIsCar ? (
          <>
            {checkingTransit ? (
              <Text style={styles.actionNote}>{t('traveler.checkingTransit')}</Text>
            ) : revalidation?.status === 'ok' && !revalidation.changed ? (
              <>
                <Text style={styles.actionNote}>
                  {t('traveler.lastTravelTo', { from: placeName(plan.to.name), to: destination })}
                </Text>
                <PrimaryButton label={t('traveler.reserveLastTravel')} onPress={() => reserve(2)} />
              </>
            ) : (
              <>
                <Text style={styles.actionNote}>
                  {revalidation?.status === 'ok' && revalidation.changed
                    ? t('traveler.transitChanged')
                    : revalidation?.status === 'none'
                      ? t('traveler.transitNoLongerAvailable')
                      : t('traveler.transitVerificationUnavailable')}
                </Text>
                {revalidation?.status === 'ok' && revalidation.changed && revalidation.replacementPlan && (
                  <PrimaryButton
                    label={t('traveler.smartAdoptUpdated')}
                    onPress={() => {
                      if (ride.adoptSmartReplan(revalidation.replacementPlan!)) setRevalidation(null);
                    }}
                    style={{ marginBottom: 12 }}
                  />
                )}
                <PrimaryButton label={t('traveler.checkTransitAgain')} onPress={() => { setRevalidation(null); void checkTransit(); }} />
                <Text style={[styles.actionNote, { marginTop: 14 }]}>{t('traveler.smartDirectInsteadNote')}</Text>
                <OutlineButton
                  label={t('traveler.smartDirectInstead')}
                  onPress={() => { ride.endSmartJourney(); router.dismissTo('/'); }}
                />
              </>
            )}
          </>
        ) : (
          <PrimaryButton label={t('traveler.complete')} onPress={() => { ride.endSmartJourney(); router.dismissTo('/'); }} />
        )}
      </>
    );
  } else {
    action = (
      <>
        {journey.leg2No && (
          <View style={styles.reservedRow}>
            <Text style={styles.actionNote}>{t('traveler.lastTravelReserved')}</Text>
            <Mono size={13}>{journey.leg2No}</Mono>
          </View>
        )}
        {ride.rideActive ? (
          <OutlineButton label={t('traveler.viewTravel')} onPress={() => router.navigate('/ride')} />
        ) : (
          <PrimaryButton label={t('traveler.complete')} onPress={() => { ride.endSmartJourney(); router.dismissTo('/'); }} />
        )}
      </>
    );
  }

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <View style={styles.headRow}>
        <View style={styles.tile}>
          <RailGlyph />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ marginTop: 0 }}>{t('traveler.smartTravelTitle')}</Title>
          <Sub style={{ marginTop: 4 }}>
            {origin} → {destination}
          </Sub>
        </View>
      </View>
      {afterFirstCar ? (
        <Text style={styles.summary}>{t('traveler.smartAfterFirstFare')}</Text>
      ) : (
        <Text style={styles.summary}>{t('traveler.durMin', { n: plan.smartMin })} · {comparison(plan, t)}</Text>
      )}
      {!afterFirstCar && depart && arrive ? (
        <Text style={styles.times}>{t('traveler.departArrive', { depart, arrive })}</Text>
      ) : null}

      <SectionLabel style={{ marginTop: 22, marginBottom: 12 }}>{t('traveler.journey')}</SectionLabel>
      <Card style={styles.journeyCard}>
        {plan.legs.map((l, i) => {
          const amount = afterFirstCar && l.kind === 'car' ? null : legAmount(l, t);
          return (
            <View key={i} style={[styles.jRow, i > 0 && styles.jDivider]}>
              <LegIcon leg={l} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.jTitle}>{legTitle(l, t)}</Text>
                <Text style={styles.jSub}>
                  {endName(l.from.name)} → {endName(l.to.name)}
                  {l.kind === 'transit' && l.stops ? ` · ${t('traveler.stopsCount', { n: l.stops })}` : ''}
                </Text>
              </View>
              <View style={styles.jRight}>
                <Text style={styles.jMinutes}>{t('traveler.durMin', { n: l.minutes })}</Text>
                {amount ? <Num size={13} weight="600" style={{ marginTop: 3 }}>{amount}</Num> : null}
              </View>
            </View>
          );
        })}
      </Card>

      <SectionLabel style={{ marginTop: 22, marginBottom: 12 }}>{t('traveler.cost')}</SectionLabel>
      {afterFirstCar ? (
        <Card style={styles.costCard}><Text style={styles.costLabel}>{t('traveler.smartAfterFirstFare')}</Text></Card>
      ) : <Card style={styles.costCard}>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>
            {cars.length === 1 ? t('traveler.oneCarTravel') : t('traveler.nCarTravels', { n: cars.length })}
          </Text>
          <Num size={15} weight="600">{fmt(plan.smartCents / 100)}</Num>
        </View>
        <View style={[styles.costRow, styles.costDivider]}>
          <Text style={[styles.costLabel, { flex: 1, minWidth: 0 }]}>{transitLabel}</Text>
          {transitUnknown ? (
            <Text style={styles.costMuted}>—</Text>
          ) : (
            <Num size={15} weight="600">{fmt(plan.transitFareCents / 100)}</Num>
          )}
        </View>
        <View style={[styles.costRow, styles.costDivider]}>
          <Text style={styles.costTotalLabel}>{t('traveler.journey')}</Text>
          {transitUnknown ? (
            <Text style={styles.costMuted}>—</Text>
          ) : (
            <Num size={17} weight="600">{fmt(plan.journeyCents / 100)}</Num>
          )}
        </View>
        <View style={[styles.costRow, { marginTop: 10 }]}>
          <Text style={styles.costMuted}>{t('traveler.directTravel')}</Text>
          <Num size={13} style={{ color: colors.muted }}>{fmt(plan.directCents / 100)}</Num>
        </View>
      </Card>}
      <Text style={styles.note}>{t('traveler.transitFareNote')}</Text>
      {cars.length > 1 ? <Text style={styles.note}>{t('traveler.eachCarTravelOwnNumber')}</Text> : null}

      <View style={{ marginTop: 'auto', paddingTop: 24 }}>{action}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summary: { fontSize: 14.5, color: colors.ink, marginTop: 16, lineHeight: 21 },
  times: { fontSize: 13, color: colors.muted, marginTop: 4 },
  journeyCard: { paddingHorizontal: 20, paddingVertical: 4 },
  jRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  jDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  // The demo's leg tiles: 36px, radius 9, ink for the car, blue for the transit leg.
  legIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  legIconTransit: { backgroundColor: colors.blue },
  jTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  jSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  jRight: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 8 },
  jMinutes: { fontSize: 12.5, color: colors.muted },
  costCard: { paddingHorizontal: 20, paddingVertical: 6 },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  costDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  costLabel: { fontSize: 14, color: colors.ink2 },
  costTotalLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  costMuted: { fontSize: 13.5, color: colors.muted },
  note: { fontSize: 12.5, color: colors.muted, marginTop: 12, lineHeight: 18 },
  actionNote: { fontSize: 13, color: colors.ink2, marginBottom: 12, lineHeight: 19 },
  reservedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
