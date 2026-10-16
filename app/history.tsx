// Travel Log — the traveler's completed travel, newest first: one card of rows, each opening
// that travel's receipt. Filters are real: Airport matches airport travel, This month the
// current calendar month. Under the filters, the count and the sum of what was charged for the
// travel in view, so the amounts in the column are named once and the log can answer "what did
// this month cost" without a statement nobody generates. The demo's Download Statement is
// deliberately absent — see the foot of the file.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { RideRecord } from '../src/backend/dispatch';
import { useGoBack } from '../src/components/nav';
import {
  Card,
  Chev,
  Chip,
  LetterheadBar,
  Num,
  Screen,
  Sub,
  Title,
  useNote,
} from '../src/components/UI';
import { classNameKey, prettyPlace, TRAVEL_CLASSES } from '../src/data';
import { travelDateTime } from '../src/dates';
import { describePaidWith, receiptFromRide } from '../src/receipt';
import { useAuth } from '../src/state/AuthContext';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, fmt } from '../src/theme';

/** The record holds the class as operators declare it ('Large Vehicle'); this finds the key
 *  so the row can print it in the traveler's language. Older records hold nothing. */
const classKeyForLabel = (label?: string) => TRAVEL_CLASSES.find((c) => c.label === label)?.key;

type Filter = 'all' | 'airport' | 'month';

export default function History() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const { user } = useAuth();
  const { note } = useNote();
  // Opened from Patron Support with ?pick=1: a row names the travel the case concerns and
  // returns, instead of opening its receipt.
  const params = useLocalSearchParams<{ pick?: string }>();
  const picking = params.pick === '1';

  // Make sure the real travels are loaded even if the user deep-links straight here.
  useEffect(() => {
    if (user) ride.refreshMyRides({ useCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // COMPLETED TRAVEL ONLY. The store holds every travel this account has booked; a live one
  // belongs on the travel screen and a cancelled one is not a travel that happened, and until
  // 15 Sept 2026 both were listed here under a count of "completed", amount and all.
  const completed = ride.myRides.filter((r) => r.status === 'completed');

  // The filters are real, not cosmetic: Airport matches airport travel, This month matches the
  // current calendar month.
  const [filter, setFilter] = useState<Filter>('all');
  const now = new Date();
  const trips = completed.filter((r) => {
    if (filter === 'airport') return /airport/i.test(r.arr) || /airport/i.test(r.dep);
    if (filter === 'month') {
      const d = new Date(r.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // What the travel in view cost, and how far it went. Distance is summed only when every
  // travel in view recorded it — a partial sum would be a smaller number presented as the whole.
  const chargedCents = trips.reduce((s, r) => s + r.totalCents, 0);
  const milesKnown = trips.length > 0 && trips.every((r) => typeof r.miles === 'number');
  const miles = milesKnown ? Math.round(trips.reduce((s, r) => s + (r.miles ?? 0), 0) * 10) / 10 : null;

  // Turn a real ride record into the receipt's expected shape and open it.
  // The shaping lives in src/receipt.ts so home's Recent Travel opens an identical one.
  const openReceipt = (r: RideRecord) => {
    ride.setViewTrip(receiptFromRide(r, language, t));
    router.navigate({ pathname: '/receipt', params: { from: 'history' } });
  };

  // The travel's own facts, each only where the record holds it: the class it was booked in,
  // who drove it, and what paid. Nothing is estimated and nothing is copied from today's
  // settings onto a past travel.
  const detailOf = (r: RideRecord) => {
    const key = classKeyForLabel(r.travelClass);
    return [
      key ? t(classNameKey(key)) : '',
      r.operatorName ? t('traveler.operatorNamed', { name: r.operatorName }) : '',
      describePaidWith(r.paidWith, t),
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const filters: ReadonlyArray<readonly [Filter, string]> = [
    ['all', t('traveler.filterAll')],
    ['airport', t('traveler.filterAirport')],
    ['month', t('traveler.filterThisMonth')],
  ];

  return (
    <Screen note={note}>
      <LetterheadBar onBack={goBack} />
      <Title>{t('traveler.travelLog')}</Title>
      {completed.length > 0 && (
        <Sub>{picking ? t('traveler.pickTravelForCase') : t('traveler.logSelectReceipt')}</Sub>
      )}

      <View style={styles.filterRow}>
        {filters.map(([key, label]) => (
          <Chip key={key} label={label} on={filter === key} onPress={() => setFilter(key)} />
        ))}
      </View>

      {trips.length > 0 && (
        <Text style={styles.summary} accessibilityRole="summary">
          {trips.length === 1 ? t('traveler.travelsOne') : t('traveler.travelsMany', { n: trips.length })}
          {miles != null ? ` · ${t('traveler.milesShort', { n: miles })}` : ''}
          {' · '}
          <Num size={13.5} color={colors.ink2}>
            {fmt(chargedCents / 100)}
          </Num>
          {' '}
          {t('traveler.chargedLabel')}
        </Text>
      )}

      <Card style={styles.listCard}>
        {trips.length === 0 ? (
          <Text style={styles.empty}>{t('traveler.completedTravelAppears')}</Text>
        ) : (
          trips.map((r, i) => {
            const dep = prettyPlace(r.dep);
            const arr = prettyPlace(r.arr);
            const route = `${dep} → ${arr}`;
            // A long route is set as two lines, the arrow closing the first, so a place name is
            // never broken across lines by the wrap ("… → Miami" / "International Airport").
            const twoLines = route.length > 30;
            const when = travelDateTime(r.createdAt, language);
            const detail = detailOf(r);
            const amount = fmt(r.totalCents / 100);
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  if (picking) {
                    ride.openHelp(r.tripNo);
                    router.back();
                  } else {
                    openReceipt(r);
                  }
                }}
                accessibilityRole="button"
                // Spoken as "Miami International Airport, from Brickell" — the arrow glyph would be
                // read out as a symbol, and "from" is already in every catalogue.
                accessibilityLabel={[
                  `${arr}, ${t('traveler.fromPlace', { place: dep })}`,
                  when,
                  detail,
                  amount,
                ]
                  .filter(Boolean)
                  .join('. ')}
              >
                <View style={[styles.row, i > 0 && styles.hair]}>
                  <View style={{ flex: 1 }}>
                    {twoLines ? (
                      <>
                        <Text style={styles.route}>{dep} →</Text>
                        <Text style={styles.route}>{arr}</Text>
                      </>
                    ) : (
                      <Text style={styles.route}>{route}</Text>
                    )}
                    {/* The date is a fact of the record and reads as one: the palette's emphatic
                        secondary tone, not the muted grey Chad read as "web-form" (15 Sept 2026).
                        The attributes beneath it stay muted — third in the hierarchy. */}
                    <Text style={styles.when}>{when}</Text>
                    {detail ? <Text style={styles.sub}>{detail}</Text> : null}
                  </View>
                  <View style={styles.right}>
                    <Num size={13.5}>{amount}</Num>
                    {/* In pick mode a row selects and returns; it opens nothing, so no chevron. */}
                    {!picking && <Chev />}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </Card>

      {ride.hasOlderMyRides && (
        <Pressable accessibilityRole="button" onPress={() => void ride.loadOlderMyRides()}
          disabled={ride.loadingOlderMyRides} style={styles.more}>
          <Text style={styles.moreText}>
            {ride.loadingOlderMyRides ? t('traveler.olderTravelLoading') : t('traveler.loadOlderTravel')}
          </Text>
        </Pressable>
      )}
      {ride.hasOlderMyRides && <Text style={styles.partial}>
        {t('traveler.travelTotalsShownOnly')}
      </Text>}

      {/* DOWNLOAD STATEMENT REMOVED 16 Aug 2026. It announced "A monthly statement PDF
          has been generated and saved" and then changed to "Statement generated ✓" — but
          nothing was generated and nothing was saved. It set a flag. This is worse than a
          placeholder: a placeholder admits a screen is missing, whereas this told the
          traveler a document existed and invited them to look for it. An institution is
          only authoritative because its statements are true.
          Restore it with a real PDF, never before. (Chad, 15 Sept 2026, asked for a period
          statement export again; the answer stands until the document is real.) */}
    </Screen>
  );
}

const styles = StyleSheet.create({
  more: { alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, marginBottom: 8 },
  moreText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  partial: { fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 18 },
  summary: { fontSize: 13.5, color: colors.ink2, marginTop: 16, lineHeight: 19 },
  listCard: { marginTop: 14, paddingVertical: 2, paddingHorizontal: 20, marginBottom: 16 },
  empty: { fontSize: 13.5, color: colors.muted, paddingVertical: 18, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  route: { fontSize: 15, color: colors.ink },
  when: { fontSize: 12.5, color: colors.ink2, marginTop: 3, lineHeight: 17 },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 17 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
