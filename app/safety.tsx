// Safety — the web demo's safety screen: share your travel, trusted contacts, the vehicle
// verification code, and immediate assistance. No red on this screen: the only red control
// in the product is Call 911, on the emergency screen this one opens.
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useGoBack } from '../src/components/nav';
import { Card, Chev, LetterheadBar, Mono, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import {
  MAX_CONTACTS,
  loadContacts,
  normalizePhone,
  prettyPhone,
  saveContacts,
  type TrustedContact,
} from '../src/contacts';
import { useRide } from '../src/state/RideContext';
import { followLink } from '../src/backend/follow';
import { travelerPickupCode } from '../src/backend/pickupVerification';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, radii } from '../src/theme';

export default function SafeTravels() {
  const { t } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [adding, setAdding] = useState(false);
  const [pendingRemoveContact, setPendingRemoveContact] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  // Sharing is available from Travel confirmation onward. Vehicle verification waits until
  // an Operator is actually assigned, because the server-authoritative Travel Number and the
  // Operator's matching code do not exist before dispatch succeeds.
  const activeNo = ride.rideActive ? ride.lastTrip.no : null;
  const currentRideId = ride.rideActive ? ride.matchedOp?.rideId : null;
  const [secureCode, setSecureCode] = useState<string | null>(null);
  const [pickupMessage, setPickupMessage] = useState<'idle'|'working'|'inactive'|'ready'|'verified'|'error'>('idle');
  const getSecureCode = async () => {
    if (!currentRideId || pickupMessage === 'working') return;
    setSecureCode(null); setPickupMessage('working');
    try {
      const result = await travelerPickupCode(currentRideId);
      if (!result.enabled) setPickupMessage('inactive');
      else if (result.verified) setPickupMessage('verified');
      else if (result.pin) { setSecureCode(result.pin); setPickupMessage('ready'); }
      else setPickupMessage('error');
    } catch { setPickupMessage('error'); }
  };
  useEffect(() => { setSecureCode(null); setPickupMessage('idle'); }, [currentRideId]);

  useEffect(() => {
    loadContacts().then(setContacts);
  }, []);

  const commit = (next: TrustedContact[]) => {
    setContacts(next);
    saveContacts(next);
  };

  // ADDING A CONTACT USED TO BE HALF-BUILT: an iOS-only Alert.prompt captured a NAME, and on
  // Android the button raised "Editing and removal open with the contacts screen" — a screen
  // that does not exist. A name alone was also useless: the emergency screen cannot text a
  // person it has no number for. One sheet, both platforms, name and number.
  const openAdd = () => {
    setDraftName('');
    setDraftPhone('');
    setAdding(true);
  };

  const normalizedDraftPhone = normalizePhone(draftPhone);
  const phoneDigits = normalizedDraftPhone.replace(/\D/g, '');
  const contactReady = !!draftName.trim() && phoneDigits.length >= 7 && phoneDigits.length <= 15;

  const saveDraft = () => {
    const name = draftName.trim();
    if (!contactReady) return;
    commit([...contacts, { name, phone: normalizedDraftPhone }]);
    setAdding(false);
  };

  const removeContact = (index: number) => commit(contacts.filter((_, i) => i !== index));

  // WHAT WE ACTUALLY KNOW, AND NOTHING WE DO NOT. The message carries what we hold the
  // moment an operator is matched — name, vehicle, plate, the arrival estimate, the Travel
  // Number — and the follow link (backend/follow.js), which shows the vehicle's last reported
  // position while the travel is underway and nothing once it has ended. The card's sentence
  // says exactly that. In the traveler's language, like every other line the app writes.
  const shareTravel = async () => {
    const op = ride.matchedOp;
    // THE LINK IS THE POINT. Everything else in this message is a description; the link is the
    // only part that lets a contact SEE where the car is, which is what "follow my travel"
    // means and what this feature promised for weeks without delivering.
    //
    // Requested at share time rather than held: a token that exists before anybody asks is a
    // capability sitting on a record for no reason.
    // Only while a travel is underway: the control is disabled otherwise. This used to send
    // "My most recent travel is AR-…" with nothing to follow — a message with no purpose.
    if (!ride.rideActive) return;
    const link = await followLink(ride.matchedOp?.rideId);
    const trip = [
      t('traveler.safetyShareIntro', { place: ride.lastTrip.arr }),
      op && t('traveler.safetyOperatorLine', { name: op.name, car: op.car, plate: op.plate }),
      op && t('traveler.safetyArrivingIn', { n: op.etaMin }),
      op && t('traveler.safetyTravelNumber', { no: ride.lastTrip.no }),
      // Absent when the server could not mint one. The message still sends — a share that
      // failed silently because a link could not be made would be the same defect again.
      link && t('traveler.safetyFollowHere', { link }),
    ]
      .filter(Boolean)
      .join(' ');
    try {
      await Share.share({ message: trip });
    } catch {
      // sharing cancelled — nothing to do
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title size={24}>{t('traveler.safeTravels')}</Title>
      {/* The subtitle states what is true and nothing more (Chad, 17 Sept 2026: state the
          outcome, not the mechanism). Route monitoring IS real now — backend/monitor.js
          reports a delay with a known cause, asks the operator about an unexplained stop,
          then the traveler, then opens a case — so the sentence says exactly that order; it
          does not say "operations" or "personnel", because there is no desk watching. */}
      <Sub>{t('traveler.safetySub')}</Sub>

      <SectionLabel style={styles.lbl}>{t('traveler.shareThisTravel')}</SectionLabel>
      <Card style={styles.shareCard}>
        <Text style={styles.body}>
          {t('traveler.shareTravelSub')}
        </Text>
        {!activeNo && <Text style={styles.note}>{t('traveler.shareUnavailable')}</Text>}
        <Pressable
          onPress={shareTravel}
          disabled={!activeNo}
          accessibilityRole="button"
          accessibilityState={{ disabled: !activeNo }}
          style={({ pressed }) => [
            styles.inkBtn,
            !activeNo && { backgroundColor: colors.disabled },
            pressed && !!activeNo && { opacity: 0.86 },
          ]}
        >
          <Text style={[styles.inkBtnText, !activeNo && { color: colors.disabledText }]}>
            {t('traveler.shareTravelBtn')}
          </Text>
        </Pressable>
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.trustedContacts')}</SectionLabel>
      <Card style={styles.listCard}>
        {contacts.length === 0 && (
          <Text style={[styles.body, { paddingVertical: 16 }]}>
            {t('traveler.uptoThreePeople')}
          </Text>
        )}
        {contacts.map((c, i) => (
          <View key={c.name + i} style={[styles.row, i > 0 && styles.hair]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.name}</Text>
              <Text style={styles.rowNote}>
                {c.phone ? prettyPhone(c.phone) : t('traveler.noNumberCannotText')}
              </Text>
            </View>
            <Pressable onPress={() => setPendingRemoveContact(i)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.removeLink}>{t('traveler.remove')}</Text>
            </Pressable>
          </View>
        ))}
        {contacts.length < MAX_CONTACTS && (
          <Pressable onPress={openAdd} hitSlop={8} accessibilityRole="button">
            <View style={[styles.row, contacts.length > 0 && styles.hair]}>
              <Text style={styles.addLink}>{t('traveler.addAContact')}</Text>
              <Chev />
            </View>
          </Pressable>
        )}
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.vehicleVerification')}</SectionLabel>
      {/* Never display the former predictable number-based code as proof of
          identity. A six-digit code is issued only to this Traveler by the server,
          and cannot be inferred by an Operator from the Travel Number. */}
      <Card style={styles.verifyCard}>
        {currentRideId ? (
          <>
            <Text style={styles.verifyBody}>{t('traveler.pickupSecurityIntro')}</Text>
            {secureCode ? (
              <Mono size={26} weight="600" style={{marginTop:8,letterSpacing:1.3}}>{secureCode}</Mono>
            ) : null}
            {pickupMessage === 'inactive' ? <Text style={styles.verifyBody}>{t('traveler.pickupCodePendingRollout')}</Text> : null}
            {pickupMessage === 'verified' ? <Text style={styles.verifyBody}>{t('traveler.pickupCodeVerified')}</Text> : null}
            {pickupMessage === 'error' ? <Text style={styles.verifyBody}>{t('traveler.pickupCodeUnavailable')}</Text> : null}
            {pickupMessage !== 'ready' && pickupMessage !== 'verified' && (
              <Pressable accessibilityRole="button" disabled={pickupMessage === 'working'} onPress={() => { void getSecureCode(); }} style={{paddingVertical:10}}>
                <Text style={styles.addLink}>{pickupMessage === 'working' ? t('traveler.pleaseWait') : t('traveler.getPickupSecurityCode')}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <Text style={styles.verifyBody}>{t('traveler.verifyCodeIdle')}</Text>
        )}
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.immediateAssistance')}</SectionLabel>
      <View style={styles.assistRow}>
        {/* NAMED FOR WHAT IT DOES. This read "Call 911" and opened a screen — the rubric's
            own failure mode, on the one control where being wrong matters most. The screen
            it opens holds the address, plate, operator and Travel Number while the call
            connects, and the button that dials is inside, where it is the only red control
            in this product. This one is therefore ink — the primary of the pair, because in
            an emergency it is the one to find (Chad, 17 Sept 2026: red beside the specialist
            control read as unsafe by default). */}
        <Pressable
          onPress={() => router.navigate('/emergency')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.solidBtn, pressed && { opacity: 0.86 }]}
        >
          <Text style={styles.inkBtnText}>{t('traveler.emergencyAssistance')}</Text>
        </Pressable>
        {/* Opens Patron Support, where a described case is filed to a person — and is named
            for that, as the receipt's control is. No specialist is connected by pressing it. */}
        <Pressable
          onPress={() => {
            ride.openHelp(ride.lastTrip.no);
            router.navigate({ pathname: '/issues', params: { from: 'safety' } });
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.ghostWide, pressed && { opacity: 0.86 }]}
        >
          <Text style={styles.ghostWideText}>{t('traveler.contactPatronSupport')}</Text>
        </Pressable>
      </View>

      <Modal visible={pendingRemoveContact !== null} animationType="fade" transparent onRequestClose={() => setPendingRemoveContact(null)}>
        <Pressable style={styles.sheetScrim} onPress={() => setPendingRemoveContact(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('traveler.trustedContacts')}</Text>
            <Text style={styles.sheetBody}>{pendingRemoveContact !== null ? contacts[pendingRemoveContact]?.name : ''}</Text>
            <View style={styles.sheetBtns}>
              <Pressable onPress={() => setPendingRemoveContact(null)} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>{t('traveler.cancel2')}</Text>
              </Pressable>
              <Pressable onPress={() => {
                const index = pendingRemoveContact;
                setPendingRemoveContact(null);
                if (index !== null) removeContact(index);
              }} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>{t('traveler.remove')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={adding} animationType="fade" transparent onRequestClose={() => setAdding(false)}>
        <Pressable style={styles.sheetScrim} onPress={() => setAdding(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('traveler.addTrustedContact')}</Text>
            <Text style={styles.sheetBody}>
              {t('traveler.numberUsedOnlyWhen')}
            </Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('traveler.namePh')}
              placeholderTextColor={colors.muted}
              style={styles.field}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              value={draftPhone}
              onChangeText={setDraftPhone}
              placeholder={t('traveler.mobilePh')}
              placeholderTextColor={colors.muted}
              style={styles.field}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={saveDraft}
            />
            <View style={styles.sheetBtns}>
              <Pressable onPress={() => setAdding(false)} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>{t('traveler.cancel2')}</Text>
              </Pressable>
              <Pressable
                onPress={saveDraft}
                disabled={!contactReady}
                style={[styles.saveBtn, !contactReady && { backgroundColor: colors.disabled }]}
              >
                <Text
                  style={[
                    styles.saveBtnText,
                    !contactReady && { color: colors.disabledText },
                  ]}
                >
                  {t('traveler.saveContact')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 24, marginBottom: 12 },
  shareCard: { paddingVertical: 18, paddingHorizontal: 20 },
  body: { fontSize: 14, color: colors.ink2, lineHeight: 21 },
  note: { fontSize: 12.5, color: colors.muted, marginTop: 8, lineHeight: 18 },
  // The demo's in-card Share Travel button: 14px padding on the standard radius.
  inkBtn: {
    marginTop: 14,
    backgroundColor: colors.ink,
    borderRadius: 13,
    padding: 14,
    alignItems: 'center',
  },
  inkBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, color: '#fff', textAlign: 'center' },
  listCard: { paddingVertical: 2, paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowNote: { fontSize: 12, color: colors.muted, marginTop: 2 },
  removeLink: { fontSize: 13.5, fontWeight: '500', color: colors.muted },
  // Ink, not the demo's link blue: Chad took the colour off this control (17 Sept 2026), as
  // off the sheet's controls and the drawer head before it.
  addLink: { fontSize: 15, fontWeight: '500', color: colors.ink },
  verifyCard: { paddingVertical: 18, paddingHorizontal: 20 },
  verifyBody: { fontSize: 13.5, color: colors.ink2, lineHeight: 20 },
  assistRow: { flexDirection: 'row', gap: 10 },
  // The ghost secondary, at the same 18px padding as its solid neighbour.
  ghostWide: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostWideText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, color: colors.ink, textAlign: 'center' },
  solidBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: 13,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(20,23,31,0.42)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  sheetBody: { fontSize: 13.5, color: colors.muted, marginTop: 6, lineHeight: 19.5 },
  field: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    fontSize: 16.5,
    color: colors.ink,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  ghostBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    alignItems: 'center',
  },
  ghostBtnText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: 13,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
