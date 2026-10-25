'use strict';
// No private data is embedded in this corporate static page.
// Data appears only after Google/Firebase login and an independently
// authorized, revocation-checked, read-only response from the live API.
const markup=String.raw`<section class="page-hero shell" style="padding-bottom:42px">
  <p class="section-label">PRIVATE COMPANY INFORMATION</p>
  <h1>Founder overview.</h1>
  <p>Current American Rider operating figures, available to the authorized Founder.</p>
</section>
<div class="shell" style="max-width:960px;padding-bottom:100px">
  <section class="inset" id="sign-in-panel" aria-label="Private Founder sign-in">
    <h2>Private access</h2>
    <p>Sign in with your authorized Google account. No Operations password or authenticator code is required for this read-only overview.</p>
    <button type="button" class="action primary" id="founder-google">Continue with Google</button>
    <p role="status" aria-live="polite" id="founder-message">Access requires an approved Founder account.</p>
    <p id="founder-identity" hidden style="font-size:13px;overflow-wrap:anywhere">Account reference: <code id="founder-account-id"></code> <button id="founder-copy" type="button" class="action secondary" style="margin:10px 0">Copy reference</button></p>
  </section>
  <section id="founder-workspace" hidden aria-label="Company operating figures">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:18px;margin:18px 0">
      <div><h2 style="margin-bottom:6px">Platform overview</h2><p id="founder-asof" style="margin:0">Read-only · On demand</p></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px"><button type="button" class="action secondary" id="founder-refresh">Refresh</button><button type="button" class="action secondary" id="founder-signout">Sign out</button></div>
    </div>
    <div id="founder-metrics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:12px" aria-live="polite"></div>
    <p id="founder-explanation" style="margin-top:26px">Registered accounts may overlap with Operators. Available does not mean qualified. Completed does not mean paid.</p>
    <p>For sensitive administrative decisions, use the separate protected Operations console.</p>
  </section>
</div>
<script type="module">
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {getAuth,browserSessionPersistence,setPersistence,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
const cfg={apiKey:'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',authDomain:'american-rider-35688.firebaseapp.com',projectId:'american-rider-35688',appId:'1:623854974930:web:d73e4dec7949c3756efa0b'};
const auth=getAuth(getApps().length?getApp():initializeApp(cfg));
const endpoint='https://american-rider-api-production-623854974930.us-east1.run.app/founder/overview/read';
const by=(id)=>document.getElementById(id);
const fields=[
 ['registeredAccountProfiles','Registered accounts'],['operatorProfiles','Operator profiles'],
 ['operatorsStartedOnboardingToday','Operator onboarding started today'],['operatorsQualifiedToday','Operators qualifying today'],
 ['operatorsReportingAvailable','Operators reporting available'],['activeTravelRecords','Travels in progress'],
 ['completedTravelRecords','Completed Travels, all time'],['travelsCreatedToday','Travels created today'],
 ['travelsSettledToday','Travels settled today'],['recruiterAccounts','Recruiter accounts']
];
let busy=false;
function message(t){by('founder-message').textContent=t;}
function showLogin(text,showReference=false){
 by('founder-identity').hidden=!(showReference&&auth.currentUser);
 if(showReference&&auth.currentUser)by('founder-account-id').textContent=auth.currentUser.uid;
 by('founder-signout').disabled=false;
 by('founder-workspace').hidden=true;
 by('sign-in-panel').hidden=false;
 message(text||'Sign in with the authorized Google account.');
}
function renderOverview(data){
 const cards=by('founder-metrics');cards.replaceChildren();
 for(const pair of fields){
  const key=pair[0],title=pair[1],value=data.counts&&data.counts[key];
  const card=document.createElement('div');card.className='inset';card.style.padding='19px';card.style.minWidth='0';
  const label=document.createElement('p');label.textContent=title;label.style.fontSize='13px';label.style.margin='0 0 12px';
  const number=document.createElement('strong');number.textContent=Number.isSafeInteger(value)?String(value):'Unavailable';
  number.style.fontSize='30px';number.style.fontVariantNumeric='tabular-nums';
  card.append(label,number);cards.append(card);
 }
 const date=data.day||'date unavailable';
 const time=Number.isFinite(data.asOf)?new Date(data.asOf).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):'time unavailable';
 by('founder-asof').textContent='Eastern · '+date+' · '+time+' · Current indexed records';
 by('founder-workspace').hidden=false;
 by('sign-in-panel').hidden=true;
}
async function load(){
 if(busy||!auth.currentUser)return;
 busy=true;by('founder-refresh').disabled=true;
 try{
  const token=await auth.currentUser.getIdToken();
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
   if(response.status===403){
     showLogin('This Google account has not been authorized for Founder access. Its account reference is shown below for one-time verification.',true);
   }else if(payload.code==='founder_account_not_configured'){
     showLogin('Founder sign-in is awaiting production authorization. Your Google account reference is '+auth.currentUser.uid+'. No operating data has been disclosed.');
   }else if(response.status===401){
     showLogin('Please sign in again to confirm your identity.');
   }else if(response.status===429){
     message('Please refresh later.');by('founder-workspace').hidden=false;by('sign-in-panel').hidden=true;
   }else{
     showLogin('Overview access is awaiting deployment or is temporarily unavailable. Account reference: '+auth.currentUser.uid+'. No zero counts are assumed.');
   }
  }else renderOverview(payload);
 }catch{
  showLogin('The live overview is temporarily unavailable. No figures have been assumed.');
 }finally{busy=false;by('founder-refresh').disabled=false;}
}
by('founder-google').addEventListener('click',async()=>{
 by('founder-google').disabled=true;message('Opening your Google account…');
 try{
   const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
   await signInWithPopup(auth,provider);await load();
 }catch{
   message('Google sign-in was not completed. Please retry using the Google account authorized for American Rider.');
 }finally{by('founder-google').disabled=false;}
});
by('founder-copy').addEventListener('click',()=>{
 const uid=by('founder-account-id').textContent;
 if(uid&&navigator.clipboard?.writeText)navigator.clipboard.writeText(uid).catch(()=>{});
});
by('founder-refresh').addEventListener('click',load);
by('founder-signout').addEventListener('click',async()=>{await signOut(auth);showLogin('Signed out.');});
setPersistence(auth,browserSessionPersistence).then(()=>{
 onAuthStateChanged(auth,async user=>{if(user)await load();else showLogin('Sign in with your authorized Google account.');});
}).catch(()=>showLogin('Secure sign-in is temporarily unavailable.'));
</script>`;
module.exports={founderHtml:()=>markup};
