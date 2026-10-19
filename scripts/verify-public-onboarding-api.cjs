'use strict';
const fs=require('node:fs');
const path=require('node:path');
const URL='https://american-rider-api-production-623854974930.us-east1.run.app';
function sourceCheck(root=path.join(__dirname,'..')){
  const e=JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
  const p=e.build?.['prelaunch-onboarding'];
  if(p?.distribution!=='internal'||p.env?.EXPO_PUBLIC_API_URL!==URL)
    throw Error('Internal onboarding candidate not bound to real Google production API');
  if(e.build?.production?.env?.EXPO_PUBLIC_API_URL===URL)
    throw Error('Production app store profile must not be silently switched before live-money cutover');
}
function responseCheck(l,h,c){
  if(l?.ok!==true||h?.deployment!=='production'||h?.support?.firestore!=='on'
      ||!Number.isInteger(h?.fleet?.operators))throw Error('Public production Firebase backend not verified');
  if(h?.stripe!=='no-key'||c?.mode!=='no-key'||c?.canTakePayment!==false)
    throw Error('Internal onboarding builds require all money to be DISABLED');
}
async function get(base,part){
  const r=await fetch(base+part,{headers:{accept:'application/json'},redirect:'error',
    signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Public Google API failed '+part+' HTTP '+r.status);
  return r.json();
}
async function main(){
  sourceCheck();
  const [l,h,c]=await Promise.all(['/live','/health','/config'].map(p=>get(URL,p)));
  responseCheck(l,h,c);
  console.log('Verified real public Google API: registration builds only, Stripe money OFF.');
}
if(require.main===module)main().catch(e=>{console.error('BLOCK:',String(e.message).slice(0,280));process.exitCode=1;});
module.exports={sourceCheck,responseCheck,URL};
