'use strict';
const assert = require('node:assert/strict');
const { DAY_MS, STATUS_INTERVAL_DAYS, STATUS_GRACE_DAYS, STATUS_DUE_MS,
  STATUS_MAX_AGE_MS, initialMonitoringFromDocument, continuingStatus,
  applyIndependentConfirmation, applyOperatorAttestation } = require('./insurance-monitoring');
const now = Date.parse('2026-10-18T12:00:00Z');
const specimen = { expiry: '2027-12-01', evidence: { insurance: {
  insurer: 'Example carrier', policyNumber: 'TEST-ONLY', effectiveDate: '2026-01-01',
  expirationDate: '2027-12-01',
} } };
for(let pass=0;pass<2;pass++) {
  assert.equal(STATUS_INTERVAL_DAYS,60);
  assert.equal(STATUS_GRACE_DAYS,5);
  assert.equal(STATUS_DUE_MS,60*DAY_MS);
  assert.equal(STATUS_MAX_AGE_MS,65*DAY_MS);
  const uploaded=initialMonitoringFromDocument(specimen,now);
  assert.equal(continuingStatus({insuranceMonitoring:uploaded},now).ok,false,'documents alone never confirm');
  const prior={...uploaded,verificationRequestCount:3,verificationRequestedAt:now-1000,
    verificationIssue:{kind:'delivery_attempts_exhausted'}};
  const confirmed=applyIndependentConfirmation(prior,{source:'carrier',status:'verified_active',now});
  assert.equal(confirmed.verificationRequestCount,0,'each real verification opens a fresh request cycle');
  assert.equal(confirmed.verificationRequestedAt,null);
  assert.equal(confirmed.verificationIssue,null);
  assert.equal(confirmed.statusMaxAgeDays,65);
  assert.equal(confirmed.nextVerificationDueAt,now+60*DAY_MS);
  assert.equal(continuingStatus({insuranceMonitoring:confirmed},now+59*DAY_MS).ok,true);
  const atDay60=continuingStatus({insuranceMonitoring:confirmed},now+60*DAY_MS);
  assert.equal(atDay60.ok,true);
  assert.equal(atDay60.operatorActionRequired,false);
  const atDay61=continuingStatus({insuranceMonitoring:confirmed},now+60*DAY_MS+1);
  assert.equal(atDay61.ok,false);
  assert.equal(atDay61.code,'insurance_attestation_due');
  const attest=applyOperatorAttestation(confirmed,now+60*DAY_MS+1);
  assert.equal(continuingStatus({insuranceMonitoring:attest},now+65*DAY_MS).ok,true);
  assert.equal(continuingStatus({insuranceMonitoring:attest},now+65*DAY_MS+1).code,'insurance_status_stale');
  const legacyAttest={...confirmed,operatorAttestedAt:now+30*DAY_MS};
  assert.equal(continuingStatus({insuranceMonitoring:legacyAttest},now+61*DAY_MS).ok,false,
    'old day-30 confirmation is not a day-60 attestation');
  const legacyDue={...confirmed,nextVerificationDueAt:now+30*DAY_MS,statusMaxAgeDays:35};
  assert.equal(continuingStatus({insuranceMonitoring:legacyDue},now+59*DAY_MS).ok,true,
    'historic next-due field is not authoritative for new 60-day rule');
  const expiry={...confirmed,expirationDate:'2026-10-17'};
  assert.equal(continuingStatus({insuranceMonitoring:expiry},now).ok,false,'printed policy expiry always blocks');
  const canceled={...confirmed,status:'cancelled'};
  assert.equal(continuingStatus({insuranceMonitoring:canceled},now).ok,false,'reported cancellation blocks instantly');
  const loss={...confirmed,status:'coverage_reduced'};
  assert.equal(continuingStatus({insuranceMonitoring:loss},now).ok,false);
}
console.log('PASS twice: day 60/65 insurer review, old data, cycle reset, immediate adverse lockout');
