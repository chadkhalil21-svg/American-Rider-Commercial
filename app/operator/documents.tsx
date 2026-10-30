// Documents — what American Rider actually holds, and how to submit what it does not.
//
// WHAT THIS SCREEN USED TO SAY. Six rows, every one badged "Verified", with dates written into
// the file by hand: "Valid through 2029", "Valid through 2026", "Completed Mar 2026",
// "For-hire · active". None of them came from a document. No document had been submitted,
// because no screen captured one — `verifyDoc` set a flag after 900 milliseconds and that was
// the whole of it. The screen told an operator their licence and insurance were verified
// through years nobody had read off anything.
//
// It says what is true now: what has been read, what it said, when it expires, and what is
// still needed. A document that was refused says why. A document a person is still looking at
// says so, and does not count as verified.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { pickDocument, type DocKind } from '../../src/backend/documentUpload';
import { useGoBack } from '../../src/components/nav';
import { BadgeOk } from '../../src/components/operator';
import { BackLink, Card, Screen, Sub, Title } from '../../src/components/UI';
import { useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

// KEYS, NOT SENTENCES — built at import, before the stored language is read.
const DOCUMENTS: { key: DocKind; title: string; asks: string }[] = [
  { key: 'license', title: 'traveler.docDriverLicense', asks: 'traveler.photographFront' },
  { key: 'registration', title: 'traveler.docVehicleReg', asks: 'traveler.currentRegistration' },
  // VEHICLE INSPECTION IS NOT ASKED FOR, and that is a decision, not an omission.
  //
  // Florida requires three things of an operator before they may accept travel — §627.748(12)(a):
  // the criminal and sex-offender searches, the driving record, and confirmation of licence and
  // registration — plus the coverage in (7). There is no inspection requirement anywhere in the
  // statute. We asked for one anyway.
  //
  // "We do not want to force a package that is not required, ever" (Chad, 27 Aug 2026) was said
  // about screening tiers, but it is a rule about the operator's money and time, and it applies
  // here identically: a Florida inspection costs an operator a trip to a station and a fee, to
  // satisfy a rule nobody wrote. Removed 30 Aug 2026 on the founders' decision.
  //
  // The reader is still accepted server-side (documents.js) so an operator who HAS one may file
  // it, and so anyone who uploaded one before today keeps it. It is simply not asked for and
  // gates nothing.
  {
    key: 'insurance',
    title: 'traveler.docCommercialIns',
    // The declarations page, not the wallet card. The card proves a policy exists; the
    // declarations page proves what it covers — and American Rider carries nothing behind it.
    asks: 'traveler.declarationsShort',
  },
];

const dateLabel = (iso: string, language: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(language, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

export default function OperatorDocuments() {
  const { t, language } = useLanguage();
  const goBack = useGoBack();
  const router = useRouter();
  const op = useOperator();
  const [busy, setBusy] = useState<DocKind | null>(null);

  const submit = async (kind: DocKind, title: string) => {
    // Camera first — a licence photographed now is one the operator is holding. The library is
    // offered because insurance and inspection documents usually arrive as a PDF or a
    // screenshot, and refusing it would refuse the ordinary case.
    Alert.alert(title, t('traveler.whereIsDocument'), [
      { text: t('traveler.takePhotograph'), onPress: () => run(kind, true) },
      { text: t('traveler.chooseFile'), onPress: () => run(kind, false) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const run = async (kind: DocKind, fromCamera: boolean) => {
    const uri = await pickDocument(fromCamera);
    if (!uri) return;
    setBusy(kind);
    const out = await op.reviewDoc(kind, uri);
    setBusy(null);
    // NOTHING IS CLAIMED HERE. The context has already recorded the verdict; the rows below
    // read it. This only reports the failures the rows cannot show — an upload that never
    // arrived, and a server that could not be reached.
    if (!out) Alert.alert(t('traveler.notSubmitted'), t('traveler.docUploadFailed'));
    else if ('error' in out) Alert.alert(t('traveler.notChecked'), out.error);
  };

  const bgLabel = op.bgCheckedAt
    ? t('traveler.bgPassedRecheck', {
        date: new Date(op.bgCheckedAt).toLocaleDateString(language, {
          month: 'short',
          year: 'numeric',
        }),
        year: new Date(op.bgCheckedAt).getFullYear() + 3,
      })
    : t('traveler.bgNotYetCompleted');

  return (
    <Screen>
      <BackLink label={t('common.back')} onPress={goBack} />
      <Title>{t('operator.documents')}</Title>
      {/* WAS: "All qualifications current." It said that whatever was true. */}
      <Sub>{t('traveler.docsHeld')}</Sub>
      <Text style={styles.note}>{t('traveler.docUploadGuidance')}</Text>

      <Card style={styles.listCard}>
        {DOCUMENTS.map((d, i) => {
          const state = op.docs[d.key];
          const review = op.docReviews[d.key];
          const checking = busy === d.key || state === 'checking';
          const accepted = state === 'ok';

          return (
            <View key={d.key} style={[styles.row, i > 0 && styles.hair]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.rowTitle}>{t(d.title)}</Text>

                {accepted ? (
                  <Text style={styles.rowSub}>
                    {review?.expiry ? t('traveler.validThrough', { date: dateLabel(review.expiry, language) }) : review?.summary || t('traveler.docAccepted')}
                  </Text>
                ) : review?.verdict === 'refuse' ? (
                  <Text style={styles.rowRefused}>{review.reasons[0] || t('traveler.notAccepted')}</Text>
                ) : state === 'review' || review?.verdict === 'review' ? (
                  <Text style={styles.rowSub}>
                    {review?.reasons?.[0] || t('traveler.underReview')}
                  </Text>
                ) : (
                  <Text style={styles.rowSub}>{t(d.asks)}</Text>
                )}

                {!accepted && !checking && (
                  <Pressable accessibilityRole="button" onPress={() => {
                    if (d.key === 'insurance') router.navigate('/operator/insurance');
                    else void submit(d.key, d.title);
                  }} hitSlop={6}>
                    <Text style={styles.action}>
                      {d.key === 'insurance' ? `${t('traveler.open')} ›` :
                        review ? t('traveler.submitDifferentDoc') : `${t('traveler.submit')} ›`}
                    </Text>
                  </Pressable>
                )}
              </View>

              {checking ? (
                <ActivityIndicator color={colors.muted} />
              ) : accepted ? (
                <BadgeOk label={t('operator.verified')} />
              ) : null}
            </View>
          );
        })}

        {/* The two that are not documents. The background check's verdict comes from a licensed
            screening company, and identity from the verification selfie — neither is a photo
            this screen can read. */}
        <View style={[styles.row, styles.hair]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('traveler.backgroundCheck')}</Text>
            <Text style={styles.rowSub}>{bgLabel}</Text>
            {op.docs.background !== 'ok' && (
              <Pressable accessibilityRole="button" onPress={() => router.navigate('/operator/background')} hitSlop={6}>
                <Text style={styles.action}>{t('traveler.open')} ›</Text>
              </Pressable>
            )}
          </View>
          {op.docs.background === 'ok' ? <BadgeOk label={t('operator.verified')} /> : null}
        </View>

      </Card>

      {/* WAS: "Renewal alerts are automatic", then "Renewal dates are shown here". The first was
          false. The second was true and is now less than the whole truth — expiry dates are read
          off the documents and tracked, and notifications exist, but nothing yet watches these
          dates and sends one. Said plainly, because an operator whose insurance lapses while
          waiting for a reminder loses their livelihood over a sentence. */}
      <Text style={styles.note}>
        {t('traveler.expiryFromDocuments')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listCard: { marginTop: 20, paddingVertical: 2, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15 },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  rowRefused: { fontSize: 12.5, color: colors.red, marginTop: 3, lineHeight: 18 },
  action: { fontSize: 13, fontWeight: '600', color: colors.blue, marginTop: 7 },
  note: { fontSize: 12, color: colors.muted, marginTop: 16, lineHeight: 17.5 },
});
