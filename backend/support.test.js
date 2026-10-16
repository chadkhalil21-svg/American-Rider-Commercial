// Patron Support's fixed decisions: which words must always reach a person — in the five
// languages the app speaks, not only English — what the traveler reads from the server in
// each, and how their own filed cases are shaped for the screen.
const assert = require('node:assert');
const { mustReachHuman, supportMessage, langOf } = require('./support');
const { listTickets } = require('./tickets');

const results = [];
const check = (label, ok, detail) => results.push({ label, ok: !!ok, detail });

// ---- always a person, in every language ----
check('an accident in English reaches a person', mustReachHuman('there was an accident on the highway'));
check('un accidente in Spanish reaches a person', mustReachHuman('hubo un accidente en la autopista'));
check('a drunk driver in French reaches a person', mustReachHuman('le conducteur était ivre'));
check('an aggression in Italian reaches a person', mustReachHuman('ho subito un\'aggressione'));
check('an injury in German reaches a person', mustReachHuman('ich wurde verletzt'));
check('a fare question in Spanish does not', !mustReachHuman('el importe cobrado no coincide con el presupuesto'));
check('a route question in English does not', !mustReachHuman('the operator took the causeway instead of the highway'));

// ---- what the traveler reads ----
check('a filed case is confirmed in Spanish', supportMessage('filed', 'es').startsWith('Una persona lee su caso'));
check('a filed case names the address the reply goes to', /a t@example\.com\.$/.test(supportMessage('filed', 'es', { email: 't@example.com' })));
check('a filed case names the sender when the server has one', supportMessage('filed', 'en', { email: 't@example.com', from: 'support@americanrider.app' }) === 'A person reads your case and replies from support@americanrider.app to t@example.com.');
check('the sender is named in every language', ['es', 'fr', 'it', 'de'].every((l) => /support@americanrider\.app .*t@example\.com\.$/.test(supportMessage('filed', l, { email: 't@example.com', from: 'support@americanrider.app' }))));
check('no sender configured, no sender named', !/%\{|from/.test(supportMessage('filed', 'en', { email: 't@example.com', from: '' })));
check('a filed case without an address still names the channel', supportMessage('filed', 'en') === 'A person reads your case and replies by email.' && !/%\{/.test(supportMessage('filed', 'de')));
check('an unfiled case names the inbox in French', /support@americanrider\.app/.test(supportMessage('notFiled', 'fr')));
check('an unknown language falls back to English', supportMessage('filed', 'xx') === supportMessage('filed', 'en'));
check('a missing language falls back to English', supportMessage('forced', undefined) === supportMessage('forced', 'en'));
check('language codes are normalised', langOf('ES') === 'es' && langOf('pt') === 'en' && langOf(null) === 'en');

// ---- the traveler's own cases ----
const rows = [
  { caseNo: 'AR-C-000001', uid: 'u1', kind: 'support', createdAt: 100, trip: { no: 'AR-2117-MIA' }, status: 'open', description: 'private', reason: 'private' },
  { caseNo: 'AR-C-000002', uid: 'u1', kind: 'emergency', createdAt: 300, trip: null, status: 'open' },
  { caseNo: 'AR-C-000003', uid: 'u1', createdAt: 200, trip: { no: 'AR-2118-MIA' } },
  { uid: 'u1', createdAt: 400 }, // a malformed row without a case number is dropped
];
const fakeDb = {
  collection: (name) => ({
    where: (field, op, value) => ({
      limit(n) { this.cap = n; return this; },
      get: async function () {
        return { docs: rows.filter((r) => name === 'support_tickets' && r[field] === value)
          .slice(0, this.cap).map((r) => ({ data: () => r })) };
      },
    }),
  }),
};
(async () => {
  const list = await listTickets('u1', { database: fakeDb });
  check('newest first', list.map((c) => c.caseNo).join(',') === 'AR-C-000002,AR-C-000003,AR-C-000001');
  check('an emergency keeps its kind, a missing kind is support', list[0].kind === 'emergency' && list[1].kind === 'support');
  check('the travel number comes from the trip, null when there is none', list[2].tripNo === 'AR-2117-MIA' && list[0].tripNo === null);
  check('a missing status reads as open', list[1].status === 'open');
  check('the description and our reason are never shaped for the screen', !('description' in list[2]) && !('reason' in list[2]));
  check('the limit holds', (await listTickets('u1', { database: fakeDb, limit: 1 })).length === 1);
  check('no uid, no rows', (await listTickets('', { database: fakeDb })).length === 0);
  let missingDbThrows = false;
  try { await listTickets('u1', { database: null }); } catch { missingDbThrows = true; }
  check('missing database is not misreported as empty history', missingDbThrows);

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  assert.strictEqual(failed.length, 0);
})();
