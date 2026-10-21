// Traveler's authenticated, bounded scheduled Travel list.
// No whole-history scan, fake appointments, or client-side cancellation writes.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import {
  Card, LetterheadBar, Num, PrimaryButton, Screen, SectionLabel, Title,
} from '../src/components/UI';
import {
  deleteScheduledRide, fetchScheduledRidesPage, fetchScheduledHistoryPage, scheduledHistoryMonth,
  type ScheduledRide, type ScheduledPage,
} from '../src/backend/scheduled';
import { useLanguage } from '../src/state/LanguageContext';
import { useRide } from '../src/state/RideContext';
import { scheduledDisplayTotal } from '../src/scheduledMoney';
import { colors, fmt } from '../src/theme';

function bookedDate(r: ScheduledRide, language: string): string {
  if (!Number.isFinite(r.atMs)) return '';
  try {
    return new Intl.DateTimeFormat(language, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      timeZone: r.pickupTimeZone || undefined,
    }).format(new Date(r.atMs));
  } catch {
    return '';
  }
}

export default function UpcomingTravel() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const ride = useRide();
  const [rides, setRides] = useState<ScheduledRide[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const pageRequest = useRef(0);
  const [cursor, setCursor] = useState<ScheduledPage['nextCursor']>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelErrorId, setCancelErrorId] = useState<string | null>(null);

  const load = useCallback(async (after: ScheduledPage['nextCursor'] = null) => {
    // A late request from another month or tab must not overwrite this view.
    const request = ++pageRequest.current;
    setLoading(true);
    setError(false);
    if (!after) { setRides([]); setCursor(null); setMore(false); }
    const page = showHistory
      ? await fetchScheduledHistoryPage(historyOffset, after)
      : await fetchScheduledRidesPage(after);
    if (request !== pageRequest.current) return;
    if (!page) {
      setError(true);
    } else {
      setRides(prev => after ? [...prev, ...page.rides] : page.rides);
      setCursor(page.nextCursor);
      setMore(page.hasMore);
    }
    setLoading(false);
  }, [showHistory, historyOffset]);

  useFocusEffect(useCallback(() => {
    void load(null);
  }, [load]));

  const cancel = async (id: string) => {
    if (cancellingId || !rides.some(r => r.id === id && (r.status ?? 'reserved') === 'reserved')) return;
    setCancellingId(id);
    setCancelErrorId(null);
    const confirmed = await deleteScheduledRide(id);
    if (confirmed) {
      // Server has committed the cancellation; reconcile the existing Home state
      // without waiting for a separate Firestore snapshot or another paid read.
      ride.dismissCancelledScheduled(id);
      setRides(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r));
      setCancelId(null);
    } else {
      // The server may already have assigned the booking. Never assume that
      // cancellation succeeded, nor delete the local record on failure.
      setCancelErrorId(id);
    }
    setCancellingId(null);
  };

  const monthStart = scheduledHistoryMonth(historyOffset).fromMs;
  const monthName = new Intl.DateTimeFormat(language, {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(monthStart));

  const statusLabel = (r: ScheduledRide) => {
    switch (r.status ?? 'reserved') {
      case 'reserved': return t('traveler.scheduledTravel');
      case 'dispatching': return t('traveler.rideFindingBest');
      case 'dispatched': return t('traveler.schedOperatorAssigned');
      case 'unmatched': return t('traveler.noOperatorAvailable');
      case 'payment_failed': return t('traveler.cardDeclined');
      case 'needs_attention': return t('traveler.chargedNotCreated');
      case 'cancelled': return t('traveler.schedCanceled');
      default: return t('traveler.schedNeedsReview');
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={() => router.back()} />
      <Title>{t('traveler.scheduledTravel')}</Title>
      <View style={styles.modeRow}>
        <Pressable accessibilityRole="button" accessibilityState={{selected:!showHistory}}
          onPress={() => { setShowHistory(false); setCancelId(null); }} style={styles.modeButton}>
          <Text style={showHistory ? styles.modeText : styles.activeModeText}>{t('traveler.schedUpcomingTab')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{selected:showHistory}}
          onPress={() => { setShowHistory(true); setCancelId(null); }} style={styles.modeButton}>
          <Text style={showHistory ? styles.activeModeText : styles.modeText}>{t('traveler.schedHistoryTab')}</Text>
        </Pressable>
      </View>
      {showHistory && <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => setHistoryOffset(n => Math.min(2400,n+1))}>
          <Text style={styles.link}>{t('traveler.schedHistoryPrevious')}</Text>
        </Pressable>
        <Text style={styles.monthName}>{monthName}</Text>
        <Pressable accessibilityRole="button" disabled={historyOffset===0} style={styles.action} onPress={() => setHistoryOffset(n => Math.max(0,n-1))}>
          <Text style={historyOffset===0?styles.disabledText:styles.link}>{t('traveler.schedHistoryNext')}</Text>
        </Pressable>
      </View>}
      {error && <Card><Text style={styles.help}>{t('traveler.schedListUnavailable')}</Text>
        <Pressable onPress={() => void load(null)} style={styles.action}>
          <Text style={styles.link}>{t('traveler.tryAgain')} ›</Text>
        </Pressable>
      </Card>}
      {!error && !loading && rides.length === 0 &&
        <Text style={styles.help}>{t(showHistory ? 'traveler.schedHistoryEmpty' : 'traveler.schedNoUpcoming')}</Text>}
      {rides.map((r) => {
        const status = r.status ?? 'reserved';
        const total = scheduledDisplayTotal(r);
        return (
          <Card key={r.id} style={styles.travelCard}>
            <SectionLabel>{statusLabel(r)}</SectionLabel>
            <Text style={styles.destination}>{r.dest || r.arr || t('traveler.schedDestination')}</Text>
            {!!r.dep && <Text style={styles.detail}>{t('traveler.schedPickupPlace')}: {r.dep}</Text>}
            <Text style={styles.detail}>{bookedDate(r, language)} · {r.time} {r.period}</Text>
            {!!r.travelClass && <Text style={styles.detail}>{t('traveler.vehicleClassLabel')}: {r.travelClass}</Text>}
            {total != null && total > 0 && <Num size={15} weight="600">{fmt(total)}</Num>}
            {!!r.tripNo && <Text style={styles.tripNo}>{r.tripNo}</Text>}
            {status === 'dispatched' && !!r.operatorName &&
              <Text style={styles.detail}>{r.operatorName}</Text>}
            {(status === 'unmatched' || status === 'needs_attention' || status === 'payment_failed') &&
              <Text style={styles.help}>{r.closedReason || statusLabel(r)}</Text>}

            {status === 'reserved' && cancelId !== r.id && (
              <Pressable accessibilityRole="button" style={styles.action}
                onPress={() => { setCancelId(r.id); setCancelErrorId(null); }}>
                <Text style={styles.link}>{t('traveler.cancel2')} ›</Text>
              </Pressable>
            )}
            {status === 'reserved' && cancelId === r.id && (
              <View style={styles.cancelReview}>
                <Text style={styles.bold}>{t('traveler.schedCancelConfirmTitle')}</Text>
                <Text style={styles.help}>{t('traveler.schedCancelConfirmBody')}</Text>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" style={styles.action}
                    disabled={cancellingId === r.id}
                    onPress={() => { setCancelId(null); setCancelErrorId(null); }}>
                    <Text style={styles.link}>{t('traveler.schedKeepTravel')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={styles.action}
                    disabled={cancellingId === r.id} onPress={() => void cancel(r.id)}>
                    <Text style={styles.destructive}>
                      {cancellingId === r.id ? t('traveler.familyWorking') :
                        t('traveler.schedCancelConfirmAction')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {cancelErrorId === r.id &&
              <Text style={styles.error}>{t('traveler.schedCancelConflict')}</Text>}
          </Card>
        );
      })}
      {!error && loading && <Text style={styles.help}>{t('traveler.familyWorking')}</Text>}
      {!error && !loading && more && !!cursor && (
        <PrimaryButton label={t(showHistory ? 'traveler.schedHistoryMore' : 'traveler.schedMoreUpcoming')}
          onPress={() => void load(cursor)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  modeRow: {flexDirection:'row',gap:16,marginTop:12,marginBottom:6},
  modeButton: {minHeight:44,justifyContent:'center',paddingHorizontal:5},
  modeText: {fontSize:14,fontWeight:'500',color:colors.ink2},
  activeModeText: {fontSize:14,fontWeight:'700',color:colors.ink},
  monthRow: {flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,flexWrap:'wrap',marginTop:8},
  monthName: {fontSize:13,fontWeight:'600',color:colors.ink},
  disabledText: {fontSize:13,color:colors.muted},
  travelCard: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 16 },
  destination: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 7 },
  detail: { fontSize: 13.5, color: colors.ink2, marginTop: 7, lineHeight: 20 },
  tripNo: { fontSize: 12, color: colors.ink2, marginTop: 8 },
  help: { fontSize: 13.5, color: colors.ink2, lineHeight: 20, marginTop: 9 },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 8 },
  link: { fontSize: 14, fontWeight: '600', color: colors.ink },
  destructive: { fontSize: 14, fontWeight: '600', color: colors.red },
  bold: { fontSize: 14, fontWeight: '600', color: colors.ink },
  cancelReview: { marginTop: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  error: { color: colors.red, fontSize: 13, lineHeight: 19, marginTop: 7 },
});
