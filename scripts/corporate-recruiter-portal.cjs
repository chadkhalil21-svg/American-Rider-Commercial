'use strict';
// Static corporate-site recruiter login: Firebase web authentication, not a new recruiter data store.
// Auth tokens go only to the canonical American Rider API, no personal data embedded in HTML.
const markup = "<section class=\"page-hero shell\"><p class=\"section-label\">INDEPENDENT RELATIONSHIPS</p><h1>Your recruitment account.</h1><p>Review approved introductions, qualifying activity and account information in one private place.</p></section>\n<div class=\"shell\" style=\"max-width:760px;padding-bottom:90px\">\n  <section class=\"page-section\" id=\"sign-in-panel\" aria-labelledby=\"login-title\">\n    <h2 id=\"login-title\">Sign in</h2>\n    <p>Sign in using the verified email address associated with your invitation. Banking information is collected only through Stripe.</p>\n    <form id=\"recruiter-sign-in\">\n      <label style=\"display:block;margin-bottom:8px\" for=\"recruiter-email\">Email address</label>\n      <input required type=\"email\" id=\"recruiter-email\" autocomplete=\"username\" style=\"padding:14px;width:100%;max-width:480px;border:1px solid #c7c7c3;border-radius:9px;margin-bottom:18px\">\n      <label style=\"display:block;margin-bottom:8px\" for=\"recruiter-password\">Password</label>\n      <input required type=\"password\" id=\"recruiter-password\" autocomplete=\"current-password\" style=\"padding:14px;width:100%;max-width:480px;border:1px solid #c7c7c3;border-radius:9px;display:block;margin-bottom:18px\">\n      <button type=\"submit\" class=\"action primary\">Sign in</button>\n    </form>\n    <p style=\"margin-top:24px\"><button type=\"button\" id=\"google\" class=\"action secondary\">Continue with Google</button> <button type=\"button\" id=\"apple\" class=\"action secondary\">Continue with Apple</button></p>\n  </section>\n  <section class=\"page-section\" id=\"workspace\" hidden aria-labelledby=\"workspace-title\">\n    <h2 id=\"workspace-title\">Your introductions</h2>\n    <p id=\"review-status\"></p>\n    <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:26px 0\">\n      <div style=\"padding:20px;background:#fff;border:1px solid #e3e2dc;border-radius:12px\">\n        <div style=\"font-size:12px;color:#777\">Operator introductions</div>\n        <strong id=\"operator-count\" style=\"font-size:28px\">—</strong>\n      </div>\n      <div style=\"padding:20px;background:#fff;border:1px solid #e3e2dc;border-radius:12px\">\n        <div style=\"font-size:12px;color:#777\">Traveler introductions</div>\n        <strong id=\"traveler-count\" style=\"font-size:28px\">—</strong>\n      </div>\n    </div>\n    <p>Introductions are not the same as verified Operators or qualifying paid Travels. Those figures are displayed only after confirmation.</p>\n    <section aria-label=\"Personal invitation links\">\n      <h3>Personal invitations</h3>\n      <p>Invitation links are available after individual approval and program verification. Native app opening is optional; the website preserves referral codes.</p>\n      <p><button id=\"operator-link\" type=\"button\" class=\"action secondary\" disabled>Share an Operator invitation</button> <button id=\"traveler-link\" type=\"button\" class=\"action secondary\" disabled>Share a Traveler invitation</button></p>\n    </section>\n    <section aria-label=\"Compensation\">\n      <h3>Compensation and payments</h3>\n      <p>Review your verified introduction records, eligible commissions and payout status once your account is approved. Banking and identity verification are handled by Stripe. Do not email financial or tax information.</p>\n    </section>\n    <button type=\"button\" class=\"action secondary\" id=\"sign-out\">Sign out</button>\n  </section>\n  <p role=\"status\" aria-live=\"polite\" id=\"recruiter-message\"></p>\n</div>\n<script type=\"module\">\nimport {initializeApp} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';\nimport {getAuth, browserSessionPersistence, setPersistence, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signOut} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';\nconst cfg={apiKey:'AIzaSyAQMJ1ikGvhrmCZY9D0OjM6EM2r2m0V4OY',authDomain:'american-rider-35688.firebaseapp.com',projectId:'american-rider-35688',appId:'1:623854974930:web:d73e4dec7949c3756efa0b'};\nconst auth=getAuth(initializeApp(cfg));\nconst api='https://american-rider-api-production-623854974930.us-east1.run.app';\nconst by=id=>document.getElementById(id);\nconst note=s=>{by('recruiter-message').textContent=s;};\nasync function request(path){\n const person=auth.currentUser;\n if(!person||!person.emailVerified)throw Error('verified_email_required');\n const bearer=await person.getIdToken();\n const response=await fetch(api+path,{headers:{Authorization:'Bearer '+bearer},cache:'no-store'});\n if(!response.ok)throw Error(response.status===404?'account_not_enrolled':'service_unavailable');\n return await response.json();\n}\nasync function refresh(person){\n by('sign-in-panel').hidden=!!person;\n by('recruiter-paid').textContent='Awaiting verified account data';by('workspace').hidden=!person;\n if(!person){note('');return;}\n if(!person.emailVerified){note('Please verify your email address to enter the recruitment account.');return;}\n try{\n  const data=await request('/recruiters/me');\n  by('review-status').textContent=data.status==='approved'?'Account approved for further verification.':data.status==='pending_review'?'Your relationship is under review.':data.status==='suspended'?'This relationship is suspended.':'This relationship is not active.';\n  by('operator-count').textContent=String(data.counts?.operatorIntroductions??0);\n  by('traveler-count').textContent=String(data.counts?.travelerIntroductions??0);\n  by('operator-link').disabled=!data.linksAvailable;\n  by('traveler-link').disabled=!data.linksAvailable;\n  note('Your information is current as of this sign-in.');\n }catch(e){by('operator-link').disabled=true;by('traveler-link').disabled=true;\n   note(e.message==='account_not_enrolled'?'A personal invitation is required before this account can be used.':'We could not verify your recruitment record. Please try again.');}\n}\nasync function login(promise){\n note('Verifying your account.');\n try{await setPersistence(auth,browserSessionPersistence);await promise();}catch{note('Sign-in could not be completed. Check your account or try another sign-in method.');}\n}\nby('recruiter-sign-in').addEventListener('submit',e=>{\n e.preventDefault();\n login(()=>signInWithEmailAndPassword(auth,by('recruiter-email').value,by('recruiter-password').value));\n});\nby('google').addEventListener('click',()=>login(()=>signInWithPopup(auth,new GoogleAuthProvider())));\nby('apple').addEventListener('click',()=>login(()=>signInWithPopup(auth,new OAuthProvider('apple.com'))));\nby('sign-out').addEventListener('click',async()=>{await signOut(auth);note('Signed out.');});\nasync function share(role){\n try{\n  const data=await request('/recruiters/link?role='+encodeURIComponent(role));\n  if(!/^https:\\/\\/americanrider\\.tech\\/join\\?r=[A-Z0-9]+&role=(operator|traveler)$/.test(data.url))throw Error('invalid_link');\n  const disclosure='I may receive compensation if you join American Rider through this invitation and meet applicable requirements. '+data.url;\n  if(navigator.share)await navigator.share({title:'American Rider',text:disclosure});\n  else if(navigator.clipboard){await navigator.clipboard.writeText(disclosure);note('Invitation and compensation disclosure copied.');}\n  else note('Copying links is not supported in this browser.');\n }catch{note('Your personal link is unavailable or could not be shared.');}\n}\nby('operator-link').addEventListener('click',()=>share('operator'));\nby('traveler-link').addEventListener('click',()=>share('traveler'));\nonAuthStateChanged(auth,p=>refresh(p));\n</script>";
// Modifications apply to the generated HTML, leaving sign-in unchanged.
const {qrWidgetHtml}=require('./corporate-recruiter-qr.cjs');
const {progressHtml,progressClientJs}=require('./corporate-recruiter-progress.cjs');
function portalHtml(){
  let html=markup.replace('<h2 id="workspace-title">Your introductions</h2>',
    '<h2 id="workspace-title">Recruitment Overview</h2>');
  html=html.replace('<section aria-label="Personal invitation links">',
    '<section aria-label="Qualification and payment status"><h3>Verified activity</h3>'+
    '<p><strong>Qualified Operators:</strong> Not yet verified &nbsp; · &nbsp; '+
    '<strong>Qualifying Travels:</strong> Not yet available &nbsp; · &nbsp; '+
    '<strong>Commissions paid:</strong> <span id="recruiter-paid">Awaiting verified account data</span></p>'+
    '<p id="settled-travel-records">Recorded settled Travels: Not yet verified</p>'+
    '</section><section aria-label="Personal invitation links">');
  html=html.replace('<section aria-label="Compensation">',
    '<p id="recruiter-wallet-status" role="status">Checking payment status.</p>'+qrWidgetHtml()+'<section aria-label="Compensation">');
  html=html.replace('<section aria-label="Compensation">',
    progressHtml()+'<section aria-label="Compensation">');
  html=html.replace('<section aria-label="Compensation">',
    "<section class=\"page-section\" aria-label=\"Stripe Recruiter payments\" style=\"padding:20px 0\">\n<h3>Secure compensation and bank enrollment</h3>\n<p>Stripe Connect handles your banking and identity verification. American Rider does not collect bank account or tax numbers.</p>\n<p><strong>Monthly active Connect fee: $2.00.</strong> Deducted from earned Recruiter commissions only in a month with a bank payout. No charge for inactive months. American Rider covers standard per-payout processing costs.</p>\n<p id=\"recruiter-stripe-status\" role=\"status\" aria-live=\"polite\">Checking enrollment availability.</p>\n<div id=\"recruiter-stripe-consent\" hidden>\n<h4>Approved compensation agreement</h4>\n<div id=\"recruiter-stripe-agreement\" tabindex=\"0\" style=\"white-space:pre-wrap;max-height:220px;overflow:auto;padding:16px;border:1px solid #c7c7c3;border-radius:9px\"></div>\n<label style=\"display:block;margin:18px 0\"><input type=\"checkbox\" id=\"recruiter-stripe-check\"> I accept the approved Recruiter agreement and the $2 Connect fee in each active payout month.</label>\n<button id=\"recruiter-stripe-start\" type=\"button\" class=\"action secondary\">Accept and continue to Stripe</button>\n</div>\n</section>"+'<section aria-label="Compensation">');
  html=html.replace('async function refresh(person){',
    progressClientJs()+'\nasync function refresh(person){');
  // A slow account summary from the previous Firebase session must never
  // paint a new recruiter's private counts after sign-out/account switching.
  html=html.replace("  const data=await request('/recruiters/me');",
    "  const data=await request('/recruiters/me');if(auth.currentUser?.uid!==person.uid)return;");
  html=html.replace("  by('traveler-count').textContent=String(data.counts?.travelerIntroductions??0);",
    "  by('traveler-count').textContent=String(data.counts?.travelerIntroductions??0);"+
    "by('settled-travel-records').textContent=Number.isSafeInteger(data.counts?.operatorSettlementRecords)&&Number.isSafeInteger(data.counts?.travelerSettlementRecords)?"+
    "'Recorded settled Travels · Operator introductions: '+data.counts.operatorSettlementRecords+' · Traveler introductions: '+data.counts.travelerSettlementRecords+' (not a commission statement).':"+
    "'Recorded settled Travels: Not yet verified';");
  html=html.replace("  note('Your information is current as of this sign-in.');",
    "  by('recruiter-paid').textContent=data.wallet?('USD '+(data.wallet.netPaidCents/100).toFixed(2)+' verified net paid') :'Unavailable';"+
    "  note('Your information is current as of this sign-in.');await loadIntroductions(true);await loadRecruiterConnect(person);");
  html=html.replace("by('workspace').hidden=!person;",
    "resetIntros();by('operator-count').textContent='—';"+
    "by('traveler-count').textContent='—';by('workspace').hidden=!person;");
  html=html.replace("if(!person){note('');return;}",
    "if(!person){resetIntros();note('');return;}");
  html=html.replace('<script type="module">',
    '<script src="/assets/qrcode-generator-2.0.4.js"></script><script type="module">');
  html=html.replace("async function share(role){",
    "let approvedConnectTerms=null;\nasync function securePost(path,body){\n const person=auth.currentUser;if(!person?.emailVerified)throw Error('verified_account_required');\n const bearer=await person.getIdToken(true);\n const response=await fetch(api+path,{method:'POST',cache:'no-store',\n   headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},\n   body:JSON.stringify(body)});\n const data=await response.json().catch(()=>({ok:false}));\n if(!response.ok||!data.ok)throw Error('request_not_approved');\n return data;\n}\nasync function loadRecruiterConnect(person){\n const label=by('recruiter-stripe-status');by('recruiter-stripe-consent').hidden=true;\n approvedConnectTerms=null;if(!person?.emailVerified)return;\n try{\n  const fee=await request('/recruiters/stripe/terms');\n  if(auth.currentUser?.uid!==person.uid)return;\n  if(fee.status!=='ready_for_consent'){label.textContent='Enrollment will open once the commission program and provider agreement are approved.';return;}\n  const status=await request('/recruiters/stripe/status');\n  if(auth.currentUser?.uid!==person.uid)return;\n  if(status.ready){label.textContent='Your Stripe account is verified. Separate tax and first-payout approval remain required.';return;}\n  const agreement=await request('/recruiters/agreement');\n  if(auth.currentUser?.uid!==person.uid)return;\n  approvedConnectTerms={version:agreement.version,feeVersion:fee.feeVersion};\n  by('recruiter-stripe-agreement').textContent=agreement.text+'\\\\n\\\\n'+fee.feeDisclosure;\n  by('recruiter-stripe-check').checked=false;\n  by('recruiter-stripe-consent').hidden=false;\n  label.textContent='Please review and accept the approved terms to begin secure Stripe enrollment.';\n }catch{if(auth.currentUser?.uid===person.uid)\n  label.textContent='Bank enrollment is not available yet. No payment details are required now.';}\n}\nby('recruiter-stripe-start').addEventListener('click',async()=>{\n const person=auth.currentUser,button=by('recruiter-stripe-start'),label=by('recruiter-stripe-status');\n if(!person?.emailVerified||!approvedConnectTerms||!by('recruiter-stripe-check').checked){\n  label.textContent='Please accept the agreement and fee disclosure first.';return;\n }\n const terms=approvedConnectTerms;button.disabled=true;label.textContent='Opening secure Stripe enrollment…';\n try{\n  await securePost('/recruiters/agreement',{version:terms.version,accepted:true});\n  if(auth.currentUser?.uid!==person.uid)return;\n  await securePost('/recruiters/stripe/fee-consent',{version:terms.feeVersion,accepted:true});\n  if(auth.currentUser?.uid!==person.uid)return;\n  const result=await securePost('/recruiters/stripe/onboard',{});\n  if(auth.currentUser?.uid!==person.uid)return;\n  if(new URL(result.url).origin!=='https://connect.stripe.com')throw Error('invalid_provider_link');\n  window.location.assign(result.url);\n }catch{if(auth.currentUser?.uid===person.uid)\n  label.textContent='Stripe could not open your enrollment. Please try again. No bank information was collected here.';}\n finally{button.disabled=false;}\n});\n"+"\nasync function share(role){");
  // Preserve original share code.
  html=html.replace("async function share(role){",
    "async function share(role,mode='share'){");
  html=html.replace("  const disclosure='I may receive compensation",
    "  if(mode==='qr'){if(!window.__arRenderQr(data.url,role))throw Error('qr_unavailable');note('Personal QR card ready.');return;}\\n  const disclosure='I may receive compensation".replace('\\n','\n'));
  html=html.replace("  by('operator-link').disabled=!data.linksAvailable;",
    "  by('operator-link').disabled=!data.linksAvailable;by('qr-operator').disabled=!data.linksAvailable;");
  html=html.replace("  by('traveler-link').disabled=!data.linksAvailable;",
    "  by('traveler-link').disabled=!data.linksAvailable;by('qr-traveler').disabled=!data.linksAvailable;");
  html=html.replace("by('operator-link').disabled=true;by('traveler-link').disabled=true;",
    "by('operator-link').disabled=true;by('traveler-link').disabled=true;by('qr-operator').disabled=true;by('qr-traveler').disabled=true;");
  html=html.replace("by('operator-link').addEventListener('click',()=>share('operator'));",
    "by('operator-link').addEventListener('click',()=>share('operator'));by('qr-operator').addEventListener('click',()=>share('operator','qr'));" );
  html=html.replace("by('traveler-link').addEventListener('click',()=>share('traveler'));",
    "by('traveler-link').addEventListener('click',()=>share('traveler'));by('qr-traveler').addEventListener('click',()=>share('traveler','qr'));" );
  // One account, not an employee hiring workflow. The invite landing page
  // already offers Create account plus Apple/Google and verified-email binding.
  // A display name is not a bank, tax or legal-identity declaration.
  const accountDetails=String.raw`<section class="page-section" aria-label="Account details" style="padding:20px 0">
    <h3>Account details</h3>
    <form id="recruiter-profile">
      <label for="recruiter-profile-name" style="display:block;margin-bottom:8px">Your name</label>
      <input id="recruiter-profile-name" name="name" autocomplete="name" required minlength="2" maxlength="80"
        style="display:block;padding:14px;width:100%;max-width:480px;border:1px solid #c7c7c3;border-radius:9px;margin-bottom:16px">
      <button type="submit" class="action secondary">Save name</button>
    </form><p id="recruiter-profile-status" role="status" aria-live="polite"></p>
    <p>Your email address is confirmed by your sign-in. Payments will be set up securely when the program is available.</p>
  </section>`;
  html=html.replace('<section aria-label="Compensation">',
    accountDetails+'<section aria-label="Compensation">');
  html=html.replace("  by('traveler-count').textContent=String(data.counts?.travelerIntroductions??0);",
    "  by('traveler-count').textContent=String(data.counts?.travelerIntroductions??0);"+
    "by('recruiter-profile-name').value=String(data.profileName||'');");
  html=html.replace("by('workspace').hidden=!person;",
    "by('recruiter-profile-name').value='';by('recruiter-profile-status').textContent='';by('workspace').hidden=!person;");
  const profileScript=String.raw`by('recruiter-profile').addEventListener('submit',async e=>{
 e.preventDefault();
 const person=auth.currentUser,feedback=by('recruiter-profile-status');
 if(!person?.emailVerified){feedback.textContent='Please verify your email address.';return;}
 const button=e.currentTarget.querySelector('button[type="submit"]');
 button.disabled=true;feedback.textContent='Saving account details…';
 try{
  const bearer=await person.getIdToken(true);
  const response=await fetch(api+'/recruiters/profile',{method:'POST',cache:'no-store',
    headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
    body:JSON.stringify({profileName:by('recruiter-profile-name').value})});
  const result=await response.json();
  if(auth.currentUser?.uid!==person.uid)return;
  feedback.textContent=response.ok&&result.ok?'Your name has been saved.':
    'Your name could not be saved. Please review and try again.';
 }catch{if(auth.currentUser?.uid===person.uid)
   feedback.textContent='The account service is unavailable. No change was confirmed.';
 }finally{button.disabled=false;}
});
`;
  html=html.replace("by('sign-out').addEventListener('click'",
    profileScript+"by('sign-out').addEventListener('click'");
  return html;
}
module.exports={portalHtml};
