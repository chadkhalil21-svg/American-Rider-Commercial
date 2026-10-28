// Proceed to Pickup / At Pickup — the operator demo, exactly: the ETA pill, the
// drawn navigation map, the traveler card with Contact, the Travel Notes card
// ("You retain final discretion"), Confirm Arrival → Commence Travel.
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { OperatorMap } from '../../src/components/operator';
import { Avatar, Card, Mono, Num, PrimaryButton, Screen, SectionLabel } from '../../src/components/UI';
import { CheckInCard } from '../../src/components/CheckInCard';
import { useOperator } from '../../src/state/OperatorContext';
import { usePaymentConfig } from '../../src/state/PaymentConfigContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorPickup() {
  const { t } = useLanguage();
  const router = useRouter();
  const op = useOperator();
  const payConfig = usePaymentConfig();
  const active = op.op;
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [pickupEntry, setPickupEntry] = useState('');
  // This is a DISPLAY timer only. Eligibility and payments are always decided
  // from the server arrival stamp, not this device's clock or UI countdown.
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!op.arrived) return;
    const timer=setInterval(()=>setClock(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[op.arrived]);

  // Cold-open guard only: cancelling clears `op` while its own navigation runs —
  // don't race it.
  const hadOp = useRef(false);
  if (active) hadOp.current = true;
  useEffect(() => {
    if (!active && !hadOp.current) router.replace('/operator');
  }, [active, router]);
  const arrived = op.arrived;
  const waitMs = active?.arrivedAt
    ? Math.max(0, 5*60*1000 - (clock - active.arrivedAt)) : null;
  const waitSeconds=waitMs===null ? null : Math.ceil(waitMs/1000);
  // No extra backend status request for a normal adult pickup.
  // Teen PIN entry stays required and is checked by the server.
  useEffect(() => { setPickupEntry(''); }, [active?.rideId,arrived]);
  if (!active) return <Screen scroll={false}>{null}</Screen>;

  return (
    <Screen>
      <Pressable
        onPress={() => router.dismissTo('/operator')}
        hitSlop={10}
        style={styles.back}
      >
        <Text style={styles.backText}>{t('traveler.backLabel')}</Text>
      </Pressable>

      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{arrived ? 'At Pickup' : 'Proceed to Pickup'}</Text>
          <Text style={styles.sub}>
            {/* A real travel carries no operator ETA — the scripted ones did, and this printed
                "undefined min away" for everything else. Say where, and say who only when we
                have a name for them. */}
            {active.pickup}
            {arrived
              ? active.traveler
                ? ` · meet ${active.traveler}`
                : ''
              : active.pickupMin != null
                ? ` · ${active.pickupMin} min away`
                : ''}
          </Text>
        </View>
        <View style={styles.etaPill}>
          <Num size={13} color="#fff">
            {arrived ? 'Arrived' : active.pickupMin != null ? `${active.pickupMin} min` : 'En route'}
          </Num>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <OperatorMap
          tag={arrived ? 'ARRIVED · PICKUP' : 'NAVIGATION · TO PICKUP'}
          animate={!arrived}
        />
      </View>

      {/* The platform's question about this vehicle, when it has one. Absent on an ordinary
          journey — see src/components/CheckInCard.tsx for why it is asked of the operator
          before it is ever asked of the traveler. */}
      {!!op.checkIn && <CheckInCard question={op.checkIn} onAnswer={op.respondToCheckIn} />}

      <Card style={styles.travelerCard}>
        <View style={styles.rowBetween}>
          <View style={styles.travelerLeft}>
            <Avatar initials={active.tInit} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={styles.travelerName}>{active.traveler}</Text>
              <Text style={styles.travelerSub}>
                {active.pickup} → {active.dest}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => router.navigate('/operator/communicate')} hitSlop={10}>
            <Text style={styles.contact}>{t('traveler.contact')}</Text>
          </Pressable>
        </View>
      </Card>

      {/* Teen travelers retain their mandatory four-digit boarding code. */}
      {active.teen ? (
        <Card style={styles.codeCard}>
          <SectionLabel>{t('operator.verificationCode')}</SectionLabel>
          <Text style={styles.codeBody}>{t('operator.enterPrivatePickupCode')}</Text>
          <TextInput accessibilityLabel={t('operator.enterPrivatePickupCode')}
            keyboardType="number-pad" value={pickupEntry}
            onChangeText={value=>setPickupEntry(value.replace(/\D/g,'').slice(0,4))}
            maxLength={4}
            placeholder="••••"
            style={{fontSize:24,letterSpacing:3,color:colors.ink,paddingVertical:12}}/>
        </Card>
      ) : null}

      {!active.teen ? (
        <Text style={styles.codeBody}>{t('operator.confirmTravelerName')}</Text>
      ) : null}

      {active.cabinPreferences ? (
        <Card style={styles.prefsCard}>
          {[
            {
              label: t('traveler.climate'),
              value:
                active.cabinPreferences.climate === 'Cool'
                  ? t('traveler.prefCool')
                  : active.cabinPreferences.climate === 'Warm'
                    ? t('traveler.prefWarm')
                    : t('traveler.prefModerate'),
            },
            {
              label: t('traveler.atmosphere'),
              value: active.cabinPreferences.quiet
                ? t('traveler.prefQuiet')
                : t('traveler.prefConversation'),
            },
            {
              label: t('traveler.music'),
              value:
                active.cabinPreferences.music === 'Traveler Choice'
                  ? t('traveler.prefTravelerChoice')
                  : t('traveler.prefMusicNone'),
            },
            {
              label: t('traveler.additionalRequests'),
              value:
                [
                  active.cabinPreferences.charging ? t('traveler.charger') : null,
                  active.cabinPreferences.luggage ? t('traveler.luggage') : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || t('traveler.noneRequested'),
            },
          ].map((item, i) => (
            <View key={item.label} style={[styles.prefRow, i > 0 && styles.prefHair]}>
              <Text style={styles.prefLabel}>{item.label}</Text>
              <Text style={styles.prefValue}>{item.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={{ flex: 1 }} />
      {/* A paid no-show control must follow the real server release gate.
          During OFF/unreadable configuration the existing Operator withdrawal
          remains available; do not invite a tap that only returns 503. */}
      {arrived && active.rideId && !active.teen && payConfig.verifiedNoShowEnabled === true ? (
        <View style={styles.waitArea}>
          <Text style={styles.waitText}>
            {waitSeconds === null
              ? t('operatorNoShow.waitUnconfirmed')
              : waitSeconds > 0
                ? t('operatorNoShow.countdown',{time:`${Math.floor(waitSeconds/60)}:${String(waitSeconds%60).padStart(2,'0')}`})
                : t('operatorNoShow.contactFirst')}
          </Text>
          {waitSeconds === 0 ? (
            <Pressable accessibilityRole="button"
              disabled={transitioning}
              onPress={() => Alert.alert(t('operatorNoShow.title'),
                t('operatorNoShow.confirm'),[
                  {text:t('operatorNoShow.continue'),style:'cancel'},
                  {text:t('operatorNoShow.record'),style:'destructive',onPress:async()=>{
                    setTransitioning(true);setTransitionError(null);
                    try {
                      const result=await op.noShowOp();
                      if(result.ok) {
                        Alert.alert(t('operatorNoShow.closed'),result.refundPending
                          ? t('operatorNoShow.refundPending')
                          : result.operatorPaymentPending
                            ? t('operatorNoShow.compensationPending')
                            : t('operatorNoShow.paymentReconciled'));
                        router.replace('/operator');
                      } else {
                        setTransitionError(result.code==='operator_contact_required'
                          ? t('operatorNoShow.messageRequired')
                          : result.code==='no_show_not_commissioned'
                            ? t('operatorNoShow.unavailable')
                            : t('operatorNoShow.unverified'));
                      }
                    } finally {setTransitioning(false);}
                  }},
                ])}
              style={styles.noShowAction}>
              <Text style={styles.noShowLabel}>{t('operatorNoShow.action')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {transitionError ? <Text style={styles.error}>{transitionError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={transitioning}
        onPress={() => Alert.alert(
          t('operator.withdrawTravel'), t('operator.withdrawExplanation'), [
            {text:t('traveler.keepTravel'),style:'cancel'},
            {text:t('operator.withdrawTravel'),style:'destructive',onPress:async () => {
              setTransitioning(true);
              setTransitionError(null);
              try {
                const result = await op.withdrawAcceptedOp();
                if (result.ok) router.replace('/operator');
                else setTransitionError(t('operator.withdrawFailed'));
              } catch {
                setTransitionError(t('operator.withdrawFailed'));
              } finally {
                setTransitioning(false);
              }
            }},
          ])}
        style={{ alignSelf:'center', minHeight:44, justifyContent:'center', marginTop:14 }}
      >
        <Text style={{ color:colors.muted, fontSize:14 }}>
          {t('operator.withdrawTravel')}
        </Text>
      </Pressable>

      {!arrived ? (
        <PrimaryButton testID="operator-confirm-arrival" label={transitioning ? t('traveler.pleaseWait') : t('operator.confirmArrival')} disabled={transitioning} onPress={async () => { setTransitioning(true); setTransitionError(null); const ok = await op.confirmArrival(); setTransitioning(false); if (!ok) setTransitionError(t('traveler.errGeneric')); }} style={{ marginTop: 24 }} />
      ) : (
        <PrimaryButton
          testID="operator-commence-travel"
          label={t('operator.commenceTravel')}
          color={colors.green}
          disabled={transitioning}
          onPress={async () => {
            setTransitioning(true); setTransitionError(null);
            try {
              if (active.teen && !/^\d{4}$/.test(pickupEntry)) {
                setTransitionError(t('operator.enterPrivatePickupCode'));return;
              }
              const ok = await op.beginTrip(active.teen ? pickupEntry : undefined);
              if (ok) router.replace('/operator/trip');
              else setTransitionError(t('traveler.errGeneric'));
            } catch {
              setTransitionError(t('traveler.pickupCodeUnavailable'));
            } finally { setTransitioning(false); }
          }}
          style={{ marginTop: 24 }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontSize: 15, fontWeight: '500', color: colors.ink },
  error: { fontSize: 13.5, color: colors.red, marginTop: 10 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.44, color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 21 },
  etaPill: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  travelerCard: { marginTop: 14, paddingVertical: 16, paddingHorizontal: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  travelerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  travelerName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  travelerSub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  contact: { fontSize: 14, fontWeight: '500', color: colors.blue },
  waitArea:{marginTop:20,gap:12},
  waitText:{fontSize:12.5,color:colors.muted,lineHeight:19},
  noShowAction:{alignSelf:'flex-start',minHeight:44,justifyContent:'center',paddingVertical:8},
  noShowLabel:{fontSize:14,fontWeight:'500',color:colors.ink},
  codeCard: { marginTop: 12, paddingVertical: 16, paddingHorizontal: 18 },
  codeBody: { fontSize: 12.5, color: colors.muted, marginTop: 8, lineHeight: 18 },
  prefsCard: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 1 },
  prefRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  prefHair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  prefLabel: { fontSize: 13.5, color: colors.muted, flexShrink: 0 },
  prefValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 19,
    textAlign: 'right',
  },
});
