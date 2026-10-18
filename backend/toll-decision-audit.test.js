'use strict';
const assert = require('node:assert/strict');
const { recordTollDecision } = require('./toll-decision-audit');
const prev = process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT;
const originalInfo = console.info;
const originalRandom = Math.random;
const logs = [];
try {
  console.info = message => logs.push(JSON.parse(message));
  Math.random = () => 0;
  delete process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT;
  recordTollDecision('here', { route: { provider: 'osrm', tollRelevant: true }, outcome: { status: 'tolled' } });
  assert.equal(logs.length, 0, 'audit must be off by default');
  process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT = '1';
  recordTollDecision('here', {
    route: { provider: 'osrm', tollRelevant: true, lat: 25.7, travelerUid: 'private-uid' },
    outcome: { status: 'tolled', tollCents: 120, paymentIntent: 'private-payment' },
  });
  assert.deepEqual(logs[0], {
    event: 'toll_authority_sample_v1', choice: 'here', routeSource: 'osrm',
    osmTollSignal: 'toll_tagged', status: 'tolled', samplePercent: 1,
  });
  assert.ok(!JSON.stringify(logs[0]).includes('25.7'));
  assert.ok(!JSON.stringify(logs[0]).includes('private'));
  Math.random = () => 0.999;
  recordTollDecision('here', { route: {}, outcome: {} });
  assert.equal(logs.length, 1, 'out-of-sample request logs nothing');
  process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT = '100';
  Math.random = () => 0;
  recordTollDecision('here', { route: {}, outcome: {} });
  assert.equal(logs.length, 1, 'prohibit excessive logging');
  console.log('PASS: sampled toll decision audit defaults off, contains no personal or route data');
} finally {
  console.info = originalInfo;
  Math.random = originalRandom;
  if (prev === undefined) delete process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT;
  else process.env.AR_TOLL_AUDIT_SAMPLE_PERCENT = prev;
}
