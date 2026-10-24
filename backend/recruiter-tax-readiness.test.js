'use strict';
const assert=require('node:assert/strict');
const {verifiedStripeTaxProfile}=require('./recruiter-tax-readiness');
const base={country:'US',details_submitted:true,payouts_enabled:true};
assert.equal(verifiedStripeTaxProfile({...base,business_type:'individual',
 individual:{ssn_last_4_provided:true}}),true);
assert.equal(verifiedStripeTaxProfile({...base,business_type:'individual',
 individual:{ssn_last_4_provided:false}}),false);
assert.equal(verifiedStripeTaxProfile({...base,business_type:'company',
 company:{tax_id_provided:true}}),true);
assert.equal(verifiedStripeTaxProfile({...base,business_type:'company',
 company:{tax_id_provided:false}}),false);
assert.equal(verifiedStripeTaxProfile({...base,country:'CA',business_type:'individual',
 individual:{ssn_last_4_provided:true}}),false);
assert.equal(verifiedStripeTaxProfile({...base,payouts_enabled:false,
 business_type:'individual',individual:{ssn_last_4_provided:true}}),false);
assert.equal(verifiedStripeTaxProfile(null),false);
console.log('PASS real Stripe tax identity evidence; missing or foreign tax proof never auto-cleared');
