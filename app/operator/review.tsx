// Under Review — the web demo shell's screen: the shield, where the answer appears, and the
// traveler escape hatch.
//
// THE DECISION IS THE SERVER'S. This screen had a Continue button that commissioned the
// operator on the spot, in phone storage ("Test program — review is simulated and clears at
// once"). The server now qualifies an operator automatically when every check passes, and a
// person on /ops decides only what the checks cannot settle. This screen reads that answer:
// on arrival, every thirty seconds while it is open, and when the operator asks.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import Svg, { Path } from 'react-native-svg';
import { PrimaryButton, Screen } from '../../src/components/UI';
import { qualificationStatus } from '../../src/backend/connect';
import { useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorReview() {
  const { t } = useLanguage();
  const router = useRouter();
  const op = useOperator();

  // A COMMISSIONED OPERATOR MUST NOT BE TOLD THEY ARE UNDER REVIEW. `qualify` has this guard
  // and this screen did not, so arriving here afterwards — a deep link, the back stack, a
  // reload — showed "Your qualification is complete. Most operators are commissioned within a
  // few hours" to somebody already commissioned and carrying travel.
  //
  // ON ARRIVAL ONLY, never on every change: Continue below sets verification to
  // 'commissioned' and then routes to /operator/commissioned. A guard watching the value
  // would overtake that and swallow the one screen that tells them they passed.
  const settled = useRef(false);
  useEffect(() => {
    if (!op.ready || settled.current) return;
    settled.current = true;
    if (op.verification === 'commissioned') router.replace('/operator');
  }, [op.ready, op.verification, router]);

  const [refused, setRefused] = useState<string | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const approvedOnce = useRef(false);
  const { commission, resetQualification } = op;
  const check = useCallback(async () => {
    setBusy(true);
    const s = await qualificationStatus();
    setBusy(false);
    setStatusUnavailable(s.status === 'unknown');
    if (s.status === 'qualified' && !approvedOnce.current) {
      approvedOnce.current = true;
      commission();
      router.replace('/operator/commissioned');
    } else if (s.status === 'refused' || s.status === 'suspended') {
      setRefused(s.reason || '');
    } else if (s.status === 'incomplete') {
      // Something the operator must do — a document missing or expired, a screening to finish.
      // Nobody is reviewing that, so waiting here would be forever; the checklist shows it.
      resetQualification();
      router.replace('/operator/qualify');
    }
    // 'exception': a person is deciding one item. 'unknown': the server was not reached.
    // Either way this screen, which says the answer appears here, is the right place to wait.
  }, [commission, resetQualification, router]);

  // Do not poll external screening/Firebase/Stripe every 30 seconds forever.
  // The one-phone Operator sees fresh results when returning to the screen or
  // reopening the app; pending review gets a bounded two-minute foreground check.
  useFocusEffect(useCallback(() => {
    void check();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void check();
    }, 120_000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => { clearInterval(id); listener.remove(); };
  }, [check]));

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1 }} />
        <Svg width={56} height={56} viewBox="0 0 56 56" fill="none">
          <Path
            d="M28 6l18 7v11c0 12-8 20-18 26C18 44 10 36 10 24V13z"
            stroke={colors.ink}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.title}>
          {refused !== null ? t('traveler.reviewNotApproved') :
           statusUnavailable ? t('traveler.reviewCheckStatus') : t('traveler.underReview')}
        </Text>
        {refused !== null ? (
          <Text style={styles.sub}>{refused}</Text>
        ) : statusUnavailable ? (
          <Text accessibilityRole="alert" style={styles.sub}>{t('traveler.errReachARNoStop')}</Text>
        ) : (
          <Text style={styles.sub}>
            {/* WAS: "you will be notified the moment you are cleared." Nothing notifies
                anyone — the app registers for no push notifications. Say where the answer
                appears instead, which is somewhere they can actually go and look. */}
            {/* WAS: "Most operators are commissioned within a few hours". No production data
                supports a processing time, so none is promised. */}
            {t('traveler.reviewStatusHere')}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ alignSelf: 'stretch' }}>
          {refused !== null ? (
            <PrimaryButton
              label={t('traveler.reviewReturnToQualification')}
              onPress={() => {
                resetQualification();
                router.replace('/operator/qualify');
              }}
            />
          ) : (
            <PrimaryButton
              label={busy ? t('traveler.busyChecking') : t('traveler.reviewCheckStatus')}
              disabled={busy}
              onPress={check}
            />
          )}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} hitSlop={10} style={{ marginTop: 16 }}>
          <Text style={styles.link}>{t('traveler.travelWhileWaiting')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 18,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.52,
    color: colors.ink,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14.5,
    color: colors.muted,
    marginTop: 9,
    lineHeight: 21.75,
    textAlign: 'center',
  },
  link: { fontSize: 15, fontWeight: '500', color: colors.ink, textAlign: 'center' },
});
