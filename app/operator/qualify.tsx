// Economics precede compliance spend; server review, not a checklist, commissions duty.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { useGoBack } from '../../src/components/nav';
import { BadgeOk } from '../../src/components/operator';
import { Card, PrimaryButton, Screen } from '../../src/components/UI';
import * as Location from 'expo-location';
import { getOperatingMarket, setOperatingMarket, joinOperatorAreaWaitlist, type MarketState } from '../../src/backend/connect';
import { QUAL_DOCS, useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';
import { recordInvitation } from '../../src/backend/referrals';
import { readPendingInvite, clearPendingInvite, savePendingInvite } from '../../src/backend/referralPending';
import { useAuth } from '../../src/state/AuthContext';

export default function OperatorQualification() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const op = useOperator();
  const { user } = useAuth();
  // One optional, server-verified path for spoken codes and links alike.
  // Attribution is not a commission or a guarantee of payment.
  const [referralCode, setReferralCode] = useState('');
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralStatus, setReferralStatus] = useState<'idle' | 'recorded' | 'failed'>('idle');
  const claimReferral = async () => {
    const code = referralCode.trim().toUpperCase();
    if (referralBusy || referralStatus === 'recorded') return;
    if (!/^[A-Z0-9]{8,32}$/.test(code)) {
      setReferralStatus('failed');
      return;
    }
    setReferralBusy(true);
    setReferralStatus('idle');
    try {
      // Keep the code on this device when verification or network access fails.
      // A future visit can resume the same attribution attempt.
      const saved = await savePendingInvite(code, 'operator');
      if (!saved) { setReferralStatus('failed'); return; }
      const result = await recordInvitation(code, 'operator');
      if (result !== 'retry') await clearPendingInvite();
      setReferralStatus(result === 'recorded' ? 'recorded' : 'failed');
    } finally {
      setReferralBusy(false);
    }
  };

  // Already past this screen? Send the account where it actually is.
  useEffect(() => {
    if (!op.ready) return;
    if (op.verification === 'pending') router.replace('/operator/review');
    else if (op.verification === 'commissioned') router.replace('/operator');
  }, [op.ready, op.verification, router]);

  const n = op.verifiedCount;
  // Document review evidence survives on the server, not in this phone's memory.
  // An app restart must not disable the only way to ask the server to review it.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Operator onboarding begins only after the selected service county opens.
  // Last-known location is used only when permission already exists; otherwise choose.
  const [area, setArea] = useState<MarketState | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [interest, setInterest] = useState<'idle' | 'saving' | 'recorded' | 'failed'>('idle');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let st = await getOperatingMarket();
        if (st.error) { if (live) setAreaError(st.error); return; }
        if (!st.market) {
          try {
            const perm = await Location.getForegroundPermissionsAsync();
            const pos = perm.granted ? await Location.getLastKnownPositionAsync() : null;
            if (pos) st = await setOperatingMarket({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          } catch {
            /* no position: the operator chooses below */
          }
        }
        if (live) { if (st.error) setAreaError(st.error); else { setArea(st); setAreaError(null); } }
      } catch {
        if (live) setAreaError(t('traveler.couldNotSaveConn'));
      }
    })();
    return () => {
      live = false;
    };
  }, [t]);
  const areaActive = area?.market?.status === 'active';
  const areaAuthorized = areaActive; // Settled rule: no preparation in unopened markets.
  // A link or QR received before installation can be recovered after sign-in.
  // Retry only when this screen is revisited, not with a background poll.
  useFocusEffect(React.useCallback(() => {
    if (!user?.emailVerified || !areaActive ||
        process.env.EXPO_PUBLIC_REFERRALS_ENABLED !== '1' ||
        referralStatus === 'recorded') return;
    let live = true;
    (async () => {
      const pending = await readPendingInvite();
      if (!live || !pending || pending.role !== 'operator') return;
      setReferralCode(pending.code);
      setReferralBusy(true);
      try {
        const outcome = await recordInvitation(pending.code, 'operator');
        if (!live) return;
        if (outcome !== 'retry') await clearPendingInvite();
        if (live) setReferralStatus(outcome === 'recorded' ? 'recorded' : 'failed');
      } finally {
        if (live) setReferralBusy(false);
      }
    })();
    return () => { live = false; };
  }, [user?.uid, user?.emailVerified, areaActive]));

  return (
    <Screen>
      <Pressable onPress={goBack} accessibilityRole="button" hitSlop={10} style={styles.back}>
        <Text style={styles.backText}>{t('traveler.notNowChev')}</Text>
      </Pressable>

      <Text style={styles.wm}>
        AMERICAN RIDER <Text style={styles.wmOp}>· {t('traveler.operatorCaps')}</Text>
      </Text>
      <Text style={styles.title}>{t('operator.operatorQualification')}</Text>
      {areaActive && <Text style={styles.sub}>
        {t('traveler.qualProgress', { n, total: QUAL_DOCS.length })}
      </Text>}

      {areaActive && <View style={styles.steps}>
        {QUAL_DOCS.map((d) => (
          <View
            key={d.key}
            style={[
              styles.stepBar,
              { backgroundColor: op.docs[d.key] === 'ok' ? colors.green : colors.border },
            ]}
          />
        ))}
      </View>}

      {area && (
        <>
        {areaError ? <Text accessibilityRole="alert" style={styles.footnote}>{areaError}</Text> : null}

      <Card style={styles.listCard}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('operator.operatingArea')}</Text>
              <Text style={styles.rowSub}>
                {areaActive
                  ? area.market!.name
                  : area.market
                    ? t('operator.marketNotActive', { name: area.market.name })
                    : t('operator.marketUnknownSoon')}
              </Text>
              {!areaAuthorized && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {area.active.map((m) => (
                    <Pressable
                      key={m.id}
                      hitSlop={6}
                      disabled={areaBusy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: areaBusy }}
                      onPress={async () => {
                        if (areaBusy) return;
                        setAreaBusy(true);
                        setAreaError(null);
                        try {
                          const next = await setOperatingMarket({ marketId: m.id });
                          if (next.error) setAreaError(next.error);
                          else if (next.market?.id !== m.id) setAreaError(t('traveler.couldNotSaveConn'));
                          else { setArea(next); setInterest('idle'); }
                        } catch {
                          setAreaError(t('traveler.couldNotSaveConn'));
                        } finally {
                          setAreaBusy(false);
                        }
                      }}
                      style={{ marginRight: 14, marginTop: 4, minHeight: 44, justifyContent: 'center' }}
                    >
                      <Text style={styles.rowTitle}>{m.name} ›</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            {areaActive ? <BadgeOk label={t('traveler.open')} /> : null}
          </View>
        </Card>
        </>
      )}
      {area?.market && !areaActive && <Card style={styles.prepCard}>
        <Text style={styles.rowTitle}>{t('operator.marketNotActive', { name: area.market.name })}</Text>
        {interest === 'recorded' ? <Text style={styles.prepBody}>{t('traveler.waitlistRecorded')}</Text> : <>
          <Text style={styles.prepBody}>{t('traveler.marketInterestPrivacy')}</Text>
          <PrimaryButton label={interest === 'saving' ? t('operator.checking') : t('traveler.waitlistJoin')}
            disabled={interest === 'saving'}
            onPress={async () => {
              const marketId = area?.market?.id;
              if (!marketId || interest === 'saving') return;
              setInterest('saving');
              const ok = await joinOperatorAreaWaitlist(marketId);
              setInterest(ok ? 'recorded' : 'failed');
            }} style={{ marginTop: 12 }} />
          {interest === 'failed' && <Text accessibilityRole="alert" style={styles.footnote}>{t('traveler.waitlistFailed')}</Text>}
        </>}
      </Card>}
      {!area && <Text accessibilityRole={areaError ? 'alert' : undefined} style={styles.footnote}>
        {areaError || t('operator.checking')}
      </Text>}
      {areaError && <Pressable accessibilityRole="button" style={styles.back} onPress={async () => {
        const latest = await getOperatingMarket();
        if (latest.error) setAreaError(latest.error);
        else { setArea(latest); setAreaError(null); }
      }}><Text style={styles.backText}>{t('traveler.marketCheckAgain')} ›</Text></Pressable>}

      {areaActive && process.env.EXPO_PUBLIC_REFERRALS_ENABLED === '1' && (
        <Card style={styles.referralCard}>
          <Text style={styles.rowTitle}>{t('operator.referralQuestion')}</Text>
          <Text style={styles.rowSub}>{t('operator.referralDescription')}</Text>
          <Text style={styles.rowSub}>{t('operator.referralCodeOptional')}</Text>
          <TextInput
            accessibilityLabel={t('operator.referralCodeOptional')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={32}
            editable={!referralBusy && referralStatus !== 'recorded'}
            placeholder={t('operator.referralCodePlaceholder')}
            value={referralCode}
            onChangeText={value => { setReferralCode(value); setReferralStatus('idle'); }}
            style={styles.referralInput}
          />
          {referralStatus === 'recorded' ? (
            <Text accessibilityRole="alert" style={styles.rowSub}>{t('operator.referralRecorded')}</Text>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={t('operator.referralApply')}
              disabled={referralBusy} onPress={() => void claimReferral()}
              style={styles.referralAction}>
              <Text style={styles.rowTitle}>{referralBusy ? t('operator.referralChecking') : t('operator.referralApply')}</Text>
            </Pressable>
          )}
          {referralStatus === 'failed' && <Text accessibilityRole="alert" style={styles.footnote}>
            {t('operator.referralFailed')}
          </Text>}
        </Card>
      )}
      {areaActive && <Card style={styles.listCard}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/operator/vehicle')}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('traveler.vehicle')}</Text>
              <Text style={styles.rowSub}>{op.vehicle?.car || t('traveler.noVehicleOnFile')}</Text>
            </View>
            <Text style={styles.pillTodo}>{t('traveler.open')} ›</Text>
          </View>
        </Pressable>
        {QUAL_DOCS.map((d, i) => {
          const st = op.docs[d.key];
          return (
            <Pressable
              accessibilityRole="button"
              key={d.key}
              onPress={() => {
                if (!areaAuthorized) {
                  // A closed area has no Operator compliance workflow.
                  setAreaError(t('operator.marketAdmissionRequired'));
                  return;
                }
                // THE FOUR DOCUMENT STEPS GO TO THE SCREEN THAT CAN READ ONE. They used to call
                // verifyDoc, which ticked them after 900 milliseconds without ever seeing a
                // document. verifyDoc now refuses those keys, so leaving this would have made
                // the row do nothing at all — quieter than the timer and no more honest.
                if (d.key === 'insurance') router.navigate('/operator/insurance');
                else if (d.key === 'background') router.navigate('/operator/background');
                else if (d.key === 'license' || d.key === 'registration' || d.key === 'inspection')
                  router.navigate('/operator/documents');
                else op.verifyDoc(d.key);
              }}
            >
              <View style={[styles.row, i > 0 && styles.hair]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t(d.title)}</Text>
                  {d.sub ? <Text style={styles.rowSub}>{t(d.sub)}</Text> : null}
                </View>
                {st === 'ok' ? (
                  <BadgeOk label={t('operator.verified')} />
                ) : st === 'checking' ? (
                  <Text style={styles.pillChecking}>{t('operator.checking')}</Text>
                ) : st === 'review' ? (
                  <Text style={styles.pillChecking}>{t('traveler.underReview')}</Text>
                ) : (
                  <Text style={styles.pillTodo}>{t('traveler.add')} ›</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </Card>}
      {areaActive && <Pressable accessibilityRole="button" onPress={() => router.navigate('/operator/payouts')}
        style={{ minHeight: 48, justifyContent: 'center', marginTop: 10 }}>
        <Text style={styles.rowTitle}>{t('operator.gettingPaid')} ›</Text>
        <Text style={styles.rowSub}>{t('traveler.stripeHoldsDetails')}</Text>
      </Pressable>}
      {areaActive && <Pressable accessibilityRole="button" onPress={() => router.navigate('/operator/economics' as never)}
        style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
        <Text style={styles.rowSub}>{t('operator.econTitle')} ›</Text>
      </Pressable>}

      {areaActive && <Text style={styles.footnote}>
        {t('traveler.verifyNotSellShort')}
      </Text>}
      {/* WAS: "Test program — document review is simulated." It was true when verifyDoc set a
          flag after 900 milliseconds, and it stopped being true the day reviewDoc started
          sending the document to a model that reads it. A line telling an operator their
          licence is not really checked, on a screen where it is, is the same defect as the
          reverse — it is just the flattering direction to be wrong in. */}

      <View style={{ flex: 1 }} />
      {submitError && <Text accessibilityRole="alert" style={styles.footnote}>{submitError}</Text>}
      {areaActive && <PrimaryButton
        label={t('traveler.qualSubmitReview')}
        disabled={submitting || !areaAuthorized}
        onPress={async () => {
          setSubmitting(true);
          setSubmitError(null);
          const out = await op.submitQualification();
          setSubmitting(false);
          if (out.ok) router.replace('/operator/review');
          else setSubmitError(out.error || null);
        }}
        style={{ marginTop: 24 }}
      />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  referralCard: { marginTop: 10, paddingVertical: 18, paddingHorizontal: 18 },
  referralInput: { marginTop: 15, minHeight: 48, borderWidth: 1, borderColor: colors.border,
    borderRadius: 7, paddingHorizontal: 13, fontSize: 16, color: colors.ink },
  referralAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 6 },
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontSize: 15, fontWeight: '500', color: colors.ink },
  // The shell's left-aligned qualification wordmark: 12 / 600 / .26em.
  wm: { marginTop: 8, fontSize: 12, fontWeight: '600', letterSpacing: 3.12, color: colors.ink },
  wmOp: { color: colors.muted },
  title: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.52,
    lineHeight: 34,
    color: colors.ink,
  },
  sub: { fontSize: 14.5, color: colors.muted, marginTop: 9, lineHeight: 21.75 },
  steps: { flexDirection: 'row', gap: 5, marginTop: 16 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
  banner: {
    marginTop: 16,
    backgroundColor: colors.blueTint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  bannerText: { fontSize: 13, color: colors.ink2, lineHeight: 18.85 },
  prepCard: { marginTop: 16, padding: 18 },
  prepBody: { fontSize: 13.5, lineHeight: 20, color: colors.ink2, marginTop: 8 },
  listCard: { marginTop: 16, paddingVertical: 2, paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 15,
    gap: 10,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  pillChecking: { fontSize: 12, fontWeight: '600', color: colors.ink },
  pillTodo: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  footnote: { fontSize: 11.5, color: colors.faint, marginTop: 10, lineHeight: 16.7 },
});
