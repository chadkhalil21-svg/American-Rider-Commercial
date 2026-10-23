// Emergency — the screen a traveler holds while 911 answers.
//
// THE PROBLEM IT SOLVES: Safe Travels had a Call 911 button that dialled and did nothing
// else. A person in a moving car, in a city they do not know, cannot answer the dispatcher's
// first question — "where are you". The app knows. So this screen carries, in type readable
// at arm's length and in the order a dispatcher asks for it:
//   1. the current street address, re-derived from the live position as the car moves
//   2. the vehicle and its PLATE
//   3. the operator
//   4. the Travel Number
//
// And in the same action it files an emergency case with American Rider and offers to put
// the same facts into the traveler's trusted contacts' hands.
//
// NOTHING HERE CLAIMS AN OUTCOME IT HAS NOT REACHED. If the notification fails, the screen
// says so. If location is unavailable, it says that too rather than falling back to the
// pickup address — a confidently wrong address is worse than an admitted blank, because the
// dispatcher would send help to it.
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useGoBack } from '../src/components/nav';
import { Card, Display, LetterheadBar, Mono, Screen, SectionLabel, Sub } from '../src/components/UI';
import { alertEmergency, fetchEmergencyTravelContext, updateEmergencyLocation, type VerifiedEmergencyTravel } from '../src/backend/support';
import { loadContacts, type TrustedContact } from '../src/contacts';
import { useRide } from '../src/state/RideContext';
import { useOperator } from '../src/state/OperatorContext';
import { resolveEmergencyTravelFacts } from '../src/emergencyTravelFacts';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';
import { applyEmergencyPosition, applyEmergencyStreet, type EmergencyFix } from '../src/emergencyPosition';

type Fix = EmergencyFix;

const clockLabel = (ms: number) => {
  const d = new Date(ms);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${ampm}`;
};

// Apple's reverse geocoder is rate limited and warns against being called freely, so a
// moving car gets a new address at most this often. Ten seconds is well inside the time it
// takes a dispatcher to ask the question.
const GEOCODE_EVERY_MS = 10000;

export default function Emergency() {
  const { t } = useLanguage();
  const goBack = useGoBack();
  const ride = useRide();

  // Operator and Traveler hold DIFFERENT live Travel states. Never substitute
  // the Traveler's cached old trip or demonstration car when an Operator
  // opens Emergency during their own accepted Travel.
  const operatorState = useOperator();
  const facts = resolveEmergencyTravelFacts({
    role: operatorState.role,
    activeOperatorTravel: operatorState.op,
    operatorName: operatorState.opName,
    operatorVehicle: operatorState.vehicle,
    travelerActive: ride.rideActive,
    matchedOperator: ride.matchedOp,
    travelerTrip: ride.lastTrip,
  });
  // A push can wake an Operator before their usual live Travel state restores.
  // The incoming ID is a hint only; the backend independently proves membership.
  const params = useLocalSearchParams<{ rideId?: string }>();
  const pushedRide = typeof params.rideId === 'string' && /^[a-f0-9]{40}$/.test(params.rideId)
    ? params.rideId : null;
  const localRide = operatorState.role === 'operator'
    ? operatorState.op?.rideId : ride.matchedOp?.rideId;
  const candidateRideId = pushedRide ||
    (facts.tripNo && typeof localRide === 'string' && /^[a-f0-9]{40}$/.test(localRide) ? localRide : null);
  const [verifiedTravel, setVerifiedTravel] = useState<VerifiedEmergencyTravel | null>(null);
  useEffect(() => {
    let active = true;
    setVerifiedTravel(null);
    if (candidateRideId) {
      void fetchEmergencyTravelContext(candidateRideId).then(next => {
        if (active) setVerifiedTravel(next);
      });
    }
    return () => { active = false; };
  }, [candidateRideId]);

  // Ignore the previous Travel while React processes a newly opened push.
  // Clearing state in useEffect happens after render; this identity gate is
  // immediate and prevents one frame of stale emergency vehicle details.
  const currentVerified = verifiedTravel?.rideId === candidateRideId ? verifiedTravel : null;
  // A locally cached Travel is a lookup hint, not verified emergency identity.
  // Keep 911 and an ordinary Emergency report available during a server outage,
  // without presenting an obsolete vehicle or Travel Number as confirmed.
  const hasOperator = !!(currentVerified?.operator && currentVerified.vehicle && currentVerified.plate);
  const operator = currentVerified?.operator || '';
  const vehicle = currentVerified?.vehicle || '';
  const plate = currentVerified?.plate || '';
  const tripNo = currentVerified?.tripNo || '';
  const hasVehicleFacts = !!(vehicle && plate);
  const hasOperatorName = !!operator;

  const [fix, setFix] = useState<Fix | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [notify, setNotify] = useState<{ state: 'sending' | 'sent' | 'recorded' | 'failed'; caseNo: string | null }>(
    { state: 'sending', caseNo: null },
  );
  const [requestId] = useState(() => Crypto.randomUUID());
  const alertBusy = useRef(false);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [contactStatus, setContactStatus] = useState<string | null>(null);

  const fixRef = useRef<Fix | null>(null);
  fixRef.current = fix;

  useEffect(() => {
    loadContacts().then(setContacts);
  }, []);

  // ---- 1. Where the traveler is, now, and again as the car moves. ------------------------
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    let lastGeocodeAt = 0;

    const describe = async (lat: number, lng: number, sampledAt: number) => {
      // The phone's GPS sample time, not when a slow geocoder finishes, establishes
      // freshness. Discard an out-of-order fix and keep the newest position.
      const at = Number.isFinite(sampledAt) && sampledAt > 0 &&
        sampledAt <= Date.now() + 1000 ? sampledAt : Date.now();
      if (alive) setFix(prev => applyEmergencyPosition(prev, { lat, lng }, at));
      const now = Date.now();
      if (now - lastGeocodeAt < GEOCODE_EVERY_MS) return;
      lastGeocodeAt = now;
      let address: string | null = null;
      let region: string | null = null;
      try {
        // Reverse-geocoding may return after newer GPS samples. Only attach the
        // address when it remains within 15m of the CURRENT point.
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
          address = street || place.name || null;
          region = [place.city, place.region, place.postalCode].filter(Boolean).join(', ') || null;
        }
      } catch {
        // Coordinates remain useful even if street lookup fails.
      }
      if (alive) setFix(prev => applyEmergencyStreet(prev, { lat, lng }, address, region));
    };

    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (!perm.granted) {
          setLocationDenied(true);
          return;
        }
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
          (l) => { void describe(l.coords.latitude, l.coords.longitude, l.timestamp); },
        );
        if (!alive) {
          sub.remove();
          sub = null;
        }
      } catch {
        if (alive) setLocationDenied(true);
      }
    })();

    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  // ---- 2. Tell American Rider, once, on arrival at this screen. ---------------------------
  // Opening this screen IS the alert. Waiting for a second tap would mean a traveler who
  // dials 911 and never comes back to the app was never reported at all.
  const issueAlert = useCallback(async () => {
    if (alertBusy.current) return;
    alertBusy.current = true;
    setNotify((prior) => ({ state: 'sending', caseNo: prior.caseNo }));
    try {
      const result = await alertEmergency({
      requestId,
      rideId: candidateRideId,
      // Operator and Travel identity come ONLY from the server's authorized
      // canonical record. The phone supplies a lookup hint, not verified facts.
      trip: null,
      operator: '',
      vehicle: '',
      plate: '',
      address: fixRef.current ? [fixRef.current.address, fixRef.current.region].filter(Boolean).join(', ') : null,
      coords: fixRef.current?.coords ?? null,
      });
      setNotify({ state: result.stored && result.emailed ? 'sent' : result.stored ? 'recorded' : 'failed', caseNo: result.caseNo });
    } catch {
      // A network exception is not evidence that a person was alerted. The same request
      // id makes a retry idempotent if the first response was lost after storage.
      setNotify((prior) => ({ state: 'failed', caseNo: prior.caseNo }));
    } finally {
      alertBusy.current = false;
    }
  }, [requestId, candidateRideId]);
  const alerted = useRef(false);
  useEffect(() => {
    if (alerted.current) return;
    alerted.current = true;
    void issueAlert();
  }, [issueAlert]);

  // ---- 3. Keep the filed case current while this screen is open. --------------------------
  useEffect(() => {
    if (!['sent', 'recorded'].includes(notify.state) || !notify.caseNo) return;
    const caseNo = notify.caseNo;
    const push = () => {
      const f = fixRef.current;
      if (!f) return;
      void updateEmergencyLocation({
        caseNo,
        // A monitored incident belongs to the Traveler, so an Operator needs
        // the server-verified active Travel to add their own live position.
        rideId: currentVerified?.rideId ?? null,
        address: [f.address, f.region].filter(Boolean).join(', ') || null,
        coords: f.coords,
      });
    };
    push();
    const t = setInterval(push, 15000);
    return () => clearInterval(t);
  }, [notify.state, notify.caseNo, currentVerified?.rideId]);

  // ---- The facts, as one block of text a contact can read. --------------------------------
  const locationLine = fix
    ? [fix.address, fix.region].filter(Boolean).join(', ') ||
      `${fix.coords.lat.toFixed(5)}, ${fix.coords.lng.toFixed(5)}`
    : 'not established';
  const mapLink = fix
    ? `https://maps.apple.com/?ll=${fix.coords.lat},${fix.coords.lng}&q=American%20Rider`
    : null;

  const contactMessage =
    (hasOperator
      ? t('traveler.emgHelpIntro')
      : currentVerified
        ? t('traveler.emgHelpTravel')
        : t('traveler.emgHelpGeneral')) +
    '\n\n' +
    t('traveler.emgWhereIAm', { place: locationLine }) +
    (fix ? ' ' + t('traveler.emgAsOf', { time: clockLabel(fix.at) }) : '') +
    (currentVerified?.tripNo
      ? '\n' + t('traveler.emgRouteLine', { from: currentVerified.dep, to: currentVerified.dest })
      : '') +
    (hasVehicleFacts ? '\n' + t('traveler.emgVehicleLine', { vehicle, plate }) : '') +
    (hasOperatorName ? '\n' + t('traveler.emgOperatorLine', { name: operator }) : '') +
    (tripNo ? '\n' + t('traveler.emgTravelNumberLine', { no: tripNo }) : '') +
    (mapLink ? `\n\n${mapLink}` : '');

  const withPhones = contacts.filter((c) => c.phone);

  const alertContacts = useCallback(async () => {
    if (withPhones.length > 0) {
      // iOS separates several recipients with a comma and takes &body; Android uses a
      // semicolon and ?body. Getting this wrong opens Messages with no recipient at all.
      const numbers = withPhones.map((c) => c.phone as string);
      const url =
        Platform.OS === 'ios'
          ? `sms:${numbers.join(',')}&body=${encodeURIComponent(contactMessage)}`
          : `sms:${numbers.join(';')}?body=${encodeURIComponent(contactMessage)}`;
      try {
        await Linking.openURL(url);
        // Messages is now open with the text in it. It has NOT been sent — only the
        // traveler can do that, so that is what the screen says.
        setContactStatus(
          t('traveler.emgMessagesOpenTo', { names: withPhones.map((c) => c.name).join(t('traveler.andJoin')) }),
        );
        return;
      } catch {
        // Fall through to the share sheet — some devices have no SMS app.
      }
    }
    try {
      const res = await Share.share({ message: contactMessage });
      if (res.action === Share.sharedAction) setContactStatus(t('traveler.emgLocationShared'));
    } catch {
      setContactStatus(t('traveler.emgNoShareSheet'));
    }
  }, [withPhones, contactMessage]);

  const [callBusy, setCallBusy] = useState(false);
  const call911 = async () => {
    if (callBusy) return;
    setCallBusy(true);
    await Linking.openURL('tel:911').catch(() => {
      setContactStatus(t('traveler.emgNoCalls'));
    });
    setCallBusy(false);
  };

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Display>{t('traveler.emergency')}</Display>
      <Sub>{t('traveler.readToDispatcher')}</Sub>

      <Pressable
        onPress={call911}
        disabled={callBusy}
        accessibilityRole="button"
        accessibilityState={{ disabled: callBusy }}
        style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.86 }]}
      >
        <Text style={styles.callBtnText}>{t('traveler.call911')}</Text>
      </Pressable>

      {/* 1 · WHERE YOU ARE — the dispatcher's first question, so it is the first thing here. */}
      <SectionLabel style={styles.lbl}>{t('traveler.whereYouAre')}</SectionLabel>
      <Card style={styles.factCard}>
        {locationDenied ? (
          <>
            <Text style={styles.unknown}>{t('traveler.notEstablished')}</Text>
            <Text style={styles.factNote}>
              {t('traveler.locationOff')}
            </Text>
          </>
        ) : !fix ? (
          <Text style={styles.unknown}>{t('traveler.findingPosition')}</Text>
        ) : (
          <>
            <Text style={styles.address}>
              {fix.address ?? `${fix.coords.lat.toFixed(5)}, ${fix.coords.lng.toFixed(5)}`}
            </Text>
            {fix.region && <Text style={styles.region}>{fix.region}</Text>}
            <View style={styles.coordRow}>
              <Mono size={13.5} color={colors.ink2}>
                {fix.coords.lat.toFixed(5)}, {fix.coords.lng.toFixed(5)}
              </Mono>
              <Text style={styles.factNote}>{t('traveler.updatedAt', { time: clockLabel(fix.at) })}</Text>
            </View>
          </>
        )}
      </Card>

      {hasOperator && (hasVehicleFacts || hasOperatorName) ? (
        <>
          {/* Vehicle and Operator facts do not exist until dispatch succeeds. Omitting the
              sections before then is clearer than presenting "Not recorded" as if data were
              missing from an assigned Travel. */}
          {hasVehicleFacts && <>
            <SectionLabel style={styles.lbl}>{t('traveler.vehicle')}</SectionLabel>
            <Card style={styles.factCard}>
              <Text style={styles.vehicle}>{vehicle}</Text>
              <Text style={styles.plateLabel}>{t('traveler.plateCaps')}</Text>
              <Mono size={34} weight="600" style={styles.plate}>{plate}</Mono>
            </Card>
          </>}
          {hasOperatorName && <>
            <SectionLabel style={styles.lbl}>{t('traveler.operator')}</SectionLabel>
            <Card style={styles.factCard}><Text style={styles.operator}>{operator}</Text></Card>
          </>}
        </>
      ) : null}

      {tripNo ? (
        <>
          <SectionLabel style={styles.lbl}>{t('traveler.travelNumber')}</SectionLabel>
          <Card style={styles.factCard}>
            <Mono size={22} weight="500">{tripNo}</Mono>
          </Card>
        </>
      ) : null}

      <SectionLabel style={styles.lbl}>{t('traveler.americanRider')}</SectionLabel>
      <Card style={styles.factCard}>
        {notify.state === 'sending' && <Text style={styles.notifyPending}>{t('traveler.notifying')}</Text>}
        {notify.state === 'sent' && (
          <>
            <Text style={styles.notifySent}>{t('traveler.notified')}</Text>
            {notify.caseNo && (
              <View style={styles.caseRow}>
                <Text style={styles.factNote}>{t('traveler.caseLabel')}</Text>
                <Mono size={13.5}>{notify.caseNo}</Mono>
              </View>
            )}
          </>
        )}
        {notify.state === 'recorded' && (
          <>
            <Text style={styles.notifyFailed}>{t('traveler.emgRecordedNotAlerted')}</Text>
            {notify.caseNo && <Mono size={13.5}>{notify.caseNo}</Mono>}
          </>
        )}
        {notify.state === 'failed' && (
          <>
            <Text style={styles.notifyFailed}>{t('traveler.notReachedDevice')}</Text>
            <Text style={styles.factNote}>
              {t('traveler.call911First')}
            </Text>
          </>
        )}
        {(notify.state === 'failed' || notify.state === 'recorded') && (
          <Pressable accessibilityRole="button" onPress={() => void issueAlert()} style={styles.sendBtn}>
            <Text style={styles.sendBtnText}>{t('traveler.tryAgain')}</Text>
          </Pressable>
        )}
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.trustedContacts')}</SectionLabel>
      <Card style={styles.factCard}>
        {contacts.length === 0 ? (
          <Text style={styles.factNote}>
            {t('traveler.noContactsSaved')}
          </Text>
        ) : (
          <Text style={styles.factNote}>
            {contacts.map((c) => c.name).join(', ')}
            {withPhones.length < contacts.length &&
              t('traveler.emgWithoutNumber', { n: contacts.length - withPhones.length })}
          </Text>
        )}
        <Pressable
          onPress={alertContacts}
          accessibilityRole="button"
          style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.86 }]}
        >
          <Text style={styles.sendBtnText}>
            {withPhones.length > 0 ? t('traveler.emgTextMyLocation') : t('traveler.emgSendMyLocation')}
          </Text>
        </Pressable>
        {contactStatus && <Text style={styles.contactStatus}>{contactStatus}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 22, marginBottom: 10 },
  // The only red button in the product is Call 911, and on this screen it is the largest
  // thing after the address: 22px padding against the demo's usual 18.
  callBtn: {
    marginTop: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 13,
    paddingVertical: 22,
    alignItems: 'center',
  },
  callBtnText: { fontSize: 20, fontWeight: '600', letterSpacing: 0.2, color: colors.red },
  factCard: { paddingVertical: 18, paddingHorizontal: 20 },
  // Not mono, and not the size of a Travel Number. This is the absence of one, and dressing it
  // in the type reserved for record keys would read as a value a dispatcher could use.
  noTravel: { fontSize: 17, color: colors.muted },
  address: { fontSize: 26, fontWeight: '600', letterSpacing: -0.52, color: colors.ink, lineHeight: 32 },
  region: { fontSize: 17, color: colors.ink2, marginTop: 4 },
  coordRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unknown: { fontSize: 22, fontWeight: '600', color: colors.ink },
  factNote: { fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  vehicle: { fontSize: 20, fontWeight: '600', color: colors.ink },
  plateLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.65,
    color: colors.muted,
    marginTop: 14,
  },
  plate: { marginTop: 4, letterSpacing: 2 },
  operator: { fontSize: 22, fontWeight: '600', color: colors.ink },
  notifyPending: { fontSize: 17, fontWeight: '600', color: colors.muted },
  notifySent: { fontSize: 17, fontWeight: '600', color: colors.green },
  notifyFailed: { fontSize: 17, fontWeight: '600', color: colors.red },
  caseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sendBtn: {
    marginTop: 14,
    backgroundColor: colors.ink,
    borderRadius: 13,
    padding: 14,
    alignItems: 'center',
  },
  sendBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, color: '#fff' },
  contactStatus: { fontSize: 13, color: colors.ink2, marginTop: 10, lineHeight: 19 },
});
