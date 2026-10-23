// The authenticated Teen's private pickup code. Never place this PIN in an Expo
// notification or trust a deep-link ride ID as authorization.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useGoBack } from '../src/components/nav';
import { fetchTeenPickupCode } from '../src/backend/family';
import { Card, LetterheadBar, Mono, PrimaryButton, Screen, Title } from '../src/components/UI';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';

export default function TeenPickupCode() {
  const { t } = useLanguage();
  const back = useGoBack();
  const params = useLocalSearchParams<{ rideId?: string }>();
  const rideId = typeof params.rideId === 'string' && /^[a-f0-9]{40}$/.test(params.rideId)
    ? params.rideId : '';
  const [code, setCode] = useState<string | null>(null);
  const currentRideId = useRef(rideId);
  currentRideId.current = rideId;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Never display a previous Travel's code when the route changes.
  useEffect(() => {
    setCode(null);
    setBusy(false);
    setFailed(false);
  }, [rideId]);

  const reveal = async () => {
    if (!rideId || busy) return;
    setBusy(true);
    setCode(null);
    setFailed(false);
    try {
      // The server independently checks verified authentication, Teen/guardian
      // membership, active ride state, PIN provision and attempt lockout.
      const privateCode = await fetchTeenPickupCode(rideId);
      if (currentRideId.current === rideId) setCode(privateCode);
    } catch {
      if (currentRideId.current === rideId) setFailed(true);
    } finally {
      if (currentRideId.current === rideId) setBusy(false);
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={back} />
      <Title>{t('traveler.familyPickupCode')}</Title>
      <Card style={styles.card}>
        <Text style={styles.help}>{t('traveler.familyPickupCodeHelp')}</Text>
        {code ? <View accessibilityRole="text" style={styles.code}>
          <Mono size={32}>{code}</Mono>
        </View> : null}
        {failed || !rideId ? <Text accessibilityRole="alert" style={styles.error}>
          {t('traveler.familyPickupCodeFailed')}
        </Text> : null}
        <PrimaryButton
          label={busy ? t('traveler.familyWorking') : code ? t('traveler.tryAgain') : t('traveler.familyPickupCode')}
          disabled={!rideId || busy}
          onPress={() => { void reveal(); }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 18, padding: 18, gap: 16 },
  help: { color: colors.ink2, fontSize: 14, lineHeight: 21 },
  code: { alignItems: 'center', paddingVertical: 8 },
  error: { color: colors.ink2, fontSize: 13 },
});
