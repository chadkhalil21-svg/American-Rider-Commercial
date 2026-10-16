'use strict';
const assert = require('node:assert/strict');
const { normalize, summarize, listIndexes, isCompositeDefinition } = require('./firestore-index-commission.cjs');
const manifest = require('../firestore.indexes.json');
// Index inventory grows through separately reviewed additions. Guard uniqueness and
// query shape, rather than freezing the launch-era number of indexes forever.
assert(manifest.indexes.length >= 12, 'do not remove existing commissioned indexes');
assert.equal(new Set(manifest.indexes.map(normalize)).size, manifest.indexes.length,
  'duplicate composite definitions are not allowed');
for (const needed of [
  [{ fieldPath: 'travelerUid', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' }],
  [{ fieldPath: 'travelerUid', order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'costCents', order: 'ASCENDING' }],
  [{ fieldPath: 'travelerUid', order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }],
]) {
  assert(manifest.indexes.some(index => index.collectionGroup === 'rides' &&
    JSON.stringify(index.fields) === JSON.stringify(needed)),
    'bounded Traveler history/aggregate indexes must be declared');
}
for (const index of manifest.indexes) {
  assert(index.collectionGroup && index.queryScope, 'index must have collection group and query scope');
  assert(index.fields.length > 0, 'index must have fields');
  assert(isCompositeDefinition(index), 'manifest must not include automatically indexed single fields');
  assert(normalize(index).includes(index.collectionGroup));
  assert(summarize(index).includes(index.collectionGroup));
}
// A normal single-field index, with implicit __name__ ordering, is provided by
// Firestore automatically. It must not be POSTed as a composite definition.
for (const [group, field] of [['rides', 'status'], ['operators', 'available']]) {
  const singleFieldIndex = {
    collectionGroup: group, queryScope: 'COLLECTION',
    fields: [{ fieldPath: field, order: 'ASCENDING' },
             { fieldPath: '__name__', order: 'ASCENDING' }],
  };
  assert.equal(isCompositeDefinition(singleFieldIndex), false,
    'single-field query with default document name ordering is automatic');
  assert(!manifest.indexes.some(i => normalize(i) === normalize(singleFieldIndex)),
    'Firestore rejects unnecessary single-field composite indexes');
}
const source = {
  collectionGroup: 'support_tickets',
  queryScope: 'COLLECTION',
  fields: [{fieldPath:'status',order:'ASCENDING'},
           {fieldPath:'createdAt',order:'DESCENDING'}],
};
const live = {
  name:'projects/american-rider-35688/databases/(default)/collectionGroups/support_tickets/indexes/abcdef',
  queryScope: 'COLLECTION',
  state:'READY',
  fields: [...source.fields, {fieldPath:'__name__',order:'DESCENDING'}],
};
assert.equal(normalize(source), normalize(live), 'FireStore adds default trailing __name__ field');
assert(isCompositeDefinition(source), 'real two-field composite index remains required');
assert.notEqual(normalize(source), normalize({
  ...live,fields:[{fieldPath:'status',order:'ASCENDING'},
                  {fieldPath:'createdAt',order:'ASCENDING'},
                  {fieldPath:'__name__',order:'ASCENDING'}],
}), 'descending and ascending indexes are not interchangeable');
assert.equal(normalize({
  ...source,fields:[...source.fields,{fieldPath:'__name__',order:'ASCENDING'}],
}) === normalize(live), false, 'non-default __name__ sort should remain distinct');
console.log('PASS Firestore commissioner source definitions and implicit key order');

async function verifyLiveListProtocol() {
  const originalFetch = global.fetch;
  const priorToken = process.env.FIRESTORE_ACCESS_TOKEN;
  const calls = [];
  process.env.FIRESTORE_ACCESS_TOKEN = 'fake-test-token';
  try {
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      assert(!String(url).includes('pageSize'), 'Never send unsupported Firestore pageSize');
      const page = calls.length === 1
        ? { indexes: [live], nextPageToken: 'next page/+token' }
        : { indexes: [{ ...live, name: live.name + '-second' }] };
      return { ok: true, json: async () => page };
    };
    const rows = await listIndexes('support_tickets');
    assert.equal(rows.length, 2, 'all Firestore list pages must be collected');
    assert.equal(calls.length, 2);
    assert(calls[0].url.endsWith('/collectionGroups/support_tickets/indexes'),
      'first page has no query parameters');
    assert(calls[1].url.includes('?pageToken=next%20page%2F%2Btoken'),
      'continuation token must be encoded');
    assert(calls.every(x => x.method === 'GET'), 'audit is read-only');
  } finally {
    global.fetch = originalFetch;
    if (priorToken === undefined) delete process.env.FIRESTORE_ACCESS_TOKEN;
    else process.env.FIRESTORE_ACCESS_TOKEN = priorToken;
  }
}
verifyLiveListProtocol().then(() =>
  console.log('PASS Firestore commissioner omits unsupported pageSize and paginates read-only')
).catch((e) => { console.error(e); process.exitCode = 1; });
