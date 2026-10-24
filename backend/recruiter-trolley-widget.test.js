'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {signedRecruiterBankSetupUrl}=require('./recruiter-trolley-widget');
const uid='recruiter-0001';
const account={uid,status:'approved',agreementAccepted:true,identityVerified:true,
 verifiedEmail:'recruiter@example.com'};
const config={enabled:true,contractApproved:true,payEnabled:true,taxEnabled:true,
 accessKey:'sandbox_access_key_012',secretKey:'secret_abc_0123456789'};
const now=1782340000000;
const valid=signedRecruiterBankSetupUrl({uid,account,config,now});
assert.equal(valid.ok,true);
const link=new URL(valid.url),q=link.searchParams;
assert.equal(link.origin,'https://widget.trolley.com');
assert.equal(q.get('refid'),uid);
assert.equal(q.get('email'),account.verifiedEmail);
assert.equal(q.get('payoutMethods'),'bank-transfer');
assert.equal(q.get('products'),'pay,tax');
assert.equal(q.get('ts'),String(Math.floor(now/1000)));
assert.equal(valid.expiresInSeconds,30);
assert.equal(valid.url.includes(config.secretKey),false);
const unencoded=link.search.slice(1).split('&sign=')[0];
assert.equal(q.get('sign'),crypto.createHmac('sha256',config.secretKey).update(unencoded).digest('hex'));
for(const invalid of [
 {config:{...config,enabled:false}},{config:{...config,contractApproved:false}},
 {config:{...config,taxEnabled:false}},
 {account:{...account,verifiedEmail:'someone_else@example.com',uid:'wrong_uid'}},
 {account:{...account,agreementAccepted:false}},
 {config:{...config,secretKey:''}},
]){
 assert.equal(signedRecruiterBankSetupUrl({uid,account,config,now,...invalid}).ok,false);
}
assert.equal(JSON.stringify(valid).includes('routingNumber'),false);
console.log('PASS short-lived verified-recipient hosted bank/tax onboarding URL; no API or bank payment');