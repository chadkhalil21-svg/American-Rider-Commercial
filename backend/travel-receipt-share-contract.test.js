'use strict';
// Source-only contract for the Traveler receipt share action. No device,
// email provider or Stripe transaction is invoked.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app/receipt.tsx');
const receipt=read('backend/email.js');
assert.match(app,/Share\\.share\\(\\{message:/);
assert.match(app,/label=\\{t\\('traveler\\.shareReceipt'\\)\\}/);
for(const key of ['travelNumber','totalCharged','departure','destination','distance',
  'duration','operator','paymentMethod','adjustmentCorrected']) {
  assert.ok(app.includes("t('traveler."+key+"')"),key+' shares recorded receipt facts');
}
assert.match(app,/line\\.payee/);
assert.match(app,/view\\.miles != null/);
assert.match(app,/view\\.minutes != null/);
assert.doesNotMatch(app,/send\\(\\{\\s*to:|RESEND_API_KEY|stripe\\.transfers\\.create/);
assert.match(receipt,/row\\('Duration', duration\\)/);
assert.match(receipt,/row\\('Distance', distance\\)/);
for(const lang of ['en','es','fr','de','it']){
 const table=read('src/i18n/'+lang+'.ts');
 assert.match(table,/shareReceipt:\\s*'[^']+'/);
}
console.log('PASS share receipt from Travel Log with recorded facts and five languages; no financial action or email');
