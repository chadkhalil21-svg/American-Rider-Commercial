// Operation Complete — the operator demo, exactly: the check, the revenue figure,
// the honest three-line ledger (fare → 1% commission → you retain), and the
// operation record card.
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import Svg, { Circle, Path } from 'react-native-svg';
import { Card, Mono, Num, PrimaryButton, Screen } from '../../src/components/UI';
import { useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors, fmt } from '../../src/theme';
import { completionBreakdown } from '../../src/operatorCompletionMoney';

export default function OperatorComplete() {
  const { t } = useLanguage();
  const router = useRouter();
  const op = useOperator();
  const rec = op.lastCompleted;

  useEffect(() => {
    if (!rec) router.replace('/operator');
  }, [rec, router]);
  if (!rec) return <Screen scroll={false}>{null}</Screen>;

  // Local estimate, not a confirmed Stripe transfer. Tolls are reimbursed IN ADDITION
  // to 99% of Fare; never count them as negative platform commission.
  const detail = completionBreakdown(rec.fare, rec.earn, rec.tollReimbursementCents);

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Svg width={56} height={56} viewBox="0 0 56 56" fill="none">
          <Circle cx={28} cy={28} r={20} stroke={colors.green} strokeWidth={2} />
          <Path
            d="M20 28l6 6 11-12"
            stroke={colors.green}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.title}>{t('operator.operationComplete')}</Text>
        <Text style={styles.sub}>
          {rec.dep} → {rec.arr}
        </Text>
        <Num size={44} weight="600" color={colors.green} style={{ marginTop: 18 }}>
          {fmt(rec.earn)}
        </Num>
        <Text style={styles.added}>{t('operator.completedEarningsEstimate')}</Text>
      </View>

      <Card style={styles.ledgerCard}>
        <View style={[styles.row, styles.hair]}>
          <Text style={styles.rowLabel}>{t('traveler.travelersFare')}</Text>
          <Num size={14.5}>{fmt(rec.fare)}</Num>
        </View>
        {detail.commissionCents !== null && (
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowLabel}>{t('traveler.platformCommission')}</Text>
            <Num size={14.5} color={colors.muted}>−{fmt(detail.commissionCents / 100)}</Num>
          </View>
        )}
        {detail.tollReimbursementCents != null && detail.tollReimbursementCents > 0 && (
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowLabel}>{t('operator.completionTollReimbursement')}</Text>
            <Num size={14.5}>{fmt(detail.tollReimbursementCents / 100)}</Num>
          </View>
        )}
        <View style={[styles.row, styles.hair]}>
          <Text style={styles.rowStrong}>{t('operator.youRetain')}</Text>
          <Num size={14.5} weight="600" color={colors.green}>
            {fmt(rec.earn)}
          </Num>
        </View>
      </Card>

      <Card style={styles.metaCard}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('operator.travelNumber')}</Text>
          <Mono size={12.5}>{rec.no}</Mono>
        </View>
        {/* Shown only when measured. A real travel record carries no mileage or duration, and
            "0 mi" beside a completed journey is a measurement nobody took. */}
        {rec.dist != null && (
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowLabel}>{t('operator.distance')}</Text>
            <Text style={styles.rowValue}>{t('traveler.distMi', { n: rec.dist })}</Text>
          </View>
        )}
        {rec.tripMin != null && (
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowLabel}>{t('operator.duration')}</Text>
            <Text style={styles.rowValue}>{t('traveler.durMin', { n: rec.tripMin })}</Text>
          </View>
        )}
      </Card>

      <View style={{ flex: 1 }} />
      <PrimaryButton
        label={t('operator.returnToOperations')}
        color={colors.green}
        onPress={() => router.dismissTo('/operator')}
        style={{ marginTop: 24 }}
      />
      <Pressable
        onPress={() => router.navigate('/operator/revenue')}
        hitSlop={10}
        style={{ marginTop: 16 }}
      >
        <Text style={styles.viewRevenue}>{t('operator.viewRevenue')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: 14,
    fontSize: 23,
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
  added: { fontSize: 13.5, color: colors.muted, marginTop: 2 },
  ledgerCard: { marginTop: 22, paddingVertical: 4, paddingHorizontal: 20 },
  metaCard: { marginTop: 12, paddingVertical: 4, paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowLabel: { fontSize: 14.5, color: colors.ink2 },
  rowStrong: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowValue: { fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  viewRevenue: { fontSize: 15, fontWeight: '600', color: colors.ink, textAlign: 'center' },
});
