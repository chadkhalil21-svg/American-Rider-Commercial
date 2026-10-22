// Getting Paid — the operator's Stripe Connect onboarding.
//
// WHY THIS SCREEN IS THE DIFFERENCE BETWEEN A PROMISE AND A PAYMENT. Every surface in this
// product says an operator keeps 99% of the fare. That happens through `transfer_data` on the
// traveler's charge, which needs a connected account id belonging to this operator. Nothing
// created one, so with real money the platform would have collected the whole fare and the
// operator would have received nothing automatically.
//
// Stripe hosts the identity check and the bank details. American Rider never sees an
// operator's SSN or account number, and this screen never asks for them — it opens Stripe and
// then reports what Stripe says, which is the only honest source for "can you be paid".
import { useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { BadgeOk, OperatorBar, OperatorDrawer, OperatorScreen } from '../../src/components/operator';
import { Card, PrimaryButton, SectionLabel, useNote } from '../../src/components/UI';
import { useGoBack } from '../../src/components/nav';
import { acceptConnectFees, readConnectStatus, openPayoutDashboard, startConnectOnboarding, type ConnectStatus } from '../../src/backend/connect';
import { useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorPayouts() {
  const { t } = useLanguage();
  const goBack = useGoBack();
  const op = useOperator();
  const [menuOpen, setMenuOpen] = useState(false);
  const { note, showNote } = useNote();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [feeBusy, setFeeBusy] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const refreshingRef = useRef<Promise<void> | null>(null);

  // Focus, deep link and app resume can all occur on the same return from
  // Stripe. Share one read, never repeatedly poll the provider or render a
  // failed lookup as a nonexistent payout account.
  const refresh = useCallback(async (requested = false) => {
    if (refreshingRef.current) return refreshingRef.current;
    const task = (async () => {
      setStatusChecking(true);
      const actual = await readConnectStatus();
      if (actual === null) {
        setStatus(null);
        setStatusUnavailable(true);
        setStatusNotice(null);
      } else {
        setStatus(actual);
        setStatusUnavailable(false);
        setStatusNotice(requested && !actual.payoutsEnabled
          ? t('operator.payoutStatusStillPending') : null);
      }
      setStatusChecking(false);
    })();
    refreshingRef.current = task;
    try { await task; } finally { refreshingRef.current = null; }
  }, [t]);

  // Stripe onboarding happens in a browser. There is no way to know from here whether they
  // finished, so the status is re-read when they come back rather than assumed.
  useEffect(() => {
    const sub = Linking.addEventListener('url', () => refresh());
    return () => sub.remove();
  }, [refresh]);

  // THE DEEP LINK IS NOT THE ONLY WAY BACK. The listener above only fires when Stripe returns
  // the operator through americanrider://, and an operator who finishes and simply taps the
  // back arrow arrives here with the status this screen read BEFORE they onboarded — still
  // offering "Set up payouts" as though nothing had happened. Re-reading on focus covers every
  // route back into the screen, including that one.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // NOR IS NAVIGATION FOCUS. Stripe onboarding runs in Safari, which is a DIFFERENT APP — this
  // screen never loses navigation focus while the operator is over there, so useFocusEffect
  // does not fire when they come back. Tapping the iOS "◀ American Rider" chip returns them to
  // a screen still offering "Set up payouts", having just set up payouts.
  //
  // Found 29 Aug 2026 doing exactly that: Stripe had the account cleared for payouts and this
  // screen was still asking for it. Coming back from another app is an AppState change and
  // nothing else, so that is what this listens to.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const begin = async () => {
    if (statusUnavailable || statusChecking || status === null) {
      setError(t('operator.payoutStatusUnavailable'));
      return;
    }
    if (status?.feeConsentAccepted !== true) {
      setError(t('operator.feeConsentRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    const r = await startConnectOnboarding();
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    Linking.openURL(r.url).catch(() => setError(t('traveler.onboardingPageFail')));
  };

  const showStripeDashboard = async () => {
    if (dashboardBusy) return;
    setDashboardBusy(true);
    setError(null);
    try {
      const result = await openPayoutDashboard();
      if (!result.ok || !result.url) {
        setError(result.error || t('traveler.errReachAR'));
        return;
      }
      await Linking.openURL(result.url);
    } catch {
      setError(t('traveler.onboardingPageFail'));
    } finally {
      setDashboardBusy(false);
    }
  };

  const payable = status?.payoutsEnabled === true;
  const started = status?.exists === true;

  return (
    <OperatorScreen nav="profile" note={note}>
      <OperatorBar onMenu={() => setMenuOpen(true)} initials={op.opInitials} />
      <Text style={styles.title}>{t('operator.gettingPaid')}</Text>
      <Text style={styles.sub}>
        {t('traveler.whereItLands')}
      </Text>

      <SectionLabel style={styles.lbl}>{t('operator.payoutAccount')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.accountTitle}>{t('operator.activeAccountCost')}</Text>
        <Text style={styles.accountBody}>{t('operator.activeAccountCostBody')}</Text>
        {status && !statusUnavailable && status.feeConsentAccepted !== true && (
          <PrimaryButton
            label={feeBusy ? t('traveler.familyWorking') : t('operator.feeConsentAccept')}
            disabled={feeBusy || statusChecking}
            style={{marginTop:16}}
            onPress={async()=>{
              setFeeBusy(true);
              setError(null);
              const ok=await acceptConnectFees();
              if(!ok)setError(t('operator.feeConsentRequired'));
              else await refresh();
              setFeeBusy(false);
            }}
          />
        )}
      </Card>
      <Card style={styles.card}>
        {statusUnavailable ? (
          <>
            <Text accessibilityRole="alert" style={styles.pending}>
              {t('operator.payoutStatusUnavailable')}
            </Text>
            <PrimaryButton
              label={statusChecking ? t('operator.checking') : t('traveler.tryAgain')}
              disabled={statusChecking}
              onPress={() => { void refresh(true); }}
              style={{ marginTop: 16 }}
            />
          </>
        ) : status === null ? (
          <Text style={styles.body}>{t('operator.checking')}</Text>
        ) : payable ? (
          <>
            <BadgeOk label={t('operator.readyForPayouts')} />
            <Text style={styles.body}>
              {t('traveler.payoutsAutoTransfer')}
            </Text>
            <Text style={styles.body}>{t('operator.payoutTruthBank')}</Text>
            <Text style={styles.body}>{t('operator.payoutTruthInstant')}</Text>
            <PrimaryButton
              label={dashboardBusy ? t('traveler.busyOpeningStripe') : t('operator.viewStripePayouts')}
              onPress={showStripeDashboard}
              disabled={dashboardBusy}
              style={{ marginTop: 16 }}
            />
          </>
        ) : started ? (
          <>
            <Text style={styles.pending}>{t('operator.notFinished')}</Text>
            <Text style={styles.body}>
              {t('traveler.stripeStillNeeds', {
                items:
                  status.due.length > 0
                    ? status.due.join(', ').replace(/_/g, ' ')
                    : t('traveler.stripeAFewDetails'),
              })}
            </Text>
          </>
        ) : (
          <Text style={styles.body}>
            {t('traveler.stripeChecksIdentity')}
          </Text>
        )}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {statusNotice && !statusUnavailable &&
          <Text accessibilityLiveRegion="polite" style={styles.body}>{statusNotice}</Text>}
        {!payable && !statusUnavailable && status !== null && (
          <PrimaryButton
            label={busy ? t('traveler.busyOpeningStripe') : started ? t('traveler.finishWithStripe') : t('traveler.setUpPayouts')}
            onPress={begin}
            disabled={busy || statusChecking}
            style={{ marginTop: 16 }}
          />
        )}
        {started && !payable && !statusUnavailable && (
          <Pressable accessibilityRole="button" disabled={statusChecking}
            onPress={() => { void refresh(true); }} hitSlop={10}>
            <Text style={styles.recheck}>{t('traveler.finishedCheckAgain')}</Text>
          </Pressable>
        )}
      </Card>

      <SectionLabel style={styles.lbl}>{t('operator.whatComesOut')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.body}>
          {t('traveler.nothingDeducted')}
        </Text>
      </Card>

      <Pressable accessibilityRole="button" onPress={goBack} hitSlop={10}>
        <Text style={styles.back}>{t('traveler.backLabel')}</Text>
      </Pressable>

      <OperatorDrawer open={menuOpen} onClose={() => setMenuOpen(false)} onNote={showNote} />
    </OperatorScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 27, fontWeight: '600', letterSpacing: -0.54, color: colors.ink, marginTop: 6 },
  sub: { fontSize: 14.5, color: colors.muted, marginTop: 9, lineHeight: 21.75 },
  lbl: { marginTop: 24, marginBottom: 12 },
  card: { paddingVertical: 18, paddingHorizontal: 20 },
  accountTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  accountBody: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 7 },
  body: { fontSize: 14, color: colors.ink2, lineHeight: 21, marginTop: 8 },
  pending: { fontSize: 15, fontWeight: '600', color: colors.red },
  error: { fontSize: 13.5, color: colors.red, marginTop: 12, lineHeight: 19 },
  recheck: { fontSize: 14, fontWeight: '500', color: colors.ink, textAlign: 'center', paddingTop: 14 },
  back: { fontSize: 15, fontWeight: '500', color: colors.muted, textAlign: 'center', paddingTop: 22 },
});
