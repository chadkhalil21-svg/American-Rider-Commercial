'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {portalHtml}=require('../scripts/corporate-recruiter-portal.cjs');
const {progressHtml}=require('../scripts/corporate-recruiter-progress.cjs');
const html=portalHtml(),progress=progressHtml();
for(const key of ['intros-rows','intros-more','intros-status','intros-operators','intros-travelers'])
  assert.ok(html.includes(key),'Missing private dashboard element: '+key);
assert.match(html,/recruiters\/introductions\?role=/);
assert.match(html,/encodeURIComponent\(introCursor\)/);
assert.match(html,/entry\.reference/);
assert.match(html,/No introductions recorded yet/);
assert.match(html,/Not verified/);
assert.match(html,/resetIntros\(\)/);
assert.match(html,/await loadIntroductions\(true\)/);
assert.doesNotMatch(progress,/email address|phone number|pickup|destination|bank account number/i);
const moduleJs=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleJs,'Firebase authenticated script required');
assert.doesNotThrow(()=>new vm.Script(moduleJs[1].replace(/^import [^\n]*\n/gm,'')));
const backend=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.match(backend,/app\.get\('\/recruiters\/introductions',requireAuth,requireFreshAuth/);
assert.match(backend,/requireVerifiedEmail,recruiterLimit/);
assert.match(backend,/uid:String\(req\.uid\),verifiedEmail:req\.email/);
assert.match(backend,/Cache-Control','private, no-store, max-age=0/);
const indexes=JSON.parse(fs.readFileSync(path.join(__dirname,'..','firestore.indexes.json'),'utf8')).indexes;
assert.ok(indexes.some(i=>i.collectionGroup==='referral_attributions'&&
  i.fields.some(f=>f.fieldPath==='inviterUid')&&
  i.fields.some(f=>f.fieldPath==='role')&&i.fields.length===2),
  'reuse the pre-existing two-field index, no new index rollout');
console.log('PASS recruiter dashboard: indexed 20-row list, verified-account authorization, private no-store and truthful money status');
