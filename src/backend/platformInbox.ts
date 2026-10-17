const { auth } = require('../firebase');
const { PAYMENT_SERVER_URL } = require('../config');

export type PlatformMessage = {
  id: string;
  category: string;
  title: string;
  body: string;
  action?: { screen?: string } | null;
  required: boolean;
  createdAt: number;
  readAt?: number | null;
};

async function headers() {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function fetchOperatorInbox(): Promise<PlatformMessage[]> {
  const res = await fetch(`${PAYMENT_SERVER_URL}/account/inbox`, { headers: await headers() });
  if (!res.ok) throw new Error('platform_inbox_unavailable');
  const out = await res.json();
  return Array.isArray(out.messages) ? out.messages : [];
}

export async function markOperatorMessageRead(id: string): Promise<boolean> {
  const res = await fetch(`${PAYMENT_SERVER_URL}/account/inbox/${encodeURIComponent(id)}/read`, {
    method: 'POST', headers: await headers(),
  });
  return res.ok;
}
