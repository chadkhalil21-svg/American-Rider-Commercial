import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Card, LetterheadBar, PrimaryButton, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import { useGoBack } from '../src/components/nav';
import { useAuth } from '../src/state/AuthContext';
import { useLanguage } from '../src/state/LanguageContext';
import { db } from '../src/firebase';
import { colors } from '../src/theme';

function normalizeMobile(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return raw;
}

export default function AccountMobile() {
  const goBack = useGoBack();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!user?.uid) {
      setLoadState('unavailable');
      return () => { active = false; };
    }
    setLoadState('loading');
    setError('');
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!active) return;
        const m = snap.data()?.mobile;
        const existing = typeof m === 'string' ? m.trim() : '';
        setCurrent(existing);
        setPhone(existing);
        setLoadState('ready');
      })
      .catch(() => {
        if (active) setLoadState('unavailable');
      });
    return () => { active = false; };
  }, [user?.uid, reloadCount]);

  const save = async () => {
    if (!user?.uid || busy || loadState !== 'ready') return;
    const clean = normalizeMobile(phone);
    const digits = clean.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      setError(t('traveler.mobileInvalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setDoc(doc(db, 'users', user.uid), { mobile: clean }, { merge: true });
      goBack();
    } catch {
      setError(t('traveler.couldNotSaveConn'));
    } finally {
      setBusy(false);
    }
  };

  const changed = normalizeMobile(phone) !== normalizeMobile(current);

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title size={24}>{t('traveler.changeMobileTitle')}</Title>
      <Sub>{t('traveler.mobileContactSub')}</Sub>

      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.mobileNumber')}</SectionLabel>
      <Card style={styles.fieldCard}>
        <TextInput
          style={styles.field}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="+1 (305) 555-0148"
          placeholderTextColor={colors.faint}
          autoFocus={loadState === 'ready'}
          editable={loadState === 'ready' && !busy}
          returnKeyType="done"
          onSubmitEditing={save}
        />
      </Card>
      {loadState === 'loading' ? (
        <Sub style={styles.note}>{t('traveler.busyChecking')}</Sub>
      ) : loadState === 'unavailable' ? (
        <View style={styles.loadError}>
          <Sub style={styles.error}>{t('traveler.mobileReadUnavailable')}</Sub>
          <Pressable accessibilityRole="button" style={styles.retry}
            onPress={() => setReloadCount(n => n + 1)}>
            <Sub>{t('traveler.tryAgain')} ›</Sub>
          </Pressable>
        </View>
      ) : null}
      <Sub style={styles.note}>{t('traveler.mobileContactNote')}</Sub>
      {error ? <Sub style={styles.error}>{error}</Sub> : null}

      <View style={{ flex: 1, minHeight: 30 }} />
      <PrimaryButton
        label={busy ? t('traveler.busySaving') : t('traveler.save')}
        disabled={busy || loadState !== 'ready' || !phone.trim() || !changed}
        onPress={save}
        style={{ paddingVertical: 16 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldCard: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 1 },
  field: { paddingVertical: 15, fontSize: 16, color: colors.ink },
  note: { marginTop: 10 },
  error: { color: colors.red, marginTop: 10 },
  loadError: { marginTop: 10 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
});
