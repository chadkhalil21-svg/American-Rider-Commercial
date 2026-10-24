'use strict';
// Server-side Trolley hosted pay/tax widget signer. SOURCE ONLY, no mounted
// HTTP endpoint and no provider account until founder approves vendor/contract.
// Trolley's 30-second HMAC URL contains no secret, bank or tax information.
const crypto=require('node:crypto');
const {emailOf,validUid}=require('./recruiter-portal');
function signedRecruiterBankSetupUrl({uid,account,config,now=Date.now()}={}){
 const deny=reason=>({ok:false,reason});
 if(config?.enabled!==true||config?.contractApproved!==true||
    config?.payEnabled!==true||config?.taxEnabled!==true)
   return deny('provider_not_commissioned');
 if(!validUid(uid)||account?.uid!==uid||account?.status!=='approved'||
    account?.agreementAccepted!==true||account?.identityVerified!==true||
    emailOf(account?.verifiedEmail)!==account?.verifiedEmail)
   return deny('recruiter_not_verified');
 const key=config.accessKey,secret=config.secretKey;
 if(typeof key!=='string'||key.length<8||key.length>256||
    typeof secret!=='string'||secret.length<16||secret.length>512||
    !Number.isSafeInteger(now)||now<=0)
   return deny('provider_keys_unavailable');
 // refid is server-owned identity and must not be supplied by any client form.
 const query=new URLSearchParams({
   ts:String(Math.floor(now/1000)),key,email:account.verifiedEmail,refid:uid,
   hideEmail:'true',roEmail:'true',hideAccountType:'true',
   payoutMethods:'bank-transfer',locale:'en',products:'pay,tax',
 }).toString().replace(/\+/g,'%20');
 const signature=crypto.createHmac('sha256',secret).update(query).digest('hex');
 return {ok:true,url:'https://widget.trolley.com/?'+query+'&sign='+signature,
   expiresInSeconds:30,provider:'trolley',status:'onboarding_only_no_money_sent'};
}
module.exports={signedRecruiterBankSetupUrl};