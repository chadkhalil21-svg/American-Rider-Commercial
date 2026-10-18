const assert = require('assert');
const {
  STATUS_DUE_MS,
  STATUS_MAX_AGE_MS,
  initialMonitoringFromDocument,
  continuingStatus,
  applyOperatorAttestation,
  applyIndependentConfirmation,
} = require('./insurance-monitoring');

const now = Date.UTC(2026, 8, 26, 12);
const doc = {
  expiry: '2027-03-01',
  evidence: { insurance: { insurer: 'Example Commercial', policyNumber: 'ABC123', effectiveDate: '2026-03-01', expirationDate: '2027-03-01' } },
};

const initial = initialMonitoringFromDocument(doc, now);
assert.equal(initial.status, 'unverified', 'document acceptance cannot claim live insurer verification');
assert.equal(initial.operatorAttestedAt, null);
assert.equal(initial.lastVerifiedAt, null);
assert.equal(continuingStatus({ insuranceMonitoring: initial }, now).ok, false);
assert.equal(continuingStatus({ insuranceMonitoring: initial }, now).code, 'insurance_unverified');

// Only a genuinely independent confirmation opens the monitored policy-status clock.
const confirmed = applyIndependentConfirmation(initial, {
  status: 'verified_active', source: 'independently_vetted_broker', now,
});
assert.equal(confirmed.status, 'verified_active');
assert.equal(continuingStatus({ insuranceMonitoring: confirmed }, now).ok, true);
assert.equal(continuingStatus({ insuranceMonitoring: confirmed }, now).operatorActionRequired, false);

// At day 61, only if independent confirmation has not arrived, one tap can bridge the short grace.
const day61 = now + STATUS_DUE_MS + 1;
const due = continuingStatus({ insuranceMonitoring: confirmed }, day61);
assert.equal(due.ok, false);
assert.equal(due.code, 'insurance_attestation_due');
assert.equal(due.operatorActionRequired, true);

const attested = applyOperatorAttestation(confirmed, day61);
const grace = continuingStatus({ insuranceMonitoring: attested }, day61);
assert.equal(grace.ok, true);
assert.equal(grace.status, 'verification_due');

// Self-attestation never resets independent verification; after day 65 it still blocks.
const tooOld = continuingStatus({ insuranceMonitoring: attested }, now + STATUS_MAX_AGE_MS + 1);
assert.equal(tooOld.code, 'insurance_status_stale');

const cancelled = applyIndependentConfirmation(confirmed, { status: 'cancelled', source: 'broker', now });
assert.equal(continuingStatus({ insuranceMonitoring: cancelled }, now).code, 'insurance_cancelled');

const reverified = applyIndependentConfirmation(cancelled, { status: 'verified_active', source: 'carrier', now });
assert.equal(continuingStatus({ insuranceMonitoring: reverified }, now).ok, true);


// Repeated malformed/future carrier timestamps must NEVER make coverage fresh.
for (let pass = 0; pass < 2; pass++) {
  for (const invalid of [now + 1, now + 86400000, 'tomorrow', Infinity, 0, -1]) {
    const observed = continuingStatus({
      insuranceMonitoring: { ...confirmed, lastVerifiedAt: invalid },
    }, now);
    assert.equal(observed.ok, false, 'bad independent verification time must fail closed');
    assert.equal(observed.code, 'insurance_status_unverified');
  }
  // Even a freshly recorded broker confirmation cannot extend a policy
  // whose known expiry was yesterday or whose date is invalid.
  for (const invalidExpiry of ['2026-09-25', '2026-09-99', 'nonsense']) {
    const observed = continuingStatus({
      insuranceMonitoring: { ...confirmed, expirationDate: invalidExpiry },
    }, now);
    assert.equal(observed.ok, false);
    assert.equal(observed.code, 'insurance_policy_expired');
  }
  // Valid documented policy remains active THROUGH its stated expiry date.
  const endOfPolicy = Date.UTC(2027, 2, 1, 23, 59, 59, 999);
  const newlyConfirmed = applyIndependentConfirmation(initial, {
    status: 'verified_active', source: 'independently_vetted_carrier', now: endOfPolicy,
  });
  assert.equal(continuingStatus({ insuranceMonitoring: newlyConfirmed }, endOfPolicy).ok, true);
  assert.equal(continuingStatus({ insuranceMonitoring: newlyConfirmed }, endOfPolicy+1).code,
    'insurance_policy_expired');
  // A cancellation notice always takes priority over any currently valid date.
  assert.equal(continuingStatus({
    insuranceMonitoring:{ ...confirmed,status:'cancelled',lastVerifiedAt:now+99999 },
  },now).code,'insurance_cancelled');
}

console.log('insurance-monitoring tests passed');