// Verified, bounded toll reuse must never turn an unknown cost into zero.
const assert = require('node:assert/strict');
process.env.HERE_API_KEY = 'nonsecret-unit-test-key';
const { resolveTolls } = require('./tolls');

(async () => {
  const before = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ routes: [{ sections: [{}] }] }) };
  };
  try {
    const pickup = { lat: 25.76, lng: -80.21 };
    const arrival = { lat: 25.73, lng: -80.24 };
    const [first, second] = await Promise.all([
      resolveTolls(pickup, arrival), resolveTolls(pickup, arrival),
    ]);
    assert.equal(first.status, 'clear');
    assert.deepEqual(second, first);
    assert.equal(calls, 1, 'identical simultaneous requests use one provider call');
    assert.deepEqual(await resolveTolls(pickup, arrival), first);
    assert.equal(calls, 1, 'verified result is reused briefly');
    await resolveTolls(pickup, { lat: 25.74, lng: -80.23 });
    assert.equal(calls, 2, 'different destination must be independently verified');

    const other = { lat: 25.71, lng: -80.20 };
    global.fetch = async () => { calls++; return { ok: false, status: 503 }; };
    const unknown = await resolveTolls(pickup, other);
    assert.equal(unknown.status, 'unknown');
    global.fetch = async () => {
      calls++;
      return { ok: true, json: async () => ({ routes: [{ sections: [
        { tolls: [{ fares: [{ id: 'test', price: { value: 1.25, currency: 'USD' } }] }] },
      ] }] }) };
    };
    const restored = await resolveTolls(pickup, other);
    assert.equal(restored.status, 'tolled', 'a prior failure must never cache an assumed zero');
    assert.equal(restored.tollCents, 125);
    console.log('Verified-only toll cache and retry recovery passed');
  } finally {
    global.fetch = before;
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
