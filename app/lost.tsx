// Lost Item — which travel, what it looks like, and how it gets back.
//
// WHAT THIS REPLACES: one row in Patron Support that spun for 1.9 seconds and then said
// "RESOLVED · Operator notified · Your operator has been notified." It had never asked which
// travel, so it did not know which operator "your operator" meant; and it said RESOLVED over
// an item nobody had looked for.
//
// FOUR THINGS THE FOUNDERS ASKED FOR, 16 Aug:
//   a. never guess the travel — list them, and give someone who cannot remember a real row
//      to press that tells every operator in the window
//   b. describe it, with a photo, because an operator is searching a car in a parking lot
//      and "black backpack, back seat, driver's side" is actionable where "my bag" is not
//   c. talk to the operator, in a thread scoped to that travel, with no phone number in
//      either direction
//   d. the return, both paths, chosen by the platform — the traveler does not negotiate
//   e. a status that is true, and never the word Resolved
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { RideRecord } from '../src/backend/dispatch';
import {
  reportLostItem,
  lostItemPhotoUrl,
  watchLostItem,
  type LostItem,
} from '../src/backend/lostitem';
import { useGoBack } from '../src/components/nav';
import {
  Card,
  Chev,
  Chip,
  LetterheadBar,
  Mono,
  Num,
  OutlineButton,
  PrimaryButton,
  Screen,
  SectionLabel,
  Sub,
  Title,
} from '../src/components/UI';
import { classNameKey, prettyPlace, TRAVEL_CLASSES } from '../src/data';
import { travelDateTime } from '../src/dates';
import { useAuth } from '../src/state/AuthContext';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';

type Step = 'travel' | 'describe' | 'filed';

// Where in the vehicle, without typing it (Chad, 17 Sept 2026). KEYS, not sentences: the
// render site translates. One place at most; it joins the description as written, so the
// traveler sees exactly what the report carries.
const PLACES = ['front', 'rear', 'floor', 'door', 'trunk'] as const;
type Place = (typeof PLACES)[number];
const PLACE_KEY: Record<Place, string> = {
  front: 'traveler.lostPlaceFront',
  rear: 'traveler.lostPlaceRear',
  floor: 'traveler.lostPlaceFloor',
  door: 'traveler.lostPlaceDoor',
  trunk: 'traveler.lostPlaceTrunk',
};

const isToday = (at: number) => {
  const d = new Date(at);
  const n = new Date();
  return (
    d.getDate() === n.getDate() &&
    d.getMonth() === n.getMonth() &&
    d.getFullYear() === n.getFullYear()
  );
};

export default function LostItemScreen() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const { user } = useAuth();
  // `?item=<id>` reopens a filed report from Patron Support, straight onto its ladder.
  const params = useLocalSearchParams<{ item?: string }>();

  const [step, setStep] = useState<Step>(params.item ? 'filed' : 'travel');
  const [chosen, setChosen] = useState<RideRecord[] | null>(null);
  const [unsure, setUnsure] = useState(false);
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [remotePhotoUrl, setRemotePhotoUrl] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const [item, setItem] = useState<LostItem | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (user) ride.refreshMyRides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // THE DAY'S TRAVELS. A bag is usually reported the same day, so that is the list. When
  // there is nothing from today — someone noticing the next morning — the most recent
  // travels are shown with their dates rather than an empty screen.
  const { travels } = useMemo(() => {
    const done = ride.myRides.filter((t) => t.status !== 'cancelled');
    const today = done.filter((t) => isToday(t.createdAt));
    return today.length > 0
      ? { travels: today, sameDay: true }
      : { travels: done.slice(0, 6), sameDay: false };
  }, [ride.myRides]);

  // Keep the ladder live: the moment an operator answers, this screen moves. A report opened
  // again from Patron Support is read the same way, so the ladder, the return and the thread
  // stay reachable after the traveler has left this screen once. A report that cannot be read
  // falls back to the list rather than drawing an empty ladder.
  const watchId = item?.id ?? params.item ?? null;
  useEffect(() => {
    if (!watchId) return;
    return watchLostItem(watchId, (next) => {
      if (next) setItem(next);
      else setStep('travel');
    });
  }, [watchId]);

  useEffect(() => {
    let active = true;
    if (!item) { setRemotePhotoUrl(null); return; }
    lostItemPhotoUrl(item).then((url) => { if (active) setRemotePhotoUrl(url); });
    return () => { active = false; };
  }, [item?.id, item?.photoObjectKey, item?.photoUrl]);

  // Who the broad report actually reaches: the distinct operators of the travels in the
  // window. Three airport travels with one operator are one operator, and the row says so.
  const distinctOperators = new Set(travels.map((r) => r.operatorId).filter(Boolean)).size;

  // Who the report is for — stated as an address, never as a delivery: nothing is sent until
  // "Report the item". The broad report counts the DISTINCT operators, the same number the row
  // that led here showed, not the number of travels (six travels with one operator read
  // "Sent to 6 operators" one tap after "The operator of these 6 travels is notified").
  const chosenTravels = chosen ?? [];
  const chosenOperators = new Set(chosenTravels.map((r) => r.operatorId).filter(Boolean)).size;
  const first = chosenTravels[0];
  const describeSub = unsure
    ? chosenOperators === 1
      ? t('traveler.lostForAllOne', { n: chosenTravels.length })
      : t('traveler.lostForAllMany', { k: chosenOperators, n: chosenTravels.length })
    : first?.operatorName
      ? t('traveler.lostForOne', { name: first.operatorName, place: prettyPlace(first.arr) })
      : `${t('traveler.lostForTravel', { place: prettyPlace(first?.arr ?? '') })} ${t('traveler.lostNoOperatorRecorded')}`;

  const pickTravel = (t: RideRecord) => {
    setChosen([t]);
    setUnsure(false);
    setStep('describe');
  };

  const pickUnsure = () => {
    setChosen(travels);
    setUnsure(true);
    setStep('describe');
  };

  const addPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      if (!res.canceled && res.assets?.[0]?.uri) setPhotoUri(res.assets[0].uri);
    } catch {
      // The picker is unavailable on this device. A described item still files.
    }
  };

  const file = async () => {
    if (!chosen || !description.trim() || filing) return;
    setFiling(true);
    setFileError(null);
    const created = await reportLostItem({
      travels: chosen,
      description: place ? `${description.trim()} · ${t(PLACE_KEY[place])}` : description,
      photoUri,
      unsure,
    });
    setFiling(false);
    if (!created) {
      setFileError(t('traveler.lostReportNotSaved'));
      return;
    }
    setItem(created);
    setStep('filed');
  };


  // The report itself, not a demo/last-visited Travel, establishes whom to
  // contact. A record without a genuine Travel cannot open an Operator thread.
  const recordedTripNo = item?.tripNo || item?.candidateTripNos?.find(Boolean) || null;
  const openThread = () => {
    if (!item?.id || !recordedTripNo) return;
    router.navigate({
      pathname: '/message',
      params: { trip: recordedTripNo, lost: item.id, from: 'lost' },
    });
  };

  // ---- a · WHICH TRAVEL ------------------------------------------------------------------
  if (step === 'travel') {
    return (
      <Screen>
        <LetterheadBar onBack={goBack} />
        <Title>{t('traveler.lostItem')}</Title>
        {/* One instruction (Chad, 15 Sept 2026: "No travel today" read as cold). The rows
            carry their dates; nothing here needs to explain why older travel is listed. */}
        <Sub>{travels.length === 0 ? t('traveler.lostReportedAgainst') : t('traveler.lostSelectTravel')}</Sub>

        <Card style={styles.listCard}>
          {travels.length === 0 ? (
            <Text style={styles.empty}>{t('traveler.noTravelYet')}</Text>
          ) : (
            travels.map((r, i) => {
              // The same row as the Travel Log: the whole route (two lines when long), the
              // date with its year in the traveler's language, the class and the operator.
              const dep = prettyPlace(r.dep);
              const arr = prettyPlace(r.arr);
              const twoLines = `${dep} → ${arr}`.length > 30;
              const classKey = TRAVEL_CLASSES.find((c) => c.label === r.travelClass)?.key;
              const detail = [
                classKey ? t(classNameKey(classKey)) : '',
                r.operatorName ? t('traveler.operatorNamed', { name: r.operatorName }) : '',
              ]
                .filter(Boolean)
                .join(' · ');
              const when = travelDateTime(r.createdAt, language);
              return (
                <Pressable accessibilityRole="button"
                  key={r.id}
                  onPress={() => pickTravel(r)}
                  accessibilityLabel={[`${arr}, ${t('traveler.fromPlace', { place: dep })}`, when, detail].filter(Boolean).join('. ')}
                >
                  <View style={[styles.row, i > 0 && styles.hair]}>
                    <View style={{ flex: 1 }}>
                      {twoLines ? (
                        <>
                          <Text style={styles.rowTitle}>{dep} →</Text>
                          <Text style={styles.rowTitle}>{arr}</Text>
                        </>
                      ) : (
                        <Text style={styles.rowTitle}>{dep} → {arr}</Text>
                      )}
                      <Text style={styles.rowWhen}>{when}</Text>
                      {detail ? <Text style={styles.rowSub}>{detail}</Text> : null}
                    </View>
                    <Chev />
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>

        {/* Nobody leaves this screen with nowhere to go. With no travel to report against
            there is nothing for an operator to search, so the case belongs with a person. */}
        {travels.length === 0 && (
          <Pressable accessibilityRole="button"
            onPress={() => {
              ride.openHelp();
              router.replace({ pathname: '/issues', params: { from: 'lost' } });
            }}
          >
            <Card style={styles.unsureCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('traveler.contactSupport')}</Text>
                <Text style={styles.rowSub}>{t('traveler.describeItPerson')}</Text>
              </View>
              <Chev />
            </Card>
          </Pressable>
        )}

        {/* Somebody who cannot remember which car must not be stuck. This row is not a
            shrug — it puts the report in front of every operator in the window. Named for
            what it does (Chad, 15 Sept 2026: "I'm not sure which" read as hesitant), and its
            line states who is notified — the distinct operators, counted, and nothing about
            what they will do next, which is theirs to do. Absent when no travel in the
            window has an operator recorded: there would be nobody to ask. */}
        {travels.length > 1 && distinctOperators > 0 && (
          <Pressable onPress={pickUnsure} accessibilityRole="button">
            <Card style={styles.unsureCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('traveler.lostAskAll')}</Text>
                <Text style={styles.rowSub}>
                  {distinctOperators === 1
                    ? t('traveler.lostAskAllSubOne', { n: travels.length })
                    : t('traveler.lostAskAllSubMany', { k: distinctOperators, n: travels.length })}
                </Text>
              </View>
              <Chev />
            </Card>
          </Pressable>
        )}
      </Screen>
    );
  }

  // ---- b · DESCRIBE IT -------------------------------------------------------------------
  if (step === 'describe') {
    return (
      <Screen>
        <LetterheadBar onBack={() => setStep('travel')} />
        <Title>{t('traveler.describeTheItem')}</Title>
        <Sub>{describeSub}</Sub>

        <Card style={styles.describeCard}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('traveler.lostItemPh')}
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            multiline
            autoFocus
            textAlignVertical="top"
          />
          <Text style={styles.hint}>
            {t('traveler.whereItSat')}
          </Text>
        </Card>

        <SectionLabel style={styles.lbl}>{t('traveler.lostPlaceLabel')}</SectionLabel>
        <View style={styles.chips}>
          {PLACES.map((p) => (
            <Chip
              key={p}
              label={t(PLACE_KEY[p])}
              on={place === p}
              onPress={() => setPlace(place === p ? null : p)}
            />
          ))}
        </View>

        <SectionLabel style={styles.lbl}>{t('traveler.photo')}</SectionLabel>
        <Card style={styles.photoCard}>
          {photoUri ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photoUri }} style={styles.thumb} />
              <Pressable accessibilityRole="button"
                onPress={() => setPhotoUri(null)}
                style={styles.linkPress}
              >
                <Text style={styles.removeLink}>{t('traveler.remove')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={addPhoto} style={styles.linkPress} accessibilityRole="button">
              <Text style={styles.addLink}>{t('traveler.addAPhoto')}</Text>
            </Pressable>
          )}
        </Card>

        {fileError && <Text style={styles.error}>{fileError}</Text>}

        <PrimaryButton
          label={filing ? t('traveler.busyFiling') : t('traveler.reportTheItem')}
          onPress={file}
          disabled={filing || !description.trim()}
          style={{ marginTop: 'auto' }}
        />
      </Screen>
    );
  }

  // ---- e · A STATUS THAT IS TRUE ---------------------------------------------------------
  // A reopened report is read before its ladder is drawn: no rung is shown green, and no count
  // shown as zero, for a record that has not arrived yet.
  if (!item) {
    return (
      <Screen>
        <LetterheadBar onBack={goBack} />
        <Title>{t('traveler.lostItem')}</Title>
      </Screen>
    );
  }
  const notified = item.notifiedOperatorNames;
  const ret = item.return ?? null;

  return (
    <Screen>
      {/* Back goes back. This sent the traveler home instead — a chevron that means "leave
          the app's idea of where you are", which is the rubric's own example of a control
          named after something other than what it does. */}
      <LetterheadBar onBack={goBack} />
      <Title>{t('traveler.lostItem')}</Title>
      <Sub>
        {item.tripNo ? (
          <>
            {t('traveler.travelSingular')} <Mono size={13.5}>{item.tripNo}</Mono>.
          </>
        ) : (
          t('traveler.lostNTravelsTold', { n: item.candidateTripNos.length })
        )}
      </Sub>

      <SectionLabel style={styles.lbl}>{t('traveler.status')}</SectionLabel>
      <Card style={styles.statusCard}>
        <Rung
          label={t('traveler.reported')}
          done
          note={item ? travelDateTime(item.createdAt, language) : undefined}
        />
        {/* THE HONEST READING OF THIS RUNG. The report is filed against the travel and
            names the operator, which is real and durable. What does NOT yet exist is
            anything on the operator's phone that shows it to them — the operator app has
            no lost item queue, and cannot have one until an operator has an account
            identity (docs/OPEN-DECISIONS.md §4). Calling that "notified" with nothing
            further said would be the same defect this screen was built to remove, so the
            note carries what is actually true underneath the label. */}
        <Rung
          label={t('traveler.operatorNotified')}
          done={!!item && Number(item.operatorDeliveryCount || 0) > 0}
          note={
            notified.length === 0
              ? t('traveler.lostNoOperatorRecorded')
              : Number(item.operatorDeliveryCount || 0) > 0
                ? t('traveler.lostOperatorInboxDelivered', { names: notified.join(', ') })
                : item?.caseNo
                  ? t('traveler.lostCarryingCase', { names: notified.join(', '), caseNo: item.caseNo })
                  : t('traveler.lostNotPassedToSpecialist', { names: notified.join(', ') })
          }
        />
        <Rung
          label={t('traveler.itemLocated')}
          done={item?.status === 'located'}
          failed={item?.status === 'not-found'}
          note={
            item?.status === 'located'
              ? t('traveler.lostOperatorHasIt')
              : item?.status === 'not-found'
                ? t('traveler.lostNotThere')
                : t('traveler.lostWaitingSearch')
          }
        />
        <Rung
          label={t('traveler.returnArranged')}
          done={!!ret}
          note={
            ret
              ? t('traveler.lostCarriesIt', { name: ret.operatorName })
              : t('traveler.lostNotArranged')
          }
        />
        <Rung
          label={t('traveler.backWithYou')}
          done={item?.status === 'returned'}
          note={item?.status === 'returned' ? undefined : t('traveler.itemInYourHands')}
          last
        />
      </Card>

      <SectionLabel style={styles.lbl}>{t('traveler.whatYouDescribed')}</SectionLabel>
      <Card style={styles.describedCard}>
        <Text style={styles.described}>{item?.description}</Text>
        {remotePhotoUrl ? (
          <Image source={{ uri: remotePhotoUrl }} style={[styles.thumb, { marginTop: 12 }]} />
        ) : photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={[styles.thumb, { marginTop: 12 }]} />
            <Text style={styles.hint}>
              {t('traveler.photoStayedOnPhone')}
            </Text>
          </>
        ) : null}
      </Card>

      {/* Return coordination remains human until an authoritative paid/free return-Travel
          lifecycle exists. Do not label operator selection as a dispatch or charge. */}
      <SectionLabel style={styles.lbl}>{t('traveler.returnLabel')}</SectionLabel>
      <Card style={styles.returnCard}>
        <Text style={styles.returnBody}>{t('traveler.lostReturnHuman')}</Text>
        {item?.caseNo ? <Text style={styles.returnNote}>{t('traveler.lostCaseNumber', { caseNo: item.caseNo })}</Text> : null}
      </Card>

      {/* c · TALK TO THE OPERATOR — required, and scoped to the travel. */}
      {recordedTripNo ? (
        <>
          <OutlineButton
            label={t('traveler.messageTheOperator')}
            onPress={openThread}
            style={{ marginTop: 20, marginBottom: 8 }}
          />
          <Text style={styles.maskedNote}>
            {t('traveler.messagesStayInApp')}
          </Text>
        </>
      ) : (
        <Text style={styles.maskedNote}>
          {t('traveler.lostNoVerifiedTravelThread')}
        </Text>
      )}
    </Screen>
  );
}

// One rung of the ladder. `done` is written only where something actually happened, which is
// the whole point of the screen.
function Rung({
  label,
  done,
  failed,
  note,
  last,
}: {
  label: string;
  done?: boolean;
  failed?: boolean;
  note?: string;
  last?: boolean;
}) {
  const color = failed ? colors.red : done ? colors.green : colors.faint;
  return (
    <View style={[styles.rung, !last && styles.rungGap]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rungLabel, { color: done || failed ? colors.ink : colors.muted }]}>
          {label}
        </Text>
        {note && <Text style={styles.rungNote}>{note}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 22, marginBottom: 10 },
  listCard: { marginTop: 20, paddingVertical: 2, paddingHorizontal: 20 },
  empty: { fontSize: 13.5, color: colors.muted, paddingVertical: 18, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowWhen: { fontSize: 12.5, color: colors.ink2, marginTop: 3, lineHeight: 17 },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  unsureCard: {
    marginTop: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  describeCard: { marginTop: 20, paddingVertical: 16, paddingHorizontal: 18 },
  textarea: {
    minHeight: 96,
    fontSize: 16.5,
    color: colors.ink,
    lineHeight: 23,
  },
  hint: { fontSize: 12.5, color: colors.muted, marginTop: 12, lineHeight: 18 },
  // The two links are 44 pt tall (the contract's minimum) inside the same card height as
  // before: the card's own padding gives up what the pressable gained.
  photoCard: { paddingVertical: 3, paddingHorizontal: 20 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  linkPress: { minHeight: 44, justifyContent: 'center' },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.fill },
  // Ink, not the demo's link blue: Chad took the colour off the in-form controls on the
  // confirmation sheet (13–14 Sept 2026) and asked the same of this one (17 Sept).
  addLink: { fontSize: 15, fontWeight: '500', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  removeLink: { fontSize: 13.5, fontWeight: '500', color: colors.muted },
  error: { fontSize: 13.5, color: colors.red, marginTop: 12, lineHeight: 19 },
  statusCard: { paddingVertical: 18, paddingHorizontal: 20 },
  rung: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rungGap: { marginBottom: 16 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  rungLabel: { fontSize: 15, fontWeight: '500' },
  rungNote: { fontSize: 12.5, color: colors.muted, marginTop: 2, lineHeight: 18 },
  describedCard: { paddingVertical: 16, paddingHorizontal: 20 },
  described: { fontSize: 14.5, color: colors.ink2, lineHeight: 21 },
  returnCard: { paddingVertical: 18, paddingHorizontal: 20 },
  returnPath: { fontSize: 17, fontWeight: '600', color: colors.ink },
  returnBody: { fontSize: 14, color: colors.ink2, marginTop: 8, lineHeight: 21 },
  priceRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: { fontSize: 13.5, color: colors.ink2 },
  priceFree: { fontSize: 17, fontWeight: '600', color: colors.ink },
  returnNote: { fontSize: 12.5, color: colors.muted, marginTop: 10, lineHeight: 18 },
  maskedNote: { fontSize: 12.5, color: colors.muted, textAlign: 'center', lineHeight: 18 },
});
