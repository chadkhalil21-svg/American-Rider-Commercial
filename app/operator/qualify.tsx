// Economics precede compliance spend; server review, not a checklist, commissions duty.
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { useGoBack } from '../../src/components/nav';
import { BadgeOk } from '../../src/components/operator';
import { Card, PrimaryButton, Screen } from '../../src/components/UI';
import * as Location from 'expo-location';
import { getOperatingMarket, setOperatingMarket, type MarketState } from '../../src/backend/connect';
import { QUAL_DOCS, useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorQualification() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const op = useOperator();

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

  // The server accepts qualification for an admitted prelaunch county, but paid duty only after
  // full commercial activation. Placed from the phone's last known position when there
  // is one and nothing is declared yet; otherwise the operator chooses.
  const [area, setArea] = useState<MarketState | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  // A failed market request must not look like a valid empty county list.
  // Retry only when the Operator asks, and do not request GPS permission.
  const loadArea = React.useCallback(async (alive: () => boolean = () => true) => {
    setAreaBusy(true);
    let st = await getOperatingMarket();
    if (!st.error && !st.market) {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const pos = perm.granted ? await Location.getLastKnownPositionAsync() : null;
        if (pos) st = await setOperatingMarket({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch { /* The Operator can select their county manually. */ }
    }
    if (alive()) {
      setAreaBusy(false);
      if (st.error) setAreaError(st.error);
      else { setArea(st); setAreaError(null); }
    }
  }, []);
  useEffect(() => {
    let live = true;
    void loadArea(() => live);
    return () => { live = false; };
  }, [loadArea]);
  const areaActive = area?.market?.status === 'active';
  // Final commercial submission is different from early paperwork preparation.
  const areaAuthorized = areaActive || area?.market?.status === 'onboarding';

  return (
    <Screen>
      <Pressable onPress={goBack} accessibilityRole="button" hitSlop={10} style={styles.back}>
        <Text style={styles.backText}>{t('traveler.notNowChev')}</Text>
      </Pressable>

      <Text style={styles.wm}>
        AMERICAN RIDER <Text style={styles.wmOp}>· {t('traveler.operatorCaps')}</Text>
      </Text>
      <Text style={styles.title}>{t('operator.operatorQualification')}</Text>
      <Text style={styles.sub}>
        {t('traveler.qualProgress', { n, total: QUAL_DOCS.length })}
      </Text>

      <View style={styles.steps}>
        {QUAL_DOCS.map((d) => (
          <View
            key={d.key}
            style={[
              styles.stepBar,
              { backgroundColor: op.docs[d.key] === 'ok' ? colors.green : colors.border },
            ]}
          />
        ))}
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>{t('operator.retainOnceCommissioned')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/operator/economics' as never)} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
          <Text style={styles.bannerText}>{t('operator.econYourScenario')} ›</Text>
        </Pressable>
      </View>

      <Card style={styles.prepCard}>
        <Text style={styles.rowTitle}>{t('operator.qualPreparation')}</Text>
        <Text style={styles.prepBody}>{t('operator.qualCostPreview')}</Text>
        <Text style={styles.prepBody}>{t('operator.qualNext')}</Text>
      </Card>

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
                  : area.market?.status === 'onboarding'
                    ? t('operator.marketPrelaunch', { name: area.market.name })
                  : area.market
                    ? t('operator.marketNotActive', { name: area.market.name })
                    : t('operator.chooseOperatingArea')}
              </Text>
              {!areaAuthorized && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {[...area.active, ...area.onboarding, ...area.waitlist].map((m) => (
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
                          else setArea(next);
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
            {areaActive ? <BadgeOk label={t('operator.verified')} /> : null}
          </View>
        </Card>
        </>
      )}
      {!area && <>
        <Text accessibilityRole={areaError ? 'alert' : undefined} style={styles.footnote}>
          {areaError || t('operator.checking')}
        </Text>
        {areaError && <PrimaryButton label={t('traveler.tryAgain')} onPress={() => { void loadArea(); }} disabled={areaBusy} style={{ marginTop: 10 }} />}
      </>}

      <Card style={styles.listCard}>
        {QUAL_DOCS.map((d, i) => {
          const st = op.docs[d.key];
          return (
            <Pressable
              accessibilityRole="button"
              key={d.key}
              onPress={() => {
                // Basics is a self-completed form step, not a verified credential.
                if (d.key === 'basics') { op.verifyDoc(d.key); return; }
                // Jurisdiction is needed for documents and screening, but
                // the county need not yet be open for paid Travel.
                if (!area?.market) {
                  setAreaError(t('operator.chooseOperatingArea'));
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
                  <BadgeOk label={d.key === 'basics' ? t('traveler.complete') : t('operator.verified')} />
                ) : st === 'checking' ? (
                  <Text style={styles.pillChecking}>{t('operator.checking')}</Text>
                ) : (
                  <Text style={styles.pillTodo}>{t('traveler.add')} ›</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Text style={styles.footnote}>
        {t('traveler.verifyNotSellShort')}
      </Text>
      {/* WAS: "Test program — document review is simulated." It was true when verifyDoc set a
          flag after 900 milliseconds, and it stopped being true the day reviewDoc started
          sending the document to a model that reads it. A line telling an operator their
          licence is not really checked, on a screen where it is, is the same defect as the
          reverse — it is just the flattering direction to be wrong in. */}

      <View style={{ flex: 1 }} />
      {submitError && <Text accessibilityRole="alert" style={styles.footnote}>{submitError}</Text>}
      <PrimaryButton
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
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
