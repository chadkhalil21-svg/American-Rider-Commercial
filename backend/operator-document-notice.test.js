'use strict';
const assert=require('node:assert/strict');
const {correctionNotice}=require('./operator-document-notice');
assert.equal(correctionNotice({kind:'license',verdict:'accept'}),null);
assert.equal(correctionNotice({kind:'unknown',verdict:'review'}),null);
const unreadable=correctionNotice({kind:'license',verdict:'review',reasons:['The driver licence could not be read clearly.']});
assert.match(unreadable.text,/clearer photo or original PDF/);
assert.match(unreadable.text,/original file remains saved/);
const coverage=correctionNotice({kind:'insurance',verdict:'review',
 reasons:['Whether the policy covers carrying passengers for hire could not be read.']});
assert.match(coverage.text,/declarations page or relevant endorsement/);
const expired=correctionNotice({kind:'registration',verdict:'refuse',reasons:['Expired 2025-06-30.']});
assert.match(expired.text,/current document/);
const privateReason='The name on the document (SECRET PERSON) does not match the account (PRIVATE PERSON).';
const mismatch=correctionNotice({kind:'license',verdict:'review',reasons:[privateReason]});
assert.doesNotMatch(mismatch.text,/SECRET PERSON|PRIVATE PERSON/);
assert.doesNotMatch(mismatch.html,/SECRET PERSON|PRIVATE PERSON/);
console.log('PASS private, actionable document correction notices without leaking OCR or relaxing travel duty');
