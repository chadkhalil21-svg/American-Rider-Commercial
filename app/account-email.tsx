import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppState, Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { Card, LetterheadBar, PrimaryButton, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import { useGoBack } from '../src/components/nav';
import { useAuth } from '../src/state/AuthContext';
import { useLanguage } from '../src/state/LanguageContext';
import { accountAuthProvider, reauthenticateWithPassword } from '../src/state/accountDeletion';
import { googleSignInConfigured } from '../src/state/googleSignIn';
import { colors } from '../src/theme';

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function AccountEmail() {
  const goBack = useGoBack();
  const router = useRouter();
  const { t } = useLanguage();
  const { user, busy, resendEmailVerification, requestEmailChange, refreshEmailStatus } = useAuth();
  const [nextEmail, setNextEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const requestLock = useRef(false);
  const refreshLock = useRef(false);
  const lastRefresh = useRef(0);
  const refreshFn = useRef(refreshEmailStatus);
  refreshFn.current = refreshEmailStatus;

  const provider = useMemo(
    () =>
      accountAuthProvider(
        user?.providerData.map((p) => p.providerId) ?? [],
        { apple: Platform.OS === 'ios', google: googleSignInConfigured },
      ),
    [user?.providerData],
  );

  const resend = async () => {
    setError('');
    setNotice('');
    const ok = await resendEmailVerification();
    setNotice(ok ? t('traveler.emailVerificationSent') : '');
    if (!ok) setError(t('traveler.emailVerificationFailed'));
  };

  const change = async () => {
    if (!user || provider !== 'password' || !emailOk(nextEmail) || !password || busy) return;
    setError('');
    setNotice('');
    const ok = await requestEmailChange(nextEmail, () => reauthenticateWithPassword(user, password));
    if (ok) {
      setNotice(t('traveler.emailChangeSent', { email: nextEmail.trim() }));
      setNextEmail('');
      setPassword('');
    } else {
      setError(t('traveler.emailChangeFailed'));
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title size={24}>{t('traveler.emailAddressTitle')}</Title>
      <Sub>{t('traveler.emailIdentitySub')}</Sub>

      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.currentEmail')}</SectionLabel>
      <Card style={styles.currentCard}>
        <Text style={styles.currentValue}>{user?.email || t('traveler.notSet')}</Text>
        {user?.email ? (
          <Text style={styles.state}>
            {user.emailVerified ? t('traveler.verified') : t('traveler.verificationRequired')}
          </Text>
        ) : null}
      </Card>

      {!user?.emailVerified && provider === 'password' ? (
        <Pressable onPress={resend} disabled={busy} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>{t('traveler.sendVerificationEmail')}</Text>
        </Pressable>
      ) : null}

      {provider === 'password' ? (
        <>
          <SectionLabel style={{ marginTop: 24 }}>{t('traveler.changeEmail')}</SectionLabel>
          <Card style={styles.fieldCard}>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('traveler.newEmail')}</Text>
              <TextInput
                value={nextEmail}
                onChangeText={setNextEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="name@example.com"
                placeholderTextColor={colors.faint}
                style={styles.field}
              />
            </View>
            <View style={[styles.fieldWrap, styles.hair]}>
              <Text style={styles.fieldLabel}>{t('auth.passwordLabel')}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                placeholder={t('traveler.yourPasswordPh')}
                placeholderTextColor={colors.faint}
                style={styles.field}
                onSubmitEditing={change}
              />
            </View>
          </Card>
          <Sub style={styles.note}>{t('traveler.emailChangeNote')}</Sub>
        </>
      ) : (
        <Card style={styles.managedCard}>
          <Text style={styles.managedTitle}>{t('traveler.emailManagedTitle')}</Text>
          <Text style={styles.managedBody}>
            {provider === 'apple' ? t('traveler.emailManagedApple') : t('traveler.emailManagedGoogle')}
          </Text>
        </Card>
      )}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {provider === 'password' ? (
        <>
          <View style={{ flex: 1, minHeight: 30 }} />
          <PrimaryButton
            label={busy ? t('traveler.busyChecking') : t('traveler.emailSendChangeLink')}
            disabled={busy || !emailOk(nextEmail) || !password}
            onPress={change}
            style={{ paddingVertical: 16 }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  currentCard: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 15 },
  currentValue: { fontSize: 15, fontWeight: '600', color: colors.ink },
  state: { fontSize: 12, color: colors.muted, marginTop: 3 },
  link: { fontSize: 14, fontWeight: '600', color: colors.accent, marginTop: 12 },
  fieldCard: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 1 },
  fieldWrap: { paddingVertical: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, color: colors.muted, textTransform: 'uppercase' },
  field: { paddingTop: 8, paddingBottom: 2, fontSize: 16, color: colors.ink },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  note: { marginTop: 10 },
  managedCard: { marginTop: 24, paddingHorizontal: 18, paddingVertical: 16 },
  managedTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  managedBody: { fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 4 },
  notice: { fontSize: 13, color: colors.ink2, lineHeight: 19, marginTop: 14 },
  error: { fontSize: 13, color: colors.red, lineHeight: 19, marginTop: 14 },
});
