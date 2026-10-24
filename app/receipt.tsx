// Travel Receipt — the web demo's receipt, exactly: Total Charged card, the
// operator-retained box, then Operator / Payment Method / Travel Number rows and the
// ghost "Report an Issue". Real extras kept: the fare-fix credit line when Patron
// Support issued one, and "Ride again" when reviewing an old trip.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import {
  Card,
  LetterheadBar,
  Mono,
  Num,
  OutlineButton,
  PrimaryButton,
  Screen,
  Sub,
  Title,
} from '../src/components/UI';
import { canonicalPlaceName, prettyPlace } from '../src/data';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, fmt } from '../src/theme';

export default function Receipt() {
  const { t } = useLanguage();
  const router = useRouter();
  const ride = useRide();
  const params = useLocalSearchParams<{ from?: string }>();

  const viewingOld = !!ride.viewTrip;
  const view = ride.viewTrip ?? ride.pastTrips[0];

  // THE VIEWED TRAVEL IS RELEASED WHEN THIS SCREEN UNMOUNTS, not when the back control is
  // pressed. goBack() used to clear viewTrip and then pop the route, so the receipt rendered
  // once more with nothing behind it; with the seeded journeys gone from pastTrips (9 Sept
  // 2026) that render had `view` undefined, `'creditCents' in view` threw a TypeError, and a
  // Release build died with it (SIGSEGV) — on the back control of every receipt opened from
  // the Travel Log or Recent Travel. Seen 15 Sept 2026 on ea5380f. The setter is a state
  // setter and stable, so this cleanup runs exactly once, after the pop has finished.
  const { setViewTrip } = ride;
  useEffect(() => () => setViewTrip(null), [setViewTrip]);

  if (!view) {
    // Nothing to show and nothing to throw on: a receipt with no travel behind it — the
    // moment after the live travel's record is released, or a deep link with no state — is
    // an empty frame with a way back, never a crash.
    return (
      <Screen>
        <LetterheadBar onBack={() => (router.canGoBack() ? router.back() : router.dismissTo('/'))} />
      </Screen>
    );
  }
  // A refund Patron Support actually issued, in cents — never a figure typed into a screen.
  const creditCents =
    ('creditCents' in view && (view as { creditCents?: number }).creditCents) ||
    (ride.credited?.no === view.no ? ride.credited.cents : 0) ||
    0;

  // Show the operator who actually took the trip: the name stored on an old trip, or the
  // live matched operator for the ride just finished. Fall back to the demo driver only for
  // the built-in seed trips (which predate real dispatch).
  // A receipt names who drove. Where the record does not say, it says so — it does not
  // print the demonstration operator's name onto somebody's record of a real journey.
  const driverFull =
    view.operator || (!viewingOld ? ride.matchedOp?.name : undefined) || t('traveler.notRecorded');

  const goBack = () => {
    if (viewingOld) router.back();
    else router.dismissTo('/');
  };

  // "Travel to <destination> again": a shortcut destination goes straight to the sheet with the
  // destination set; any other place — an address the traveler typed once — opens the sheet's
  // search with that name already entered, one tap from the same result. Old records that say
  // "Miami Airport" resolve to the place's current name first.
  const rideAgain = () => {
    const arr = canonicalPlaceName(view.arr);
    ride.startBooking();
    router.dismissTo('/');
    router.navigate({ pathname: '/reserve', params: { search: '1', q: arr } });
  };
  const returnRecord = ride.myRides.find((r) => r.tripNo === view.no && r.status === 'completed');
  const canReturn = !ride.rideActive && !(ride.smartJourney?.stage === 'leg1') &&
    !!returnRecord?.dep && !!returnRecord.arr &&
    Number.isFinite(returnRecord.pickupLat) && Number.isFinite(returnRecord.pickupLng) &&
    Number.isFinite(returnRecord.destinationLat) && Number.isFinite(returnRecord.destinationLng);

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title>{t('traveler.travelReceipt')}</Title>
      {/* The document's date. The route is stated as labelled rows below (Chad, 15 Sept 2026:
          "structural rigor"), not folded into a subtitle. */}
      <Sub>{view.date}</Sub>

      <Card style={styles.totalCard}>
        <Text style={styles.totalLabel}>{t('traveler.totalCharged')}</Text>
        <Num size={18} weight="600">
          {fmt(view.total)}
        </Num>
      </Card>

      {/* Government fees inside the total, named with their payee. Never our own fee. */}
      {!!view.feeLines?.length && (
        <Card style={styles.govFeeCard}>
          {view.feeLines.map((l, i) => (
            <View key={l.id ?? l.name} style={[styles.govFeeRow, i > 0 && styles.hair]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.govFeeName}>{l.name}</Text>
                <Text style={styles.govFeeSub}>{t('traveler.includedRemittedTo', { payee: l.payee })}</Text>
              </View>
              <Num size={14} weight="600">
                {fmt(l.cents / 100)}
              </Num>
            </View>
          ))}
        </Card>
      )}

      {creditCents > 0 && (
        <Card style={styles.creditCard}>
          <Text style={styles.creditLabel}>{t('traveler.adjustmentCorrected')}</Text>
          <Num size={14} color={colors.green}>
            −{fmt(creditCents / 100)}
          </Num>
        </Card>
      )}

      <Card style={styles.metaCard}>
        {/* The record, as labelled rows: where from, where to, who drove, what paid, the
            Travel Number, distance and time. A long place name wraps under its label. */}
        <View style={[styles.metaRow]}>
          <Text style={styles.metaLabel}>{t('traveler.departure')}</Text>
          <Text style={[styles.metaValue, styles.metaValueWide]}>{prettyPlace(view.dep)}</Text>
        </View>
        <View style={[styles.metaRow, styles.hair]}>
          <Text style={styles.metaLabel}>{t('traveler.destination')}</Text>
          <Text style={[styles.metaValue, styles.metaValueWide]}>{prettyPlace(view.arr)}</Text>
        </View>
        <View style={[styles.metaRow, styles.hair]}>
          <Text style={styles.metaLabel}>{t('traveler.operator')}</Text>
          {/* The rating was DRIVER.rating — the demo operator's — printed beside whoever
              actually drove. A receipt is a record; it may not state a number about a named
              person that is not theirs. */}
          <Text style={styles.metaValue}>{driverFull}</Text>
        </View>
        <View style={[styles.metaRow, styles.hair]}>
          <Text style={styles.metaLabel}>{t('traveler.paymentMethod')}</Text>
          {/* From the travel's own record (src/receipt.ts describePaidWith). Where a travel was
              settled before the server recorded what paid, it says so — it does not print the
              method the phone happens to have selected today onto a past receipt. */}
          <Text style={[styles.metaValue, styles.metaValueWide]}>{view.pay || t('traveler.notRecorded')}</Text>
        </View>
        <View style={[styles.metaRow, styles.hair]}>
          <Text style={styles.metaLabel}>{t('traveler.travelNumber')}</Text>
          <Mono size={12.5}>{view.no}</Mono>
        </View>
        {/* Fla. Stat. 627.748(6): the receipt lists the total time and distance of the ride.
            Where a record predates these fields it says so; it does not estimate. */}
        <View style={[styles.metaRow, styles.hair]}>
          <Text style={styles.metaLabel}>{t('traveler.distance')}</Text>
          <Text style={styles.metaValue}>
            {view.miles != null ? t('traveler.milesShort', { n: view.miles }) : t('traveler.notRecorded')}
          </Text>
        </View>
        <View style={[styles.metaRow, styles.hair]}>
          <Text style={styles.metaLabel}>{t('traveler.duration')}</Text>
          <Text style={styles.metaValue}>
            {view.minutes != null ? t('traveler.durMin', { n: view.minutes }) : t('traveler.notRecorded')}
          </Text>
        </View>
        {/* Only when the server sent one: the day a copy of this receipt was emailed. */}
        {view.emailed ? (
          <View style={[styles.metaRow, styles.hair]}>
            <Text style={styles.metaLabel}>{t('traveler.copyEmailed')}</Text>
            <Text style={[styles.metaValue, styles.metaValueWide]}>{view.emailed}</Text>
          </View>
        ) : null}
      </Card>

      {/* THE 99% STATEMENT IS A FOOTER LINE, NOT A PANEL. The demo's blueTint operatorBox sat
          between the total and the record; Chad (15 Sept 2026): a receipt is a transaction
          record, and the statement belongs quietly at its foot. Stated once, as the brief
          (§10A) has it. NOTHING FURTHER — Chad, 16 Aug: the traveler does not see the fee
          arithmetic; the operator's own revenue screen is where it is itemised. */}
      <Text style={styles.retainedNote}>{t('traveler.operatorRetainedNote')}</Text>

      <View style={styles.actions}>
        <OutlineButton label="Share receipt" onPress={() => {
          // User chooses the destination through the native share sheet.
          // No contact access, automatic bulk mail, or third-party receipt storage.
          const fields = [
            'AMERICAN RIDER', 'TRAVEL RECEIPT',
            view.date,
            'Travel Number: ' + view.no,
            'From: ' + view.dep,
            'To: ' + view.arr,
            'Duration: ' + (view.minutes != null ? view.minutes + ' minutes' : 'Not recorded'),
            'Distance: ' + (view.miles != null ? view.miles + ' miles' : 'Not recorded'),
            'Total charged: ' + fmt(view.total),
            'Questions: support@americanrider.tech',
          ];
          void Share.share({ message: fields.join('\n') }).catch(() => {});
        }} />
        {viewingOld && (
          <PrimaryButton label={t('traveler.rideToAgain', { place: prettyPlace(view.arr) })} onPress={rideAgain} />
        )}
        {canReturn && (
          <>
            <OutlineButton label={t('traveler.bookReturnTravel')} onPress={() => {
              if (ride.startReturnBooking(view.no)) {
                router.dismissTo('/');
                router.navigate('/reserve');
              }
            }} />
            <Text style={styles.returnNote}>{t('traveler.returnPickupCheck')}</Text>
          </>
        )}
        <OutlineButton
          label={t('traveler.contactPatronSupport')}
          onPress={() => {
            ride.openHelp(view.no);
            router.navigate({ pathname: '/issues', params: { from: 'receipt' } });
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  returnNote: { fontSize: 12.5, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  totalCard: {
    marginTop: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  creditCard: {
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditLabel: { fontSize: 14, color: colors.green },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Space below as well as above: on a full record the actions sit directly beneath this line.
  retainedNote: { fontSize: 13, color: colors.ink2, marginTop: 14, marginBottom: 20, lineHeight: 19 },
  metaValueWide: { flex: 1, textAlign: 'right', marginLeft: 16 },
  metaCard: { marginTop: 14, paddingVertical: 4, paddingHorizontal: 20 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  metaLabel: { fontSize: 14, color: colors.ink2 },
  metaValue: { fontSize: 14, color: colors.ink },
  actions: { marginTop: 'auto', gap: 11 },
  govFeeCard: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 18 },
  govFeeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  govFeeName: { fontSize: 13.5, color: colors.ink },
  govFeeSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

});
