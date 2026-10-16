// Operator-facing continuing insurance-status workflow.
import { PAYMENT_SERVER_URL } from '../config';
import { auth } from '../firebase';
import { t } from '../i18n';

export type InsuranceConfig = {
  state: string;
  stateName: string;
  statute: string;
  source: string;
  script: string;
  policyUse: string;
  limits: {
    loggedOn?: { perPerson?: number; perIncident?: number; propertyDamage?: number };
    ridePrimaryLiability?: number;
    pipRequired?: boolean;
    umUim?: string;
  };
};

export type InsuranceStatus = {
  ok: boolean;
  status: string;
  documentApproved?: boolean;
  policyExpiry?: string | null;
  code?: string | null;
  reason?: string | null;
  lastVerifiedAt?: number | null;
  operatorAttestedAt?: number | null;
  nextVerificationDueAt?: number | null;
  operatorActionRequired?: boolean;
  graceUntil?: number | null;
  authorized?: boolean;
  verificationIssue?: { kind?: string; at?: number; source?: string; contactEmail?: string; note?: string | null } | null;
  contact?: { name?: string; email?: string; type?: string } | null;
};

async function headers() {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function insuranceStatus(): Promise<InsuranceStatus | null> {
  try {
    const r = await fetch(`${PAYMENT_SERVER_URL}/operator/insurance/status`, { headers: await headers() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function attestInsuranceUnchanged(): Promise<InsuranceStatus | null> {
  try {
    const r = await fetch(`${PAYMENT_SERVER_URL}/operator/insurance/attest`, {
      method: 'POST', headers: await headers(), body: '{}',
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function requestInsuranceConfirmation(contact: {
  name?: string;
  email: string;
  type?: 'agent' | 'broker' | 'carrier';
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${PAYMENT_SERVER_URL}/operator/insurance/request-confirmation`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(contact),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: d?.error || `Server error ${r.status}` };
  } catch {
    return { ok: false, error: t('traveler.errReachARNoStop') };
  }
}

// A negative report can only pause new Travel; the Operator cannot certify a
// policy as active or reverse this report without an independent source.
export async function reportInsuranceRisk(kind: 'pending_cancellation' | 'cancelled'):
  Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${PAYMENT_SERVER_URL}/operator/insurance/report-risk`, {
      method: 'POST', headers: await headers(), body: JSON.stringify({ kind }),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok && d.newTravelBlocked === true ? { ok: true } :
      { ok: false, error: d?.error || t('traveler.errReachARNoStop') };
  } catch { return { ok: false, error: t('traveler.errReachARNoStop') }; }
}

export async function insuranceConfig(): Promise<InsuranceConfig | null> {
  try {
    const r = await fetch(`${PAYMENT_SERVER_URL}/operator/insurance/config`, { headers: await headers() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function authorizeInsuranceStatusVerification(): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${PAYMENT_SERVER_URL}/operator/insurance/authorize-status`, {
      method: 'POST', headers: await headers(), body: '{}',
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: d?.error || `Server error ${r.status}` };
  } catch {
    return { ok: false, error: t('traveler.errReachARNoStop') };
  }
}
