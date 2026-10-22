'use strict';
// Provider-boundary acceptance: a Stripe/Firestore outage must never become
// "no payout account" on the handset or create a second Connect setup.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('backend/server.js');
const client=read('src/backend/connect.ts');
const screen=read('app/operator/payouts.tsx');
const block=server.split("app.get('/connect/status'")[1]?.split('// POST /connect/dashboard')[0]||'';
assert(block,'Connect status endpoint must exist');
assert.match(block,/if \(keyMode === 'no-key'\) return res\.status\(503\)/,
  'Missing Stripe credentials must be service unavailable, not empty account');
assert.match(block,/if \(!db\) return res\.status\(503\)/,
  'Missing database must be service unavailable, not empty account');
assert.match(block,/if \(status\?\.error\) return res\.status\(502\)/,
  'Provider exception object must never masquerade as no-account 200');
assert.match(block,/res\.json\(\{\.\.\.status,feeConsentAccepted/,
  'Healthy response retains actual account state and fee consent');

const start=client.indexOf('export async function readConnectStatus');
const end=client.indexOf('/** Existing conservative eligibility helper',start);
assert(start>=0&&end>start,'Client requires distinct unavailable/empty read');
const original=client.slice(start,end);
assert.match(original,/Promise\.race/,'Connect lookup must have a total deadline');
assert.match(original,/controller\.abort\(\)/,'Deadline must cancel in-flight HTTP');
assert.match(client,/return \(await readConnectStatus\(\)\) \?\? NONE/,
  'Legacy qualification consumers remain conservatively blocked');
const snippet=original.replace('export async function','async function').replace('12_000','10')+
  '\nmodule.exports={readConnectStatus};';
const js=ts.transpileModule(snippet,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
}}).outputText;
const make=(fetch)=>(()=>{
  const module={exports:{}};
  vm.runInNewContext(js,{
    module,fetch,authHeaders:async()=>({'Content-Type':'application/json'}),
    PAYMENT_SERVER_URL:'https://example.invalid',AbortController,setTimeout,clearTimeout,Promise,
  },{timeout:1500});
  return module.exports.readConnectStatus;
})();
const asResponse=(body,status=200)=>({ok:status>=200&&status<300,
  json:async()=>body});
(async()=>{
  let checked=0;
  for(const [label,impl,expected] of [
    ['new account (genuine)',async()=>asResponse({exists:false,payoutsEnabled:false,
      chargesEnabled:false,feeConsentAccepted:false,due:[]}),false],
    ['verified account',async()=>asResponse({exists:true,payoutsEnabled:true,
      chargesEnabled:true,feeConsentAccepted:true,due:[]}),true],
  ]){
    const state=await make(impl)();
    assert(state && state.exists===expected,label);
    checked++;
  }
  for(const [label,fetch] of [
    ['Stripe 502',async()=>asResponse({code:'provider_unavailable'},502)],
    ['Firestore 503',async()=>asResponse({code:'no_admin_db'},503)],
    ['provider-reported error on HTTP 200',async()=>asResponse({
      exists:false,payoutsEnabled:false,error:'Stripe unavailable'})],
    ['legacy database reason on HTTP 200',async()=>asResponse({
      exists:false,payoutsEnabled:false,reason:'not connected'})],
    ['invalid body',async()=>asResponse({})],
    ['offline',async()=>{throw Error('network lost');}],
    ['nonterminating provider',async()=>new Promise(()=>{})],
  ]){
    const state=await make(fetch)();
    assert.equal(state,null,label+' must not render false empty account');
    checked++;
  }
  assert.match(screen,/readConnectStatus\(\)/);
  assert.match(screen,/setStatusUnavailable\(true\)/);
  assert.match(screen,/statusUnavailable \? \(/);
  assert.match(screen,/payoutStatusUnavailable/);
  assert.match(screen,/!payable && !statusUnavailable && status !== null/,
    'No payout setup until real account state can be read');
  assert.match(screen,/started && !payable && !statusUnavailable/,
    'Manual recheck must only show when actual account is known');
  assert.match(screen,/refreshingRef\.current/,
    'Focus, foreground and Stripe return must deduplicate status reads');
  assert.doesNotMatch(screen,/useEffect\(\(\) => \{\s*refresh\(\);/,
    'Redundant initial status read must not multiply provider calls');
  for(const locale of ['en','es','fr','it','de']){
    const text=read('src/i18n/'+locale+'.ts');
    for(const key of ['payoutStatusUnavailable','payoutStatusStillPending'])
      assert(text.includes(key+':'),locale+' missing status response '+key);
  }
  console.log('PASS payout provider contract: '+checked+' synthetic healthy/outage scenarios, clear retry and no duplicate Connect onboarding.');
})().catch(e=>{console.error(e);process.exitCode=1;});
