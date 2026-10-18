'use strict';
// Simulated 30-minute parked duty and outage/recovery against the actual native task.
// Time and phone callbacks are controlled, not real device measurements.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { presenceStale } = require('./matching');

function compile(relative) {
  return ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
}
const policySource = compile('src/backend/backgroundPresencePolicy.ts');
const presenceSource = compile('src/backend/presence.ts');
const BASE = Date.UTC(2026, 9, 18, 14);

function handset(platform) {
  const state = {
    now: BASE, connected: true, serverAccepts: true, backgroundPermission: true,
    registered: true, options: { distanceInterval: 150 }, task: null,
    calls: [], acceptedAt: 0, stopped: false
  };
  class TestDate extends Date { static now() { return state.now; } }
  function load(source, requireModule) {
    const mod = { exports: {} };
    vm.runInNewContext(source, {
      module: mod, exports: mod.exports, require: requireModule,
      Date: TestDate, console: { warn() {} }, Number, JSON, Math, Promise
    }, { timeout: 5000 });
    return mod.exports;
  }
  const policy = load(policySource, name => { throw Error('Unexpected policy import: '+name); });
  const location = {
    Accuracy: { Balanced: 3 },
    getBackgroundPermissionsAsync: async () => ({ granted: state.backgroundPermission }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestBackgroundPermissionsAsync: async () => ({
      status: state.backgroundPermission ? 'granted' : 'denied'
    }),
    isBackgroundLocationAvailableAsync: async () => true,
    startLocationUpdatesAsync: async (name, options) => {
      state.registered = true; state.options = options;
    },
    stopLocationUpdatesAsync: async () => {
      state.stopped = true; state.registered = false;
    }
  };
  const manager = {
    defineTask: (name, task) => { state.task = task; },
    isTaskRegisteredAsync: async () => state.registered,
    getTaskOptionsAsync: async () => state.options
  };
  const module = load(presenceSource, name => {
    if (name === 'react-native') return { Platform: { OS: platform }, Alert: { alert() {} } };
    if (name === 'expo-location') return location;
    if (name === 'expo-task-manager') return manager;
    if (name === '../config') return { PAYMENT_SERVER_URL: 'https://synthetic.invalid' };
    if (name === './payments') return { authHeaders: async () => ({ Authorization: 'synthetic' }) };
    if (name === '../i18n') return { t: key => key };
    if (name === './backgroundPresencePolicy') return policy;
    throw Error('Unexpected presence dependency: ' + name);
  });
  // The source uses the global fetch in its own VM. Recompile with the same
  // injected dependencies, but with our simulated server response.
  function loadTask() {
    const mod = { exports: {} };
    vm.runInNewContext(presenceSource, {
      module: mod, exports: mod.exports, Date: TestDate, Number, JSON, Math, Promise,
      console: { warn() {} },
      require: name => {
        if (name === 'react-native') return { Platform: { OS: platform }, Alert: { alert() {} } };
        if (name === 'expo-location') return location;
        if (name === 'expo-task-manager') return manager;
        if (name === '../config') return { PAYMENT_SERVER_URL: 'https://synthetic.invalid' };
        if (name === './payments') return { authHeaders: async () => ({ Authorization: 'synthetic' }) };
        if (name === '../i18n') return { t: key => key };
        if (name === './backgroundPresencePolicy') return policy;
        throw Error('Unexpected presence dependency: ' + name);
      },
      fetch: async (url, options) => {
        assert.equal(url, 'https://synthetic.invalid/operator/online');
        const body = JSON.parse(options.body);
        assert.equal(body.background, true);
        assert.equal(body.lat, 25.7);
        assert.equal(body.lng, -80.3);
        state.calls.push(state.now);
        if (!state.connected) throw Error('synthetic network disconnection');
        if (state.serverAccepts) state.acceptedAt = state.now;
        return { status: 200, ok: true,
          json: async () => ({ ok: state.serverAccepts }) };
      }
    }, { timeout: 5000 });
    return mod.exports;
  }
  const actual = loadTask();
  assert.equal(typeof state.task, 'function');
  return {
    state, presence: actual,
    async callback(secondsSinceBase, options = {}) {
      state.now = BASE + secondsSinceBase * 1000;
      const loc = {
        coords: { latitude: 25.7, longitude: -80.3, accuracy: 15 },
        timestamp: state.now, mocked: false
      };
      if (options.stale) loc.timestamp -= 120000;
      if (options.mocked) loc.mocked = true;
      if (options.inaccurate) loc.coords.accuracy = 400;
      await state.task({ data: { locations: [loc] }, error: null });
    }
  };
}

(async () => {
  for (const platform of ['ios', 'android']) {
    const phone = handset(platform);
    assert.equal(await phone.presence.startBackgroundPresence(), true);
    assert.equal(phone.state.options.distanceInterval, 0,
      platform + ': upgrade old 150m task to permit parked callbacks');
    if (platform === 'android') {
      assert.ok(phone.state.options.foregroundService.notificationTitle,
        'Android keeps an on-duty location notice');
    }
    // 30 minutes parked; native OS chooses to supply 30-second callbacks.
    // Only every third callback makes a successfully accepted server renewal.
    for (let second = 0; second <= 1800; second += 30) {
      await phone.callback(second);
      assert.equal(presenceStale({ onlineAt: phone.state.acceptedAt }, phone.state.now),
        false, platform + ': parked operator remains dispatchable with fresh callbacks');
    }
    assert.equal(phone.state.calls.length, 21,
      platform + ': at most one successful parked renewal each 90 seconds');
    assert.equal(phone.state.acceptedAt, BASE + 1800 * 1000);

    // A connected phone can get an HTTP 200 without valid server acceptance.
    // Such a response must never postpone a retry or refresh dispatch presence.
    phone.state.serverAccepts = false;
    await phone.callback(1830);
    await phone.callback(1890);
    assert.equal(phone.state.acceptedAt, BASE + 1800 * 1000);
    assert.equal(phone.state.calls.length, 22);
    phone.state.serverAccepts = true;
    await phone.callback(1920);
    assert.equal(phone.state.acceptedAt, BASE + 1920 * 1000,
      platform + ': recovery after server refusal needs no new duty action');

    // Lose connectivity. No failed request is allowed to refresh server presence.
    phone.state.connected = false;
    for (let second = 1950; second <= 2310; second += 30) {
      await phone.callback(second);
    }
    assert.equal(presenceStale({ onlineAt: phone.state.acceptedAt }, phone.state.now), true,
      platform + ': after six minutes offline dispatch must exclude operator');
    phone.state.connected = true;
    await phone.callback(2340);
    assert.equal(presenceStale({ onlineAt: phone.state.acceptedAt }, phone.state.now), false,
      platform + ': new callback restores eligibility after the network returns');

    // Simulate the OS suspending all location events for six minutes.
    phone.state.now = BASE + 2710 * 1000;
    assert.equal(presenceStale({ onlineAt: phone.state.acceptedAt }, phone.state.now), true,
      platform + ': absence of callbacks must not be fabricated into availability');
    await phone.callback(2740, { stale: true });
    await phone.callback(2740, { mocked: true });
    await phone.callback(2740, { inaccurate: true });
    assert.equal(presenceStale({ onlineAt: phone.state.acceptedAt }, phone.state.now), true,
      platform + ': stale/mocked/inaccurate GPS must not restore dispatch');
    await phone.callback(2770);
    assert.equal(presenceStale({ onlineAt: phone.state.acceptedAt }, phone.state.now), false,
      platform + ': fresh valid callback automatically restores dispatch');
    await phone.presence.stopBackgroundPresence();
    assert.equal(phone.state.stopped, true);
  }
  // A revoked background-location permission must not be bypassed when an
  // older saved task is upgraded.
  for (const platform of ['ios', 'android']) {
    for (const savedDistance of [0, 150]) {
      const revoked = handset(platform);
      revoked.state.options = { distanceInterval: savedDistance };
      revoked.state.backgroundPermission = false;
      assert.equal(await revoked.presence.startBackgroundPresence(), false,
        platform + ': revoked permission cannot pass even for already upgraded tasks');
      assert.equal(revoked.state.options.distanceInterval, savedDistance,
        'do not reconfigure a task after permission is revoked');
    }
  }

  console.log('PASS parked duty: 30m iOS + Android, bounded renewals, server refusal, ' +
    'offline 6m, OS pause, stale GPS, auto recovery, permission revocation');
})().catch(error => { console.error(error); process.exitCode = 1; });
