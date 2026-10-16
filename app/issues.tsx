// Patron Support — a category, the traveler's own words, and a real outcome.
//
// WHAT CHANGED, 16 Aug 2026. This screen used to run entirely on the phone: tap a row, watch
// a spinner for 1.9 seconds, read a resolution written months earlier in src/data.ts. Nothing
// was sent, no ticket existed, no money moved, and the escalation link set a variable and
// then told the traveler "A specialist is responding · typically under five minutes".
//
// Every state below now corresponds to something that actually happened on the server:
//   explain   — an answer, reasoned from the recorded facts of that travel
//   credit    — a refund Stripe actually issued; the screen shows it only when it did
//   escalate  — a case filed to a person, with its number, and only if the filing succeeded
//   unreachable — this device could not reach us, said plainly, with an inbox to write to
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../src/components/AppText';
import Svg, { Path } from 'react-native-svg';
import { useNative } from '../src/components/anim';
import { useGoBack } from '../src/components/nav';
import {
  Card,
  Chev,
  LetterheadBar,
  Mono,
  Num,
  PrimaryButton,
  Screen,
  SectionLabel,
  Sub,
  Title,
} from '../src/components/UI';
import { fetchMyLostItems, type LostItem, type LostItemStatus } from '../src/backend/lostitem';
import { fetchMyCases, type SupportCase } from '../src/backend/support';
import { ISSUES, prettyPlace } from '../src/data';
import { travelDate, travelDateTime } from '../src/dates';
import { useRide } from '../src/state/RideContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors, fmt } from '../src/theme';

// The demo's assessing spinner: an 18px sweeping arc.
function SweepArc() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: useNative,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ width: 18, height: 18, transform: [{ rotate }] }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3a9 9 0 1 0 9 9"
          stroke={colors.blue}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

/** A lost item's stored status, as the traveler reads it. */
const LOST_STATUS_KEY: Partial<Record<LostItemStatus, string>> = {
  reported: 'traveler.lostStatusReported',
  'operator-notified': 'traveler.lostStatusOperatorNotified',
  located: 'traveler.lostStatusLocated',
  'return-arranged': 'traveler.lostStatusReturnArranged',
  returned: 'traveler.lostStatusReturned',
};

export default function PatronSupport() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const ride = useRide();
  const { resetIssue } = ride;
  const [draft, setDraft] = useState('');
  const [submissionFailed, setSubmissionFailed] = useState(false);

  // THE TRAVELER'S OWN RECORD OF WHAT THEY HAVE ASKED US (Chad, 15 Sept 2026): the cases the
  // server holds for this account, and the lost-item reports, newest first. What is shown is
  // what is stored — the case number, when it was filed, which travel — and for a lost item
  // the status the operator's app has moved it to. No case carries a handling status, because
  // none is tracked anywhere a screen could state truthfully.
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [casesUnavailable, setCasesUnavailable] = useState(false);
  const [casesPartial, setCasesPartial] = useState(false);
  const [casesLoading, setCasesLoading] = useState(false);
  const [lost, setLost] = useState<LostItem[]>([]);

  // Failed case-history reads must never be represented as an empty inbox.
  // Keep the last known cases visible until a successful refresh replaces them.
  const refreshCases = useCallback(async (live: () => boolean = () => true) => {
    setCasesLoading(true);
    const result = await fetchMyCases();
    if (!live()) return;
    if (result.unavailable) setCasesUnavailable(true);
    else {
      setCases(result.cases);
      setCasesPartial(result.possiblyIncomplete === true);
      setCasesUnavailable(false);
    }
    setCasesLoading(false);
  }, []);
  // Read again every time the screen comes into view, not once on mount: a report filed a
  // moment ago on the Lost Item screen is listed the moment the traveler comes back here.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void refreshCases(() => live);
      fetchMyLostItems().then((items) => live && setLost(items));
      return () => {
        live = false;
      };
    }, [refreshCases]),
  );

  // THE TRAVEL THE CASE CONCERNS, stated before the traveler writes a word (Chad, 15 Sept
  // 2026: the recent journey pinned at the top). From the account's records, never guessed;
  // a traveler with completed travel and none selected is asked to select one, and a new
  // account with no travel sees nothing here — a case can still be filed.
  const regarding = ride.myRides.find((r) => r.tripNo === ride.issueTripNo);
  const hasTravels = ride.myRides.some((r) => r.status === 'completed');
  const pickTravel = () => router.navigate({ pathname: '/history', params: { pick: '1' } });

  const caseRows = [
    ...cases.map((c) => ({ id: c.caseNo, createdAt: c.createdAt, kind: 'case' as const, c, l: null as LostItem | null })),
    ...lost.map((l) => ({ id: `lost-${l.id}`, createdAt: l.createdAt, kind: 'lost' as const, c: null as SupportCase | null, l })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  // Covers every way off this screen — including browser/hardware back, which bypasses the
  // in-app handlers — so an abandoned case does not leave a half-open state behind it.
  useEffect(() => () => resetIssue(), [resetIssue]);

  const category = ride.issue ? ISSUES[ride.issue] : null;
  const result = ride.issueResult;
  const done = () => router.dismissTo('/');

  // This route contains its own hierarchy (categories → issue detail → outcome). Router back
  // only knows that /issues was opened from another route; using it while a category is open
  // skips the logical parent and can throw the Traveler to Home/Receipt. Retrace the in-route
  // hierarchy first, then use the route stack only from the category list.
  const supportBack = () => {
    if (ride.issueState !== null) {
      resetIssue();
      setDraft('');
      setSubmissionFailed(false);
      return;
    }
    goBack();
  };

  const choose = (key: string) => {
    const iss = ISSUES[key];
    if (!iss) return;
    // A lost item is a flow, not a paragraph — it needs to know which travel first.
    if (iss.route) {
      router.navigate(iss.route as '/lost');
      return;
    }
    setDraft('');
    setSubmissionFailed(false);
    ride.pickIssue(key);
  };

  return (
    <Screen>
      <LetterheadBar onBack={supportBack} />
      <Title>{t('traveler.patronSupport')}</Title>
      {/* The instruction belongs to the form. Once the outcome is on screen the card says it. */}
      {ride.issueState !== 'resolved' && <Sub>{t('traveler.supportSub')}</Sub>}

      {/* ---- the travel this concerns ---- */}
      {ride.issueState === null && regarding && (
        <Card style={styles.regardingCard}>
          <Text style={styles.regardingLabel}>{t('traveler.regarding')}</Text>
          {/* A long route is set as two lines, the arrow closing the first, so a place name
              is never broken by the wrap — as on the Travel Log. */}
          {`${prettyPlace(regarding.dep)} → ${prettyPlace(regarding.arr)}`.length > 36 ? (
            <>
              <Text style={styles.regardingRoute}>{prettyPlace(regarding.dep)} →</Text>
              <Text style={styles.regardingRouteCont}>{prettyPlace(regarding.arr)}</Text>
            </>
          ) : (
            <Text style={styles.regardingRoute}>
              {prettyPlace(regarding.dep)} → {prettyPlace(regarding.arr)}
            </Text>
          )}
          <Text style={styles.regardingMeta}>
            {travelDateTime(regarding.createdAt, language)}
            {' · '}
            <Mono size={12.5}>{regarding.tripNo}</Mono>
          </Text>
          {hasTravels && (
            <Pressable onPress={pickTravel} accessibilityRole="button" style={styles.linkRow}>
              <Text style={styles.link}>{t('traveler.selectAnotherTravel')}</Text>
            </Pressable>
          )}
        </Card>
      )}
      {ride.issueState === null && !regarding && hasTravels && (
        <Pressable onPress={pickTravel} accessibilityRole="button">
          <Card style={styles.regardingCard}>
            <Text style={styles.regardingLabel}>{t('traveler.regarding')}</Text>
            <Text style={styles.link}>{t('traveler.selectTravelForCase')}</Text>
          </Card>
        </Pressable>
      )}

      {/* ---- the categories ---- */}
      {ride.issueState === null && (
        <Card style={styles.listCard}>
          {Object.entries(ISSUES).map(([key, iss], i) => (
            <Pressable key={key} onPress={() => choose(key)} accessibilityRole="button">
              <View style={[styles.issueRow, i > 0 && styles.hair]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.issueLabel}>{t(iss.label)}</Text>
                  {/* Said on the row, not only after the tap: a safety matter is read by a
                      person, always — and the server enforces it whatever the words. */}
                  {iss.alwaysHuman && <Text style={styles.issueSub}>{t('traveler.alwaysReachesPerson')}</Text>}
                </View>
                <Chev />
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {/* ---- the traveler's own cases ---- */}
      {ride.issueState === null && casesUnavailable && (
        <Card style={styles.regardingCard}>
          <Text style={styles.submissionError}>{t('traveler.casesCouldNotLoad')}</Text>
          <Pressable accessibilityRole="button" disabled={casesLoading}
            onPress={() => { void refreshCases(); }} style={styles.linkRow}>
            <Text style={styles.link}>{t('traveler.retryCases')}</Text>
          </Pressable>
        </Card>
      )}
      {ride.issueState === null && casesPartial && !casesUnavailable && (
        <Card style={styles.regardingCard}>
          <Text style={styles.caseMeta}>{t('traveler.caseHistoryPartial')}</Text>
        </Card>
      )}
      {ride.issueState === null && caseRows.length > 0 && (
        <>
          <SectionLabel style={styles.lbl}>{t('traveler.yourCases')}</SectionLabel>
          <Card style={styles.listCard}>
            {caseRows.map((row, i) => {
              const tripNo = row.c?.tripNo ?? row.l?.tripNo ?? null;
              // The travel number is operational data, so it is set in Mono here as it is on
              // every other screen.
              const meta = (
                <Text style={styles.caseMeta}>
                  {t('traveler.filedOn', { date: travelDate(row.createdAt, language) })}
                  {tripNo ? (
                    <>
                      {' · '}
                      {t('traveler.travelSingular')}{' '}
                      <Mono size={12.5} color={colors.muted}>
                        {tripNo}
                      </Mono>
                    </>
                  ) : null}
                </Text>
              );
              if (row.l) {
                // A lost item report opens again onto its ladder, so the return and the thread
                // are reachable for as long as the item is out — not only on the day it was
                // filed. A support case opens nothing (no handling status is tracked anywhere
                // a screen could state truthfully), so its row carries no chevron.
                const l = row.l;
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => router.navigate({ pathname: '/lost', params: { item: l.id } })}
                    accessibilityRole="button"
                  >
                    <View style={[styles.caseListRow, styles.caseListOpen, i > 0 && styles.hair]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.caseTitle}>
                          {t('traveler.lostItem')} · {t(LOST_STATUS_KEY[l.status] ?? 'traveler.lostStatusReported')}
                        </Text>
                        {meta}
                      </View>
                      <Chev />
                    </View>
                  </Pressable>
                );
              }
              if (!row.c) return null;
              return (
                <View key={row.id} style={[styles.caseListRow, i > 0 && styles.hair]}>
                  <Text style={styles.caseTitle}>
                    <Mono size={13.5}>{row.c.caseNo}</Mono>
                    {row.c.kind === 'emergency' ? ` · ${t('traveler.emergencyKind')}` : ''}
                  </Text>
                  {meta}
                  <Text style={styles.caseMeta}>
                    {row.c.status === 'closed' || row.c.status === 'resolved'
                      ? t('traveler.caseStatusClosed')
                      : row.c.acknowledgedAt ? t('traveler.caseStatusAcknowledged')
                      : t('traveler.caseStatusReceived')}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}

      {/* ---- the traveler's own words ---- */}
      {ride.issueState === 'describing' && category && (
        <>
          <SectionLabel style={styles.lbl}>{t(category.label)}</SectionLabel>
          <Card style={styles.describeCard}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={category.prompt ? t(category.prompt) : ''}
              placeholderTextColor={colors.muted}
              // The caret is ink, not the platform's blue (Chad, 14 Sept 2026, as on the search fields).
              selectionColor={colors.ink}
              cursorColor={colors.ink}
              style={styles.textarea}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </Card>
          {ride.issueTripNo ? (
            <View style={styles.tripRow}>
              <Text style={styles.tripLabel}>{t('traveler.travel')}</Text>
              <Mono size={13}>{ride.issueTripNo}</Mono>
            </View>
          ) : null}
          {category.alwaysHuman && (
            // Said before they write, not after. Someone reporting a safety incident should
            // not have to wonder whether a machine is about to answer them.
            <Text style={styles.humanNote}>{t('traveler.alwaysReachesPerson')}</Text>
          )}
          {submissionFailed && <Text style={styles.submissionError}>{t('traveler.messageNotDelivered')}</Text>}
          <PrimaryButton
            label={t('traveler.send')}
            onPress={async () => {
              setSubmissionFailed(false);
              try {
                if (!await ride.submitDescription(draft)) setSubmissionFailed(true);
              } catch {
                setSubmissionFailed(true);
              }
            }}
            disabled={!draft.trim()}
            style={{ marginTop: 'auto' }}
          />
        </>
      )}

      {ride.issueState === 'resolving' && (
        <Card style={styles.stateCard}>
          <View style={styles.resolvingHead}>
            <SweepArc />
            <Text style={styles.resolvingTitle}>{t('traveler.assessing')}</Text>
          </View>
          <Text style={styles.resolvingBody}>
            {t('traveler.readingAgainstRecord')}
          </Text>
        </Card>
      )}

      {/* ---- what actually happened ---- */}
      {ride.issueState === 'resolved' && result && (
        <>
          {/* The eyebrows state the outcome in the quiet grey every section label wears. They
              were blue, green and red by outcome — a coloured "WITH A PERSON" read as a
              reactive badge, and the demo has no such colours (Chad, 16 Sept 2026). */}
          {result.action === 'explain' && (
            <Card style={styles.stateCard}>
              <SectionLabel>{t('traveler.answered')}</SectionLabel>
              <Text style={styles.stateBody}>{result.message}</Text>
            </Card>
          )}

          {result.action === 'credit' && (
            <Card style={styles.stateCard}>
              <SectionLabel>{t('traveler.refunded')}</SectionLabel>
              <Num size={27} weight="600" style={{ marginTop: 8 }}>
                {fmt(result.creditCents / 100)}
              </Num>
              <Text style={styles.stateBody}>{result.message}</Text>
              <Text style={styles.stateNote}>{t('traveler.refundTiming')}</Text>
            </Card>
          )}

          {result.action === 'escalate' && (
            <Card style={styles.stateCard}>
              <SectionLabel>{result.filed ? t('traveler.caseFiled') : t('traveler.notFiled')}</SectionLabel>
              <Text style={styles.stateBody}>{result.message}</Text>
              {/* The record of what was filed — the case number, the matter, the travel — so
                  the traveler leaves with the same facts the person reading it has. */}
              {result.filed && result.caseNo && (
                <View style={styles.caseRow}>
                  <Text style={styles.tripLabel}>{t('traveler.caseLabel')}</Text>
                  <Mono size={13}>{result.caseNo}</Mono>
                </View>
              )}
              {result.filed && category && (
                <View style={styles.caseRow}>
                  <Text style={styles.tripLabel}>{t('traveler.matterLabel')}</Text>
                  <Text style={styles.tripLabel}>{t(category.label)}</Text>
                </View>
              )}
              {result.filed && ride.issueTripNo ? (
                <View style={styles.caseRow}>
                  <Text style={styles.tripLabel}>{t('traveler.travelNumber')}</Text>
                  <Mono size={13}>{ride.issueTripNo}</Mono>
                </View>
              ) : null}
            </Card>
          )}

          {result.action === 'unreachable' && (
            <Card style={styles.stateCard}>
              <SectionLabel>{t('traveler.notSent')}</SectionLabel>
              <Text style={styles.stateBody}>{result.message}</Text>
              <View style={styles.caseRow}>
                <Text style={styles.tripLabel}>{t('traveler.travel')}</Text>
                <Mono size={13}>{ride.issueTripNo}</Mono>
              </View>
            </Card>
          )}

          {/* Named for what it does: it returns to Home. "Complete" could have meant closing
              the case (Chad, 16 Sept 2026). */}
          <PrimaryButton label={t('traveler.returnHome')} onPress={done} style={{ marginTop: 'auto' }} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lbl: { marginTop: 22, marginBottom: 10 },
  listCard: { marginTop: 20, paddingVertical: 2, paddingHorizontal: 20 },
  regardingCard: { marginTop: 20, paddingVertical: 16, paddingHorizontal: 20 },
  regardingLabel: { fontSize: 11.5, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.muted },
  regardingRoute: { fontSize: 15, color: colors.ink, marginTop: 8, lineHeight: 21 },
  regardingRouteCont: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  regardingMeta: { fontSize: 12.5, color: colors.ink2, marginTop: 4 },
  linkRow: { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 4 },
  link: { fontSize: 14, fontWeight: '500', color: colors.ink },
  issueSub: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
  caseListRow: { paddingVertical: 14 },
  caseListOpen: { flexDirection: 'row', alignItems: 'center' },
  caseTitle: { fontSize: 15, color: colors.ink },
  caseMeta: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
  issueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  issueLabel: { fontSize: 15, color: colors.ink },
  describeCard: { paddingVertical: 16, paddingHorizontal: 18 },
  textarea: { minHeight: 110, fontSize: 16.5, color: colors.ink, lineHeight: 23 },
  tripRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripLabel: { fontSize: 13.5, color: colors.ink2 },
  humanNote: { fontSize: 12.5, color: colors.muted, marginTop: 10, lineHeight: 18 },
  submissionError: { fontSize: 13, color: colors.red, marginTop: 10, lineHeight: 19 },
  stateCard: { marginTop: 20, padding: 20 },
  resolvingHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resolvingTitle: { fontSize: 14, fontWeight: '600', color: colors.blue },
  resolvingBody: { fontSize: 14, color: colors.ink2, marginTop: 12, lineHeight: 21.7 },
  stateBody: { fontSize: 14, color: colors.ink2, marginTop: 10, lineHeight: 21.7 },
  stateNote: { fontSize: 12.5, color: colors.muted, marginTop: 10, lineHeight: 18 },
  caseRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
