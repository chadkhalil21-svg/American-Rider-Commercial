// Invitations — an invitation is a message: what the service is and where to find it.
//
// THE CODE IS GONE, 17 Sept 2026 (Chad: "high-net-worth patrons do not pass out promo codes"),
// and it went for a plainer reason than tone: it identified nothing. It was generated on the
// phone from the account id, registered nowhere, and sign-up never asked for one — so "your
// code identifies the people you bring" was a claim with no record behind it, the same defect
// as the $10 offer removed on 16 Aug. HOW IT WORKS went with it: there is no mechanism to
// explain. What remains is real — a share sheet carrying the sentence shown on the screen, so
// the traveler sees exactly what the recipient receives. An invitation that grants access and
// is recorded against the inviter is a feature with a cost, and can be named once it exists.
import React, { useState } from 'react';
import { Share, StyleSheet } from 'react-native';
import { personalInvitation } from '../src/backend/referrals';
import { Text } from '../src/components/AppText';
import { useGoBack } from '../src/components/nav';
import { Card, LetterheadBar, PrimaryButton, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import { LEGAL_URL } from '../src/config';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';

export default function Invitations() {
  const { t } = useLanguage();
  const goBack = useGoBack();
  const [shareFailed, setShareFailed] = useState(false);

  // The sentence the recipient receives, in the traveler's language, with the site named the
  // way people say it.
  const message = t('traveler.inviteShareText', { site: LEGAL_URL.replace(/^https?:\/\//, '') });

  const sendInvitation = async () => {
    setShareFailed(false);
    try {
      // No change to the visible Traveler screen or wording; referrals are OFF
      // by default, so a normal share takes no extra network call.
      const link = process.env.EXPO_PUBLIC_REFERRALS_ENABLED === '1'
        ? await personalInvitation('traveler') : null;
      await Share.share({ message: link ? `${message} ${link}` : message });
    } catch {
      setShareFailed(true);
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title size={24}>{t('traveler.inviteFriends')}</Title>
      <Sub>{t('traveler.inviteSub')}</Sub>

      {/* What will be sent, as it will be sent (Chad, 17 Sept 2026: show the recipient's
          invitation). No preview of a card that does not exist — the text is the invitation. */}
      <SectionLabel style={styles.lbl}>{t('traveler.theInvitation')}</SectionLabel>
      <Card style={styles.card}>
        <Text style={styles.message}>{message}</Text>
      </Card>

      {shareFailed ? <Text style={styles.error}>{t('traveler.inviteShareFailed')}</Text> : null}
      <PrimaryButton label={t('traveler.sendInvitation')} onPress={sendInvitation} style={{ marginTop: 16 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 22, marginBottom: 10 },
  card: { paddingVertical: 16, paddingHorizontal: 18 },
  message: { fontSize: 14.5, color: colors.ink, lineHeight: 22 },
  error: { fontSize: 12.5, color: colors.red, lineHeight: 18, marginTop: 12 },
});
