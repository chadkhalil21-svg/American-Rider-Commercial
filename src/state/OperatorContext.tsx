// American Rider — the OPERATOR side's single store. Role flag, qualification
// checklist, commissioned state, availability, real assigned-Travel loop, and
// revenue presentation. Server authority governs qualification, duty, Travel progression,
// settlement and institutional records; device storage here is presentation/cache state.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { accountInitials, accountName } from '../account';
import { APP_FEE, coordinationFee, fareFromTotal } from '../data';
import { goOffline, goOnline, settlePendingPayouts, submitForReview } from '../backend/connect';
import { confirmOperatorBackgroundLocationUse, startBackgroundPresence, stopBackgroundPresence } from '../backend/presence';
import { startHeartbeat } from '../backend/heartbeat';
import {
  acceptTravel,
  declineTravel,
  markArrived,
  markCompleted,
  markOnboard,
  watchAssignedTravel,
  type AssignedTravel,
} from '../backend/operatorInbox';
import { announceTravel, answerCheckIn } from '../backend/checkin';
import { submitDocument, type DocKind, type DocReview, type SelectedDocument } from '../backend/documentUpload';
import { reportPosition } from '../backend/telemetry';
import { sendTravelMessage, watchTravelThread } from '../backend/messages';
import { resolveOperatorDutyPosition } from '../location';
import { AppState, Platform } from 'react-native';
import { useAuth } from './AuthContext';
// Aliased: this module has local bindings named `t` (a message string, a timer).
import { t as tr } from '../i18n';

export type DocKey =
  | 'basics'
  | 'license'
  | 'registration'
  | 'inspection'
  | 'insurance'
  | 'background';
export type DocState = 'todo' | 'checking' | 'ok';
export type Verification = 'none' | 'pending' | 'commissioned';
export type Role = 'traveler' | 'operator';

// The web demo shell's 6-item checklist, plus the founders' Background Check step
// (10 Aug spec: operator-paid, pass/fail, three-year Florida re-check).
// KEYS, NOT SENTENCES — this array is built once at import time, before the stored
// language is read, so translated strings here would pin the checklist to the default
// locale for the life of the process. Screens translate `title`/`sub` at render.
export const QUAL_DOCS: {
  key: DocKey;
  title: string;
  sub: string;
  detail?: boolean; // step opens a guidance screen instead of inline verification
}[] = [
  // No self-verified Basics badge: data entry is not independent approval.
  { key: 'license', title: 'traveler.qualLicense', sub: 'traveler.qualLicenseSub' },
  { key: 'registration', title: 'traveler.qualRegistration', sub: '' },
  { key: 'insurance', title: 'traveler.qualInsurance', sub: 'traveler.qualInsuranceSub', detail: true },
  { key: 'background', title: 'traveler.backgroundCheck', sub: 'traveler.qualBgSub', detail: true },
  // VEHICLE INSPECTION IS NOT A STEP EITHER. Removed from the Documents screen on 30 Aug and
  // left standing here, so qualification still demanded one — the removal was half done, which
  // is worse than not started: the operator is told it is not needed on one screen and required
  // on the next. Florida requires no inspection (see app/operator/documents.tsx).
  //
  // IDENTITY IS NOT A STEP, because nothing could ever complete it. Found 30 Aug 2026 while
  // verifying the inspection removal: the Documents screen told every operator "A verification
  // selfie is still needed" — with no button, no screen, and no caller anywhere in the app that
  // reaches verifyDoc('identity'). It could not be satisfied, so it said "still needed" forever.
  //
  // The same shape as the tip path, the website and the screening gate: stated at one end,
  // never wired at the other. This one was operator-facing, on the compliance screen, telling
  // somebody they were incomplete when they were not.
  //
  // REMOVED RATHER THAN BUILT, for the reason the vehicle inspection was: §627.748(12)(a) does
  // not require it, and the screening company already establishes identity — an SSN trace and
  // government ID sit behind the criminal search. A selfie we cannot read adds nothing to that.
];

const TODO_DOCS: Record<DocKey, DocState> = {
  basics: 'todo',
  license: 'todo',
  registration: 'todo',
  inspection: 'todo',
  insurance: 'todo',
  background: 'todo',
};

// A simulated operation request. The first is the operator demo's exact request —
// traveler and fare figures come from src/data.ts (RIDER, the Miami Airport place);
// the rest rotate through demo places so repeat requests stay plausible.
// A travel put in front of an operator to answer.
//
// The optional fields are the ones a REAL dispatched travel does not carry. The scripted
// requests had a traveler rating, a "3 min away", a journey time and a mileage; the ride
// record has none of them, and no operator rating exists anywhere in the product. They stay
// optional rather than being filled with plausible numbers — a request sheet that invents how
// far away a pickup is is telling an operator something nobody knows.
export type SimRequest = {
  traveler: string;
  bookedForAnother?: boolean;
  teen?: boolean;
  guardianName?: string | null;
  pinRequired?: boolean;
  tInit: string;
  tRating?: number;
  pickup: string;
  pickupMin?: number;
  dest: string;
  tripMin?: number;
  dist?: number;
  fare: number;
  /** Set when this is a real dispatched travel. Absent on the test-program script. */
  rideId?: string;
  /** The travel number, which is what the message thread is keyed by. */
  tripNo?: string;
  /** The traveler's uid, so the operator can write into the thread. */
  travelerUid?: string;
  cabinPreferences?: {
    climate: 'Cool' | 'Moderate' | 'Warm';
    music: 'None' | 'Traveler Choice';
    quiet: boolean;
    charging: boolean;
    luggage: boolean;
  };
};

/** Initials from whatever name the traveler set. Empty when they set none. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();


// THE SCRIPTED REQUESTS ARE GONE. An operator on duty was handed one of these every 2.6
// seconds — invented journeys with invented travelers — while the real traveler who had
// just booked waited for somebody who was never told. Requests now come from dispatch
// (src/backend/operatorInbox.ts) and only exist when a travel really was assigned.

export type ActiveOp = SimRequest & { no: string; earn: number };
export type CompletedOp = {
  no: string;
  arr: string;
  dep: string;
  earn: number;
  fare: number;
  // Optional for the same reason they are optional on a request: a real travel record carries
  // no mileage or journey time. The completion screen omits the row rather than printing a
  // measurement nobody took.
  dist?: number;
  tripMin?: number;
  at: number; // epoch ms
};
export type OpMsg = { me: boolean; text: string };

// The operator keeps 99%: travel fare minus the flat 1% coordination commission.
export const earnOf = (fare: number) => +(fare - coordinationFee(fare)).toFixed(2);

const round2 = (n: number) => +n.toFixed(2);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Recent-operation time labels, the demo's register: a time today, a date before.
export const opTimeLabel = (at: number) => {
  const d = new Date(at);
  if (sameDay(d, new Date())) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const K_ROLE = 'ar:role';
const K_VERIFICATION = 'ar:operator-verification';
const K_COMMISSIONED = 'ar:operator-commissioned'; // ISO date when commissioned
const K_DOCS = 'ar:operator-docs';
const K_BGCHECK = 'ar:operator-bgcheck'; // ISO date of the verified screening record
const K_REVENUE = 'ar:operator-revenue';

// How often an on-duty phone re-states that it is there. Comfortably inside the server's
// PRESENCE_STALE_MS so one missed renewal — a lift, a tunnel — does not drop a working
// operator out of the fleet.
const PRESENCE_RENEW_MS = 90_000;

// How long a travel stays off this phone's screen after its countdown ran out. Longer than the
// server's 45-second re-offer, so somebody else gets first refusal, and short enough that an
// operator who put the phone down for a minute is asked again rather than losing the fare.
const LAPSE_QUIET_MS = 60_000;

// How old a travel in an active status may be and still be treated as underway when the app
// restarts. See the note where it is used — beyond this it is a record that never closed, not
// a journey in progress, and treating it as current blocks every travel after it.
const ACTIVE_RESTORE_MAX_MS = 6 * 60 * 60 * 1000;
const K_VEHICLE = 'ar:operator-vehicle'; // the car a traveler will be looking for
const K_COVERAGE = 'ar:operator-coverage'; // the date the commercial policy runs out

type RevenueBlob = { ops: CompletedOp[]; withdrawn: number; seq: number };
const EMPTY_REVENUE: RevenueBlob = { ops: [], withdrawn: 0, seq: 0 };

type OperatorState = {
  ready: boolean;
  // identity — the signed-up user IS the operator (the demo shell's rule)
  opName: string;
  opInitials: string;
  // role + qualification
  role: Role;
  setRole: (r: Role) => void;
  verification: Verification;
  commissionedAt: string | null;
  docs: Record<DocKey, DocState>;
  verifyDoc: (k: DocKey) => void;
  /** Submit a photographed document. The ONLY route to a verified document step. */
  reviewDoc: (k: DocKind, uri: SelectedDocument | string) => Promise<DocReview | { error: string } | null>;
  /** What the reader said, per document — reason included. */
  docReviews: Partial<Record<DocKey, DocReview>>;
  /**
   * Mirror the SERVER's screening record onto the background document. The phone never
   * decides this one: a recorded pass marks it ok (dated by the report, not by today), and
   * anything else un-marks it — including an ok left over from the retired test program,
   * which nobody gets to keep for a check that was never run.
   */
  syncBackground: (passed: boolean, conductedAt?: number | null) => void;
  verifiedCount: number;
  allVerified: boolean;
  bgCheckedAt: string | null;
  /** Ask the server for review. Pending only once the server has accepted the request. */
  submitQualification: () => Promise<{ ok: boolean; error?: string }>;
  /** Record the server's qualification on this phone. Called only after qualificationStatus() says so. */
  commission: () => void;
  /** Return to the checklist after the server refused the qualification. */
  resetQualification: () => void;
  // availability + the simulated operation loop
  online: boolean;
  /** This device is off, but the server has not yet confirmed concluding duty. */
  offlinePending: boolean;
  offlineBusy: boolean;
  /** False when this device cannot hold presence while locked — the screen must say so. */
  backgroundPresence: boolean;
  setOnline: (b: boolean) => void;
  /** A real travel dispatched to this operator and not yet answered. */
  incoming: SimRequest | null;
  declineRequest: (r: SimRequest) => void;
  /** The countdown ran out. Leaves the travel assigned; does NOT record a refusal. */
  lapseRequest: (r: SimRequest) => void;
  /** The traveler has boarded — reported so their screen can follow. */
  beginTrip: (teenPickupCode?: string) => Promise<boolean>;
  /** Why going on duty was refused — shown on the operator home, never swallowed. */
  onlineError: string | null;
  /** The server's machine-readable reason, so a screen can point at the fix. */
  onlineErrorCode: string | null;
  /** Why assigned travel cannot be read, when it cannot. Also never swallowed. */
  inboxError: string | null;
  /** The operator's own car. Null until they record one; duty is refused until they do. */
  vehicle: { car: string; plate: string } | null;
  setVehicle: (car: string, plate: string) => void;
  /** The date the commercial policy runs out, as printed on the certificate (YYYY-MM-DD). */
  insuranceExpiry: string | null;
  setInsuranceExpiry: (iso: string) => void;
  /** Days until it lapses; negative once it has, null when nothing is on file. */
  coverageDaysLeft: number | null;
  /**
   * Every reason travel cannot currently be assigned to this operator, in plain terms.
   *
   * Standing, not raised on a tap. An operator used to press Go Available, watch it refuse,
   * and be told once — so anyone opening the app to a screen that simply would not start had
   * to guess. These are the conditions we can establish on the device; Stripe's payout answer
   * arrives only when the server is asked, and appears as onlineError.
   */
  dutyBlocks: { title: string; detail: string; route?: string }[];
  onlineBusy: boolean;
  op: ActiveOp | null;
  arrived: boolean;
  /** The platform's outstanding question about the travel underway, or null. */
  checkIn: string | null;
  respondToCheckIn: (text: string) => Promise<boolean>;
  /** Resolves true only once the server has accepted the travel for this operator. */
  acceptRequest: (r: SimRequest) => Promise<boolean>;
  confirmArrival: () => Promise<boolean>;
  cancelOp: () => void;
  completeOp: () => Promise<boolean>;
  lastCompleted: CompletedOp | null;
  msgs: OpMsg[];
  sendMsg: (text: string) => void;
  /** Whether the last authenticated attempt to check unpaid Travel was confirmed. */
  payoutRecoveryStatus: 'not_checked' | 'checking' | 'checked' | 'unconfirmed';
  // Local operational estimates, not authoritative Stripe transfer or bank figures.
  ops: CompletedOp[];
  todayTotal: number;
  todayOps: number;
  weekTotal: number;
  monthTotal: number;
  yearTotal: number;
  balance: number;
};

/** A travel an operator has taken on and not yet finished. */
const ACTIVE_STATUSES = ['accepted', 'arrived', 'onboard'];

const Ctx = createContext<OperatorState | null>(null);

export function useOperator(): OperatorState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOperator must be used inside <OperatorProvider>');
  return c;
}

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [role, setRoleState] = useState<Role>('traveler');
  const [verification, setVerification] = useState<Verification>('none');
  const [commissionedAt, setCommissionedAt] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<DocKey, DocState>>(TODO_DOCS);
  const [bgCheckedAt, setBgCheckedAt] = useState<string | null>(null);
  // THE CAR A TRAVELER WILL BE LOOKING FOR.
  //
  // goOnline used to send DRIVER.car and DRIVER.plate — the demonstration operator's Gray
  // Toyota Camry, KTR 4821 — for every real operator, because no real vehicle was ever
  // recorded. A traveler standing at the kerb was told to look for a car that was not coming.
  const [vehicle, setVehicleState] = useState<{ car: string; plate: string } | null>(null);
  // THE DATE THE COMMERCIAL POLICY RUNS OUT, as printed on the certificate.
  //
  // The Operator's qualifying commercial coverage is a mandatory duty gate. Any separate
  // contingency coverage maintained by the TNC under applicable law does not replace that
  // Operator obligation. Nothing recorded when the Operator policy ended, which meant nothing
  // could stop a Travel being assigned after that policy had run out.
  //
  // An expiry date is on the certificate and can be checked without asking anybody anything.
  // It does not catch a policy cancelled mid-term, which needs a carrier feed; it does catch
  // the ordinary case, which is a date passing while nobody was watching.
  const [insuranceExpiry, setInsuranceExpiryState] = useState<string | null>(null);
  const [online, setOnlineState] = useState(false);
  const [offlinePending, setOfflinePendingState] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [dutyRestoreReady, setDutyRestoreReady] = useState(false);
  const offlinePendingRef = useRef(false);
  const offlineInFlightRef = useRef(false);
  // A superseded Commence request must not revive local duty after cancellation.
  const dutyAttemptRef = useRef(0);
  const confirmOfflineRef = useRef<(() => Promise<void>) | null>(null);
  const userUidRef = useRef(user?.uid ?? null);
  userUidRef.current = user?.uid ?? null;
  // Why going on duty was refused, in Stripe's terms. Held here rather than thrown because
  // an operator who cannot be paid must be TOLD, not silently flipped back off.
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineErrorCode, setOnlineErrorCode] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  // Why the travel inbox is not reporting, when it is not. An operator on duty seeing nothing
  // must be able to tell "no travels yet" from "this device cannot read your travels".
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<SimRequest | null>(null);
  /** Whether presence survives the phone locking. False when the operator declined "always". */
  const [backgroundPresence, setBackgroundPresence] = useState(true);
  // Travels whose countdown ran out on this device, and when. Held here rather than written to
  // the record, because a lapse is this phone's business and a decline is the platform's. The
  // sheet stays shut for LAPSE_QUIET_MS so it cannot reopen on the next snapshot and count
  // down at somebody all over again — and reopens after it, because an unanswered travel that
  // nobody else took should keep asking.
  const lapsedRef = useRef<Map<string, number>>(new Map());
  // Fires when a lapsed travel becomes offerable again. onSnapshot only fires when the DATA
  // changes, and a lapse changes none — so without this the quiet period simply ended and
  // nothing ever looked again. The same trap the going-on-duty effect below was written for.
  const relookTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [op, setOp] = useState<ActiveOp | null>(null);
  // One accepted next Travel may wait behind the passenger currently onboard.
  const [queuedOp, setQueuedOp] = useState<ActiveOp | null>(null);
  // The travel underway, reachable from callbacks that must not re-create on every change.
  const opRef = useRef<ActiveOp | null>(null);
  const [arrived, setArrived] = useState(false);
  // The platform's outstanding question about this travel, if it has one. Raised by
  // backend/monitor.js when the vehicle has stopped for longer than a long light with nothing
  // nearby to explain it, and cleared the moment it moves again.
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [lastCompleted, setLastCompleted] = useState<CompletedOp | null>(null);
  const [msgs, setMsgs] = useState<OpMsg[]>([]);
  const [revenue, setRevenue] = useState<RevenueBlob>(EMPTY_REVENUE);
  const [payoutRecoveryStatus, setPayoutRecoveryStatus] = useState<OperatorState['payoutRecoveryStatus']>('not_checked');

  // Mirror of the revenue blob so mutations never nest setState inside an updater
  // (React updaters must stay pure — StrictMode runs them twice).
  const revRef = useRef<RevenueBlob>(EMPTY_REVENUE);

  // ---- load persisted state once ----
  useEffect(() => {
    AsyncStorage.multiGet([
      K_ROLE, K_VERIFICATION, K_COMMISSIONED, K_DOCS, K_BGCHECK, K_REVENUE, K_VEHICLE, K_COVERAGE,
    ])
      .then((pairs) => {
        const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? null;
        const r = get(K_ROLE);
        if (r === 'operator' || r === 'traveler') setRoleState(r);
        const v = get(K_VERIFICATION);
        if (v === 'pending' || v === 'commissioned') setVerification(v);
        const cov = get(K_COVERAGE);
        if (cov) setInsuranceExpiryState(cov);
        const veh = get(K_VEHICLE);
        if (veh) {
          try {
            const parsed = JSON.parse(veh);
            if (parsed?.car && parsed?.plate) setVehicleState(parsed);
          } catch {
            /* unreadable — treated as no vehicle on file, which refuses duty rather than inventing one */
          }
        }
        const c = get(K_COMMISSIONED);
        if (c) setCommissionedAt(c);
        const d = get(K_DOCS);
        if (d) {
          try {
            const parsed = JSON.parse(d) as Partial<Record<DocKey, DocState>>;
            setDocs({ ...TODO_DOCS, ...parsed });
          } catch {
            /* keep defaults */
          }
        }
        const bg = get(K_BGCHECK);
        if (bg) setBgCheckedAt(bg);
        const rev = get(K_REVENUE);
        if (rev) {
          try {
            const parsed = JSON.parse(rev) as RevenueBlob;
            if (parsed && Array.isArray(parsed.ops)) {
              const blob = { ...EMPTY_REVENUE, ...parsed };
              revRef.current = blob;
              setRevenue(blob);
            }
          } catch {
            /* keep defaults */
          }
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    AsyncStorage.setItem(K_ROLE, r).catch(() => {});
  }, []);

  const persistDocs = useCallback((next: Record<DocKey, DocState>) => {
    // never persist a mid-flight "checking" — it would strand the row on relaunch
    const clean = Object.fromEntries(
      Object.entries(next).map(([k, v]) => [k, v === 'checking' ? 'todo' : v]),
    );
    AsyncStorage.setItem(K_DOCS, JSON.stringify(clean)).catch(() => {});
  }, []);

  // What the reader said about each document, so a refusal or a hold shows its reason rather
  // than appearing as a bare unticked box.
  const [docReviews, setDocReviews] = useState<Partial<Record<DocKey, DocReview>>>({});

  /**
   * Submit a document and record what came back.
   *
   * WHAT THIS REPLACES. verifyDoc set 'checking', waited 900 milliseconds and set 'ok'. Licence,
   * registration, inspection and insurance — every one approved by a countdown, with no image
   * captured, so there was nothing to approve even in principle.
   *
   * THE ONLY PATH TO 'ok' IS A SERVER VERDICT OF accept. A refusal or a hold leaves the document
   * unverified, which is what keeps the operator out of the fleet — and a failed upload leaves it
   * unverified too, because a failure that reads as a pass is the exact defect being removed.
   */
  const reviewDoc = useCallback(
    async (k: DocKind, uri: SelectedDocument | string): Promise<DocReview | { error: string } | null> => {
      setDocs((prev) => ({ ...prev, [k]: 'checking' as DocState }));
      const out = await submitDocument(k, uri);
      if (!out || 'error' in out) {
        setDocs((prev) => {
          const next = { ...prev, [k]: 'todo' as DocState };
          persistDocs(next);
          return next;
        });
        return out;
      }
      setDocReviews((r) => ({ ...r, [k]: out }));
      // The policy expiry is read from the accepted insurance document. Do not make the
      // Operator type the same date a second time — duplicate entry creates disagreement and
      // turns a deterministic fact into a clerical task.
      if (k === 'insurance' && out.verdict === 'accept' && out.expiry) {
        setInsuranceExpiryState(out.expiry);
        AsyncStorage.setItem(K_COVERAGE, out.expiry).catch(() => {});
      }
      setDocs((prev) => {
        const next = { ...prev, [k]: (out.verdict === 'accept' ? 'ok' : 'todo') as DocState };
        persistDocs(next);
        return next;
      });
      return out;
    },
    [persistDocs],
  );

  /**
   * Mark a step done without a document.
   *
   * ONLY FOR STEPS WITH NO DOCUMENT TO READ — basics, identity, and the background check, whose
   * verdict comes from a licensed screening company through the server. The four document steps
   * go through reviewDoc and cannot reach 'ok' any other way.
   */
  const verifyDoc = useCallback(
    (k: DocKey) => {
      if (k === 'license' || k === 'registration' || k === 'inspection' || k === 'insurance') {
        // Refused rather than silently ignored: a caller reaching for this on a document step is
        // reaching for the 900ms timer, and it should stop being there to find.
        if (__DEV__) console.warn(`verifyDoc('${k}') is not a document path — use reviewDoc().`);
        return;
      }
      // NO TIMER. This used to show 'checking' for 900 milliseconds and then pass, which read
      // as a review that never happened. These steps have nothing to review, so they are done
      // when the operator does them, and they say so at once.
      setDocs((prev) => {
        if (prev[k] === 'ok') return prev;
        const next = { ...prev, [k]: 'ok' as DocState };
        persistDocs(next);
        return next;
      });
      if (k === 'background') {
        const iso = new Date().toISOString();
        setBgCheckedAt(iso);
        AsyncStorage.setItem(K_BGCHECK, iso).catch(() => {});
      }
    },
    [persistDocs],
  );

  const syncBackground = useCallback(
    (passed: boolean, conductedAt?: number | null) => {
      setDocs((prev) => {
        const want: DocState = passed ? 'ok' : 'todo';
        if (prev.background === want || prev.background === 'checking') return prev;
        const next = { ...prev, background: want };
        persistDocs(next);
        return next;
      });
      if (passed) {
        const iso = new Date(
          Number(conductedAt) > 0 ? Number(conductedAt) : Date.now(),
        ).toISOString();
        setBgCheckedAt(iso);
        AsyncStorage.setItem(K_BGCHECK, iso).catch(() => {});
      }
    },
    [persistDocs],
  );

  const verifiedCount = useMemo(
    () => QUAL_DOCS.filter((d) => docs[d.key] === 'ok').length,
    [docs],
  );
  const allVerified = verifiedCount === QUAL_DOCS.length;

  const submitQualification = useCallback(async () => {
    const out = await submitForReview();
    if (!out.ok) return out;
    setVerification('pending');
    AsyncStorage.setItem(K_VERIFICATION, 'pending').catch(() => {});
    return out;
  }, []);

  const resetQualification = useCallback(() => {
    setVerification('none');
    AsyncStorage.removeItem(K_VERIFICATION).catch(() => {});
  }, []);

  const commission = useCallback(() => {
    const iso = new Date().toISOString();
    setVerification('commissioned');
    setCommissionedAt(iso);
    AsyncStorage.multiSet([
      [K_VERIFICATION, 'commissioned'],
      [K_COMMISSIONED, iso],
    ]).catch(() => {});
  }, []);

  // Every revenue write goes through here: ref + state + storage stay one thing.
  const commitRevenue = useCallback((next: RevenueBlob) => {
    revRef.current = next;
    setRevenue(next);
    AsyncStorage.setItem(K_REVENUE, JSON.stringify(next)).catch(() => {});
  }, []);

  /**
   * Put a travel in front of the operator, from whichever path noticed it: the live
   * subscription, going on duty, or a lapsed request coming back round.
   *
   * All three built this object separately, and the going-on-duty copy had already drifted —
   * it omitted the quiet-period check entirely. One builder, one set of rules.
   */
  const offerTravel = useCallback((t: AssignedTravel) => {
    setIncoming({
      rideId: t.rideId,
      tripNo: t.tripNo,
      travelerUid: t.travelerUid,
      traveler: t.travelerName,
      bookedForAnother: t.bookedForAnother,
      teen: t.teen,
      guardianName: t.guardianName,
      cabinPreferences: t.cabinPreferences,
      tInit: initialsOf(t.travelerName),
      pickup: t.dep,
      dest: t.dest,
      // THE FARE, NOT THE ALL-IN PRICE. costCents is what the TRAVELER paid — the fare plus
      // the platform fee — and earnOf takes 1% off whatever it is given.
      fare: t.travelCostCents > 0 ? t.travelCostCents / 100 : fareFromTotal(t.costCents / 100),
    });
  }, []);

  /** The travel this operator should be looking at now, if any. */
  const nextOffer = useCallback(
    () =>
      inboxRef.current.find(
        (x) =>
          x.status === 'assigned' &&
          !x.releasedAt &&
          (lapsedRef.current.get(x.rideId) ?? 0) <= Date.now() - LAPSE_QUIET_MS,
      ),
    [],
  );

  /**
   * Decide what the operator should be looking at, and — if the answer is "nothing yet, but
   * something soon" — arrange to be asked again.
   *
   * THE HOLE THIS CLOSES WAS IN THE FIX ABOVE IT. lapseRequest scheduled a re-look, and
   * nothing else did. So going off duty cancelled the timer, going back on duty consulted the
   * quiet period, found the travel still quiet, and scheduled nothing — leaving an assigned,
   * paid travel invisible on that phone permanently. Verified in Firestore on 3 Sept 2026:
   * ride 3J1kSVwy05mtW2cIc5ee, status `assigned`, no declinedAt, operator on duty, never
   * offered.
   *
   * That is the same mistake as the original defect and I made it while fixing the original
   * defect: a suppression with no arrangement to lift it. Every path that comes up empty now
   * schedules the re-look, and it is scheduled from the EARLIEST travel still in its quiet
   * period rather than from whichever one happened to lapse last.
   */
  const evaluateOffer = useCallback(() => {
    if (relookTimer.current) {
      clearTimeout(relookTimer.current);
      relookTimer.current = null;
    }
    if (!onlineRef.current) {
      setIncoming(null);
      return;
    }
    const t = nextOffer();
    if (t) {
      offerTravel(t);
      return;
    }
    setIncoming(null);

    // Nothing offerable now. Is anything merely waiting out its quiet period?
    const now = Date.now();
    const waking = inboxRef.current
      .filter((x) => x.status === 'assigned' && !x.releasedAt && lapsedRef.current.has(x.rideId))
      .map((x) => (lapsedRef.current.get(x.rideId) as number) + LAPSE_QUIET_MS)
      .filter((at) => at > now);
    if (!waking.length) return;
    relookTimer.current = setTimeout(
      () => {
        relookTimer.current = null;
        evaluateOfferRef.current();
      },
      Math.max(Math.min(...waking) - now, 250) + 250,
    );
  }, [nextOffer, offerTravel]);

  // Through a ref so the timer above can call the latest copy without evaluateOffer having to
  // depend on itself.
  const evaluateOfferRef = useRef(evaluateOffer);
  evaluateOfferRef.current = evaluateOffer;

  const acceptRequest = useCallback(
    async (r: SimRequest) => {
      if (!r.tripNo && !r.rideId) {
        setOnlineError(tr('traveler.travelIdentityUnavailable'));
        return false;
      }
      // THE SERVER DECIDES, AND FIRST. This wrote 'accepted' to the travel and moved the
      // operator on in the same breath, whatever the write's outcome. POST /travel/accept now
      // re-checks eligibility at this moment, so nothing on this phone changes until it says
      // yes. A refusal is shown on the operator home with its reason, and when it concerns the
      // operator rather than the travel, they are out of service — as the server now records.
      if (r.rideId) {
        const out = await acceptTravel(r.rideId);
        if (!out.ok) {
          setOnlineError(out.error);
          setOnlineErrorCode(out.code ?? null);
          if (out.code && out.code !== 'not_offered' && out.code !== 'not_open') setOnlineState(false);
          return false;
        }
      }
      const seq = revRef.current.seq + 1;
      commitRevenue({ ...revRef.current, seq });
      // THE TRAVEL NUMBER IS THE TRAVEL NUMBER, not the database key it happens to be filed
      // under. This read `r.rideId` — a Firestore document id — and printed it under the
      // label "Travel Number" on the completion screen, so an operator finished a journey and
      // was shown `60aa7Nyu2cV7EL6BNkbJ` while the traveler held AR-2109-MIA for the same
      // travel. Two names for one journey, neither of which can be quoted to the other party,
      // and a label describing something the value is not. `tripNo` arrives on every
      // dispatched request (see SimRequest); rideId stays the fallback only for a record old
      // enough to predate it, and the scripted number for the test program.
      setIncoming(null);
      const accepted = { ...r, no: r.tripNo || r.rideId!, earn: earnOf(r.fare) };
      if (opRef.current && opRef.current.rideId !== r.rideId) {
        // The server only permits this when the current passenger is onboard and the vehicle
        // is approaching that destination. Keep the current Travel on screen; B is merely lined up.
        setQueuedOp(accepted);
      } else {
        setOp(accepted);
        setArrived(false);
        setMsgs([]);
      }
      return true;
    },
    [commitRevenue],
  );

  // WHAT THE OPERATOR HAS ACTUALLY BEEN GIVEN.
  //
  // This replaces a timer that armed a scripted request 2.6 seconds after going on duty. An
  // operator saw journeys that did not exist, while a traveler who really booked one waited
  // for somebody who was never told — the two halves of the company could not see each other.
  // Nothing is shown here now unless dispatch actually assigned it.
  // Watched whenever the operator is commissioned, NOT only while on duty. A travel already
  // underway has to come back after a restart, and an operator returns to the app off duty —
  // gating this on `online` would have left them looking at "Ready to operate" with a traveler
  // in the car. New requests still only appear while on duty; see the `incoming` guard below.
  useEffect(() => {
    // WAIT FOR AUTH. Keyed on the signed-in uid, not just on being commissioned: commissioned
    // is true from the first render, while Firebase restores the session a moment later, so
    // this attached with no user and reported "Not signed in." for the rest of the session.
    // The uid in the dependency list is what makes it attach again once there is one.
    if (verification !== 'commissioned' || !user?.uid) {
      // SAY WHICH, because "not attached" and "nothing yet" are different answers.
      //
      // This set inboxError to NULL on the way out, so an inbox that never attached rendered
      // the same words as a quiet night: "Matching you with nearby travelers…". On 3 Sept 2026
      // three travels in a row — AR-2111, AR-2112, AR-2113 — were assigned to an operator who
      // was on duty, charged to the traveler, and never appeared on his phone. The screen said
      // he was matching. It took most of an afternoon to work out that the subscription had
      // never been attached at all, because the one field built to tell us was being cleared.
      //
      // It is the same defect this file's own comment says the inbox exists to remove, and the
      // same shape as the swallowed rules rejection in operatorInbox.ts: a precondition that
      // fails quietly and reports the healthy state.
      setIncoming(null);
      setInboxError(
        !user?.uid
          ? tr('traveler.inboxNotSignedIn')
          : tr('traveler.inboxNotCommissioned'),
      );
      return;
    }
    setInboxError(null);
    // A request to recover a past unpaid fare is not evidence of successful settlement.
    // Keep failures distinct from a genuine server response and scope late replies to the
    // account that made the request, so switching accounts cannot present stale results.
    const recoveryUid = user.uid;
    setPayoutRecoveryStatus('checking');
    void settlePendingPayouts().then((result) => {
      if (userUidRef.current === recoveryUid) {
        setPayoutRecoveryStatus(result.ok ? 'checked' : 'unconfirmed');
      }
    });
    return watchAssignedTravel((list) => {
      // A TRAVEL UNDERWAY SURVIVES THE APP CLOSING.
      //
      // The active travel lived only in this provider's memory, so an operator whose app was
      // killed mid-journey — a crash, a restart, iOS reclaiming memory — came back to "Ready
      // to operate" with a traveler in the car and no way to complete the travel or be paid
      // for it. The record always knew; nothing read it back.
      // A JOURNEY THAT NEVER ENDED IS NOT A JOURNEY UNDERWAY.
      //
      // This restored ANY travel in an active status, however old. On 2 Sept a rules
      // regression made completion silently unwritable, so a travel stayed `onboard` for
      // good — and this picked it up on every launch and set it as the operator's current
      // operation. The request sheet only opens when there is no operation underway, so from
      // that moment the operator could never be offered anything again. He showed as "On
      // Duty · Matching you with nearby travelers" the whole time, because the home screen
      // reads `online` and the block reads `op`.
      //
      // That cost most of 3 Sept. It presented as travels never reaching his phone, and sent
      // me through the inbox, the security rules, the query, auth and the ids before a
      // diagnostic showed the subscription returning thirteen travels quite happily — one of
      // them `onboard` since the day before.
      //
      // Brickell to Miami International is about twenty minutes. Six hours is far beyond any
      // real journey and still generous for traffic, a wait, or a phone that died mid-travel
      // and came back. Beyond it, the record is wreckage rather than work, and picking it up
      // silently costs the operator every fare that follows.
      const underway = list.find(
        (x) =>
          ACTIVE_STATUSES.includes(x.status) &&
          Date.now() - Math.max(Number(x.statusAt) || 0, Number(x.createdAt) || 0) <
            ACTIVE_RESTORE_MAX_MS,
      );
      if (underway && !opRef.current) {
        const fare = underway.travelCostCents > 0 ? underway.travelCostCents / 100 : fareFromTotal(underway.costCents / 100);
        setOp({
          rideId: underway.rideId,
          tripNo: underway.tripNo,
          travelerUid: underway.travelerUid,
          traveler: underway.travelerName,
          bookedForAnother: underway.bookedForAnother,
          teen: underway.teen,
          guardianName: underway.guardianName,
          cabinPreferences: underway.cabinPreferences,
          tInit: initialsOf(underway.travelerName),
          pickup: underway.dep,
          dest: underway.dest,
          fare,
          no: underway.tripNo || underway.rideId,
          earn: earnOf(fare),
        });
        setArrived(underway.status === 'arrived' || underway.status === 'onboard');
      }
      // Asked, and not yet answered. `operatorReply` still present means the answer was sent
      // and the monitor has not read it — the question stays down either way.
      const m = underway?.monitor;
      setCheckIn(m?.state === 'asked_operator' && !m?.operatorReply ? m.question || null : null);

      // KEPT, SO GOING ON DUTY CAN RE-READ IT. See the effect below: onSnapshot fires when the
      // DATA changes, and going on duty changes nothing in the data.
      inboxRef.current = list;
      // A REQUEST TO ANSWER is only offered while actually on duty. An operator who has gone
      // offline must not be handed new work.
      // ONE PATH FOR CHOOSING WHAT TO OFFER — see evaluateOffer above, which also arranges
      // to be asked again when a quiet period is the only thing in the way.
      evaluateOfferRef.current();
    }, setInboxError);
  }, [verification, user?.uid]);

  // GOING ON DUTY MUST RE-READ WHAT IS ALREADY WAITING.
  //
  // THE DEFECT THIS CLOSES, found 29 Aug 2026 on the first booking that reached a real
  // operator. `onlineRef.current` is read INSIDE the snapshot callback, and onSnapshot fires
  // when the DATA changes — going on duty changes no data. So a travel that arrived while the
  // operator was off duty was evaluated once, with onlineRef false, and setIncoming(null).
  // The operator then tapped Go On Duty and nothing re-ran: they sat on "Matching you with
  // nearby travelers" with a travel already assigned to them, and only an unrelated write to
  // that ride document would ever have surfaced it.
  //
  // It is the same shape as the defect the inbox was built to remove — an operator not being
  // told about work that is theirs — reintroduced by the ref that keeps the subscription from
  // re-attaching. The ref is right; it just needed something to read it again.
  useEffect(() => {
    if (!online) {
      // Stop tracking the moment they finish. Leaving background location running after
      // somebody has concluded operations is a battery cost they did not agree to and a
      // tracking they did not consent to.
      stopBackgroundPresence();
      setIncoming(null); // going off duty withdraws an unanswered request immediately
      // And cancels any lapsed travel waiting to come back round: an operator who has gone
      // off duty must not have a request reopen on them a minute later.
      if (relookTimer.current) {
        clearTimeout(relookTimer.current);
        relookTimer.current = null;
      }
      return;
    }
    evaluateOffer();
  }, [online, evaluateOffer]);

  // WHERE THE CAR IS, WHILE IT IS CARRYING SOMEBODY — and only then. Route monitoring cannot
  // notice a stopped vehicle unless something reports the position, and nothing ever did: the
  // app read the phone's position for the map, for pricing and for the emergency screen, and
  // never once wrote it to the travel. Starts with the travel and stops with it.
  useEffect(() => {
    const rideId = op?.rideId;
    if (!rideId) return;
    return reportPosition(rideId);
  }, [op?.rideId]);

  /** Answer the platform's question in the operator's own words. */
  const respondToCheckIn = useCallback(async (text: string) => {
    const rideId = opRef.current?.rideId;
    if (!rideId) return false;
    const sent = await answerCheckIn(rideId, text);
    // Only taken off the screen once it is recorded. A question that looks answered and was
    // not is worse than one still waiting.
    if (sent) setCheckIn(null);
    return sent;
  }, []);

  const declineRequest = useCallback((r: SimRequest) => {
    setIncoming(null);
    // A declined travel is released rather than quietly dropped: the record says so, which is
    // what lets it be offered to somebody else instead of stalling on a phone that said no.
    if (r.rideId) declineTravel(r.rideId);
  }, []);

  /**
   * The countdown ran out. NOT the same thing as saying no, and it must not be recorded as if
   * it were.
   *
   * WHAT THIS COST, 2-3 Sept 2026. The request sheet's timer called declineRequest at zero, so
   * every unanswered travel was written `status: 'declined'` with the operator added to
   * `declinedBy`. Two consequences, both bad. The traveler's screen watches for 'declined' and
   * immediately re-dispatches — excluding the operator who never actually refused — so with a
   * single operator on duty it went straight to "No operator matched yet" on a travel that had
   * already been charged. And sweepAssignments could not rescue it either, because the only
   * operator in the market was now on the exclusion list for it.
   *
   * Three travels in a row went that way — AR-2111, AR-2112, AR-2113 — each charged $19.44,
   * each stranded within fifteen seconds. It read as "the operator never got the request",
   * which is what sent me looking at the inbox, the security rules and the query for an
   * afternoon. The request had arrived every time; it refused itself before anybody saw it.
   *
   * A LAPSE LEAVES THE TRAVEL EXACTLY WHERE IT WAS. Still `assigned`, still theirs, no
   * exclusion written. sweepAssignments re-offers it after 45 seconds to somebody else if
   * there is somebody else, and back to them if there is not — which is right, because by then
   * they may well have picked the phone up.
   */
  const lapseRequest = useCallback(
    (r: SimRequest) => {
      setIncoming(null);
      if (!r.rideId) return;
      lapsedRef.current.set(r.rideId, Date.now());
      // AND ARRANGE FOR IT TO COME BACK — which evaluateOffer now does for every path, not
      // just this one. onSnapshot fires when the DATA changes and a lapse changes none of it,
      // so without a timer "quiet for sixty seconds" means "silent for good".
      evaluateOffer();
    },
    [evaluateOffer],
  );

  // TELL THE TRAVELER, NOT JUST THIS PHONE. Their screen used to advance on a 2.6-second
  // timer regardless of where the operator was; it now follows these writes.
  const confirmArrival = useCallback(async () => {
    const rideId = opRef.current?.rideId;
    if (!rideId) return false;
    if (!(await markArrived(rideId))) return false;
    setArrived(true);
    // The traveler may not be looking at their phone. Being outside is the one moment where
    // that matters most, and it is the notification every rideshare has and we did not.
    announceTravel(rideId, 'arrived');
    return true;
  }, []);

  /** The traveler is in the car and the journey proper has begun. */
  const beginTrip = useCallback(async (teenPickupCode?: string) => {
    const rideId = opRef.current?.rideId;
    if (!rideId) return false;
    return await markOnboard(rideId, teenPickupCode);
  }, []);

  const cancelOp = useCallback(() => {
    // There is no authoritative “Operator cancelled an accepted Travel” transition yet.
    // Never erase the local operation and pretend the Travel disappeared while the server
    // still assigns it to this Operator. Going off duty may stop new offers, but the accepted
    // Travel remains visible until an authoritative terminal/reassignment path exists.
    ++dutyAttemptRef.current;
    setOnlineState(false);
    // Use the same acknowledged, persisted off-duty path as the main control.
    void confirmOfflineRef.current?.();
  }, []);

  opRef.current = op;

  const completeOp = useCallback(async () => {
    if (!op) return false;
    if (op.rideId) {
      if (!(await markCompleted(op.rideId))) return false;
      announceTravel(op.rideId, 'completed');
    }
    const record: CompletedOp = {
      no: op.no,
      arr: op.dest,
      dep: op.pickup,
      earn: op.earn,
      fare: op.fare,
      dist: op.dist,
      tripMin: op.tripMin,
      at: Date.now(),
    };
    setLastCompleted(record);
    commitRevenue({ ...revRef.current, ops: [record, ...revRef.current.ops] });
    if (queuedOp) {
      setOp(queuedOp);
      setQueuedOp(null);
    } else {
      setOp(null);
    }
    setArrived(false);
    return true;
  }, [op, queuedOp, commitRevenue]);

  // Keep the Operator's conversation on the same Travel-scoped record the Traveler sees.
  useEffect(() => {
    const current = op;
    if (!current?.tripNo || !current.rideId) {
      setMsgs([]);
      return;
    }
    return watchTravelThread(
      current.tripNo,
      'operator',
      (items) => setMsgs(items.map((m) => ({ me: m.from === 'operator', text: m.text }))),
      () => {},
    );
  }, [op?.tripNo, op?.rideId]);

  // Communicate on the authoritative Travel thread. No scripted counterparty reply: a message
  // from a real Traveler appears only when that Traveler actually sends it.
  const sendMsg = useCallback((text: string) => {
    const body = text.trim();
    const current = opRef.current;
    if (!body || !current?.rideId || !current.tripNo) return;
    sendTravelMessage({
      rideId: current.rideId,
      tripNo: current.tripNo,
      text: body,
      from: 'operator',
      travelerUid: current.travelerUid,
    }).then((stored) => {
      if (stored) setMsgs((m) => [...m, { me: true, text: body }]);
    });
  }, []);

  // ---- revenue, derived from the operations this operator actually completed ----
  const totals = useMemo(() => {
    const now = new Date();
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    let today = 0;
    let todayN = 0;
    let week = 0;
    let month = 0;
    let year = 0;
    let all = 0;
    for (const o of revenue.ops) {
      const d = new Date(o.at);
      all += o.earn;
      if (sameDay(d, now)) {
        today += o.earn;
        todayN += 1;
      }
      if (o.at >= weekAgo) week += o.earn;
      if (d.getFullYear() === now.getFullYear()) {
        year += o.earn;
        if (d.getMonth() === now.getMonth()) month += o.earn;
      }
    }
    return {
      today: round2(today),
      todayN,
      week: round2(week),
      month: round2(month),
      year: round2(year),
      balance: round2(Math.max(0, all - revenue.withdrawn)),
    };
  }, [revenue]);

  // withdraw() REMOVED. It subtracted a fee, set `withdrawn` to everything earned so the
  // balance read zero, and moved no money — a recorded withdrawal that had never happened.
  // Payouts are Stripe's: the 99% lands in the operator's own account per travel and Stripe
  // pays it out on a schedule. See app/operator/withdraw.tsx.

  // The signed-up user IS the operator (the demo shell carries the name across).
  const opName = useMemo(() => accountName(user, 'Operator'), [user]);
  const opInitials = useMemo(() => accountInitials(user), [user]);

  /**
   * Go on or off duty.
   *
   * This used to be a plain `useState` setter — a boolean that no other device could see.
   * Dispatch reads the `operators` collection in Firestore, nothing ever wrote it, so it
   * always fell through to three hardcoded demo drivers and a real operator was never
   * matchable no matter how complete their file was.
   *
   * Going on duty now means joining that collection, which needs two things the local toggle
   * never had: a real position to be matched against, and Stripe's confirmation that payouts
   * work. If either is missing the switch goes back off and says why — a fare cannot be
   * assigned to somebody it cannot be paid out to.
   */
  const vehicleRef = useRef<{ car: string; plate: string } | null>(null);
  vehicleRef.current = vehicle;
  const coverageRef = useRef<string | null>(null);
  coverageRef.current = insuranceExpiry;

  // Read inside the travel subscription, which must not re-attach every time duty toggles.
  const onlineRef = useRef(false);
  onlineRef.current = online;

  // The last inbox snapshot, so going on duty can re-read it without re-subscribing.
  const inboxRef = useRef<AssignedTravel[]>([]);

  // WHILE ON DUTY, THIS PHONE KEEPS THE SERVER AWAKE — see src/backend/heartbeat.ts. An
  // operator waiting to be dispatched to is the one person guaranteed to be holding a phone
  // when the clock matters, so their app runs it. Costs nothing, needs no account, and stops
  // the moment they go off duty.
  useEffect(() => {
    if (!online) return;
    return startHeartbeat();
  }, [online]);

  // BEING ON DUTY IS A CLAIM THAT HAS TO BE RENEWED, and until 29 Aug 2026 it never was.
  //
  // POST /operator/online wrote `onlineAt` once and nothing wrote it again. So an operator
  // record, once created, was dispatchable FOREVER — a phone that was closed, reinstalled or
  // thrown in a drawer months ago still sat in the fleet marked available, and dispatch had
  // no way to tell it from somebody waiting at a kerb. It matched by distance alone, so the
  // phantom nearest the traveler won.
  //
  // That is not hypothetical. It is what happened on the first real booking: a traveler paid
  // $19.44, was told a Gray Toyota Camry was coming, and the operator actually on duty two
  // miles away was never offered it. Dispatch now refuses a record that has not checked in
  // (see PRESENCE_STALE_MS in backend/matching.js), and this is the check-in.
  //
  // IT RE-RUNS THE GATES, WHICH IS THE SECOND REASON FOR IT. /operator/online is where
  // coverage, the disclosure and Stripe payouts are tested. Renewing presence through the
  // same door means a policy that lapses at midnight takes the operator off duty at 00:01
  // rather than at the end of a shift they should not have been driving.
  //
  // A REFUSAL ONLY COUNTS IF THE SERVER GAVE A REASON. `r.code` is set by the gates; a bare
  // failure is a tunnel or a sleeping instance, and must never take a working operator off
  // duty in the middle of a journey.
  useEffect(() => {
    if (!online) return;
    let stopped = false;
    let inFlight = false;
    const renew = async () => {
      // iOS timers are suspended in the background. Native location owns those
      // updates; this foreground path runs once on resume and at the usual cadence.
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const here = await resolveOperatorDutyPosition();
        if (stopped || !here) return;
        const r = await goOnline({
          lat: here.lat,
          lng: here.lng,
          name: user?.displayName?.trim() || '',
          car: vehicleRef.current?.car ?? '',
          plate: vehicleRef.current?.plate ?? '',
          classes: ['Standard'],
          insuranceExpiry: coverageRef.current ?? '',
        });
        if (stopped) {
          // The Operator has ended service while a renewal was in flight.
          // A late success must not resurrect dispatch availability.
          if (r.ok && !onlineRef.current) void confirmOfflineRef.current?.();
          return;
        }
        if (r.ok) {
          setOnlineError(null);
          setOnlineErrorCode(null);
          return;
        }
        if (r.code) {
          setOnlineState(false);
          setOnlineError(r.error || tr('traveler.noLongerInService'));
          setOnlineErrorCode(r.code);
        } else {
          // Network uncertainty is not authority to declare a qualification loss.
          // Matching still fails closed once the server's presence age expires.
          setOnlineError(r.error || tr('traveler.errReachDispatch'));
        }
      } finally {
        inFlight = false;
      }
    };
    const t = setInterval(() => {
      if (Platform.OS === 'web' || AppState.currentState === 'active') void renew();
    }, PRESENCE_RENEW_MS);
    let prior = AppState.currentState;
    const subscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', next => {
      if (next === 'active' && prior !== 'active') void renew();
      prior = next;
    });
    return () => {
      stopped = true;
      clearInterval(t);
      subscription?.remove();
    };
  }, [online, user?.displayName]);

  /** Days until coverage lapses. Negative once it has. Null when no date is on file. */
  const coverageDaysLeft = useMemo(() => {
    if (!insuranceExpiry) return null;
    // Match the authoritative backend, which evaluates the recorded policy
    // end at 23:59:59 UTC, not the device's timezone.
    const end = Date.parse(`${insuranceExpiry}T23:59:59.999Z`);
    if (Number.isNaN(end)) return null;
    return Math.ceil((end - Date.now()) / 86400000);
  }, [insuranceExpiry]);

  const setInsuranceExpiry = useCallback((iso: string) => {
    const clean = iso.trim();
    setInsuranceExpiryState(clean || null);
    if (clean) AsyncStorage.setItem(K_COVERAGE, clean);
    else AsyncStorage.removeItem(K_COVERAGE);
  }, []);

  const setVehicle = useCallback((car: string, plate: string) => {
    const v = { car: car.trim().slice(0, 60), plate: plate.trim().toUpperCase().slice(0, 16) };
    setVehicleState(v);
    AsyncStorage.setItem(K_VEHICLE, JSON.stringify(v));
  }, []);

  const dutyBlocks = useMemo(() => {
    const out: { title: string; detail: string; route?: string }[] = [];
    if (!user?.displayName?.trim() || !vehicle) {
      out.push({
        title: tr('traveler.blockNameVehicleTitle'),
        detail:
tr('traveler.blockNameVehicle'),
        route: '/operator/vehicle',
      });
    }
    if (!insuranceExpiry) {
      out.push({
        title: tr('traveler.blockCoverageTitle'),
        detail:
tr('traveler.blockCoverage'),
        route: '/operator/insurance',
      });
    } else if ((coverageDaysLeft ?? -1) < 0) {
      out.push({
        title: tr('traveler.blockCoverageExpiredTitle'),
        detail: tr('traveler.blockCoverageExpired', { date: insuranceExpiry }),
        route: '/operator/insurance',
      });
    }
    return out;
  }, [user?.displayName, vehicle, insuranceExpiry, coverageDaysLeft]);

  // The phone must not confuse a local OFF toggle with a server-confirmed
  // end of duty. Persist a tiny, UID-scoped retry flag, never a location,
  // identity credential, or an Operator's insurance record.
  const confirmOffline = useCallback(async () => {
    const uid = userUidRef.current;
    if (!uid || offlineInFlightRef.current) return;
    offlineInFlightRef.current = true;
    offlinePendingRef.current = true;
    setOfflinePendingState(true);
    setOfflineBusy(true);
    const key = `ar:operator-offline-pending:${uid}`;
    try {
      await AsyncStorage.setItem(key, '1').catch(() => {});
      const confirmed = await goOffline();
      if (userUidRef.current !== uid) return;
      if (confirmed) {
        await AsyncStorage.removeItem(key).catch(() => {});
        offlinePendingRef.current = false;
        setOfflinePendingState(false);
        setOnlineError(null);
        setOnlineErrorCode(null);
      } else {
        setOnlineError(tr('operator.offlineUnconfirmed'));
        setOnlineErrorCode('offline_unconfirmed');
      }
    } finally {
      offlineInFlightRef.current = false;
      if (userUidRef.current === uid) setOfflineBusy(false);
    }
  }, []);
  confirmOfflineRef.current = confirmOffline;

  useEffect(() => {
    let active = true;
    const uid = user?.uid;
    offlinePendingRef.current = false;
    setOfflinePendingState(false);
    setDutyRestoreReady(false);
    if (!uid) {
      setDutyRestoreReady(true);
      return () => { active = false; };
    }
    const key = `ar:operator-offline-pending:${uid}`;
    void AsyncStorage.getItem(key).then(pending => {
      if (!active || userUidRef.current !== uid) return;
      if (pending === '1') {
        offlinePendingRef.current = true;
        setOfflinePendingState(true);
        void confirmOffline();
      }
    }).catch(() => {
      if (!active || userUidRef.current !== uid) return;
      offlinePendingRef.current = true;
      setOfflinePendingState(true);
      setOnlineError(tr('operator.offlineUnconfirmed'));
      setOnlineErrorCode('offline_unconfirmed');
    }).finally(() => {
      if (active && userUidRef.current === uid) setDutyRestoreReady(true);
    });
    const subscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', state => {
      if (state === 'active' && offlinePendingRef.current && !onlineRef.current)
        void confirmOffline();
    });
    return () => { active = false; subscription?.remove(); };
  }, [user?.uid, confirmOffline]);

  const setOnline = useCallback(
    (want: boolean) => {
      const attempt = ++dutyAttemptRef.current;
      setOnlineError(null);
      setOnlineErrorCode(null);
      if (!want) {
        // Locally stop receiving offers immediately, then withdraw the
        // server's dispatchable presence. Failure is visible and retryable.
        setOnlineState(false);
        void confirmOffline();
        return;
      }
      if (!dutyRestoreReady || offlinePendingRef.current) {
        setOnlineState(false);
        setOnlineError(tr('operator.offlineUnconfirmed'));
        setOnlineErrorCode('offline_unconfirmed');
        return;
      }
      // A TRAVELER MUST BE ABLE TO FIND THE CAR. Same posture as the payout check above: we
      // do not dispatch a travel we cannot honour, and a traveler told to look for the wrong
      // vehicle is standing on a kerb watching the wrong cars go past.
      // A traveler is looking for a NAME and a CAR. Neither may be invented, and neither may
      // be somebody's email address: accountName falls back to the local part of the address
      // when no name is set, which would have been shown to every traveler this operator drove.
      const realName = user?.displayName?.trim();
      if (!realName || !vehicleRef.current) {
        setOnlineState(false);
        setOnlineError(
          !realName
            ? tr('traveler.gateNameAndVehicle')
            : tr('traveler.gateVehicle'),
        );
        return;
      }
      // OPERATOR COVERAGE REMAINS A DUTY GATE. Any separate TNC contingency coverage required by
      // law does not substitute for the Operator's own qualifying policy. Same posture as the
      // payout and vehicle gates: we do not assign Travel when the Operator coverage gate fails.
      // An expiry date is on the certificate and needs nobody's cooperation to check.
      if (!coverageRef.current) {
        setOnlineState(false);
        setOnlineError(tr('traveler.gateCoverageDate'));
        return;
      }
      // Use the same absolute cutoff as backend/insurance-horizon.js, never
      // this phone's local timezone or a different final millisecond.
      const end = Date.parse(`${coverageRef.current}T23:59:59.999Z`);
      if (Number.isNaN(end) || end < Date.now()) {
        setOnlineState(false);
        setOnlineError(
tr('traveler.gateCoverageExpired'),
        );
        return;
      }
      setOnlineBusy(true);
      (async () => {
        // Google Play requires a visible explanation before the Android location prompt.
        // A refusal leaves duty OFF and does not request or collect a new position.
        const consented = await confirmOperatorBackgroundLocationUse();
        if (attempt !== dutyAttemptRef.current) return;
        if (!consented) {
          setOnlineBusy(false);
          setOnlineState(false);
          setOnlineError(tr('traveler.bgLocationConsentDeclined'));
          return;
        }
        const here = await resolveOperatorDutyPosition({ requestPermission: true });
        if (attempt !== dutyAttemptRef.current) return;
        // Coordinates are optional on a DepPlace (a named pickup has none), and dispatch
        // matches purely by distance — so a position we cannot use is the same as no position.
        if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lng)) {
          setOnlineBusy(false);
          setOnlineState(false);
          setOnlineError(
tr('traveler.gateLocation'),
          );
          return;
        }
        const r = await goOnline({
          lat: here.lat as number,
          lng: here.lng as number,
          name: realName,
          car: vehicleRef.current?.car ?? '',
          plate: vehicleRef.current?.plate ?? '',
          classes: ['Standard'],
          insuranceExpiry: coverageRef.current ?? '',
        });
        if (attempt !== dutyAttemptRef.current) {
          // A newer duty choice superseded this request. If this stale request reached the
          // server successfully, explicitly withdraw that presence rather than resurrecting
          // an Operator who has since gone off duty.
          if (r.ok) void confirmOffline();
          return;
        }
        setOnlineBusy(false);
        if (!r.ok) {
          setOnlineState(false);
          setOnlineError(r.error || tr('traveler.couldNotEnterService'));
          setOnlineErrorCode(r.code ?? null);
          return;
        }
        setOnlineErrorCode(null);
        setOnlineState(true);
        // AND HOLD PRESENCE WITH THE PHONE LOCKED. The 90-second timer below only runs while
        // the app is in the foreground; iOS suspends it the moment the operator pockets the
        // phone, and five minutes later dispatch correctly concludes they are not there.
        //
        // Native background updates are conditional on OS delivery and permissions.
        // Foreground resume now revalidates with the server and exposes a refusal.
        // A refusal is not fatal and is not silent: the operator stays in service while
        // LOOKING at the app, which is a real limitation, so `backgroundPresence` records
        // whether it took and the screen says so rather than letting them discover it by
        // receiving nothing all evening.
        startBackgroundPresence()
          .then(setBackgroundPresence)
          .catch(() => setBackgroundPresence(false));
      })();
    },
    [user?.displayName, confirmOffline, dutyRestoreReady],
  );

  const value: OperatorState = {
    ready,
    payoutRecoveryStatus,
    opName,
    opInitials,
    role,
    setRole,
    verification,
    commissionedAt,
    docs,
    verifyDoc,
    reviewDoc,
    docReviews,
    syncBackground,
    verifiedCount,
    allVerified,
    bgCheckedAt,
    submitQualification,
    resetQualification,
    commission,
    online,
    offlinePending,
    offlineBusy,
    backgroundPresence,
    setOnline,
    onlineError,
    onlineErrorCode,
    onlineBusy,
    inboxError,
    vehicle,
    setVehicle,
    insuranceExpiry,
    setInsuranceExpiry,
    coverageDaysLeft,
    dutyBlocks,
    incoming,
    declineRequest,
    lapseRequest,
    beginTrip,
    op,
    arrived,
    checkIn,
    respondToCheckIn,
    acceptRequest,
    confirmArrival,
    cancelOp,
    completeOp,
    lastCompleted,
    msgs,
    sendMsg,
    ops: revenue.ops,
    todayTotal: totals.today,
    todayOps: totals.todayN,
    weekTotal: totals.week,
    monthTotal: totals.month,
    yearTotal: totals.year,
    balance: totals.balance,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
