// Capturing and submitting an operator's documents.
//
// WHAT THIS REPLACES. `verifyDoc` set a flag to 'checking', waited 900 milliseconds, and set it
// to 'ok'. Driver licence, vehicle registration, annual inspection and commercial insurance —
// every one approved by a countdown, and no image ever captured, so there was nothing to
// approve even in principle.
//
// Documents go to private R2 storage. Images are OCR-read and PDFs await qualified
// human review. No automatically read document is clearance to commence operations.
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../firebase';
import { PAYMENT_SERVER_URL } from '../config';
import { t } from '../i18n';

export type DocKind = 'license' | 'registration' | 'inspection' | 'insurance';
export type SelectedDocument = { uri: string; mimeType?: string | null; name?: string; size?: number };

export type DocReview = {
  verdict: 'accept' | 'refuse' | 'review';
  reasons: string[];
  summary: string;
  /** YYYY-MM-DD when the document states one. What the three-year re-check runs from. */
  expiry: string | null;
};

/**
 * Camera photographs or the native Files picker. A PDF policy is a normal file,
 * not a photo; the old "Choose a file" action silently opened only Photos.
 * The selected file is copied to cache so fetch(uri) can read it on both phones.
 */
export async function pickDocument(fromCamera: boolean): Promise<SelectedDocument | null> {
  try {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      const photo = await ImagePicker.launchCameraAsync({ quality: 0.75 });
      const asset = photo.canceled ? null : photo.assets?.[0];
      return asset?.uri ? { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg', size: asset.fileSize } : null;
    }
    const file = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const selected = file.canceled ? null : file.assets?.[0];
    return selected?.uri
      ? { uri: selected.uri, mimeType: selected.mimeType, name: selected.name, size: selected.size }
      : null;
  } catch {
    return null;
  }
}

// Allow ordinary multi-page insurance PDFs and phone scans without a needless conversion.
// Large documents remain private and require the existing bounded named review.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]);
function uploadContentType(selected: SelectedDocument, blob: Blob): string | null {
  const reported = (selected.mimeType || '').toLowerCase();
  const fromBlob = (blob.type || '').toLowerCase();
  const type = ACCEPTED_TYPES.has(reported) ? reported :
    ACCEPTED_TYPES.has(fromBlob) ? fromBlob :
    /\.pdf(?:$|[?#])/i.test(selected.name || selected.uri) ? 'application/pdf' : '';
  return type || null;
}

/** Upload through a short-lived, authenticated R2 URL. Returns the private object key. */
async function upload(kind: DocKind, selected: SelectedDocument): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    if (selected.size != null && selected.size > MAX_UPLOAD_BYTES) return null;
    const local = await fetch(selected.uri);
    if (!local.ok) return null;
    const blob = await local.blob();
    if (blob.size <= 0 || blob.size > MAX_UPLOAD_BYTES) return null;
    const contentType = uploadContentType(selected, blob);
    if (!contentType) return null;
    const signed = await fetch(`${PAYMENT_SERVER_URL}/storage/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ purpose: 'operator-document', kind, contentType }),
    });
    const grant = await signed.json().catch(() => ({}));
    if (!signed.ok || !grant?.uploadUrl || !grant?.key) return null;
    const put = await fetch(grant.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    return put.ok ? String(grant.key) : null;
  } catch { return null; }
}

/**
 * Submit a document and get the verdict.
 *
 * Returns `null` only when the upload itself failed — the caller must then leave the document
 * unverified rather than treating a failure as a pass, which is the whole defect this file
 * exists to remove.
 */
export async function submitDocument(
  kind: DocKind,
  source: SelectedDocument | string,
): Promise<DocReview | { error: string } | null> {
  const selected = typeof source === 'string' ? { uri: source } : source;
  const objectKey = await upload(kind, selected);
  if (!objectKey) return null;
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${PAYMENT_SERVER_URL}/operator/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind, objectKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || `Server error ${res.status}` };
    return data as DocReview;
  } catch {
    return { error: t('traveler.errCheckDocServer') };
  }
}
