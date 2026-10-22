// Under Review — the web demo shell's screen: the shield, where the answer appears, and the
// traveler escape hatch.
//
// THE DECISION IS THE SERVER'S. This screen had a Continue button that commissioned the
// operator on the spot, in phone storage ("Test program — review is simulated and clears at
// once"). The server now qualifies an operator automatically when every check passes, and a
// person on /ops decides only what the checks cannot settle. This screen reads that answer:
// on arrival, only while foregrounded at a modest cadence, and when the operator asks.
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
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const approvedOnce = useRef(false);
  // Focus, resume and a scheduled refresh can coincide. Only one provider check
  // may be in flight; this prevents duplicate Firebase Auth + Stripe API calls.
  const checkingRef = useRef(false);
  const { commission, resetQualification } = op;
  // An explicit press must ALWAYS produce a visible result, even when the server
  // reports the same exception as before. Only the authenticated server can qualify.
  const check = useCallback(async (requested = false) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setBusy(true);
    let s: Awaited<ReturnType<typeof qualificationStatus>>;
    try { s = await qualificationStatus(); }
    catch { s = { status: 'unknown', reason: null }; }
    finally { checkingRef.current = false; setBusy(false); }
    setStatusUnavailable(s.status === 'unknown');
    setReviewReason(s.reason?.trim() || null);
    setRefreshNotice(null);
    if (s.status === 'qualified' && !approvedOnce.current) {
      approvedOnce.current = true;
      commission();
      router.replace('/operator/commissioned');
    } else if (s.status === 'refused' || s.status === 'suspended') {
      setRefused(s.reason || '');
    } else if (s.status === 'incomplete') {
      // An incomplete application needs another action, not another waiting screen.
      resetQualification();
      router.replace('/operator/qualify');
    } else if (s.status === 'exception') {
      // Do not fabricate an approval or a reviewer action. Give a specific blocker,
      // plus positive confirmation when the operator manually checks again.
      setRefused(null);
      if (requested) setRefreshNotice(t('traveler.reviewStillPending'));
    } else if (s.status === 'unknown') {
      if (requested) setRefreshNotice(t('traveler.reviewRefreshUnavailable'));
    }
  }, [commission, resetQualification, router, t]);

  // The review screen asks Firebase Auth and Stripe for live provider status.
  // Paid acceptance and duty gates independently check eligibility, so do not
  // re-call both vendors every two minutes while an account waits on approval.
  // Refresh on focus, resume and user request; at most one ten-minute check
  // while this screen stays active in the foreground.
  useFocusEffect(useCallback(() => {
    void check();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void check();
    }, 10 * 60_000);
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
        {refused === null && !statusUnavailable && reviewReason ? (
          <Text accessibilityRole="text" style={styles.detail}>{reviewReason}</Text>
        ) : null}
        {refreshNotice ? (
          <Text accessibilityLiveRegion="polite" style={styles.feedback}>{refreshNotice}</Text>
        ) : null}
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
              onPress={() => { void check(true); }}
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
  detail: {
    marginTop: 15,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.ink2,
    textAlign: 'center',
  },
  feedback: {
    marginTop: 13,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
  link: { fontSize: 15, fontWeight: '500', color: colors.ink, textAlign: 'center' },
});
