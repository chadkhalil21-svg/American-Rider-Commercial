const assert = require('node:assert/strict');
process.env.HERE_API_KEY = 'nonsecret-unit-test-key';
const { verifiedHereRoute, resolveTollsCostAware } = require('./tolls');

(async () => {
  const original = global.fetch;
  const a = { lat: 25.76, lng: -80.21 }, b = { lat: 25.73, lng: -80.24 };
  let calls = 0;
  try {
    global.fetch = async (url) => {
      calls++;
      assert.match(String(url), /return=summary%2Ctolls/);
      return { ok: true, json: async () => ({ routes: [{ sections: [
        { summary: { length: 1800, duration: 160 }, tolls: [] },
        { summary: { length: 2700, duration: 330 }, tolls: [
          { fares: [{ id: 'public-test-fare', price: { currency: 'USD', value: 2.5 } }] },
        ] },
      ] }] }) };
    };
    const route = await verifiedHereRoute(a, b);
    assert.equal(route.provider, 'here');
    assert.equal(route.distanceMeters, 4500);
    assert.equal(route.durationSec, 490);
    assert.equal(route.verifiedTolls.tollCents, 250);
    const tolls = await resolveTollsCostAware(a, b, { route, routeAttempted: true });
    assert.equal(tolls.tollCents, 250);
    assert.equal(calls, 1, 'same HERE route must not pay for a second potentially different toll quote');

    global.fetch = async () => ({
      ok: true, json: async () => ({ routes: [{ sections: [
        { summary: { length: 1000, duration: 90 }, notices: [{ code: 'tollsDataUnavailable' }] },
      ] }] }),
    });
    assert.equal(await verifiedHereRoute(a, b), null, 'unknown toll must never become a quote');
    global.fetch = async () => ({ ok: true, json: async () => ({
      routes: [{ sections: [{ summary: { length: 2000 }, tolls: [] }] }],
    }) });
    assert.equal(await verifiedHereRoute(a, b), null, 'missing time must never create a modeled route');
    global.fetch = async () => ({ ok: false, status: 403 });
    assert.equal(await verifiedHereRoute(a, b), null, 'provider authorization failure blocks the quote');
    console.log('Verified single-response HERE route fallback passed');
  } finally { global.fetch = original; }
})().catch((e) => { console.error(e); process.exitCode = 1; });
