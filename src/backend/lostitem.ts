// Lost items — the record, the notification, and the return.
//
// WHAT THIS REPLACES: tapping "Lost Item" in Patron Support showed "Operator notified · Your
// operator has been notified" after a 1.9-second spinner. No operator was notified, nothing
// was written, and the app had never asked WHICH travel the item was left in. It also
// reported "RESOLVED" over a bag nobody had looked for yet.
//
// THE RULE THIS FILE KEEPS: a status is written only once the thing it describes has
// happened. `reported` means a record exists; server-side Operator recovery owns later facts.
// The Traveler client never promotes a report to located, returned, or return-arranged.
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { PAYMENT_SERVER_URL } from '../config';
import { type RideRecord } from './dispatch';

/**
 * The ladder, in order. `resolved` is deliberately not a value: an item is not resolved, it
 * is back in the traveler's hands, and that is what `returned` means.
 */
export type LostItemStatus =
  | 'reported'
  | 'operator-notified'
  | 'located'
  | 'not-found'
  | 'return-arranged'
  | 'returned';

export type ReturnPath = 'original-operator' | 'any-operator';

export type LostItemReturn = {
  path: ReturnPath;
  operatorId: string;
  operatorName: string;
  /** What the traveler pays for the return travel. 0 when the original operator carries it. */
  costCents: number;
  /** False when no coordinates were available to price it — never guess an amount. */
  priced: boolean;
  arrangedAt: number;
};

export type LostItem = {
  id: string;
  /** The support case carrying this report, when one was filed. Null means nobody was told. */
  caseNo?: string | null;
  travelerUid: string;
  /** The travel it was left in, or null when the traveler could not say which. */
  tripNo: string | null;
  /** Every travel in the window when the traveler is not sure — all of them get told. */
  candidateTripNos: string[];
  notifiedOperatorIds: string[];
  notifiedOperatorNames: string[];
  /** Number of durable Operator inbox deliveries acknowledged by the server. */
  operatorDeliveryCount?: number;
  operatorDeliveryAt?: number | null;
  description: string;
  photoUrl: string | null;
  /** Private R2 object key; access is granted by the authenticated backend. */
  photoObjectKey?: string | null;
  status: LostItemStatus;
  createdAt: number;
  statusAt: number;
  return: LostItemReturn | null;
};

/** Human wording for each rung, and whether it has been reached. Used by the status ladder. */
export const STATUS_LADDER: { key: LostItemStatus; label: string }[] = [
  { key: 'reported', label: 'Reported' },
  { key: 'operator-notified', label: 'Operator notified' },
  { key: 'located', label: 'Item located' },
  { key: 'return-arranged', label: 'Return arranged' },
  { key: 'returned', label: 'Back with you' },
];

/**
 * Put the photo somewhere the operator can open it.
 *
 * A `file://` URI written into a document is a picture only the traveler's own phone can
 * see, which is the same class of defect as a status nobody set. Returns null on failure and
 * the caller files the report without it — a described item still beats no report.
 */
async function uploadPhoto(uid: string, localUri: string): Promise<string | null> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) return null;
  try {
    const token = await user.getIdToken();
    const local = await fetch(localUri);
    const blob = await local.blob();
    const contentType = blob.type || 'image/jpeg';
    const signed = await fetch(`${PAYMENT_SERVER_URL}/storage/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ purpose: 'lost-item', contentType }),
    });
    const grant = await signed.json().catch(() => ({}));
    if (!signed.ok || !grant?.uploadUrl || !grant?.key) return null;
    const put = await fetch(grant.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    return put.ok ? String(grant.key) : null;
  } catch { return null; }
}

/**
 * File the report and notify the operators it concerns.
 *
 * `travels` is the set the report covers: one travel when the traveler picked it, and every
 * travel in the window when they chose "I'm not sure which". Somebody who cannot remember
 * which car they left a bag in must not be stuck, so the not-sure path is a real fan-out —
 * every operator on the document, not a shrug.
 */
export async function reportLostItem(args: {
  travels: RideRecord[];
  description: string;
  photoUri?: string | null;
  unsure: boolean;
}): Promise<LostItem | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const photoObjectKey = args.photoUri ? await uploadPhoto(uid, args.photoUri) : null;
  // R2 is private. The durable record stores an object key, never a public bearer URL.
  const photoUrl: string | null = null;

  const operatorIds = Array.from(
    new Set(args.travels.map((t) => t.operatorId).filter(Boolean)),
  );
  const operatorNames = Array.from(
    new Set(args.travels.map((t) => t.operatorName).filter(Boolean)),
  );

  const now = Date.now();
  const record: Omit<LostItem, 'id'> = {
    travelerUid: uid,
    tripNo: args.unsure ? null : (args.travels[0]?.tripNo ?? null),
    candidateTripNos: args.travels.map((t) => t.tripNo).filter(Boolean),
    notifiedOperatorIds: operatorIds,
    notifiedOperatorNames: operatorNames,
    description: args.description.trim().slice(0, 2000),
    photoUrl,
    ...(photoObjectKey ? { photoObjectKey } : {}),
    // A database relation is not a notification. The server advances this only after it has
    // created a durable Operator inbox message (push is an additional delivery channel).
    status: 'reported',
    createdAt: now,
    statusAt: now,
    return: null,
  };

  let created;
  try {
    created = await addDoc(collection(db, 'lost_items'), record);
  } catch {
    return null;
  }

  // AND PUT IT IN FRONT OF A PERSON. The document above names the operators, which is a
  // record, not a delivery — nothing on an operator's phone reads it yet. Until the operator
  // queue exists a specialist is the only route this bag actually has, so the case is filed
  // too, and `caseNo` comes back null when that failed. The screen says "a specialist follows
  // it up" only when it did not.
  let caseNo: string | null = null;
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${PAYMENT_SERVER_URL}/lost-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        itemId: created.id,
        tripNo: record.tripNo,
        travels: record.candidateTripNos,
        operators: record.notifiedOperatorNames,
        description: record.description,
        photoUrl: record.photoUrl,
        // The case carries the travel as the record has it, so the specialist reads the real
        // route and amount rather than blanks and a zero.
        trip: args.unsure
          ? { no: null, dep: '', arr: '', totalCents: 0 }
          : {
              no: record.tripNo,
              dep: args.travels[0]?.dep ?? '',
              arr: args.travels[0]?.arr ?? '',
              totalCents: args.travels[0]?.totalCents ?? 0,
            },
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d?.ok) caseNo = d.caseNo ?? null;
  } catch {
    // The report itself is saved. Only the human hand-off failed, and the screen says so.
  }

  return { id: created.id, caseNo, ...record };
}


/** Resolve this traveler's private lost-item image to a short-lived URL for display. */
export async function lostItemPhotoUrl(item: LostItem): Promise<string | null> {
  if (item.photoUrl) return item.photoUrl; // compatibility with pre-R2 records
  if (!item.photoObjectKey) return null;
  const user = auth.currentUser;
  if (!user || user.uid !== item.travelerUid) return null;
  try {
    const token = await user.getIdToken();
    const qs = new URLSearchParams({ purpose: 'lost-item', key: item.photoObjectKey }).toString();
    const res = await fetch(`${PAYMENT_SERVER_URL}/storage/object?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.url ? String(data.url) : null;
  } catch { return null; }
}

/** Watch one report, so the ladder moves the moment an operator answers. Returns unsubscribe. */
export function watchLostItem(id: string, onChange: (item: LostItem | null) => void): () => void {
  try {
    return onSnapshot(
      doc(db, 'lost_items', id),
      (snap) => onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<LostItem, 'id'>) }) : null),
      () => onChange(null),
    );
  } catch {
    return () => {};
  }
}

/** A small, ordered page of the Traveler's own reports. A failure throws, rather
 * than masquerading as an empty history. Only read the next page on request.
 *
 * Requires the lost_items(travelerUid ASC, createdAt DESC) composite index.
 */
export type LostItemPage = {
  items: LostItem[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function fetchMyLostItemsPage(
  cursor: LostItemPage['cursor'] = null,
  pageSize = 20,
): Promise<LostItemPage> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
    throw new Error('invalid-lost-item-page-size');

  const base = query(
    collection(db, 'lost_items'),
    where('travelerUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );
  const snap = await getDocs(cursor ? query(base, startAfter(cursor)) : base);
  const visible = snap.docs.slice(0, pageSize);
  return {
    items: visible.map(d => ({ id: d.id, ...(d.data() as Omit<LostItem, 'id'>) })),
    cursor: snap.docs.length > pageSize ? (visible[visible.length - 1] ?? null) : null,
    hasMore: snap.docs.length > pageSize,
  };
}

/** Bounded compatibility lookup. For more, use fetchMyLostItemsPage(cursor). */
export async function fetchMyLostItems(): Promise<LostItem[]> {
  return (await fetchMyLostItemsPage()).items;
}

