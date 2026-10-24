'use strict';
const assert=require('node:assert/strict');
const {inspectExistingOperatorRecruiterConnect:verify}=require('./recruiter-operator-connect');
const {verifyRecruiterBank}=require('./recruiter-stripe-accounts');
const NOW=Date.now();
const UID='operator-with-recruiter-001',ACC='acct_ExistingOperatorConnect001';
const email='operator@example.com';
class Db{
 constructor(){this.rows=new Map();this.reads=0;this.writes=0;}
 collection(name){return {doc:id=>({get:async()=>{this.reads++;
   const path=name+'/'+id,v=this.rows.get(path);
   return {exists:v!==undefined,data:()=>structuredClone(v)};}})};}
}
(async()=>{
 const db=new Db();
 db.rows.set('users/'+UID,{stripeAccountId:ACC});
 db.rows.set('recruiter_accounts/'+UID,{status:'approved',verifiedEmail:email,agreementAccepted:true});
 db.rows.set('recruiter_approvals/'+UID,{status:'approved',agreementAccepted:true,
    agreementAcceptedAt:NOW-1000,expiresAt:NOW+86400000,suspended:false});
 let providerCalls=0;
 const stripe={accounts:{retrieve:async id=>{providerCalls++;assert.equal(id,ACC);return {
   id,type:'express',country:'US',metadata:{uid:UID},
   details_submitted:true,payouts_enabled:true,capabilities:{transfers:'active'},
   requirements:{currently_due:[],past_due:[]},
   settings:{payouts:{schedule:{interval:'daily'}}}
 };}}};
 const args={db,stripe,uid:UID,verifiedEmail:email,account:db.rows.get('recruiter_accounts/'+UID),now:NOW};
 const verified=await verify(args);
 assert.equal(verified.ok,true);
 assert.equal(verified.existingOperatorConnect,true);
 assert.equal(verified.bankVerified,true);
 assert.equal(verified.ready,false,'bank-ready is not commission-money approved');
 assert.equal(verified.commissionsEnabled,false);
 assert.equal(verified.requiresSeparateAccount,false);
 assert.equal(providerCalls,1);
 assert.equal(db.writes,0);
 const routed=await verifyRecruiterBank({db,stripe,uid:UID,verifiedEmail:email,now:NOW});
 assert.equal(routed.status,'existing_operator_bank_verified');
 assert.equal(routed.ready,false);
 assert.equal(db.writes,0,'verification must never modify an existing Operator account');
 assert.equal(stripe.accounts.update,undefined,'never touch payout schedule');
 assert.equal(stripe.accounts.create,undefined,'never create second account');
 const forged={...args,verifiedEmail:'imposter@example.com'};
 assert.equal((await verify(forged)).reason,'recruiter_agreement_required');
 db.rows.set('recruiter_accounts/'+UID,{...args.account,stripeRecruiterAccountId:'acct_ExtraRecipient123456'});
 assert.equal((await verify({...args,account:db.rows.get('recruiter_accounts/'+UID)})).reason,
   'multiple_connected_accounts_require_reconciliation');
 db.rows.set('recruiter_accounts/'+UID,args.account);
 db.rows.set('recruiter_approvals/'+UID,{...db.rows.get('recruiter_approvals/'+UID),suspended:true});
 assert.equal((await verify(args)).reason,'recruiter_approval_required');
 db.rows.set('recruiter_approvals/'+UID,{...db.rows.get('recruiter_approvals/'+UID),suspended:false});
 const hostile={accounts:{retrieve:async()=>({id:ACC,type:'express',country:'US',
    metadata:{uid:'different-operator'},details_submitted:true,payouts_enabled:true,
    capabilities:{transfers:'active'}})}};
 assert.equal((await verify({...args,stripe:hostile})).reason,'operator_stripe_identity_mismatch');
 db.rows.set('users/'+UID,{stripeAccountId:''});
 assert.equal((await verify(args)).applicable,false,'independent Recruiter can use ordinary Express onboarding');
 assert.equal(db.writes,0);
 console.log('PASS: Existing Operator Stripe identity validated, original auto payouts preserved, no second account, forged/suspended/dual accounts blocked, money OFF');
})().catch(e=>{console.error(e);process.exitCode=1;});
