'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const M = require('./chatgpt-mcp');
const secret='more-than-thirty-two-characters-ops-session-secret-123';
const prev=process.env.OPS_SESSION_SECRET;
process.env.OPS_SESSION_SECRET=secret;
assert.deepEqual(M.validScope('market:read market:pause'),['market:read','market:pause']);
assert.equal(M.validScope('market:activate market:activate'),null);
assert.equal(M.validScope('market:read unknown'),null);
assert.equal(M.validScope(''),null);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const t=Date.now();
const pending={client_id:'https://chatgpt.com/oauth/client.json',
  redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',resource:M.RESOURCE,
  scope:'market:read market:plan market:activate market:pause',
  challenge:'b'.repeat(43),state:'state-12345',nonce:'nonce-12345',expires:t+60_000};
const signed=M.signPending(pending);
assert.deepEqual(M.pendingFrom({headers:{cookie:'ar_mcp_pending='+signed}}),pending);
assert.equal(M.pendingFrom({headers:{cookie:'ar_mcp_pending='+signed+'x'}}),null);
assert.equal(M.pendingFrom({headers:{cookie:'ar_mcp_pending='+M.signPending({...pending,expires:t-1})}}),null);
assert.equal(M.pendingFrom({headers:{cookie:'ar_mcp_pending='+M.signPending({...pending,redirect_uri:'https://attacker.example'})}}),null);
const routes=new Map(), data=new Map(), changes=[];
const doc=(collection,id)=>{
 const key=collection+'/'+id;
 return { key,async get(){return {exists:data.has(key),data:()=>data.get(key)};},
   async create(value){assert.ok(!data.has(key),key);data.set(key,value);},
   async set(value,opt){data.set(key,opt?.merge?{...data.get(key),...value}:value);},
 };
};
const db={
 collection(name){return {doc(id){return doc(name,id);}};},
 async runTransaction(fn){
  const pending=[];
  const tx={
   get:ref=>ref.get(),
   set:(ref,value,opt)=>pending.push(()=>data.set(ref.key,opt?.merge?{...data.get(ref.key),...value}:value)),
   create:(ref,value)=>pending.push(()=>{assert.ok(!data.has(ref.key));data.set(ref.key,value);}),
  };
  const result=await fn(tx);pending.forEach(f=>f());return result;
 }
};
const mockApp={
 get(path,handler){routes.set('GET '+path,handler);},
 post(path,...handlers){routes.set('POST '+path,handlers.at(-1));},
};
const express={urlencoded:()=>()=>{}};
let online=true, actor='founder', production=true;
const market={id:'fl-miami-dade',regionId:'fl-southeast',status:'active',geographicallyAvailable:true},region={id:'fl-southeast'};
const deps={
 db:()=>db,opsSignedIn:()=>actor,authMode:()=>online?'named':'off',
 actorFingerprint:(identity)=>identity==='founder' && online?'fingerprint123':null,isProduction:()=>production,
 markets:()=>[market], regions:[region], productionReadiness:()=>({missing:['screening_provider']}),
 inspectMarket:async()=>({status:'waitlist',readyToActivate:false,missing:[{id:'screening_agreement',reference:'secret-must-not-appear'}]}),
 manifestFor:()=>({version:'v1'}),
 proposeMarket:async({input})=>{changes.push('plan');return {ok:true,planId:input.stateCode,status:'proposed'};},
 activateRegion:async opts=>{changes.push('activate');assert.equal(opts.auditMethod,'oauth_delegated_mfa');assert.deepEqual(opts.providerMissing,['screening_provider']);return {ok:false,code:'region_not_ready',missing:[{id:'screening_agreement'}]};},
 pauseMarket:async opts=>{changes.push('pause');assert.equal(opts.auditMethod,'oauth_delegated_mfa');return {ok:true,status:'paused'};},
 deactivateMarketFleet:async()=>({ok:true,done:true}),
 invalidatePublicMarkets:()=>changes.push('invalidated'),
};
M.mount(mockApp,express,deps);
function request(method,path,{body={},query={},headers={}}={}){
 let outcome={status:200,headers:{},body:null,redirect:null};
 const res={
  status(v){outcome.status=v;return this;},
  set(k,v){outcome.headers[k]=v;return this;},
  setHeader(k,v){outcome.headers[k]=v;return this;},
  type(v){outcome.type=v;return this;},
  json(v){outcome.body=v;return outcome;},
  send(v){outcome.body=v;return outcome;},
  end(){return outcome;},
  redirect(a,b){outcome.redirect=b||a;return outcome;},
 };
 const req={query,body,headers,get(k){return headers[k.toLowerCase()]}};
 const fn=routes.get(method+' '+path);
 assert.ok(fn,'route '+method+' '+path);
 return {req,res,outcome,run:async()=>{await fn(req,res);return outcome}};
}
(async()=>{
 const metadata=await request('GET','/.well-known/oauth-authorization-server').run();
 assert.ok(metadata.body.code_challenge_methods_supported.includes('S256'));
 const tools=await request('POST','/mcp',{body:{jsonrpc:'2.0',id:1,method:'tools/list'}}).run();
 assert.equal(tools.body.result.tools.length,4);
 const unauthorized=await request('POST','/mcp',{body:{id:1,method:'tools/call',params:{name:'open_region',arguments:{regionId:'fl-southeast',confirmation:'OPEN fl-southeast'}}}}).run();
 assert.equal(unauthorized.status,200);
 assert.equal(unauthorized.body.result.isError,true);
 assert.ok(unauthorized.body.result._meta['mcp/www_authenticate'][0].includes('resource_metadata'));
 const bad=await request('GET','/ar/oauth/authorize',{query:{client_id:M.BASE,redirect_uri:M.BASE}}).run();
 assert.equal(bad.status,400);
 const verifier='v'.repeat(52);
 const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 const q={response_type:'code',client_id:pending.client_id,redirect_uri:pending.redirect_uri,
  resource:M.RESOURCE,code_challenge:challenge,code_challenge_method:'S256',
  scope:pending.scope,state:'state-12345'};
 let author=await request('GET','/ar/oauth/authorize',{query:q}).run();
 assert.equal(author.redirect,'/ar/oauth/consent');
 const cookie=author.headers['Set-Cookie'].split(';')[0];
 actor=null;
 const login=await request('GET','/ar/oauth/consent',{headers:{cookie}}).run();
 assert.equal(login.redirect,'/ops');
 actor='founder';
 const consent=await request('GET','/ar/oauth/consent',{headers:{cookie}}).run();
 assert.ok(consent.body.includes('Authorize connection'));
 const p=M.pendingFrom({headers:{cookie}});
 const form=await request('POST','/ar/oauth/consent',{
  body:{nonce:p.nonce,approve:'yes'},headers:{cookie,origin:M.BASE}
 }).run();
 assert.ok(form.redirect.startsWith(pending.redirect_uri+'?code='));
 const redirect=new URL(form.redirect),code=redirect.searchParams.get('code');
 assert.equal(data.get('ar_mcp_oauth_codes/'+hash(code)).actor,'founder');
 assert.equal(redirect.searchParams.get('iss'),M.BASE);
 const exchange=()=>request('POST','/ar/oauth/token',{body:{
  grant_type:'authorization_code',client_id:pending.client_id,redirect_uri:pending.redirect_uri,
  resource:M.RESOURCE,code,code_verifier:verifier,
 }}).run();
 const tokens=await exchange();
 assert.equal(tokens.status,200);
 assert.ok(tokens.body.access_token);
 assert.ok(tokens.body.refresh_token);
 assert.equal((await exchange()).status,400,'code must not replay');
 const bearer={authorization:'Bearer '+tokens.body.access_token};
 const list=await request('POST','/mcp',{body:{id:2,method:'tools/call',params:{name:'market_status',arguments:{}}},headers:bearer}).run();
 assert.equal(list.body.result.content[0].type,'text');
 const got=JSON.parse(list.body.result.content[0].text);
 assert.equal(got.markets[0].status,'active');
 assert.equal(got.markets[0].geographicallyAvailable,true);
 assert.equal(JSON.stringify(got).includes('secret-must-not-appear'),false);
 const reject=await request('POST','/mcp',{body:{id:3,method:'tools/call',params:{name:'open_region',arguments:{regionId:'fl-southeast',confirmation:'OPEN NO'}}},headers:bearer}).run();
 assert.equal(JSON.parse(reject.body.result.content[0].text).code,'already_active');
 assert.equal(changes.includes('activate'),false);
 const activated=await request('POST','/mcp',{body:{id:4,method:'tools/call',params:{name:'open_region',arguments:{regionId:'fl-southeast',confirmation:'OPEN fl-southeast'}}},headers:bearer}).run();
 assert.equal(JSON.parse(activated.body.result.content[0].text).code,'already_active');
 assert.equal(changes.includes('activate'),false);
 const paused=await request('POST','/mcp',{body:{id:5,method:'tools/call',params:{name:'pause_market',arguments:{marketId:market.id,reason:'Safety hold',confirmation:'PAUSE '+market.id}}},headers:bearer}).run();
 assert.equal(JSON.parse(paused.body.result.content[0].text).code,'configuration_change_required');
 assert.equal(changes.includes('pause'),false);
 const renewal=await request('POST','/ar/oauth/token',{body:{
  grant_type:'refresh_token',client_id:pending.client_id,resource:M.RESOURCE,
  refresh_token:tokens.body.refresh_token
 }}).run();
 assert.equal(renewal.status,200);
 const again=await request('POST','/ar/oauth/token',{body:{
  grant_type:'refresh_token',client_id:pending.client_id,resource:M.RESOURCE,
  refresh_token:tokens.body.refresh_token
 }}).run();
 assert.equal(again.status,400,'refresh token must rotate');
 const disconnect=await request('POST','/ar/oauth/disconnect',{headers:{origin:M.BASE}}).run();
 assert.equal(disconnect.status,200);
 assert.ok(disconnect.body.includes('disconnected'));
 const noAccess=await request('POST','/mcp',{body:{id:8,method:'tools/call',
  params:{name:'market_status',arguments:{}}},headers:bearer}).run();
 assert.equal(noAccess.body.result.isError,true,'disconnect must immediately revoke active access tokens');
 const noRefresh=await request('POST','/ar/oauth/token',{body:{
  grant_type:'refresh_token',client_id:pending.client_id,resource:M.RESOURCE,
  refresh_token:renewal.body.refresh_token
 }}).run();
 assert.equal(noRefresh.status,400,'disconnect must revoke active refresh tokens');
 online=false;
 const revoked=await request('POST','/mcp',{body:{id:6,method:'tools/call',params:{name:'market_status'}},headers:bearer}).run();
 assert.equal(revoked.body.result.isError,true,'disabled or rotated account must not authorize');
 assert.ok(revoked.body.result._meta['mcp/www_authenticate']);
 console.log('PASS founder OAuth: PKCE, signed consent, scope, replay/revocation, geographic service reporting');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ if(prev===undefined) delete process.env.OPS_SESSION_SECRET; else process.env.OPS_SESSION_SECRET=prev; });
