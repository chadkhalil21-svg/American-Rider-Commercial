import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const { user, busy, resendEmailVerification, requestEmailChange, refreshEmailStatus, resetPassword } = useAuth();
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

  // Local account-scoped reminder survives app restart; never store a password.
  // Every ar: account key is wiped by the existing sign-out/delete routine.
  const pendingKey = user?.uid ? `ar:email-change-pending:${user.uid}` : null;
  useEffect(() => {
    if (!pendingKey) return;
    let active = true;
    void AsyncStorage.getItem(pendingKey).then(value => {
      if (active && value) setPendingEmail(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [pendingKey]);

  const requestedEmail = nextEmail.trim();
  const sameEmail = requestedEmail.length > 0 &&
    requestedEmail.toLowerCase() === (user?.email || '').trim().toLowerCase();
  const canSubmit = provider === 'password' && emailOk(requestedEmail) &&
    !sameEmail && password.length > 0 && !busy && !pendingEmail;

  // A sent link is only pending. The account's Firebase identity remains the
  // source of truth; never mark an email changed just because an email was sent.
  useEffect(() => {
    if (pendingEmail && user?.email?.toLowerCase() === pendingEmail.toLowerCase() &&
        user.emailVerified) {
      setConfirmedEmail(pendingEmail);
      setPendingEmail('');
      if (pendingKey) void AsyncStorage.removeItem(pendingKey).catch(() => {});
      setNotice('');
      setError('');
    }
  }, [pendingEmail, user?.email, user?.emailVerified]);

  const checkStatus = async (manual: boolean) => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    lastRefresh.current = Date.now();
    if (manual) { setCheckingStatus(true); setError(''); setNotice(''); }
    try {
      const refreshed = await refreshFn.current();
      if (!refreshed && manual) setError(t('traveler.emailRefreshFailed'));
      if (refreshed && manual && pendingEmail) setNotice(t('traveler.emailStillPending'));
    } finally {
      refreshLock.current = false;
      if (manual) setCheckingStatus(false);
    }
  };
  const checkRef = useRef(checkStatus);
  checkRef.current = checkStatus;
  useFocusEffect(useCallback(() => {
    void checkRef.current(false);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastRefresh.current > 15000)
        void checkRef.current(false);
    });
    return () => subscription.remove();
  }, []));

  const resend = async () => {
    setError('');
    setNotice('');
    const ok = await resendEmailVerification();
    setNotice(ok ? t('traveler.emailVerificationSent') : '');
    if (!ok) setError(t('traveler.emailVerificationFailed'));
  };

  const change = async () => {
    if (!user || !canSubmit || requestLock.current) return;
    requestLock.current = true;
    setError('');
    setNotice('');
    Keyboard.dismiss();
    const requested = requestedEmail;
    try {
      const ok = await requestEmailChange(requested, () => reauthenticateWithPassword(user, password));
      // Never retain the credential after the request, successful or not.
      setPassword('');
      setShowPassword(false);
      if (ok) {
        setPendingEmail(requested);
        if (pendingKey) void AsyncStorage.setItem(pendingKey, requested).catch(() => {});
        setNextEmail('');
        setEmailTouched(false);
        setConfirmedEmail('');
      } else {
        setError(t('traveler.emailChangeFailed'));
      }
    } finally {
      requestLock.current = false;
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

      {provider === 'password' && pendingEmail ? (
        <Card style={styles.managedCard}>
          <Text style={styles.managedTitle}>{t('traveler.emailPendingTitle')}</Text>
          <Text selectable style={styles.pendingAddress}>{pendingEmail}</Text>
          <Text style={styles.managedBody}>{t('traveler.emailChangeSent', { email: pendingEmail })}</Text>
          <Text style={styles.managedBody}>{t('traveler.emailPendingDescription')}</Text>
          <Pressable accessibilityRole="button" style={styles.secondaryAction} onPress={() => void checkStatus(true)}>
            <Text style={styles.link}>{checkingStatus ? t('traveler.busyChecking') : t('traveler.emailCheckStatus')}</Text>
          </Pressable>
          <Text style={styles.managedBody}>{t('traveler.emailNotReceived')}</Text>
          <Pressable accessibilityRole="button" style={styles.secondaryAction}
            onPress={() => { setNextEmail(pendingEmail); setPendingEmail(''); if (pendingKey) void AsyncStorage.removeItem(pendingKey).catch(() => {}); setPassword(''); setError(''); setNotice(''); }}>
            <Text style={styles.link}>{t('traveler.emailEditRequest')}</Text>
          </Pressable>
        </Card>
      ) : provider === 'password' && confirmedEmail ? (
        <Card style={styles.managedCard}>
          <Text style={styles.managedTitle}>{t('traveler.emailChangedTitle')}</Text>
          <Text selectable style={styles.pendingAddress}>{confirmedEmail}</Text>
        </Card>
      ) : provider === 'password' ? (
        <>
          <SectionLabel style={{ marginTop: 24 }}>{t('traveler.changeEmail')}</SectionLabel>
          <Card style={styles.fieldCard}>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('traveler.newEmail')}</Text>
              <TextInput
                value={nextEmail}
                onChangeText={(value) => { setNextEmail(value); setError(''); }}
                onBlur={() => setEmailTouched(true)}
                accessibilityLabel={t('traveler.newEmail')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="name@example.com"
                placeholderTextColor={colors.faint}
                style={styles.field}
              />
              {emailTouched && requestedEmail.length > 0 && (!emailOk(requestedEmail) || sameEmail) ? (
                <Text style={styles.fieldError}>
                  {sameEmail ? t('traveler.emailSameAddress') : t('traveler.errInvalidEmail')}
                </Text>
              ) : null}
            </View>
            <View style={[styles.fieldWrap, styles.hair]}>
              <Text style={styles.fieldLabel}>{t('auth.passwordLabel')}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                accessibilityLabel={t('auth.passwordLabel')}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                placeholder={t('traveler.yourPasswordPh')}
                placeholderTextColor={colors.faint}
                style={styles.field}
                onSubmitEditing={() => void change()}
              />
              <Pressable accessibilityRole="button" style={styles.secondaryAction}
                onPress={() => setShowPassword(v => !v)}>
                <Text style={styles.link}>
                  {t(showPassword ? 'traveler.hidePassword' : 'traveler.showPassword')}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.secondaryAction}
                disabled={busy || !user?.email}
                onPress={async () => {
                  if (!user?.email || busy || requestLock.current) return;
                  requestLock.current = true;
                  setError('');
                  setNotice('');
                  try {
                    const ok = await resetPassword(user.email);
                    if (ok) setNotice(t('traveler.passwordResetSent', { email: user.email }));
                    else setError(t('traveler.passwordResetFailed'));
                  } finally {
                    requestLock.current = false;
                  }
                }}>
                <Text style={styles.link}>{t('auth.forgotPassword')}</Text>
              </Pressable>
            </View>
          </Card>
          <Sub style={styles.note}>{t('traveler.emailChangeNote')}</Sub>
        </>
      ) : (
        <Card style={styles.managedCard}>
          <Text style={styles.managedTitle}>{t('traveler.emailManagedTitle')}</Text>
          <Text style={styles.managedBody}>
            {t(provider === 'apple' ? 'traveler.emailManagedApple'
              : provider === 'google' ? 'traveler.emailManagedGoogle'
              : 'traveler.emailManagedUnsupported')}
          </Text>
          <Pressable accessibilityRole="button" style={styles.secondaryAction}
            onPress={() => router.navigate('/issues')}>
            <Text style={styles.link}>{t('traveler.contactPatronSupport')} ›</Text>
          </Pressable>
        </Card>
      )}

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {provider === 'password' && !pendingEmail && !confirmedEmail ? (
        <>
          <View style={{ flex: 1, minHeight: 30 }} />
          <PrimaryButton
            label={busy ? t('traveler.busyChecking') : t('traveler.emailSendChangeLink')}
            disabled={!canSubmit}
            onPress={change}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  currentCard: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 15 },
  currentValue: { fontSize: 15, fontWeight: '600', color: colors.ink },
  state: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  link: { fontSize: 14, fontWeight: '600', color: colors.accent, marginTop: 12 },
  fieldCard: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 1 },
  fieldWrap: { paddingVertical: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, color: colors.ink2, textTransform: 'uppercase' },
  field: { paddingTop: 8, paddingBottom: 2, fontSize: 16, color: colors.ink },
  fieldError: { fontSize: 12, lineHeight: 17, color: colors.red, marginTop: 7 },
  secondaryAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8 },
  pendingAddress: { fontSize: 14, fontWeight: '600', color: colors.ink, marginTop: 9 },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  note: { marginTop: 10, color: colors.ink2 },
  managedCard: { marginTop: 24, paddingHorizontal: 18, paddingVertical: 16 },
  managedTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  managedBody: { fontSize: 12.5, color: colors.ink2, lineHeight: 18, marginTop: 4 },
  notice: { fontSize: 13, color: colors.ink2, lineHeight: 19, marginTop: 14 },
  error: { fontSize: 13, color: colors.red, lineHeight: 19, marginTop: 14 },
});
