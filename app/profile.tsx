// Account details — the screen about the account holder, stating only what the account knows.
//
// Chad, 14 September 2026, on the old build: a username minted from an email address, an
// initials disc, a "default payment" that decided nothing, and two cards on an empty screen.
// Now: the name the traveler gave (editable here, saved to the account) or the address the
// account is held under; the year the account was opened; home, work and favourite
// destinations; the saved cabin environment; trusted contacts; and payment methods.
//
// NOT HERE, because the app cannot say it truthfully: an honorific or a membership tier
// (none exist), a bank name or card digits (Stripe holds the instrument and chooses it in its
// sheet at payment), a portrait (nothing stores one), a corporate billing switch (not built).
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { loadContacts, type TrustedContact } from '../src/contacts';
import { useGoBack } from '../src/components/nav';
import { Card, Chev, LetterheadBar, Screen, SectionLabel } from '../src/components/UI';
import { loadSavedPlaces, MAX_FAVORITES, type SavedPlaces } from '../src/savedPlaces';
import { useAuth } from '../src/state/AuthContext';
import { useCabinPrefs } from '../src/state/cabinPrefs';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';
import { db } from '../src/firebase';

export default function Profile() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const { user, accountName } = useAuth();
  const cabin = useCabinPrefs();

  // Re-read on focus rather than once: a traveler returning from the editors must see what
  // they just set, not what was there when this screen mounted.
  const [places, setPlaces] = useState<SavedPlaces>({ favorites: [] });
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [mobile, setMobile] = useState('');
  useFocusEffect(
    useCallback(() => {
      let live = true;
      loadSavedPlaces().then((p) => live && setPlaces(p));
      loadContacts().then((c) => live && setContacts(c));
      if (user?.uid) {
        getDoc(doc(db, 'users', user.uid))
          .then((snap) => {
            if (!live || !snap.exists()) return;
            const value = snap.data()?.mobile;
            setMobile(typeof value === 'string' ? value.trim() : '');
          })
          .catch(() => {});
      }
      return () => {
        live = false;
      };
    }, [user?.uid]),
  );

  // The signed-in web review bypass has no Firebase account by design. Give that review surface
  // a clearly fictional but complete account record so the Account Details composition can be
  // judged as it appears for a real Traveler, rather than as an impossible half-created account.
  const webPreview =
    Platform.OS === 'web' &&
    process.env.EXPO_PUBLIC_AUTH_PREVIEW_BYPASS === '1' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'app';

  const givenName = user?.displayName?.trim() || accountName || (webPreview ? 'Preview Traveler' : '');
  const accountEmail = user?.email?.trim() || (webPreview ? 'traveler@americanrider.app' : '');
  const accountMobile = mobile || (webPreview ? '+1 (305) 555-0148' : '');
  const emailVerified = user?.emailVerified === true || webPreview;

  // THE YEAR THIS ACCOUNT WAS ACTUALLY OPENED, from Firebase — not a demonstration traveler's.
  const since = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).getFullYear()
    : null;

  const climateLabel = {
    Cool: t('traveler.prefCool'),
    Moderate: t('traveler.prefModerate'),
    Warm: t('traveler.prefWarm'),
  }[cabin.climate];
  const requests = [cabin.charging ? t('traveler.charger') : null, cabin.luggage ? t('traveler.luggage') : null]
    .filter((r): r is string => !!r);

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />

      <View style={styles.head}>
        <Text style={styles.name}>{t('traveler.accountDetails')}</Text>
        {since && <Text style={styles.since}>{t('traveler.travelerSince', { year: since })}</Text>}
      </View>

      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.account')}</SectionLabel>
      <Card style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/account-name')}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{t('traveler.nameLabel')}</Text>
            <View style={styles.valueNav}>
              <Text style={givenName ? styles.statValue : styles.notSet}>
                {givenName || t('traveler.addName')}
              </Text>
              <Chev />
            </View>
          </View>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.navigate('/account-email')}>
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowTitle}>{t('traveler.emailLabel')}</Text>
            <View style={styles.valueNav}>
              <View style={styles.valueStack}>
                <Text style={accountEmail ? styles.statValue : styles.notSet} numberOfLines={1}>
                  {accountEmail || t('traveler.notSet')}
                </Text>
                {accountEmail ? (
                  <Text style={styles.verification}>
                    {emailVerified ? t('traveler.verified') : t('traveler.verificationRequired')}
                  </Text>
                ) : null}
              </View>
              <Chev />
            </View>
          </View>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.navigate('/account-mobile')}>
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowTitle}>{t('traveler.mobileNumber')}</Text>
            <View style={styles.valueNav}>
              <View style={styles.valueStack}>
                <Text style={accountMobile ? styles.statValue : styles.notSet} numberOfLines={1}>
                  {accountMobile || t('traveler.addNumber')}
                </Text>
              </View>
              <Chev />
            </View>
          </View>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.navigate('/wallet')}>
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowTitle}>{t('traveler.paymentMethods')}</Text>
            <Chev />
          </View>
        </Pressable>
      </Card>

      {/* SAVED PLACES. A row a traveler has not filled says "Not set" and opens the editor. It
          never guesses, and it never shows a place they did not type. Favourites: any
          destination they want one tap away on Home, up to MAX_FAVORITES. */}
      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.savedPlaces')}</SectionLabel>
      <Card style={styles.card}>
        {(['home', 'work'] as const).map((k, i) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            onPress={() => router.navigate({ pathname: '/saved-place', params: { which: k } })}
          >
            <View style={[styles.row, i > 0 && styles.hair]}>
              <Text style={styles.rowTitle}>
                {k === 'home' ? t('traveler.placeHome') : t('traveler.placeWork')}
              </Text>
              <View style={styles.valueNav}>
                <Text style={[places[k] ? styles.statValue : styles.notSet, styles.rowValue]} numberOfLines={1}>
                  {places[k]?.label ?? t('traveler.addAddress')}
                </Text>
                <Chev />
              </View>
            </View>
          </Pressable>
        ))}
        {places.favorites.map((f) => (
          <Pressable
            key={f.label}
            accessibilityRole="button"
            onPress={() =>
              router.navigate({ pathname: '/saved-place', params: { which: 'favorite', label: f.label } })
            }
          >
            <View style={[styles.row, styles.hair]}>
              <Text style={styles.rowTitle}>{t('traveler.favoriteDestination')}</Text>
              <View style={styles.valueNav}>
                <Text style={[styles.statValue, styles.rowValue]} numberOfLines={1}>{f.label}</Text>
                <Chev />
              </View>
            </View>
          </Pressable>
        ))}
        {places.favorites.length < MAX_FAVORITES && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate({ pathname: '/saved-place', params: { which: 'favorite' } })}
          >
            <View style={[styles.row, styles.hair]}>
              <Text style={styles.action}>{t('traveler.addFavorite')}</Text>
              <Chev />
            </View>
          </Pressable>
        )}
      </Card>

      {/* THE SAVED CABIN ENVIRONMENT. The values are one preference set, so they read as
          one record and expose one clear adjustment action instead of four chevrons to the
          same destination. */}
      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.travelPreferences')}</SectionLabel>
      <Text style={styles.serviceNote}>{t('traveler.configureThisTravel')}</Text>
      <Card style={styles.card}>
        {[
          { label: t('traveler.climate'), value: climateLabel },
          { label: t('traveler.atmosphere'), value: cabin.quiet ? t('traveler.prefQuiet') : t('traveler.prefConversation') },
          { label: t('traveler.music'), value: cabin.music === 'None' ? t('traveler.prefMusicNone') : t('traveler.prefTravelerChoice') },
          {
            label: t('traveler.additionalRequests'),
            value: requests.length ? requests.join(' · ') : t('traveler.noneRequested'),
          },
        ].map((item, i) => (
          <View key={item.label} style={[styles.row, i > 0 && styles.hair]}>
            <Text style={styles.rowTitle}>{item.label}</Text>
            <Text style={[styles.statValue, styles.rowValue]} numberOfLines={2}>{item.value}</Text>
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/prefs')}>
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.action}>{t('traveler.adjustCabinEnvironment')}</Text>
            <Chev />
          </View>
        </Pressable>
      </Card>

      {/* TRUSTED CONTACTS: how many are configured, and the screen that manages them. */}
      <SectionLabel style={{ marginTop: 22 }}>{t('traveler.safeTravels')}</SectionLabel>
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/safety')}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{t('traveler.trustedContacts')}</Text>
            <View style={styles.valueNav}>
              <Text style={contacts.length ? styles.statValue : styles.notSet}>
                {contacts.length ? t('traveler.contactsConfigured', { n: contacts.length }) : t('traveler.addContacts')}
              </Text>
              <Chev />
            </View>
          </View>
        </Card>
      </Pressable>


    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: 8 },
  name: { fontSize: 20.5, fontWeight: '600', letterSpacing: -0.38, color: colors.ink },
  since: { fontSize: 12.5, color: colors.muted, marginTop: 4 },
  card: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13.5,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 14.5, color: colors.ink },
  rowValue: { flex: 1, textAlign: 'right' },
  valueNav: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexShrink: 1 },
  valueStack: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  statValue: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  verification: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  notSet: { fontSize: 14, color: colors.muted },
  action: { fontSize: 13, fontWeight: '600', color: colors.accent },
  serviceNote: { fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 6, marginBottom: 1 },
});
