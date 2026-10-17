// Communicate — the web demo's chat, exactly: letterhead bar, the 40px operator
// header, 15px-radius bubbles (ink for you, bordered white for the operator), and the
// radius-12 field beside the radius-12 Send. Messages flow through the real ride store.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGoBack } from '../src/components/nav';
import { useLanguage } from '../src/state/LanguageContext';
import { watchTravelThread, type TravelMessage } from '../src/backend/messages';
import { LetterheadBar, Mono } from '../src/components/UI';
import { useRide } from '../src/state/RideContext';
import { colors } from '../src/theme';

export default function Message() {
  const { t } = useLanguage();
  const goBack = useGoBack();
  const ride = useRide();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ trip?: string; lost?: string }>();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // WHICH TRAVEL THIS THREAD IS ABOUT. Without it the operator has to guess which journey a
  // message concerns — and a lost item report is worthless if they do. A thread opened from
  // the live ride simply passes no parameter and gets the travel in progress.
  // An absent route parameter is only a live Travel, never a seeded
  // demonstration/last-visited record. The server independently authorizes
  // membership before accepting a message.
  const tripNo = (typeof params.trip === 'string' ? params.trip.trim() : '') ||
    (ride.rideActive ? ride.lastTrip.no : '');
  const lostItemId = params.lost || null;
  const isCurrentTravel = tripNo === ride.lastTrip.no;

  // The operator on THIS travel: the matched one for the live ride, otherwise whoever the
  // ride record names. The demo driver backs the seeds.
  const opNamed = useMemo(() => {
    // NOT the demonstration operator. This named Miguel D. as the person on the other end
    // of a thread with a real, different operator — or with nobody at all.
    if (isCurrentTravel) return ride.matchedOp?.name || null;
    return ride.myRides.find((r) => r.tripNo === tripNo)?.operatorName || null;
  }, [isCurrentTravel, ride.matchedOp, ride.myRides, tripNo]);
  // The fallback was the English literal 'Your operator' on a Spanish phone.
  const opName = opNamed || t('traveler.yourOperatorFallback');


  // THE THREAD IS READ FROM WHERE IT IS WRITTEN. Until 17 Sept 2026 this screen showed only
  // the store's in-memory list: the traveler's own words from this session and the demo
  // ride's scripted replies. A thread reopened later was empty, and an operator's reply
  // would never have appeared here at all — the operator's screen watched Firestore, this
  // one did not. The live demo ride keeps its scripted thread; every real travel watches the
  // record, and a message the record has not taken yet stays on screen from the store.
  // A real active booking is NOT a demonstration. Its Operator's messages
  // must come from the persisted, authenticated Travel thread.
  const isLiveDemoRide = isCurrentTravel && ride.rideActive &&
    ride.matchedOp?.demo === true && !lostItemId &&
    !ride.myRides.some((record) => record.tripNo === tripNo && !!record.id);
  const [stored, setStored] = useState<TravelMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  useEffect(() => {
    if (isLiveDemoRide || !tripNo) return;
    setStored(null);
    return watchTravelThread(tripNo, 'traveler', setStored, setThreadError);
  }, [tripNo, isLiveDemoRide]);
  const local = tripNo ? ride.threadFor(tripNo) : [];
  const msgs = useMemo(() => {
    if (isLiveDemoRide || stored === null) return local;
    const fromRecord = stored.map((m) => ({ me: m.from === 'traveler', text: m.text }));
    const pending = local.filter((l) => l.me && !stored.some((m) => m.from === 'traveler' && m.text === l.text));
    return [...fromRecord, ...pending];
  }, [isLiveDemoRide, stored, local]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [msgs.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !tripNo) return;
    setSending(true);
    setSendError(null);
    const storedOk = await ride.sendMsgTo(tripNo, text, lostItemId);
    setSending(false);
    if (!storedOk) {
      setSendError(t('traveler.msgNotSent'));
      return;
    }
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <LetterheadBar onBack={goBack} />
        {/* No monogram disc: the header carries the operator's name and the travel, as the
            letterhead rule has it (never a filled initials circle; Chad, 17 Sept 2026). */}
        <View style={styles.driverRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{opNamed ? t('traveler.operatorNamed', { name: opNamed }) : opName}</Text>
            {/* Name the journey, always. It is what makes the thread useful to an operator
                who has driven eleven travels today. */}
            <Text style={styles.driverNote}>
              {t('traveler.travelSingular')}{' '}
              <Mono size={11.5} color={colors.muted}>
                {tripNo}
              </Mono>
              {lostItemId ? t('traveler.msgLostItemSuffix') : ''}
            </Text>
          </View>
        </View>

        {!tripNo ? (
          <Text style={styles.emptyThread}>{t('traveler.msgTravelUnavailable')}</Text>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, marginTop: 22 }}
          contentContainerStyle={{ gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {threadError && <Text style={styles.emptyThread}>{threadError}</Text>}
          {sendError && <Text style={styles.sendError}>{sendError}</Text>}
          {tripNo && msgs.length === 0 && !threadError && (
            <Text style={styles.emptyThread}>
              {lostItemId
                ? t('traveler.msgOpHasReport')
                : t('traveler.msgMessagesAppear', { name: opName })}
            </Text>
          )}
          {msgs.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.me ? styles.bubbleMe : styles.bubbleThem,
              ]}
            >
              <Text style={{ fontSize: 14.5, lineHeight: 21, color: m.me ? colors.solidFg : colors.ink }}>
                {m.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            placeholder={t('traveler.msgPlaceholder', { name: opName })}
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!!tripNo && !sending}
            returnKeyType="send"
          />
          <Pressable accessibilityRole="button"
            onPress={send}
            disabled={sending || !tripNo || !input.trim()}
            style={({ pressed }) => [styles.sendBtn, pressed && { backgroundColor: colors.ink2 }]}
          >
            <Text style={styles.sendText}>{t('traveler.send')}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  driverName: { fontSize: 18, fontWeight: '600', color: colors.ink },
  driverNote: { fontSize: 12, color: colors.muted, marginTop: 2 },
  emptyThread: { fontSize: 13.5, color: colors.muted, lineHeight: 20, paddingVertical: 8 },
  sendError: { fontSize: 12.5, color: colors.red, lineHeight: 18, paddingVertical: 4 },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 15,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: colors.ink },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  inputRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    fontSize: 16.5,
    color: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  // Ink, not blue: the one solid control on the screen, drawn as every primary control is
  // (Chad, 17 Sept 2026: "bright electric-blue Send button").
  sendBtn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.16, color: colors.solidFg },
});
