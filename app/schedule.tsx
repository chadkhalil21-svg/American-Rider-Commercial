import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import Svg, { Path, Rect } from 'react-native-svg';
import { useGoBack } from '../src/components/nav';
import {
  Card,
  LetterheadBar,
  Num,
  PrimaryButton,
  Screen,
  SectionLabel,
  Sub,
  Title,
} from '../src/components/UI';
import { platformFee } from '../src/data';
import { publicPickupMarket } from '../src/backend/markets';
import { pickupDate, pickupMinutes, nextDate, resolvePickupWall, scheduleReadiness } from '../backend/scheduleclock';
import { SchedInfo, useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, fmt, radii } from '../src/theme';

const dayLabel = (d: Date, locale: string) =>
  d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const slotsFor = (p: 'AM' | 'PM') =>
  p === 'AM' ? ['5:30', '6:00', '6:30', '7:00'] : ['4:30', '5:30', '6:30', '7:30'];

const toMinutes = (time: string, period: 'AM' | 'PM') => {
  const [h, m] = time.split(':').map(Number);
  let hh = h % 12;
  if (period === 'PM') hh += 12;
  return hh * 60 + m;
};

const nowClockLabel = (minutes: number) => {
  let h = Math.floor(minutes/60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(minutes%60).padStart(2, '0')} ${ampm}`;
};

// The demo's Travel Scheduled splash: 58px green calendar-check, centered.
function CalendarCheck() {
  return (
    <Svg width={58} height={58} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4.5} width={18} height={16} rx={3} stroke={colors.green} strokeWidth={1.6} />
      <Path
        d="M3 9h18M8 2.5v4M16 2.5v4M9 14l2 2 4-4"
        stroke={colors.green}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function Schedule() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const [calOffset, setCalOffset] = useState(0); // months ahead of the current month
  // Once scheduled, the demo shows its Travel Scheduled splash before returning home.
  const [doneInfo, setDoneInfo] = useState<SchedInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pickupZone, setPickupZone] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // Clock-only refresh. No new database reads or network traffic; corrects time
  // validity across midnight and when a Traveler returns after locking the phone.
  const [clockMs, setClockMs] = useState(Date.now());
  useEffect(() => {
    const ticker = setInterval(() => {
      if (AppState.currentState === 'active') setClockMs(Date.now());
    }, 30_000);
    const onResume = AppState.addEventListener('change', (state) => {
      if (state === 'active') setClockMs(Date.now());
    });
    return () => { clearInterval(ticker); onResume.remove(); };
  }, []);
  const lat = ride.departure.lat;
  const lng = ride.departure.lng;
  useEffect(() => {
    let current = true;
    setPickupZone(null);
    setPickedDate(null);
    if (typeof lat !== 'number' || typeof lng !== 'number') return () => { current = false; };
    publicPickupMarket(lat,lng).then((market) => {
      if (current) setPickupZone(market.status==='active' ? market.timeZone || null : null);
    }).catch(() => { if (current) setPickupZone(null); });
    return () => { current = false; };
  },[lat,lng]);

  const now = new Date(clockMs);
  const marketToday = pickupZone ? pickupDate(now.getTime(),pickupZone) : null;
  const nowMin = pickupZone ? pickupMinutes(now.getTime(),pickupZone) : 24*60;

  // Calendar month being shown (current month + offset, handles year rollover).
  const calBase = new Date(Date.UTC(Number(marketToday?.slice(0,4) || 2026),
    Number(marketToday?.slice(5,7) || 1)-1 + calOffset, 1));
  const calTitle = calBase.toLocaleDateString(language, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const firstDow = calBase.getUTCDay();
  const daysInM = new Date(Date.UTC(calBase.getUTCFullYear(), calBase.getUTCMonth() + 1, 0)).getUTCDate();
  // "Pick a day" starts the day after tomorrow — Today/Tomorrow have their own buttons.
  const minPick = marketToday ? new Date(`${nextDate(marketToday,2)}T00:00:00Z`) : new Date(8640000000000000);

  const calCells = useMemo(() => {
    const cells: { label: string; day?: Date; selectable?: boolean }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ label: '' });
    for (let d = 1; d <= daysInM; d++) {
      const dt = new Date(Date.UTC(calBase.getUTCFullYear(), calBase.getUTCMonth(), d));
      cells.push({ label: String(d), day: dt, selectable: dt >= minPick });
    }
    return cells;
    // The pickup-zone date is included even when two different months share the same grid shape.
  }, [calOffset, daysInM, firstDow, marketToday]);

  const timeSlots = slotsFor(ride.schedPeriod);
  const isToday = ride.schedDate === 'today';
  const slotPassed = (t: string) => !!pickupZone && isToday && toMinutes(t, ride.schedPeriod) <= nowMin;
  const allSlotsPassed = timeSlots.every(slotPassed);

  // Custom time: quarter-hour slots are open; others suggest the nearest one.
  const rawT = ride.customTime.trim();
  let customState: 'none' | 'ok' | 'suggest' | 'bad' | 'past' = 'none';
  let customLabel = '';
  let suggestLabel = '';
  let suggestPeriod: 'AM' | 'PM' = ride.schedPeriod;
  if (rawT !== '') {
    const m = rawT.match(/^(\d{1,2})\s*[:.]?\s*(\d{2})?$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && (!m[2] || Number(m[2]) <= 59)) {
      const h = Number(m[1]);
      const mins = m[2] ? Number(m[2]) : 0;
      customLabel = `${h}:${String(mins).padStart(2, '0')}`;
      if (mins % 15 === 0) {
        const past = !!pickupZone && isToday && toMinutes(customLabel, ride.schedPeriod) <= nowMin;
        customState = past ? 'past' : 'ok';
      } else {
        customState = 'suggest';
        let near = Math.round(mins / 15) * 15;
        let nh = h;
        if (near === 60) {
          near = 0;
          nh = h + 1;
        }
        // 11:55 rounds to 12:00 in the NEXT period (noon/midnight boundary);
        // 12:55 rounds to 1:00 in the same period.
        if (nh === 12 && h === 11) suggestPeriod = ride.schedPeriod === 'AM' ? 'PM' : 'AM';
        if (nh > 12) nh = 1;
        suggestLabel = `${nh}:${String(near).padStart(2, '0')}`;
      }
    } else {
      customState = 'bad';
    }
  }

  const chosenTime = customState === 'ok' ? customLabel : ride.schedTime;

  const selectedPickupDate = marketToday
    ? ride.schedDate === 'today' ? marketToday
      : ride.schedDate === 'tomorrow' ? nextDate(marketToday) : pickedDate
    : null;
  const resolved = pickupZone && selectedPickupDate
    ? resolvePickupWall(selectedPickupDate, chosenTime, ride.schedPeriod, pickupZone)
    : {ok:false as const, code:'pickup_zone_required'};

  const whenLabels: Record<string, string> = {
    today: t('traveler.schedToday'),
    tomorrow: t('traveler.schedTomorrow'),
    pick: ride.schedDay,
  };
  const hasDestination = !!ride.arrival.short.trim();
  const hasQuote = hasDestination && ride.quotedFareCents != null && ride.quotedFareCents > 0 &&
    ride.quotedTotalCents != null && ride.quotedTotalCents > 0 &&
    ride.quotedForClass === ride.travelClass;
  // Missing destination or authoritative price must not masquerade as a past time.
  // No new pricing or market calls here; reuse the existing reservation context.
  const scheduleStatus = scheduleReadiness({
    hasDestination, hasQuote, pickupZone, pickupDate: selectedPickupDate,
    resolved, customState, nowMs: clockMs,
  });
  const schedInvalid = scheduleStatus !== 'ready';
  const pickupTimeDisplay = rawT && customState !== 'ok'
    ? t('traveler.schedTimeUnconfirmed') : `${chosenTime} ${ride.schedPeriod}`;
  const pickupZoneLabel = pickupZone
    ? new Intl.DateTimeFormat(language, { timeZone: pickupZone, timeZoneName: 'short' })
      .formatToParts(now).find((part) => part.type === 'timeZoneName')?.value || pickupZone
    : '';

  useEffect(() => {
    if (isToday && !allSlotsPassed && slotPassed(ride.schedTime)) {
      const firstOpen = timeSlots.find((t) => !slotPassed(t));
      if (firstOpen) ride.setSchedTime(firstOpen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, allSlotsPassed, ride.schedTime, ride.schedPeriod]);

  const dateOpts: { key: 'today' | 'tomorrow' | 'pick'; label: string }[] = [
    { key: 'today', label: t('traveler.schedToday') },
    { key: 'tomorrow', label: t('traveler.schedTomorrow') },
    { key: 'pick', label: t('traveler.schedPickDay') },
  ];

  // ---- The demo's Travel Scheduled splash. ----
  if (doneInfo) {
    return (
      <Screen>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center' }}>
          <CalendarCheck />
          <Text style={styles.splashTitle}>{t('traveler.travelScheduled')}</Text>
          {/* THIS SCREEN HAS NOW SAID THREE DIFFERENT THINGS, and only this one is true.
              First it said "We'll match you with an operator automatically and notify you
              before pickup" — neither happened, because no server read the reservation.
              Then it said to begin the travel by hand at the appointed time, which was
              honest about a feature that did not work. backend/scheduler.js now assigns an
              operator ahead of the hour and charges the card on file, so the promise is the
              original one and it is kept. The notification is still not built, so it is
              still not claimed: the traveler is told where the assignment will appear. */}
          <Text style={styles.splashSub}>
            {t('traveler.travelIsSetFor', { place: doneInfo.arr })}{' '}
            <Text style={{ fontWeight: '600', color: colors.ink }}>
              {doneInfo.when} · {doneInfo.time} {doneInfo.period}
            </Text>
            {t('traveler.schedBookingNotice')}
          </Text>
          {ride.schedSaved === false && (
            <Text style={styles.splashWarn}>
              {t('traveler.schedNotSaved')}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }} />
        <PrimaryButton label={t('common.done')} onPress={() => router.dismissTo('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title>{t('traveler.planAhead')}</Title>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate({
          pathname: '/reserve',
          params: hasDestination ? {} : { search: '1' },
        })}
        style={styles.journeyLink}
      >
        <Sub>{ride.departure.short} → {hasDestination
          ? ride.arrival.short : t('traveler.schedChooseDestination')} ›</Sub>
      </Pressable>

      <SectionLabel style={styles.sectionTitle}>{t('traveler.day')}</SectionLabel>
      <View style={styles.dayRow}>
        {dateOpts.map((o) => {
          const on = ride.schedDate === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => ride.setSchedDate(o.key)}
              style={({ pressed }) => [
                styles.dayBtn,
                {
                  backgroundColor: on ? colors.ink : colors.card,
                  borderColor: on ? colors.ink : colors.border,
                },
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: on ? '#fff' : colors.ink2 }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {ride.schedDate === 'pick' && (
        <Card style={styles.calCard}>
          <View style={styles.calHead}>
            <Pressable
              onPress={() => calOffset > 0 && setCalOffset(calOffset - 1)}
              style={styles.calNav}
              hitSlop={6}
            >
              <Text style={{ fontSize: 16, color: calOffset > 0 ? colors.ink : colors.disabled }}>
                ‹
              </Text>
            </Pressable>
            <Text style={styles.calTitle}>{calTitle}</Text>
            <Pressable
              onPress={() => calOffset < 2 && setCalOffset(calOffset + 1)}
              style={styles.calNav}
              hitSlop={6}
            >
              <Text style={{ fontSize: 16, color: calOffset < 2 ? colors.ink : colors.disabled }}>
                ›
              </Text>
            </Pressable>
          </View>
          <View style={styles.calGrid}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={styles.calDow}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {calCells.map((c, i) => {
              const on = c.day && pickedDate === c.day.toISOString().slice(0,10);
              return (
                <Pressable
                  key={i}
                  disabled={!c.selectable}
                  onPress={() => {
                    if (!c.day) return;
                    ride.setSchedDay(dayLabel(c.day,language));
                    setPickedDate(c.day.toISOString().slice(0,10));
                  }}
                  style={[styles.calCell, on && { backgroundColor: colors.ink }]}
                >
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: on ? '600' : '400',
                      color: on ? '#fff' : c.selectable ? colors.ink : colors.disabled,
                    }}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.calGoing}>{t('traveler.goingOn', { day: ride.schedDay })}</Text>
        </Card>
      )}

      <View style={styles.timeHead}>
        <SectionLabel>{t('traveler.pickupTime')}</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['AM', 'PM'] as const).map((p) => {
            const on = ride.schedPeriod === p;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  ride.setSchedPeriod(p);
                  if (!slotsFor(p).includes(ride.schedTime)) ride.setSchedTime('6:30');
                }}
                style={[
                  styles.periodBtn,
                  {
                    backgroundColor: on ? colors.ink : colors.card,
                    borderColor: on ? colors.ink : colors.border,
                  },
                ]}
                hitSlop={8}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : colors.ink2 }}>
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.timeGrid}>
        {timeSlots.map((t) => {
          const on = ride.schedTime === t && ride.customTime.trim() === '';
          const passed = slotPassed(t);
          return (
            <Pressable
              key={t}
              disabled={passed}
              onPress={() => {
                ride.setSchedTime(t);
                ride.setCustomTime('');
              }}
              style={({ pressed }) => [
                styles.timeBtn,
                {
                  backgroundColor: on ? colors.ink : colors.card,
                  borderColor: on ? colors.ink : colors.border,
                  opacity: passed ? 0.45 : 1,
                },
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
            >
              <Text style={{ fontSize: 14, color: on ? '#fff' : colors.ink2 }}>
                {t} {ride.schedPeriod}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.customCard}>
        <Text style={styles.customLabel}>{t('traveler.anotherTime')}</Text>
        <TextInput
          value={ride.customTime}
          onChangeText={ride.setCustomTime}
          placeholder={t('traveler.typeATimePh')}
          placeholderTextColor={colors.muted}
          style={styles.customInput}
        />
        {customState === 'ok' && (
          <Text style={styles.customOk}>
            {t('traveler.schedTimeChosen', { time: `${customLabel} ${ride.schedPeriod}` })}
          </Text>
        )}
        {customState === 'suggest' && (
          <View style={styles.suggestRow}>
            <Text style={styles.suggestText}>
              {t('traveler.schedClosestIs', { time: `${suggestLabel} ${suggestPeriod}` })}
            </Text>
            <Pressable
              onPress={() => {
                // Adopt the suggestion as a confirmed custom time so noon/midnight
                // boundary suggestions land in the right period.
                if (suggestPeriod !== ride.schedPeriod) ride.setSchedPeriod(suggestPeriod);
                ride.setCustomTime(suggestLabel);
              }}
              style={styles.useItBtn}
              hitSlop={6}
            >
              <Text style={styles.useItText}>{t('traveler.useIt')}</Text>
            </Pressable>
          </View>
        )}
        {customState === 'bad' && (
          <Text style={styles.customHint}>{t('traveler.enterATime')}</Text>
        )}
        {customState === 'past' && (
          <Text style={styles.customPast}>
            {t('traveler.schedAlreadyPassed', { time: nowClockLabel(nowMin) })}
          </Text>
        )}
      </Card>

      {scheduleStatus === 'time_past' && (
        <View style={styles.invalidBanner}>
          <Text style={styles.invalidText}>
            {t('traveler.schedTimePast', { time: nowClockLabel(nowMin) })}
          </Text>
        </View>
      )}
      {scheduleStatus === 'time_invalid' && (
        <Text style={styles.customPast}>{t('traveler.schedTimeInvalid')}</Text>
      )}
      {scheduleStatus === 'date_required' && (
        <Text style={styles.customPast}>{t('traveler.schedChooseDay')}</Text>
      )}
      <Text style={styles.summaryNote}>{pickupZone
        ? t('traveler.schedPickupZone', { zone: pickupZoneLabel })
        : t('traveler.schedZoneUnavailable')}</Text>

      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t('traveler.pickup')}</Text>
          <Text style={styles.summaryValue}>
            {whenLabels[ride.schedDate]} · {pickupTimeDisplay}
          </Text>
        </View>
        <View style={[styles.summaryRow, { marginTop: 10 }]}>
          <Text style={styles.summaryLabel}>{t('traveler.totalTravelCost')}</Text>
          <Num size={17} weight="600">
            {hasQuote ? fmt(ride.travelerTotal) : '—'}
          </Num>
        </View>
        {/* WAS: "Locked in when you book — it won't change, even if prices are up that
            morning. Your operator is set the night before." Two problems. The first half
            reassures against a doubt rather than stating the fact (the rubric: state the
            price, let it carry itself). The second half describes a matching job that does
            not exist — no operator is set the night before, or at any other point until the
            traveler begins the travel. */}
        {/* REMOVED, per the rubric. The comment above already diagnosed it and the line
            shipped anyway. NOTE FOR THE FOUNDERS: this screen invites the question — a
            traveler picking between 6:00 and 7:00 AM may reasonably wonder whether the hour
            changes the price. If you want that answered, it should be a stated term
            somewhere permanent, not a reassurance beside the amount. */}
      </Card>

      {(scheduleStatus === 'destination_required' || scheduleStatus === 'quote_required') && (
        <View style={styles.journeyGuidance}>
          <Text style={styles.journeyGuidanceText}>
            {t(scheduleStatus === 'destination_required'
              ? 'traveler.schedDestinationNeeded' : 'traveler.schedQuoteNeeded')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate({
              pathname: '/reserve',
              params: hasDestination ? {} : { search: '1' },
            })}
            style={styles.journeyGuidanceLink}
          >
            <Text style={styles.journeyGuidanceAction}>
              {t(scheduleStatus === 'destination_required'
                ? 'traveler.schedChooseDestination' : 'traveler.schedReviewFare')} ›
            </Text>
          </Pressable>
        </View>
      )}
      {saveError ? <Text style={styles.splashWarn}>{t('traveler.schedSaveReview')}</Text> : null}
      <PrimaryButton
        label={t('traveler.scheduleTravel')}
        disabled={schedInvalid || saving}
        onPress={async () => {
          if (scheduleStatus !== 'ready' || !resolved.ok || !pickupZone || !selectedPickupDate) return;
          const info: SchedInfo = {
            when: whenLabels[ride.schedDate],
            time: chosenTime,
            period: ride.schedPeriod,
            arr: ride.arrival.name, // the demo's splash names the destination in full
            cost: ride.travelerTotal, // the same price the traveler was shown — see travelerTotal
            atMs: resolved.atMs,
            pickupDate: selectedPickupDate,
            pickupTimeZone: pickupZone,
          };
          setSaving(true);
          setSaveError(false);
          const saved = await ride.scheduleRide(info);
          setSaving(false);
          if (saved) setDoneInfo(info);
          else setSaveError(true);
        }}
        style={{ marginTop: 'auto' }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  splashWarn: {
    fontSize: 13,
    color: colors.red,
    marginTop: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  splashTitle: {
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: -0.52,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  splashSub: {
    fontSize: 14.5,
    color: colors.muted,
    marginTop: 9,
    lineHeight: 21.75,
    textAlign: 'center',
  },
  journeyLink: { minHeight: 44, justifyContent: 'center' },
  journeyGuidance: { marginTop: 6, marginBottom: 14 },
  journeyGuidanceText: { fontSize: 14, color: colors.ink2, lineHeight: 21 },
  journeyGuidanceLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  journeyGuidanceAction: { fontSize: 14, color: colors.ink, fontWeight: '600', textDecorationLine: 'underline' },
  sectionTitle: { marginTop: 24, marginBottom: 11 },
  dayRow: { flexDirection: 'row', gap: 9 },
  // The demo's chip geometry: radius 11, 11px vertical padding.
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
  },
  calCard: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 16 },
  calHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  calNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    marginBottom: 4,
  },
  calCell: {
    width: `${100 / 7}%`,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  calGoing: { fontSize: 13, color: colors.muted, marginTop: 10, textAlign: 'center' },
  timeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  periodBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
  },
  timeGrid: { flexDirection: 'row', gap: 9 },
  timeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 11,
  },
  // 16/18 is the demo's own card padding; this was 14.
  customCard: { marginTop: 14, paddingVertical: 16, paddingHorizontal: 18 },
  customLabel: { fontSize: 13.5, color: colors.muted },
  customInput: { fontSize: 16, color: colors.ink, paddingTop: 8, paddingBottom: 2, padding: 0 },
  customOk: { fontSize: 13.5, color: colors.green, marginTop: 6, lineHeight: 19.5 },
  suggestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  // INK. This line offers the closest available time — it is neither a control nor a failure,
  // and red on a suggestion tells a traveler something has gone wrong when nothing has.
  suggestText: { flex: 1, fontSize: 13.5, color: colors.ink, lineHeight: 19.5 },
  useItBtn: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  useItText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  customHint: { fontSize: 13.5, color: colors.muted, marginTop: 6 },
  customPast: { fontSize: 13.5, color: colors.red, marginTop: 6 },
  // The demo has no red-tinted panel. Its whole red vocabulary is .btn.red — a white
  // card with a --red-b border and red lettering. This banner follows that.
  invalidBanner: {
    marginTop: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radii.card,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  invalidText: { fontSize: 13.5, color: colors.red, lineHeight: 20 },
  summaryCard: { marginTop: 16, paddingVertical: 18, paddingHorizontal: 20, marginBottom: 16 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  summaryLabel: { fontSize: 15, color: colors.muted },
  summaryValue: { fontSize: 15, fontWeight: '600', color: colors.ink },
  summaryNote: { fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 19.5 },
});
