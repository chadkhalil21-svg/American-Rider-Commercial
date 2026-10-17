// Where an operator's money actually is.
//
// WHAT THIS SCREEN USED TO BE, AND WHY IT COULD NOT STAY. It offered "Standard Transfer · no
// fee · 1–3 business days" and "Instant Transfer · arrives in minutes · $0.50", took a choice,
// and reported "Transfer recorded". It was honest that nothing moved during the test program —
// but the mechanism it modelled does not exist at all, so the honesty had a shelf life. On the
// day real money switched on, an operator would have chosen a transfer method, been told the
// transfer was recorded, and had nothing whatsoever happen as a result.
//
// American Rider never holds an operator's money. Their 99% is transferred to their own Stripe
// account as each travel completes, and Stripe pays it out to their bank on its own schedule.
// Instant payouts exist there too, at Stripe's fee, taken by the operator — which is the
// arrangement Chad asked for, and it is already true without any payout machinery of ours.
//
// So this screen says where the money is and opens the place it lives.
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { openPayoutDashboard } from '../../src/backend/connect';
import { BackLink, Card, PrimaryButton, Screen, SectionLabel } from '../../src/components/UI';
import { useGoBack } from '../../src/components/nav';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorPayouts() {
  const { t } = useLanguage();
  const goBack = useGoBack();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    const r = await openPayoutDashboard();
    setBusy(false);
    if (!r.ok || !r.url) {
      setError(r.error ?? t('traveler.couldNotOpenPayout'));
      return;
    }
    Linking.openURL(r.url).catch(() => setError(t('traveler.deviceCouldNotOpen')));
  };

  return (
    <Screen>
      <BackLink label={t('common.back')} onPress={goBack} />
      <Text style={styles.title}>{t('operator.yourPayouts')}</Text>
      <Text style={styles.sub}>
        {t('operator.payoutTruthIntro')}
      </Text>

      <SectionLabel style={styles.lbl}>{t('operator.howItReachesYou')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.step}>{t('operator.payoutTruthTransfer')}</Text>
        <Text style={[styles.step, styles.hair]}>{t('operator.payoutTruthBank')}</Text>
        <Text style={[styles.step, styles.hair]}>{t('operator.payoutTruthInstant')}</Text>
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ marginTop: 'auto' }}>
        <PrimaryButton
          label={busy ? t('traveler.busyOpening') : t('traveler.openPayoutAccount')}
          onPress={open}
          disabled={busy}
          style={{ marginTop: 24 }}
        />
        <Text style={styles.foot}>
          {t('traveler.stripeHoldsDetails')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, fontWeight: '600', color: colors.ink, marginTop: 22, letterSpacing: -0.54 },
  sub: { fontSize: 15, color: colors.muted, marginTop: 8, lineHeight: 22 },
  lbl: { marginTop: 26, marginBottom: 12 },
  card: { paddingVertical: 4, paddingHorizontal: 20 },
  step: { fontSize: 14.5, color: colors.ink2, paddingVertical: 15, lineHeight: 21 },
  stepStrong: { fontWeight: '600', color: colors.ink },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  error: { fontSize: 13, color: colors.red, marginTop: 14, lineHeight: 19 },
  foot: { fontSize: 12.5, color: colors.muted, marginTop: 14, lineHeight: 18, textAlign: 'center' },
});
