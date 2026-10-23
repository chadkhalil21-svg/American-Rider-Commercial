'use strict';
// Live listener recovery: terminal Firestore errors must not mean "no Travels".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/backend/operatorInbox.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const listeners = [];
const pending = new Map();
let timerId = 0;
let throwOnSubscribe = false;
const firestore = {
  collection: () => ({}),
  doc: () => ({}),
  query: () => ({}),
  where: () => ({}),
  onSnapshot(_query, success, error) {
    if (throwOnSubscribe) throw new Error('subscription unavailable');
    const listener = { success, error, stopped: false };
    listeners.push(listener);
    return () => { listener.stopped = true; };
  },
};
const moduleMock = { exports: {} };
const dependencies = {
  'firebase/firestore': firestore,
  '../data': { fareFromTotal: amount => amount },
  '../config': { PAYMENT_SERVER_URL: 'https://example.invalid' },
  '../firebase': { auth: { currentUser: { uid: 'operator-a' } }, db: {} },
  '../i18n': { t: key => key },
};
vm.runInNewContext(compiled, {
  exports: moduleMock.exports, module: moduleMock,
  require(name) {
    if (!(name in dependencies)) throw new Error('Unexpected module ' + name);
    return dependencies[name];
  },
  setTimeout(fn, ms) { const id = ++timerId; pending.set(id, { fn, ms }); return id; },
  clearTimeout(id) { pending.delete(id); },
  console,
});
const { watchAssignedTravel } = moduleMock.exports;
const updates = [], errors = [];
const stop = watchAssignedTravel(items => updates.push(items), error => errors.push(error));
assert.equal(listeners.length, 1);
listeners[0].success({
  docs: [{ id: 'travel-a', data: () => ({
    status: 'assigned', createdAt: 1, costCents: 1800,
    travelCostCents: 1500, tripNo: 'AR-A',
  }) }],
});
assert.equal(updates.length, 1);
assert.equal(updates[0][0].rideId, 'travel-a');
listeners[0].error(new Error('Firestore unavailable'));
assert.equal(updates.length, 1, 'outage must not overwrite genuine assignments with an empty list');
assert.equal(errors.at(-1), 'Firestore unavailable');
assert.equal(pending.size, 1, 'terminal error must schedule reconnect');
assert.equal([...pending.values()][0].ms, 3000);
const [firstId, retry] = [...pending.entries()][0];
pending.delete(firstId); retry.fn();
assert.equal(listeners.length, 2, 'reconnect must attach a new Firestore listener');
listeners[1].success({ docs: [] });
assert.equal(errors.at(-1), '', 'healthy reconnect must clear the visible error');
assert.equal(updates.at(-1).length, 0, 'only a healthy server snapshot may show an empty inbox');
listeners[1].error(new Error('offline again'));
assert.equal(pending.size, 1);
assert.equal([...pending.values()][0].ms, 3000, 'successful connection resets retry backoff');
stop();
assert.equal(pending.size, 0, 'unsubscribe must cancel retry');
assert.equal(listeners[1].stopped, true);

throwOnSubscribe = true;
const otherUpdates = [], otherErrors = [];
const stopOther = watchAssignedTravel(items => otherUpdates.push(items), err => otherErrors.push(err));
assert.equal(otherUpdates.length, 0, 'synchronous subscribe error is not an empty inbox');
assert.equal(otherErrors[0], 'subscription unavailable');
assert.equal(pending.size, 1);
stopOther();
assert.equal(pending.size, 0);
console.log('PASS: Operator inbox keeps known assignments on error, reconnects and cleans up.');
