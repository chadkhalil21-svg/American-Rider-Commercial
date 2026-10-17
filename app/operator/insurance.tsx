// Continuing coverage is a qualification, not a quote or automatic approval.
// Law, platform policy, carrier judgment and verification are distinct authorities.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text } from '../../src/components/AppText';
import { pickDocument } from '../../src/backend/documentUpload';
import {
  insuranceStatus, insuranceConfig, authorizeInsuranceStatusVerification,
  attestInsuranceUnchanged, requestInsuranceConfirmation, reportInsuranceRisk,
  type InsuranceStatus, type InsuranceConfig,
} from '../../src/backend/insuranceStatus';
import { useGoBack } from '../../src/components/nav';
import { BadgeOk } from '../../src/components/operator';
import { BackLink, Card, PrimaryButton, Screen, SectionLabel, Title } from '../../src/components/UI';
import { BROKER, INSURERS } from '../../src/data';
import { useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorInsurance() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const op = useOperator();
  const [config, setConfig] = useState<InsuranceConfig | null>(null);
  const [configResolved, setConfigResolved] = useState(false);
  const [liveStatus, setLiveStatus] = useState<InsuranceStatus | null>(null);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [showRiskOptions, setShowRiskOptions] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [brokerEmail, setBrokerEmail] = useState('');
  const [contactType, setContactType] = useState<'agent' | 'broker' | 'carrier' | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextConfig, nextStatus] = await Promise.all([insuranceConfig(), insuranceStatus()]);
    setConfig(nextConfig);
    setConfigResolved(true);
    setLiveStatus(nextStatus);
    if (nextStatus?.contact?.email) setBrokerEmail(nextStatus.contact.email);
    if (nextStatus?.contact?.type === 'agent' || nextStatus?.contact?.type === 'broker' || nextStatus?.contact?.type === 'carrier') {
      setContactType(nextStatus.contact.type);
    }
  }, []);
  // Carrier/broker confirmation is asynchronous and happens outside the app.
  // Refresh automatically when this phone returns or the Operator revisits the
  // Insurance screen, rather than requiring a Founder or Operator to force it.
  useFocusEffect(useCallback(() => {
    void refresh();
    const resume = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => resume.remove();
  }, [refresh]));
  // The focus hook owns initial fetching. Refresh a second time only when
  // this document status actually CHANGES (not on the initial screen mount).
  const previousDocumentState = useRef(op.docs.insurance);
  useEffect(() => {
    if (previousDocumentState.current !== op.docs.insurance) {
      previousDocumentState.current = op.docs.insurance;
      void refresh();
    }
  }, [refresh, op.docs.insurance]);

  const authorizeStatus = async () => {
    setStatusBusy(true);
    try {
      const out = await authorizeInsuranceStatusVerification();
      if (!out.ok) return Alert.alert(t('traveler.insAuthorizeTitle'), out.error || t('traveler.errReachAR'));
      await refresh();
      Alert.alert(t('traveler.insAuthorizeTitle'), t('traveler.insAuthorized'));
    } finally { setStatusBusy(false); }
  };
  const confirmUnchanged = async () => {
    setStatusBusy(true);
    try {
      const s = await attestInsuranceUnchanged();
      if (!s) return Alert.alert(t('traveler.notRecorded'), t('traveler.errReachAR'));
      setLiveStatus(s);
      Alert.alert(t('traveler.insStatusTitle'), t('traveler.insAttestationSent'));
    } finally { setStatusBusy(false); }
  };
  const requestStatus = async () => {
    if (!contactType) return;
    const email = brokerEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Alert.alert(t('traveler.insStatusTitle'), t('traveler.insBrokerEmail'));
    setStatusBusy(true);
    try {
      const out = await requestInsuranceConfirmation({ email, type: contactType });
      if (!out.ok) return Alert.alert(t('traveler.notSent'), out.error || t('traveler.errReachAR'));
      await refresh();
      Alert.alert(t('traveler.insStatusTitle'), t('traveler.insRequestSent'));
    } finally { setStatusBusy(false); }
  };
  const reportRisk = (kind: 'pending_cancellation' | 'cancelled') => {
    Alert.alert(t('traveler.insRiskTitle'), t('traveler.insRiskBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('traveler.insRiskConfirm'), style: 'destructive', onPress: () => {
        void (async () => {
          setStatusBusy(true);
          try {
            const result = await reportInsuranceRisk(kind);
            if (!result.ok) return Alert.alert(t('traveler.notRecorded'), result.error || t('traveler.errReachAR'));
            await refresh();
            Alert.alert(t('traveler.insRiskTitle'), t('traveler.insRiskRecorded'));
          } finally { setStatusBusy(false); }
        })();
      } },
    ]);
  };
  const submitPolicy = async (fromCamera: boolean) => {
    if (!config) return Alert.alert(t('operator.commercialInsurance'), t('traveler.insJurisdictionUnavailable'));
    const uri = await pickDocument(fromCamera);
    if (!uri) return;
    const out = await op.reviewDoc('insurance', uri);
    if (!out) Alert.alert(t('traveler.notSubmitted'), t('traveler.docUploadFailed'));
    else if ('error' in out) Alert.alert(t('traveler.notChecked'), out.error);
    else if (out.verdict === 'refuse') Alert.alert(t('traveler.notAccepted'), out.reasons.join('\n\n'));
    else if (out.verdict === 'review') Alert.alert(t('traveler.beingChecked'), t('traveler.insUnderPersonReview'));
    else await refresh();
  };
  const st = op.docs.insurance;
  // Staff may approve the source document after this phone was closed. Use the
  // authenticated server verdict, not a stale local checklist badge.
  const policyApproved = liveStatus?.documentApproved === true;
  const policyExpiry = liveStatus?.policyExpiry || op.insuranceExpiry;
  const coverageDaysLeft = policyExpiry
    ? Math.ceil((Date.parse(policyExpiry + 'T23:59:59Z') - Date.now()) / 86_400_000)
    : null;
  const expiring = coverageDaysLeft != null && coverageDaysLeft <= 30;
  const canUpload = !policyApproved || expiring;
  const current = policyApproved && liveStatus?.ok === true &&
    coverageDaysLeft != null && coverageDaysLeft >= 0;
  const national = config ? INSURERS.filter((x) => !x.states) : [];
  const regional = config ? INSURERS.filter((x) => x.states?.includes(config.state)) : [];
  const sourceRow = (x: typeof INSURERS[number], i: number) => (
    <Pressable key={x.name} accessibilityRole="link" onPress={() => {
      const url = x.url || `tel:${(x.phone || '').replace(/[^0-9+]/g, '')}`;
      void Linking.openURL(url).catch(() => Alert.alert(t('traveler.notSent'), t('traveler.errReachAR')));
    }}>
      <View style={[styles.providerRow, i > 0 && styles.hair]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerTitle}>{x.name}</Text>
          <Text style={styles.body}>{t(x.note)}</Text>
          {x.unverified && <Text style={styles.body}>{t('traveler.insNotLicenceChecked')}</Text>}
        </View>
        <Text style={styles.link}>{x.url ? t('traveler.quote') : t('traveler.call')} ›</Text>
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <BackLink label={t('common.back')} onPress={goBack} />
      <Title>{t('operator.commercialInsurance')}</Title>
      <Text style={styles.lead}>{t('operator.insFirstStep')}</Text>
      <Pressable accessibilityRole="link" onPress={() => router.navigate('/operator/economics' as never)} style={styles.tap}>
        <Text style={styles.link}>{t('operator.econTitle')} ›</Text>
      </Pressable>

      <SectionLabel style={styles.label}>{t('operator.coverageOnFile')}</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.statusLine}>
          <Text style={styles.statusTitle}>{current ? t('traveler.insStatusActive') : t('traveler.insStatusNeedsVerification')}</Text>
          {current && <BadgeOk label={t('operator.verified')} />}
        </View>
        <Text style={styles.body}>{coverageDaysLeft == null
          ? t('traveler.insNoDateOnFile')
          : coverageDaysLeft < 0 ? t('traveler.insExpired')
          : coverageDaysLeft <= 30 ? t('traveler.insDaysLeft', { n: coverageDaysLeft })
          : t('traveler.insOnFileUntil', { date: policyExpiry })}</Text>
        {st === 'checking' && <Text style={styles.body}>{t('operator.checking')}</Text>}
        {op.docReviews.insurance?.verdict === 'review' && <Text style={styles.body}>{t('traveler.insUnderPersonReview')}</Text>}
        {op.docReviews.insurance?.verdict === 'refuse' && op.docReviews.insurance.reasons.map((reason, i) => (
          <Text key={i} accessibilityRole="alert" style={styles.attention}>{reason}</Text>
        ))}
        {!current && !!liveStatus?.reason && <Text accessibilityRole="alert" style={styles.attention}>{liveStatus.reason}</Text>}
        {!!liveStatus?.verificationIssue && <Text style={styles.body}>{t('traveler.insProviderProcessBody')}</Text>}
        {!!liveStatus?.verificationIssue?.note && <Text accessibilityRole="alert" style={styles.attention}>{liveStatus.verificationIssue.note}</Text>}
        {liveStatus?.operatorActionRequired && (
          <PrimaryButton label={t('traveler.insAttest')} onPress={confirmUnchanged} disabled={statusBusy} style={styles.action} />
        )}
        {canUpload && (
          <>
          {expiring && policyApproved && <Text style={styles.note}>{t('operator.insReplacementCaution')}</Text>}
          <PrimaryButton
            label={expiring && policyApproved ? t('operator.insReplacePolicy') : t('traveler.submitMyPolicy')}
            disabled={st === 'checking' || !config}
            onPress={() => Alert.alert(t('operator.commercialInsurance'), t('traveler.insWhereDecPage'), [
              { text: t('traveler.takePhotograph'), onPress: () => { void submitPolicy(true); } },
              { text: t('traveler.chooseFile'), onPress: () => { void submitPolicy(false); } },
              { text: t('common.cancel'), style: 'cancel' },
            ])}
            style={styles.action}
          />
          </>
        )}
        {configResolved && !config && <>
          <Text accessibilityRole="alert" style={styles.attention}>{t('traveler.insJurisdictionUnavailable')}</Text>
          <PrimaryButton label={t('traveler.tryAgain')} onPress={() => { void refresh(); }} style={styles.action} />
        </>}
        {/* Insurance issues are rare exceptions, never a daily questionnaire. */}
        <Pressable accessibilityRole="button"
          accessibilityState={{ expanded: showRiskOptions }}
          onPress={() => setShowRiskOptions(!showRiskOptions)} style={styles.tap}>
          <Text style={styles.link}>{t('traveler.insRiskEntry')} {showRiskOptions ? '−' : '+'}</Text>
        </Pressable>
        {showRiskOptions && <>
          <Text style={styles.note}>{t('traveler.insRiskBody')}</Text>
          <Pressable accessibilityRole="button" disabled={statusBusy}
            onPress={() => reportRisk('pending_cancellation')} style={styles.tap}>
            <Text style={styles.link}>{t('traveler.insRiskPending')} ›</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={statusBusy}
            onPress={() => reportRisk('cancelled')} style={styles.tap}>
            <Text style={styles.link}>{t('traveler.insRiskCancelled')} ›</Text>
          </Pressable>
        </>}
        <Pressable accessibilityRole="button" onPress={() => { void refresh(); }} style={styles.tap}>
          <Text style={styles.link}>{t('operator.insRefreshStatus')} ›</Text>
        </Pressable>
      </Card>

      <SectionLabel style={styles.label}>{t('operator.insWhoDecides')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t(config?.state === 'FL' ? 'operator.insFloridaLaw' : 'operator.insLocalLaw')}</Text>
        <Text style={styles.body}>{t(config?.state === 'FL' ? 'operator.insFloridaLawBody' : 'operator.insLocalLawBody')}</Text>
        <Text style={styles.cardTitle}>{t('operator.insARPolicy')}</Text>
        <Text style={styles.body}>{t('operator.insARPolicyBody')}</Text>
        <Text style={styles.cardTitle}>{t('operator.insBrokerDecision')}</Text>
        <Text style={styles.body}>{t('operator.insBrokerDecisionBody')}</Text>
        <Text style={styles.cardTitle}>{t('operator.insARVerification')}</Text>
        <Text style={styles.body}>{t('operator.insARVerificationBody')}</Text>
      </Card>

      <SectionLabel style={styles.label}>{t('operator.insGetCovered')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('operator.insOwnBroker')}</Text>
        <Text style={styles.body}>{t('operator.insOwnBrokerBody')}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showScript }} onPress={() => setShowScript(!showScript)} style={styles.tap}>
          <Text style={styles.link}>{t('operator.insBrokerInstructions')} {showScript ? '−' : '+'}</Text>
        </Pressable>
        {showScript && <View>
          <Text style={styles.body}>{t('traveler.insRequirementsStatement')}</Text>
          <Text style={styles.body}>{t('traveler.insFixedInstruction')}</Text>
          {config ? <Text selectable style={styles.script}>{config.script}</Text>
            : <Text style={styles.attention}>{t('traveler.insJurisdictionUnavailable')}</Text>}
          <Text style={styles.note}>{t('traveler.insCallScriptNote')}</Text>
          {config && <Pressable accessibilityRole="button" onPress={() => {
            void Share.share({ message: config.script }).catch(() => Alert.alert(t('traveler.notSent'), t('traveler.errReachAR')));
          }} style={styles.tap}>
            <Text style={styles.link}>{t('operator.insShareScript')} ›</Text>
          </Pressable>}
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/operator/guidelines')} style={styles.tap}>
            <Text style={styles.link}>{t('operator.coverageGuidelinesLink')}</Text>
          </Pressable>
        </View>}
      </Card>
      {config?.state === 'FL' && BROKER && <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('operator.referredBroker')}</Text>
        <Text style={styles.providerTitle}>{BROKER.name}</Text>
        <Text style={styles.body}>{t(BROKER.note)}</Text>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`tel:${BROKER!.phone.replace(/[^0-9+]/g, '')}`); }} style={styles.tap}>
          <Text style={styles.link}>{BROKER.phone}</Text>
        </Pressable>
        {!!BROKER.email && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`mailto:${BROKER!.email}`); }} style={styles.tap}>
          <Text style={styles.link}>{BROKER.email}</Text>
        </Pressable>}
        {!!BROKER.hours && <Text style={styles.body}>{t(BROKER.hours)}</Text>}
        {!!BROKER.license && <Text style={styles.body}>{t('traveler.floridaLicenceNo', { no: BROKER.license })}</Text>}
        <Text style={styles.note}>{t('traveler.noCommissionOnPremium')}</Text>
      </Card>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSources }} onPress={() => setShowSources(!showSources)} style={styles.tap}>
        <Text style={styles.link}>{t('operator.compareProviders')} {showSources ? '−' : '+'}</Text>
      </Pressable>
      {showSources && <>
        <Text style={styles.body}>{t('traveler.insNoAdvice')}</Text>
        <Text style={styles.note}>{t('traveler.insVerifyLicence')}</Text>
        {config ? <>
          <Card style={styles.card}>{national.filter((x) => !x.secondary || showMore).map(sourceRow)}</Card>
          {regional.length > 0 && <Card style={styles.card}>{regional.filter((x) => !x.secondary || showMore).map(sourceRow)}</Card>}
          {!showMore && <Pressable accessibilityRole="button" onPress={() => setShowMore(true)} style={styles.tap}>
            <Text style={styles.link}>{t('operator.compareMoreOptions')} ›</Text>
          </Pressable>}
        </> : <Text style={styles.attention}>{t('traveler.insJurisdictionUnavailable')}</Text>}
      </>}

      {configResolved && !!config && !liveStatus && <PrimaryButton label={t('traveler.tryAgain')} onPress={() => { void refresh(); }} style={styles.action} />}
      <SectionLabel style={styles.label}>{t('traveler.insStatusTitle')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.body}>{t('operator.insMonitoringIntro')}</Text>
        {policyApproved && <>
          <Text style={styles.cardTitle}>{t('traveler.insAuthorizeTitle')}</Text>
          {liveStatus?.authorized ? <Text style={styles.body}>{t('traveler.insAuthorized')}</Text>
            : <PrimaryButton label={t('traveler.insAuthorizeButton')} onPress={authorizeStatus} disabled={statusBusy} style={styles.action} />}
          <Text style={styles.fieldLabel}>{t('operator.insContactType')}</Text>
          <View style={styles.contactTypes}>
            {(['agent', 'broker', 'carrier'] as const).map((kind) => <Pressable key={kind}
              accessibilityRole="button" accessibilityState={{ selected: contactType === kind }}
              onPress={() => setContactType(kind)} style={[styles.contactType, contactType === kind && styles.contactTypeSelected]}>
              <Text style={styles.link}>{kind === 'agent' ? t('operator.insContactAgent')
                : kind === 'broker' ? t('operator.insContactBroker') : t('operator.insContactCarrier')}</Text>
            </Pressable>)}
          </View>
          <Text style={styles.fieldLabel}>{t('traveler.insBrokerEmail')}</Text>
          <TextInput value={brokerEmail} onChangeText={setBrokerEmail} keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('traveler.insBrokerEmail')}
            placeholder={t('traveler.insBrokerEmailPh')} placeholderTextColor={colors.faint} style={styles.input} />
          <PrimaryButton label={t('traveler.insRequestConfirmation')} onPress={requestStatus}
            disabled={statusBusy || !contactType || !brokerEmail.trim() || !liveStatus?.authorized} style={styles.action} />
        </>}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMonitoring }} onPress={() => setShowMonitoring(!showMonitoring)} style={styles.tap}>
          <Text style={styles.link}>{t('operator.insMonitoringDetails')} {showMonitoring ? '−' : '+'}</Text>
        </Pressable>
        {showMonitoring && <>
          <Text style={styles.body}>{t('traveler.insAuthorizeBody')}</Text>
          <Text style={styles.body}>{t('traveler.insStatusExplain')}</Text>
          <Text style={styles.body}>{t('traveler.insStatusAutomatic')}</Text>
          <Text style={styles.body}>{t('traveler.insStatusFallback')}</Text>
          <Text style={styles.body}>{t('traveler.insEvidenceEmail')}</Text>
          <Text style={styles.body}>{t('traveler.certificateHolder')}</Text>
        </>}
      </Card>
      <Pressable accessibilityRole="link" onPress={() => router.navigate('/operator/disclosure')} style={styles.tap}>
        <Text style={styles.link}>{t('traveler.whatWeInsure')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: 12, color: colors.ink2, fontSize: 15, lineHeight: 22 },
  label: { marginTop: 26, marginBottom: 10 },
  card: { padding: 18, marginTop: 8 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '600', marginTop: 14, marginBottom: 5 },
  statusTitle: { color: colors.ink, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  body: { color: colors.ink2, fontSize: 14, lineHeight: 21, marginTop: 5 },
  attention: { color: colors.red, fontSize: 14, lineHeight: 21, marginTop: 10 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  tap: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8 },
  link: { color: colors.ink, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  action: { marginTop: 14 },
  script: { color: colors.ink, fontSize: 14, lineHeight: 21, marginTop: 12 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  providerTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  fieldLabel: { color: colors.ink2, fontSize: 14, marginTop: 16 },
  contactTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  contactType: { minHeight: 48, paddingHorizontal: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  contactTypeSelected: { borderColor: colors.ink, backgroundColor: colors.blueTint },
  input: { minHeight: 48, marginTop: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
});
