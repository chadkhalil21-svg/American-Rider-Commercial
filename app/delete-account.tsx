// Delete Account — Apple requires an in-app way to permanently delete an account
// (App Store Review Guideline 5.1.1(v)), and it must be as easy to find as sign-out.
//
// The demo has no such screen, so this is new territory: built in the demo's system
// (letterhead bar, Title/Sub, cards, section labels, ink field) and written in the
// institutional voice. A permanent act earns a full explanation before it happens —
// what goes, what stays, and why we keep what we keep.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useGoBack } from '../src/components/nav';
import { Card, LetterheadBar, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import { useAuth } from '../src/state/AuthContext';
import { useLanguage } from '../src/state/LanguageContext';
import {
  accountAuthProvider,
  providerResultError,
  reauthenticateWithPassword,
} from '../src/state/accountDeletion';
import { reauthenticateWithApple } from '../src/state/appleSignIn';
import { googleSignInConfigured, useGoogleSignIn } from '../src/state/googleSignIn';
import { colors } from '../src/theme';

function GoogleDeleteConfirmation({
  busy,
  onCancel,
  onDelete,
  t,
}: {
  busy: boolean;
  onCancel: () => void;
  onDelete: (reauthenticate: () => Promise<void>) => void;
  t: (key: string) => string;
}) {
  const google = useGoogleSignIn();
  return (
    <ConfirmationButtons
      busy={busy}
      enabled={google.ready}
      onCancel={onCancel}
      onDelete={() => onDelete(async () => {
        const result = await google.reauthenticate();
        if (!result.ok) throw providerResultError(result);
      })}
      t={t}
    />
  );
}

function ConfirmationButtons({ busy, enabled = true, onCancel, onDelete, t }: {
  busy: boolean;
  enabled?: boolean;
  onCancel: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.confirmBlock}>
      <Text style={styles.confirmAsk}>{t('traveler.deleteConfirm')}</Text>
      <View style={styles.confirmRow}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.keepBtn, pressed && { opacity: 0.86 }]}>
          <Text style={styles.keepBtnText}>{t('traveler.keepMyAccount')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button"
          onPress={onDelete}
          disabled={busy || !enabled}
          style={({ pressed }) => [styles.redBtnHalf, (!enabled || busy) && styles.disabled, pressed && enabled && !busy && { opacity: 0.86 }]}
        >
          <Text style={styles.confirmDeleteText}>{busy ? t('traveler.deleting') : t('traveler.yesDelete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DeleteAccount() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const { user, deleteAccount, busy } = useAuth();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = accountAuthProvider(
    user?.providerData.map((p) => p.providerId) ?? [],
    { apple: Platform.OS === 'ios', google: googleSignInConfigured },
  );
  const deleteDisabled = (provider === 'password' && !password) || provider === 'unsupported';

  const submit = async (reauthenticate: () => Promise<void>) => {
    if (busy) return;
    setError(null);
    try {
      await deleteAccount(reauthenticate);
      // The auth listener drops us back at the front door on success; dismiss any
      // stack we were sitting on so there is nothing to return to.
      router.dismissAll();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      setError(
        code === 'auth/reauthentication-cancelled'
          ? t('traveler.errReauthenticationCancelled')
          : code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? t('traveler.errPasswordMismatch')
          : code === 'auth/too-many-requests'
            ? t('traveler.errTooManyAttempts')
            : t('traveler.errDeleteFailed'),
      );
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      {/* The screen carries the name of the row that opens it (Chad, 19 Sept 2026). The BUTTON
          below keeps "Delete Account": a row names where it goes, a button names what it does,
          and "Account Termination Protocol" on a button would name neither. */}
      <Title size={24}>{t('traveler.acctTermination')}</Title>
      <Sub>{t('traveler.permanentRead')}</Sub>

      <SectionLabel style={styles.lbl}>{t('traveler.whatIsDeleted')}</SectionLabel>
      <Card style={styles.card}>
        {/* THESE TWO HEADINGS WERE ENGLISH IN ALL FIVE LANGUAGES. 'Your account' and 'Your
            travel history' were written into this array as literals, so a French or German
            traveler read them in English on the one screen where they are deciding whether we
            can be trusted with their data. check-untranslated.mjs did not catch them because a
            bare string inside an array is not a text node it inspects. */}
        {[
          [t('traveler.delCredentials'), t('traveler.delSignInDetails')],
          [t('traveler.delTravelRecords'), t('traveler.delEveryTrip')],
          [
            t('traveler.delEverythingDevice'),
            t('traveler.delSavedPrefs'),
          ],
        ].map(([title, sub], i) => (
          <View key={title} style={[styles.block, i > 0 && styles.hair]}>
            <Text style={styles.blockTitle}>{title}</Text>
            <Text style={styles.blockSub}>{sub}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.whatIsKept')}</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t('traveler.anonymousRecords')}</Text>
          <Text style={styles.blockSub}>
            {t('traveler.deletionRecordKept')}
          </Text>
        </View>
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.confirmItIsYou')}</SectionLabel>
      {provider === 'password' ? (
        <Card style={styles.fieldCard}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>{t('auth.passwordLabel')}</Text>
            <TextInput
              style={styles.field}
              placeholder={t('traveler.yourPasswordPh')}
              placeholderTextColor={colors.faint}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => password && setConfirming(true)}
            />
          </View>
        </Card>
      ) : (
        <Card style={styles.card}>
          <View style={styles.block}>
            <Text style={styles.blockSub}>
              {provider === 'apple'
                ? t('traveler.deleteConfirmApple')
                : provider === 'google'
                  ? t('traveler.deleteConfirmGoogle')
                  : t('traveler.errDeleteProvider')}
            </Text>
          </View>
        </Card>
      )}
      <Text style={styles.note}>{t('traveler.signedInAs', { email: user?.email ?? '' })}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!confirming ? (
        <>
          <Pressable accessibilityRole="button"
            onPress={() => setConfirming(true)}
            disabled={deleteDisabled}
            accessibilityState={{ disabled: deleteDisabled }}
            style={({ pressed }) => [
              styles.redBtn,
              deleteDisabled && styles.disabled,
              pressed && !deleteDisabled && { opacity: 0.86 },
            ]}
          >
            <Text style={[styles.redBtnText, deleteDisabled && { color: colors.faint }]}>
              {t('traveler.deleteAccount')}
            </Text>
          </Pressable>
          {/* WHILE THE CONTROL IS OFF IT SAYS WHAT IS MISSING (Chad, 19 Sept 2026: the faint
              control "looks broken or disabled rather than an intentional action"). It was
              disabled, correctly — a password is required — but nothing on the screen said so,
              so the only reading available was that the app was broken at the last step of an
              irreversible act. Same pattern the disclosure gate uses with "Open all 3 parts to
              continue". The control was also only visually disabled: it carried no `disabled`
              prop and no accessibility state, so VoiceOver announced it as an available button
              and a tap was silently swallowed by the `password &&` guard. */}
          {provider === 'password' && !password ? (
            <Text style={styles.needPassword}>{t('traveler.delNeedPassword')}</Text>
          ) : null}
        </>
      ) : provider === 'google' ? (
        <GoogleDeleteConfirmation
          busy={busy}
          onCancel={() => setConfirming(false)}
          onDelete={submit}
          t={t}
        />
      ) : (
        <ConfirmationButtons
          busy={busy}
          onCancel={() => setConfirming(false)}
          onDelete={() => submit(async () => {
            if (provider === 'password') {
              if (!user) throw providerResultError({ ok: false });
              await reauthenticateWithPassword(user, password);
              return;
            }
            const result = await reauthenticateWithApple();
            if (!result.ok) throw providerResultError(result);
          })}
          t={t}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 22, marginBottom: 10 },
  card: { paddingHorizontal: 18, paddingVertical: 1 },
  block: { paddingVertical: 13.5 },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  blockTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  blockSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  fieldCard: { paddingHorizontal: 18, paddingVertical: 1 },
  fieldWrap: { paddingTop: 14, paddingBottom: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, color: colors.muted },
  field: { paddingVertical: 12, fontSize: 16, color: colors.ink },
  note: { fontSize: 12, color: colors.faint, marginTop: 10 },
  // Centred under the control it explains, in muted rather than faint: it is the reason
  // the button above is off, so it has to be readable. muted on paper is the same value
  // the rest of the app uses for supporting text.
  needPassword: { fontSize: 12.5, color: colors.muted, marginTop: 10, textAlign: 'center' },
  error: { fontSize: 13.5, color: colors.red, marginTop: 14 },
  // The app's only other red button is Call 911; deletion earns the same weight.
  redBtn: {
    marginTop: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 13,
    padding: 18,
    alignItems: 'center',
  },
  redBtnHalf: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 13,
    padding: 16,
    alignItems: 'center',
  },
  // INK. This button opens the confirmation; it is not the confirmation. Chad, 19 Sept 2026:
  // "Red is strictly reserved for Call 911 and the final confirmation button inside the
  // termination modal." redBtnHalfText below is that final button and keeps the red.
  redBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, color: colors.ink },
  // THE ONE RED CONTROL ON THIS SCREEN, and one of only two in the application — the other is
  // Call 911. This is the final confirmation of account termination, which is what Chad's rule
  // names. The button above it opens this; it does not perform it.
  confirmDeleteText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, color: colors.red },
  disabled: { borderColor: colors.border },
  confirmBlock: { marginTop: 24 },
  confirmAsk: { fontSize: 14, color: colors.ink, lineHeight: 21, marginBottom: 14 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  keepBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: 13,
    padding: 16,
    alignItems: 'center',
  },
  keepBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, color: '#fff' },
});
