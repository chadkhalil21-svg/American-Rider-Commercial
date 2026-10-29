'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ops=fs.readFileSync(path.join(__dirname,'ops.js'),'utf8');
const mcp=fs.readFileSync(path.join(__dirname,'chatgpt-mcp.js'),'utf8');
const M=require('./chatgpt-mcp');
const expected=[
 ['platform_overview','market:read',true],
 ['invite_recruiter','recruiter:invite',false],
 ['recruiter_status','recruiter:read',true],
 ['recruiter_review','recruiter:review',false],
 ['operator_status','operator:read',true],
 ['operator_suspend','operator:manage',false],
 ['operations_cases','cases:read',true],
 ['operations_case_action','cases:act',false],
];
for(const [name,scope,readOnly] of expected){
 const tool=M.TOOLS.find(x=>x.name===name);
 assert.ok(tool,'missing '+name);
 assert.equal(tool.scope,scope,'wrong scope '+name);
 assert.equal(tool.annotations.readOnlyHint,readOnly);
 assert.deepEqual(tool.securitySchemes,[{type:'oauth2',scopes:[scope]}]);
 assert.deepEqual(M.validScope(scope),[scope]);
}
for(const name of ['recruiter_review','operator_suspend','operations_case_action']){
 const t=M.TOOLS.find(x=>x.name===name);
 assert.ok(t.inputSchema.required.includes('confirmation'),'confirm before '+name);
 assert.equal(t.annotations.destructiveHint,true);
}
assert.equal(M.validScope('administrator:all'),null);
assert.equal(M.validScope('market:read market:read'),null);
assert.equal(M.BASE,'https://american-rider-api-production-623854974930.us-east1.run.app');
assert.match(ops,/verifyIdToken\(token,true\)/,'Google ID token must be verified with revoked-token check');
assert.match(ops,/AR_FOUNDER_GOOGLE_OPS_ENABLED/,'feature must be explicitly gated');
assert.match(ops,/allowedFounderUids\(\)/,'require existing Founder UID allowlist');
assert.match(ops,/ids\.length!==1\|\|names\.length!==1/,'fail closed on ambiguous Owner identity');
assert.match(ops,/sign_in_provider!=='google\.com'/,'enforce authenticated Google provider');
assert.match(ops,/req\.get\('origin'\)!==origin/,'reject cross-origin session issue');
assert.match(ops,/SameSite=Strict/,'secure same-site session');
assert.doesNotMatch(ops,/res\.json\(\{[^\n]*idToken/,'do not return Firebase credential to browser');
console.log('PASS Founder Google operations OAuth scaffolding, scope separation, write confirmations and fail-closed configuration');
