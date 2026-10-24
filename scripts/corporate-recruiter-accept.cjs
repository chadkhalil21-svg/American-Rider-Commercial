'use strict';
// Website-only invitation acceptance, designed for first-time recruiters.
// Firebase credentials never pass through American Rider's web server.
// The long invitation token is held in page memory, never persisted in storage.
const markup=String.raw`<section class="page-hero shell"><p class="section-label">PRIVATE INVITATION</p><h1>Your invitation.</h1><p>A personal invitation to explore an independent professional relationship with American Rider.</p></section>
<div class="shell" style="max-width:760px;padding-bottom:90px">
 <section class="page-section">
  <h2>Verify your account</h2>
  <p>Invitations expire after 48 hours and are valid only for the addressed, verified email account. Acceptance does not authorize compensated recruitment.</p>
  <div id="signin">
   <form id="signin-form">
    <label for="email" style="display:block;margin-bottom:8px">Email address</label>
    <input type="email" autocomplete="username" id="email" required maxlength="254" style="display:block;padding:14px;width:100%;max-width:480px;border:1px solid #c7c7c3;border-radius:9px;margin-bottom:18px">
    <label for="password" style="display:block;margin-bottom:8px">Password</label>
    <input type="password" autocomplete="current-password" id="password" required minlength="8" style="display:block;padding:14px;width:100%;max-width:480px;border:1px solid #c7c7c3;border-radius:9px;margin-bottom:18px">
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button type="submit" class="action primary">Sign in</button>
      <button type="button" id="create-account" class="action secondary">Create account</button>
    </div>
   </form>
   <p><button type="button" class="action secondary" id="google">Continue with Google</button> <button type="button" class="action secondary" id="apple">Continue with Apple</button></p>
  </div>
  <div id="accept-panel" hidden>
   <p id="account"></p>
   <div id="verification-actions" hidden>
     <p>A verified email address is required. If you just created an account, check your inbox.</p>
     <button type="button" class="action secondary" id="resend-verification">Send verification email</button>
     <button type="button" class="action secondary" id="reload-verification">I verified my email</button>
   </div>
   <div id="approved-actions" hidden>
     <p>Acceptance confirms your invitation, not payment eligibility. Identity verification, agreements and bank setup are separate steps.</p>
     <button type="button" id="accept" class="action primary">Accept invitation</button>
   </div>
   <button type="button" id="sign-out" class="action secondary">Sign out</button>
  </div>
  <p id="status" aria-live="polite" role="status"></p>
  <p>For assistance, contact <a href="mailto:relations@americanrider.tech">relations@americanrider.tech</a>.</p>
 </section>
</div>
<script type="module">
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {getAuth,browserSessionPersistence,setPersistence,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,reload,signInWithPopup,GoogleAuthProvider,OAuthProvider,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
const token=new URL(location.href).searchParams.get('token');
history.replaceState(null,'',location.pathname);
const validToken=typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
const cfg={apiKey:'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',authDomain:'american-rider-35688.firebaseapp.com',projectId:'american-rider-35688',appId:'1:623854974930:web:d73e4dec7949c3756efa0b'};
const auth=getAuth(initializeApp(cfg));
const base='https://american-rider-api-production-623854974930.us-east1.run.app';
const by=id=>document.getElementById(id);
const status=s=>by('status').textContent=s;
function update(person){
 by('signin').hidden=!!person;
 by('accept-panel').hidden=!person;
 by('verification-actions').hidden=!person||!!person.emailVerified;
 by('approved-actions').hidden=!person||!person.emailVerified||!validToken;
 if(!validToken)status('This invitation is incomplete. Request a new invitation from Recruitment Relations.');
 else if(person&&!person.emailVerified)status('Please verify your email address before accepting this invitation.');
 else if(person)status('Review the invitation and select Accept invitation.');
 if(person)by('account').textContent='Signed in as '+(person.email||'your verified account');
}
async function login(fn){
 status('Verifying your account…');
 try{await setPersistence(auth,browserSessionPersistence);await fn();}
 catch{status('This account action could not be completed. Confirm your email address and credentials, or contact Recruitment Relations.');}
 finally{by('password').value='';}
}
by('signin-form').addEventListener('submit',e=>{
 e.preventDefault();void login(()=>signInWithEmailAndPassword(auth,by('email').value.trim(),by('password').value));
});
by('create-account').addEventListener('click',()=>{
 if(!by('signin-form').reportValidity())return;
 void login(async()=>{const person=(await createUserWithEmailAndPassword(auth,by('email').value.trim(),by('password').value)).user;
  await sendEmailVerification(person);status('A verification email has been requested. Verify your address before accepting the invitation.');
 });
});
by('google').addEventListener('click',()=>void login(()=>signInWithPopup(auth,new GoogleAuthProvider())));
by('apple').addEventListener('click',()=>void login(()=>signInWithPopup(auth,new OAuthProvider('apple.com'))));
by('resend-verification').addEventListener('click',async()=>{
 const p=auth.currentUser;
 if(!p||p.emailVerified)return;
 try{await sendEmailVerification(p);status('Verification email requested.');}
 catch{status('Unable to request verification at this time.');}
});
by('reload-verification').addEventListener('click',async()=>{
 const p=auth.currentUser;if(!p)return;
 try{await reload(p);await p.getIdToken(true);update(p);}
 catch{status('Email verification is temporarily unavailable.');}
});
onAuthStateChanged(auth,update);
by('accept').addEventListener('click',async()=>{
 const person=auth.currentUser;if(!person||!person.emailVerified||!validToken)return;
 by('accept').disabled=true;
 try{
  const bearer=await person.getIdToken(true);
  const res=await fetch(base+'/recruiters/accept',{method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({token})});
  const response=await res.json().catch(()=>null);
  if(res.ok&&response?.ok){status('Invitation accepted. Sign in to your recruitment account.');location.replace('/recruiters/portal/');return;}
  status(res.status===503?'Recruitment enrollment is not yet available.':
   'This invitation could not be accepted. Confirm the addressed email account or request a new invitation.');
 }catch{status('We could not verify this invitation. Please try again.');}
 finally{by('accept').disabled=false;}
});
by('sign-out').addEventListener('click',()=>void signOut(auth));
</script>`;
module.exports={invitationHtml:()=>markup};
