import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { updatePassword } from 'firebase/auth';
import { Text } from '../src/components/AppText';
import { Card, LetterheadBar, PrimaryButton, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import { useGoBack } from '../src/components/nav';
import { useAuth } from '../src/state/AuthContext';
import { useLanguage } from '../src/state/LanguageContext';
import { accountAuthProvider, reauthenticateWithPassword } from '../src/state/accountDeletion';
import { googleSignInConfigured } from '../src/state/googleSignIn';
import { colors } from '../src/theme';

const MIN_PASSWORD = 15;

function SecretField({
  label,
  value,
  onChangeText,
  autoComplete,
  textContentType,
  t,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  textContentType: 'password' | 'newPassword';
  t: (key: string) => string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.secretWrap}>
      <View style={styles.secretLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.showHide}>{visible ? t('traveler.hidePassword') : t('traveler.showPassword')}</Text>
        </Pressable>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        maxLength={128}
        style={styles.field}
      />
    </View>
  );
}

export default function AccountSecurity() {
  const goBack = useGoBack();
  const router = useRouter();
  const { t } = useLanguage();
  const { user, busy, resendEmailVerification, resetPassword } = useAuth();

  const provider = useMemo(
    () =>
      accountAuthProvider(
        user?.providerData.map((p) => p.providerId) ?? [],
        { apple: Platform.OS === 'ios', google: googleSignInConfigured },
      ),
    [user?.providerData],
  );

  const [mode, setMode] = useState<'idle' | 'password'>('idle');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const clearMessages = () => {
    setNotice('');
    setError('');
  };

  const resendVerification = async () => {
    clearMessages();
    const ok = await resendEmailVerification();
    if (ok) setNotice(t('traveler.emailVerificationSent'));
    else setError(t('traveler.emailVerificationFailed'));
  };

  const sendReset = async () => {
    clearMessages();
    if (!user?.email) return;
    const ok = await resetPassword(user.email);
    if (ok) setNotice(t('traveler.passwordResetSent', { email: user.email }));
    else setError(t('traveler.passwordResetFailed'));
  };

  const changePassword = async () => {
    clearMessages();
    if (!user || provider !== 'password') return;
    if (newPassword.length < MIN_PASSWORD) {
      setError(t('traveler.passwordMinLength', { n: MIN_PASSWORD }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('traveler.passwordsDoNotMatch'));
      return;
    }
    try {
      await reauthenticateWithPassword(user, currentPassword);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMode('idle');
      setNotice(t('traveler.passwordChanged'));
    } catch {
      setError(t('traveler.passwordChangeFailed'));
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title size={24}>{t('traveler.signInSecurity')}</Title>
      <Sub>{t('traveler.signInSecuritySub')}</Sub>

      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.emailAddressTitle')}</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.rowBlock}>
          <Text style={styles.value}>{user?.email || t('traveler.notSet')}</Text>
          {user?.email ? (
            <Text style={styles.state}>
              {user.emailVerified ? t('traveler.verified') : t('traveler.verificationRequired')}
            </Text>
          ) : null}
        </View>
        {!user?.emailVerified && provider === 'password' ? (
          <Pressable onPress={resendVerification} disabled={busy} accessibilityRole="button">
            <View style={[styles.actionRow, styles.hair]}>
              <Text style={styles.action}>{t('traveler.sendVerificationEmail')}</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.navigate('/account-email')} accessibilityRole="button">
            <View style={[styles.actionRow, styles.hair]}>
              <Text style={styles.action}>{t('traveler.changeEmail')}</Text>
              <Text style={styles.chev}>›</Text>
            </View>
          </Pressable>
      </Card>

      {provider === 'password' ? (
        <>
          <SectionLabel style={{ marginTop: 24 }}>{t('traveler.password')}</SectionLabel>
          <Card style={styles.card}>
            <Pressable onPress={() => { clearMessages(); setMode(mode === 'password' ? 'idle' : 'password'); }} accessibilityRole="button">
              <View style={styles.actionRow}>
                <Text style={styles.action}>{t('traveler.changePassword')}</Text>
                <Text style={styles.chev}>›</Text>
              </View>
            </Pressable>
            <Pressable onPress={sendReset} disabled={busy} accessibilityRole="button">
              <View style={[styles.actionRow, styles.hair]}>
                <Text style={styles.action}>{t('traveler.forgotCurrentPassword')}</Text>
                <Text style={styles.chev}>›</Text>
              </View>
            </Pressable>
          </Card>
        </>
      ) : (
        <>
          <SectionLabel style={{ marginTop: 24 }}>{t('traveler.signInMethod')}</SectionLabel>
          <Card style={styles.managedCard}>
            <Text style={styles.managedTitle}>
              {provider === 'apple' ? t('auth.continueWithApple')
                : provider === 'google' ? t('auth.continueWithGoogle')
                : t('traveler.signInMethod')}
            </Text>
            <Text style={styles.managedBody}>
              {t(provider === 'apple' ? 'traveler.emailManagedApple'
                : provider === 'google' ? 'traveler.emailManagedGoogle'
                : 'traveler.emailManagedUnsupported')}
            </Text>
          </Card>
        </>
      )}

      {provider === 'password' && mode === 'password' ? (
        <Card style={styles.formCard}>
          <SecretField
            label={t('traveler.currentPassword')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoComplete="current-password"
            textContentType="password"
            t={t}
          />
          <View style={styles.hair} />
          <SecretField
            label={t('traveler.newPassword')}
            value={newPassword}
            onChangeText={setNewPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            t={t}
          />
          <View style={styles.hair} />
          <SecretField
            label={t('traveler.confirmNewPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            t={t}
          />
          <Sub style={styles.note}>{t('traveler.passwordGuidance', { n: MIN_PASSWORD })}</Sub>
          <PrimaryButton
            label={t('traveler.saveNewPassword')}
            disabled={!currentPassword || newPassword.length < MIN_PASSWORD || newPassword !== confirmPassword}
            onPress={changePassword}
            style={styles.formButton}
          />
        </Card>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 1 },
  rowBlock: { paddingVertical: 14 },
  value: { fontSize: 15, fontWeight: '600', color: colors.ink },
  state: { fontSize: 12, color: colors.muted, marginTop: 3 },
  actionRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  action: { fontSize: 14.5, color: colors.ink },
  chev: { fontSize: 18, color: colors.faint },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  formCard: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 1 },
  fieldWrap: { paddingVertical: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, color: colors.muted, textTransform: 'uppercase' },
  field: { paddingTop: 8, paddingBottom: 2, fontSize: 16, color: colors.ink },
  secretWrap: { paddingVertical: 12 },
  secretLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  showHide: { fontSize: 12.5, fontWeight: '600', color: colors.accent },
  note: { marginTop: 10, marginBottom: 2 },
  formButton: { marginTop: 16, marginBottom: 14, paddingVertical: 15 },
  managedCard: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 16 },
  managedTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  managedBody: { fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 4 },
  notice: { fontSize: 13, color: colors.ink2, lineHeight: 19, marginTop: 14 },
  error: { fontSize: 13, color: colors.red, lineHeight: 19, marginTop: 14 },
});
