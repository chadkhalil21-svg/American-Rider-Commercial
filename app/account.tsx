// Menu — the web demo's grouped menu, exactly: ACCOUNT / TRAVEL / OPERATE / GENERAL,
// plain 15px rows with faint chevrons, the Become an Operator card, and the red-lettered
// ghost Sign Out. Every row here opens something real — the placeholder rows that
// only raised a toast were removed on 15 Aug for App Store review (see notes inline).
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { LEGAL_URL } from '../src/config';
import { menuTitleCase } from '../src/menuTitleCase';
import { useGoBack } from '../src/components/nav';
import {
  Card,
  Chev,
  LetterheadBar,
  OutlineButton,
  Screen,
  SectionLabel,
  Title,
  useNote,
} from '../src/components/UI';
import { useAuth } from '../src/state/AuthContext';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';

function Group({
  label,
  items,
  first = false,
}: {
  label: string;
  items: { title: string; onPress: () => void }[];
  first?: boolean; // the demo's first group label sits at 26, the rest at 24
}) {
  const { language } = useLanguage();
  return (
    <>
      <SectionLabel style={[styles.lbl, first && { marginTop: 26 }]}>{label}</SectionLabel>
      <Card style={styles.card}>
        {items.map((item, i) => (
          <Pressable key={item.title} onPress={item.onPress}>
            <View style={[styles.row, i > 0 && styles.hair]}>
              <Text style={styles.rowTitle}>{menuTitleCase(item.title, language)}</Text>
              <Chev />
            </View>
          </Pressable>
        ))}
      </Card>
    </>
  );
}

export default function Menu() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const { signOut } = useAuth();
  const { note } = useNote();
  // The most recent travel this traveler ACTUALLY took, for Patron Support to open against.
  // This read pastTrips[0], which — until the fabricated journeys were removed — was a
  // seeded trip nobody had been on, and is now simply absent for a new account.
  // The travel a case concerns by default: the most recent completed one, not merely the most
  // recent record, which may be a cancelled travel nobody took.
  const firstTripNo =
    ride.myRides.find((r) => r.status === 'completed')?.tripNo ||
    ride.myRides[0]?.tripNo ||
    ride.pastTrips[0]?.no;

  return (
    <Screen note={note}>
      <LetterheadBar onBack={goBack} />
      {/* The demo gives this title 6px extra below the bar (24 + 6). */}
      <View style={{ marginTop: 6 }}>
        <Title>{t('traveler.menu')}</Title>
      </View>

      {/* THE SAME THREE GROUPS AS THE HOME DRAWER (Chad, 14 Sept 2026), so the menu reads the
          same whichever screen opened it. Recruiting ("Become an Operator") left both: an
          operator enters at the front door. Notifications lives inside Settings. */}
      <Group
        label={t('traveler.account')}
        first
        items={[
          { title: t('traveler.accountDetails'), onPress: () => router.navigate('/profile') },
          { title: t('traveler.paymentMethods'), onPress: () => router.navigate('/wallet') },
          { title: t('traveler.settings'), onPress: () => router.navigate('/settings') },
          { title: t('traveler.inviteFriends'), onPress: () => router.navigate('/invite') },
        ]}
      />

      <Group
        label={t('traveler.travel')}
        items={[
          ...(ride.rideActive
            ? [{ title: t('traveler.travelInProgress'), onPress: () => router.navigate('/ride') }]
            : []),
          ...(ride.scheduled && !ride.rideActive
            ? [{ title: t('traveler.scheduledTravel'), onPress: () => router.navigate('/schedule') }]
            : []),
          {
            title: t('traveler.travelLog'),
            onPress: () => router.navigate({ pathname: '/history', params: { from: 'menu' } }),
          },
          { title: t('traveler.familyTitle'), onPress: () => router.navigate('/family') },
          { title: t('traveler.travelPreferences'), onPress: () => router.navigate('/prefs') },
        ]}
      />

      <Group
        label={t('traveler.assistance')}
        items={[
          {
            title: t('traveler.patronSupport'),
            onPress: () => {
              ride.openHelp(firstTripNo);
              router.navigate({ pathname: '/issues', params: { from: 'menu' } });
            },
          },
          { title: t('traveler.safeTravels'), onPress: () => router.navigate('/safety') },
          {
            // Opens the real company page — also where the 99% model is stated once, as an
            // institutional fact rather than a slogan (founders' brief §10A).
            title: t('traveler.aboutAmericanRider'),
            onPress: () => Linking.openURL(`${LEGAL_URL}/company/`),
          },
        ]}
      />

      {/* .spring — the demo pushes Sign Out to the bottom of a short screen. */}
      <View style={{ flex: 1 }} />

      {/* Ink, not red: red is reserved for Call 911. */}
      <OutlineButton label={t('traveler.signOut')} onPress={() => signOut()} style={{ marginTop: 24 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 24, marginBottom: 12 },
  card: { paddingHorizontal: 20, paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 15, color: colors.ink },
  operateCard: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  operateTitle: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  operateSub: { fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
});
