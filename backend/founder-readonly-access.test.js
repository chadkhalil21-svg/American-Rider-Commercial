'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {allowedFounderUids,founderTokenAllowed,mountFounderReadonly,MAX_AGE_SECONDS}=require('./founder-readonly-access');
const fixed=Date.UTC(2026,9,24,22,0,0),secs=Math.floor(fixed/1000),uid='FounderUIDAlpha01234';
const claims={uid,email_verified:true,auth_time:secs,
  firebase:{sign_in_provider:'google.com'}};
assert.deepEqual(allowedFounderUids(),[]); // no automatic Founder enrollment
assert.deepEqual(allowedFounderUids(''),[]);
assert.deepEqual(allowedFounderUids('*,SomeoneElse'),[]);
assert.deepEqual(allowedFounderUids(uid),[uid]);
assert.deepEqual(allowedFounderUids(uid+','+uid),[uid]);
assert.equal(founderTokenAllowed(claims,[uid],secs),true);
assert.equal(founderTokenAllowed({...claims,uid:'AnotherUserUID'},[uid],secs),false);
assert.equal(founderTokenAllowed({...claims,email_verified:false},[uid],secs),false);
assert.equal(founderTokenAllowed({...claims,firebase:{sign_in_provider:'password'}},[uid],secs),false);
assert.equal(founderTokenAllowed({...claims,firebase:{sign_in_provider:'anonymous'}},[uid],secs),false);
assert.equal(founderTokenAllowed({...claims,auth_time:secs-MAX_AGE_SECONDS-1},[uid],secs),false);
assert.equal(founderTokenAllowed({...claims,auth_time:secs+5},[uid],secs),false);
assert.equal(founderTokenAllowed(claims,[],secs),false);
const token='b'.repeat(85);
function mockDb(){
  const chain=()=>({count:()=>({get:async()=>({data:()=>({count:2})})}),
    where:()=>chain()});
  return {collection:()=>chain()};
}
function mockRes(){
  return {code:200,headers:{},body:null,
    set(k,v){this.headers[k.toLowerCase()]=v;return this;},
    status(n){this.code=n;return this;},
    json(body){this.body=body;return this;}};
}
function make({allow=[uid],assertion=claims,broken=false}={}){
  let handler,verifyCalls=0;
  const app={post:(route,fn)=>{assert.equal(route,'/founder/overview/read');handler=fn;}};
  mountFounderReadonly(app,{
    readUids:()=>allow,
    verifyToken:async()=>{verifyCalls++;if(broken)throw Error('revoked');return assertion;},
    dbReady:()=>true,db:mockDb,clock:()=>fixed
  });
  return {verifyCalls:()=>verifyCalls,run:async(headers={authorization:'Bearer '+token},body={})=>{
    const response=mockRes();await handler({headers,body},response);return response;}};
}
(async()=>{
  let x=make(),r=await x.run();
  assert.equal(r.code,200);assert.equal(r.body.counts.activeTravelRecords,2);
  assert.equal(r.body.counts.registeredAccountProfiles,2);
  assert.equal(r.headers['cache-control'],'private, no-store, max-age=0');
  assert.equal(r.headers['vary'],'Origin, Authorization');
  assert.equal(r.body.uid,undefined);assert.equal(r.body.email,undefined);
  assert.equal((await make({allow:[]}).run()).code,503);
  assert.equal((await make({assertion:{...claims,uid:'DifferentPerson'}}).run()).code,403);
  assert.equal((await make({assertion:{...claims,firebase:{sign_in_provider:'password'}}}).run()).code,403);
  assert.equal((await make({broken:true}).run()).code,401);
  assert.equal((await make().run({authorization:'Bearer invalid'})).code,401);
  assert.equal((await make().run({})).code,401);
  assert.equal((await make({assertion:{...claims,auth_time:secs-86400}}).run()).code,403);
  const limited=make();for(let i=0;i<15;i++)assert.equal((await limited.run()).code,200);
  assert.equal((await limited.run()).code,429);
  const frontend=fs.readFileSync(require('node:path').join(__dirname,'../scripts/corporate-founder-overview.cjs'),'utf8');
  const server=fs.readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');
  const builder=fs.readFileSync(require('node:path').join(__dirname,'../scripts/build-corporate-website.cjs'),'utf8');
  assert.match(frontend,/Continue with Google/);
  assert.match(frontend,/browserSessionPersistence/);
  assert.match(frontend,/fetch\(endpoint,/);
  assert.match(frontend,/credentials:'omit'/);
  assert.doesNotMatch(frontend,/OPS_USERS|OPS_MFA_SECRETS|OPS_SESSION_SECRET|AR_FOUNDER_FIREBASE_UIDS/);
  assert.match(server,/mountFounderReadonly\(app\)/);
  assert.match(builder,/out\("founder",render/);
  assert.match(builder,/noindex,nofollow/);
  assert.match(server,/mountOps\(app, express/);
  console.log('PASS Founder read-only Firebase Google login: signed/revoked verification, UID allowlist, fail-closed, secure caching, throttling, and no Operations privilege escalation');
})().catch(e=>{console.error(e);process.exitCode=1;});
