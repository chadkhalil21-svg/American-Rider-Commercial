'use strict';
// Two deterministic passes. No Firebase, R2 upload, money, personal data, or network.
// An operator-only preparation rule must not interrupt a Traveler lost-item report.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {privateUploadScope}=require('./private-upload-scope');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
for(let pass=0;pass<2;pass++){
 assert.equal(privateUploadScope('operator-document'),'operator-preparation');
 assert.equal(privateUploadScope('lost-item'),'authenticated-traveler');
 for(const unknown of ['',null,undefined,'random','operator-document/lost-item',{},'lost-item-report'])
   assert.equal(privateUploadScope(unknown),null,'unknown purposes must fail closed');
 const server=source('backend/server.js');
 assert.match(server,/app\.post\('\/storage\/upload-url', requireAuth, LIMITS\.document, requireFreshAuth, requireScopedPrivateUpload/,
   'both upload purposes retain sign-in, fresh auth, and rate limiting');
 assert.match(server,/if \(scope === 'operator-preparation'\) return requireOperatorPreparationMarket\(req, res, next\)/,
   'operator compliance document must pass jurisdiction gate');
 assert.match(server,/if \(scope === 'authenticated-traveler'\) return next\(\)/,
   'lost-item photos must not require a commercial Operator account');
 assert.match(server,/code: 'unsupported_upload_purpose'/,'invalid purposes are explicitly rejected');
 assert.match(server,/app\.post\('\/operator\/document', requireAuth, LIMITS\.document, requireFreshAuth, requireOperatorPreparationMarket/,
   'document review still requires an independently configured jurisdiction');
 assert.match(server,/r2Owns\(objectKey, req\.uid, 'operator-document'\)/,
   'client-provided document keys cannot name another account');
 const backendR2=source('backend/r2.js');
 assert.match(backendR2,/purpose === 'lost-item'/,'private loss photo remains R2 supported');
 assert.match(backendR2,/purpose === 'operator-document'/,'operator file remains supported');
 assert.match(backendR2,/operator-documents\/\$\{owner\}/);
 assert.match(backendR2,/lost-items\/\$\{owner\}/);
 assert.match(source('src/backend/lostitem.ts'),/purpose: 'lost-item'/,
   'Traveler reporting uses the intended segregated upload scope');
 assert.match(source('src/backend/documentUpload.ts'),/purpose: 'operator-document'/,
   'Operator paperwork uses the restricted scope');
}
console.log('PASS twice: authenticated private lost-item upload unaffected by Operator qualification gate; unknown purposes fail closed. No actual upload.');
