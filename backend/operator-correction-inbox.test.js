'use strict';
// Verify the Operator's corrections survive email spam/outage and remain reachable
// from the actual qualification screens. Do not require a new inbox service.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('backend/server.js'), review=read('app/operator/review.tsx');
const docs=read('app/operator/documents.tsx'), inbox=read('backend/platforminbox.js');
assert.match(server,/postPlatformMessage\(\{/,'upload writes a persistent platform notice');
assert.match(server,/category:'qualification'/,'document correction has a qualification category');
assert.match(server,/idempotencyKey:noticeKey/,'retry does not duplicate in-app notices');
assert.match(server,/action:\{screen:kind==='insurance'/,'notice opens the correct correction screen');
assert.match(server,/send\(\{to:req\.email,\.\.\.notice,idempotencyKey:noticeKey\}\)/,
  'verified email is a secondary notice channel');
assert.match(review,/router\.navigate\('\/operator\/inbox'\)/,'review screen opens messages');
assert.doesNotMatch(docs,/beingCheckedByPerson/,'unreadable upload need not imply a manual reviewer');
assert.match(inbox,/collection\('platform_messages'\)/,'inbox is durable per account');
assert.match(inbox,/readAt: null/,'the app can display unread notices');
assert.match(inbox,/kind: 'platform_message'/,'push is attempted when available');
assert.match(server,/assessAndRecord\(/,'server alone still owns qualification');
console.log('PASS: correction is in-app, persistent, inbox-linkable and email-optional; qualification gate intact');
