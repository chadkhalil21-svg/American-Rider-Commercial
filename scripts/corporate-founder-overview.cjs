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
    <button type="button" class="action secondary" id="founder-google-alternate" hidden style="margin-left:10px">Alternate Google sign-in</button>
    <p role="status" aria-live="polite" id="founder-message">Access requires an approved Founder account.</p>
    <div id="founder-signed-actions" hidden>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px">
        <button type="button" class="action secondary" id="founder-retry">Retry overview</button>
        <button type="button" class="action secondary" id="founder-login-signout">Use a different Google account</button>
      </div>
    </div>
    <p style="font-size:13px">Use this page directly in Safari or Chrome. If Google opens a technical Firebase error page, close that tab and return here to use the alternate method.</p>
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
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script type="module">
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth,browserSessionPersistence,setPersistence,GoogleAuthProvider,signInWithCredential,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const cfg={apiKey:'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',authDomain:'american-rider-35688.firebaseapp.com',projectId:'american-rider-35688',appId:'1:623854974930:web:d73e4dec7949c3756efa0b'};
const auth=getAuth(getApps().length?getApp():initializeApp(cfg));
// First-party Google Identity Services token flow avoids the Firebase hosted
// popup/redirect helper whose cross-domain session state fails on some iPads.
// The server still independently verifies the resulting Firebase ID token,
// provider, verified email, recent sign-in, and exact Founder UID allowlist.
const GOOGLE_WEB_CLIENT_ID='623854974930-4t4u62mvkeopvlrm6ne15eq6rubn25r9.apps.googleusercontent.com';
let directGoogleClient=null;
function showAlternate(reason){
  by('founder-google-alternate').hidden=false;
  message(reason);
}
function googleOAuthClient(){
  const sdk=window.google?.accounts?.oauth2;
  if(!sdk?.initTokenClient)return null;
  if(!directGoogleClient){
    directGoogleClient=sdk.initTokenClient({
      client_id:GOOGLE_WEB_CLIENT_ID,
      scope:'openid email profile',
      include_granted_scopes:false,
      callback:async result=>{
        if(!result?.access_token){
          showAlternate('Google could not complete account selection. Try Alternate Google sign-in.');
          return;
        }
        try{
          message('Verifying your Google identity with Firebase…');
          await signInWithCredential(auth,GoogleAuthProvider.credential(null,result.access_token));
          await load();
        }catch(error){
          showAlternate(googleSignInError(error)+' Try Alternate Google sign-in if needed.');
        }
      },
      error_callback:()=>{
        showAlternate('Google account selection was interrupted. Retry Continue with Google, or choose Alternate Google sign-in.');
      }
    });
  }
  return directGoogleClient;
}
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
function googleSignInError(error){
 const code=String(error?.code||'');
 if(code==='auth/popup-blocked'||code==='auth/operation-not-supported-in-this-environment')return 'Your browser blocked the Google sign-in window. Open americanrider.tech/founder/ directly in Safari or Chrome and try again.';
 if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request')return 'Google sign-in did not finish. If the window closed on its own, open this page directly in Safari or Chrome and retry.';
 if(code==='auth/unauthorized-domain')return 'This website domain is not authorized for Google sign-in. Founder access needs a configuration correction; retrying cannot resolve it.';
 if(code==='auth/operation-not-allowed')return 'Google sign-in has not been enabled for this project. Founder access needs a configuration correction.';
 if(code==='auth/network-request-failed')return 'The Google sign-in network request failed. Check your connection and retry.';
 if(code==='auth/invalid-credential'||code==='auth/invalid-idp-response')return 'Google could not exchange its identity credential. Use Alternate Google sign-in.';
 return 'Google sign-in could not complete (' +( /^auth\/[a-z0-9-]+$/.test(code)?code:'unknown error')+'). Open this page directly in Safari or Chrome if you are using an in-app browser.';
}
function showLogin(text,showReference=false){
 const signedIn=!!auth.currentUser;
 // This status MUST remain visible after a successful Google login.
 // Missing Cloud Run deployment or one-time UID approval is NOT a login failure.
 by('founder-identity').hidden=!signedIn;
 by('founder-signed-actions').hidden=!signedIn;
 by('founder-google').hidden=signedIn;
 if(signedIn)by('founder-google-alternate').hidden=true;
 // The shared .action CSS sets display:inline-flex, so also set display
 // explicitly: an author rule must not override the HTML hidden attribute.
 by('founder-google').style.display=signedIn?'none':'';
 if(signedIn)by('founder-account-id').textContent=auth.currentUser.uid;
 by('founder-signout').disabled=false;
 by('founder-workspace').hidden=true;
 by('sign-in-panel').hidden=false;
 message(text||(signedIn?'Google sign-in succeeded. Checking Founder authorization…':'Sign in with your authorized Google account.'));
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
     showLogin('Google sign-in succeeded. This account is awaiting Founder authorization. Copy the account reference below for one-time secure approval.',true);
   }else if(payload.code==='founder_account_not_configured'){
     showLogin('Google sign-in succeeded, but production Founder authorization has not been configured. Copy your account reference below. No operating data has been disclosed.',true);
   }else if(response.status===401){
     showLogin('Google signed in, but your secure session needs renewing. Select Use a different Google account, then sign in again.',true);
   }else if(response.status===429){
     showLogin('Google sign-in succeeded, but the read-only overview is rate-limited. Try again later.',true);
   }else{
     showLogin('Google sign-in succeeded. The private overview API may be awaiting deployment or temporarily unavailable (HTTP '+response.status+'). Your account reference is below; no counts have been assumed.',true);
   }
  }else renderOverview(payload);
 }catch{
  showLogin('Google sign-in succeeded, but the live overview could not be reached. Your account reference is below. No figures have been assumed.',true);
 }finally{busy=false;by('founder-refresh').disabled=false;}
}
by('founder-google').addEventListener('click',()=>{
 const client=googleOAuthClient();
 if(!client){
   showAlternate('Google direct sign-in is not yet available in this browser. Choose Alternate Google sign-in.');
   return;
 }
 message('Opening Google account selection…');
 try{
   // This invocation is synchronous with the button gesture so Safari can
   // authorize the Google chooser; no Firebase redirect/session state.
   client.requestAccessToken({prompt:'select_account'});
 }catch(error){
   showAlternate('Google could not open account selection. Choose Alternate Google sign-in.');
 }
});
by('founder-google-alternate').addEventListener('click',async()=>{
 by('founder-google-alternate').disabled=true;
 message('Opening alternative Google sign-in…');
 try{
   const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
   await signInWithPopup(auth,provider);
   await load();
 }catch(error){
   showAlternate(googleSignInError(error));
 }finally{by('founder-google-alternate').disabled=false;}
});
by('founder-copy').addEventListener('click',()=>{
 const uid=by('founder-account-id').textContent;
 if(uid&&navigator.clipboard?.writeText)navigator.clipboard.writeText(uid).catch(()=>{});
});
by('founder-refresh').addEventListener('click',load);
by('founder-retry').addEventListener('click',load);
by('founder-login-signout').addEventListener('click',async()=>{await signOut(auth);showLogin('Choose your authorized Google account.');});
by('founder-signout').addEventListener('click',async()=>{await signOut(auth);showLogin('Signed out.');});
setPersistence(auth,browserSessionPersistence).then(()=>{
 onAuthStateChanged(auth,async user=>{
   if(user){showLogin('Google sign-in succeeded. Checking read-only access…',true);await load();}
   else showLogin('Sign in with your authorized Google account.');
 });
}).catch(()=>showLogin('Secure sign-in is temporarily unavailable.'));
</script>`;
module.exports={founderHtml:()=>markup};
