// Everything a traveler uses to find the right car and the right person.
//
// WHY THIS SCREEN HAD TO EXIST. Nothing recorded an operator's vehicle, so going on duty sent
// DRIVER.car and DRIVER.plate — the demonstration operator's Gray Toyota Camry, KTR 4821 —
// for every real operator in the fleet. A traveler at the kerb was told to look for a car that
// was never coming, and given a plate belonging to nobody to check before getting in.
//
// The NAME is here for the same reason and one more. Sign-up takes a name but does not insist
// on one, and nothing anywhere could add one afterwards, so an account without one fell back
// to the local part of its owner's email address — shown to every traveler they drove. That is
// not only unbecoming, it hands a stranger half of somebody's email address.
//
// Filed here rather than during qualification because all three change: people marry, cars get
// sold, plates get replaced. Qualification happens once.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { OperatorBar, OperatorScreen } from '../../src/components/operator';
import { Card, PrimaryButton, SectionLabel, useNote } from '../../src/components/UI';
import { useGoBack } from '../../src/components/nav';
import { useAuth } from '../../src/state/AuthContext';
import { useOperator } from '../../src/state/OperatorContext';
import { useLanguage } from '../../src/state/LanguageContext';
import { colors } from '../../src/theme';

export default function OperatorVehicle() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const op = useOperator();
  const { user, setDisplayName } = useAuth();
  const { note, showNote } = useNote();

  const [name, setName] = useState(user?.displayName ?? '');
  const [car, setCar] = useState(op.vehicle?.car ?? '');
  const [plate, setPlate] = useState(op.vehicle?.plate ?? '');
  const [saving, setSaving] = useState(false);

  const ready = name.trim().length >= 2 && car.trim().length >= 3 && plate.trim().length >= 2;

  const save = async () => {
    setSaving(true);
    try {
      if (name.trim() !== (user?.displayName ?? '')) await setDisplayName(name);
      op.setVehicle(car, plate);
      // Self-entered details count as completed, never as independently verified.
      op.verifyDoc('basics');
      showNote(t('traveler.saved'));
      router.back();
    } catch {
      showNote(t('traveler.couldNotSaveConn'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperatorScreen note={note}>
      <OperatorBar onMenu={goBack} initials={op.opInitials} />
      <Text style={styles.title}>{t('operator.howTravelersFindYou')}</Text>
      <Text style={styles.sub}>
        {t('traveler.whatTravelerLooksFor')}
      </Text>

      <SectionLabel style={styles.lbl}>{t('operator.yourName')}</SectionLabel>
      <Card style={styles.card}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('traveler.namePh2')}
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="words"
        />
      </Card>

      <SectionLabel style={styles.lbl}>{t('operator.makeModelColor')}</SectionLabel>
      <Card style={styles.card}>
        <TextInput
          value={car}
          onChangeText={setCar}
          placeholder={t('traveler.carPh')}
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="words"
        />
      </Card>

      <SectionLabel style={styles.lbl}>{t('operator.licensePlate')}</SectionLabel>
      <Card style={styles.card}>
        <TextInput
          value={plate}
          onChangeText={setPlate}
          placeholder={t('traveler.platePh')}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.plate]}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </Card>

      <Text style={styles.hint}>
        {t('traveler.plateMustMatch')}
      </Text>

      <View style={{ marginTop: 'auto' }}>
        <PrimaryButton
          label={saving ? t('traveler.busySaving') : t('traveler.save')}
          onPress={save}
          disabled={!ready || saving}
          style={{ marginTop: 24 }}
        />
      </View>
    </OperatorScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 23, fontWeight: '600', color: colors.ink, marginTop: 22, letterSpacing: -0.54 },
  sub: { fontSize: 15, color: colors.muted, marginTop: 8, lineHeight: 22 },
  lbl: { marginTop: 22, marginBottom: 10 },
  card: { paddingVertical: 14, paddingHorizontal: 20 },
  input: { fontSize: 16.5, color: colors.ink, lineHeight: 23 },
  plate: { letterSpacing: 1.2 },
  hint: { fontSize: 12.5, color: colors.muted, marginTop: 14, lineHeight: 18 },
});
