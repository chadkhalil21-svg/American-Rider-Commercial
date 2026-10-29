'use strict';
// Fail the native QA run BEFORE Xcode if the authenticated local Operator
// cannot qualify and obtain current insurance from the actual HTTP API.
// This checks the same server endpoints used by OperatorContext, not the
// unauthenticated presence of a 'commissioned' flag on a Firestore fixture.
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('./native-qa-isolation');

async function main(){
  assert.equal(isolatedNativeQa(),true,'Refusing credential requests outside disposable local native commercial QA');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
  assert.equal(process.env.EXPO_PUBLIC_API_URL,'http://127.0.0.1:4242');
  // Fixed synthetic credentials from the disposable QA fixture only.
  const authUrl='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only';
  const authResponse=await fetch(authUrl,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:'native.qa.operator@example.test',
      password:'Native-QA-Only-7819-Strong',returnSecureToken:true}),
    signal:AbortSignal.timeout(12000),
  });
  const signed=await authResponse.json();
  assert.equal(authResponse.status,200,'Local QA Operator must authenticate using real Firebase emulator credentials');
  assert.equal(signed.localId,'native-qa-operator','Unexpected Firebase Operator account');
  assert.ok(typeof signed.idToken==='string'&&signed.idToken.length>40,'Missing Firebase ID token');

  async function status(path){
    const res=await fetch('http://127.0.0.1:4242'+path,{
      headers:{Authorization:'Bearer '+signed.idToken},
      signal:AbortSignal.timeout(15000),
    });
    const body=await res.json().catch(()=>({}));
    return {http:res.status,...body};
  }
  // The qualification status route may return a failed eligibility decision
  // with HTTP 200. We MUST inspect the server verdict and blockers.
  const [q,insurance]=await Promise.all([
    status('/operator/qualification'),
    status('/operator/insurance/status'),
  ]);
  console.log('QA_OPERATOR_AUTHENTICATED_STATUS',JSON.stringify({
    uid:signed.localId,
    qualificationHttp:q.http,qualification:q.status,
    blockers:q.blockers||[],
    insuranceHttp:insurance.http,insuranceStatus:insurance.status,
    insuranceOk:insurance.ok===true,insuranceDocumentApproved:insurance.documentApproved===true,
    policyExpiry:insurance.policyExpiry||null,
  }));
  assert.equal(q.http,200,'Authenticated Operator qualification request failed');
  assert.equal(q.status,'qualified','QA Operator fails real server qualification: inspect blockers above');
  assert.equal(q.qualified,true,'Server did not certify this synthetic Operator for QA');
  assert.equal(insurance.http,200,'Authenticated Operator insurance request failed');
  assert.equal(insurance.ok,true,'QA insurance continuing-status gate failed');
  assert.equal(insurance.documentApproved,true,'QA policy document not approved by configured jurisdiction rules');
  assert.match(insurance.policyExpiry||'',/^\\d{4}-\\d{2}-\\d{2}$/);
  console.log('PASS: authenticated local Operator is qualified, covered, and eligible for app-side role restoration');
}
main().catch(e=>{console.error('QA_OPERATOR_PREBUILD_ELIGIBILITY_FAILED:',e.message);process.exitCode=1});
