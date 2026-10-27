'use strict';
// Disposable local-emulator + Stripe TEST accounts only. NEVER load or write any production user or fleet.
// QA values emulate an eligible Operator to exercise gates; NOT evidence of real insurance/screening.
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('./native-qa-isolation');
const {adminDb}=require('./firebase-admin');
const {getAuth}=require('firebase-admin/auth');
const Stripe=require('stripe');
const {DISCLOSURE_VERSION}=require('./disclosure');
async function main(){
  assert.equal(isolatedNativeQa(),true,'Refusing QA fixtures outside isolated local backend');
  const key=process.env.STRIPE_SECRET_KEY||'';
  assert.match(key,/^sk_test_/,'No Stripe TEST key; do not seed fake payment accounts');
  assert.match(process.env.STRIPE_PUBLISHABLE_KEY||'',/^pk_test_/,'TEST publishable key is required');
  assert.ok(!process.env.K_SERVICE&&!process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.FIREBASE_SERVICE_ACCOUNT,
    'Never use production Google identity');
  const stripe=new Stripe(key);
  assert.equal((await stripe.balance.retrieve()).livemode,false,'Stripe provider must confirm TEST mode before any writes');
  const db=adminDb();assert.ok(db,'Local Firestore Admin emulator unavailable');
  const pass='Native-QA-Only-7819-Strong';
  const traveler='native.qa.traveler@example.test';
  const operator='native.qa.operator@example.test';
  const acct=await stripe.accounts.create({
    type:'custom',country:'US',email:operator,business_type:'individual',
    capabilities:{transfers:{requested:true}},
    individual:{first_name:'Test',last_name:'Operator',email:operator,phone:'+15005550006',
      dob:{day:1,month:4,year:1990},address:{line1:'address_full_match',city:'Miami',state:'FL',postal_code:'33101'},
      ssn_last_4:'0000',id_number:'000000000'},
    business_profile:{mcc:'4121',product_description:'Isolated American Rider native QA',url:'https://americanrider.test'},
    tos_acceptance:{date:Math.floor(Date.now()/1000),ip:'8.8.8.8'},
    external_account:{object:'bank_account',country:'US',currency:'usd',routing_number:'110000000',account_number:'000123456789'},
    metadata:{qa_only:'true',ci_run:String(process.env.GITHUB_RUN_ID||'manual')},
  });
  assert.ok(acct.id?.startsWith('acct_'),'Stripe TEST operator account not created');
  const auth=getAuth();
  const ids={traveler:'native-qa-traveler',operator:'native-qa-operator'};
  async function provision(uid,email) {
    try{await auth.createUser({uid,email,password:pass,emailVerified:true,displayName:uid===ids.operator?'Test Operator':'Test Traveler'});}
    catch(e){if(e.code!=='auth/uid-already-exists')throw e;}
  }
  await provision(ids.traveler,traveler);await provision(ids.operator,operator);
  const now=Date.now();
  const doc=(extras={})=>({verdict:'accept',expiry:'2099-01-01',evidence:{isTheRequestedDocument:true,legible:true,fields:{expiry:'2099-01-01',...extras}}});
  const insurance=doc({commercialUse:'yes',limits:'$1,000,000 CSL'});
  insurance.evidence.insurance={
    namedInsureds:['Test Operator'],listedDrivers:[],effectiveDate:'2026-01-01',expirationDate:'2099-01-01',
    vehicles:[{description:'QA test car',vin:'',plate:'QATEST1'}],useStatements:[],tncEndorsement:'yes',
    forHireUse:'not_shown',loggedOnLimits:{bodilyInjuryPerPerson:'$50,000',bodilyInjuryPerIncident:'$100,000',
      propertyDamage:'$25,000',combinedSingleLimit:''},
    rideLimits:{bodilyInjuryPerPerson:'',bodilyInjuryPerIncident:'',propertyDamage:'',combinedSingleLimit:'$1,000,000'},
    generalLimits:{bodilyInjuryPerPerson:'',bodilyInjuryPerIncident:'',propertyDamage:'',combinedSingleLimit:''},
    pip:{shown:'yes',amount:'$10,000'},uninsuredMotorist:{shown:'yes',amount:''},
  };
  await db.collection('users').doc(ids.traveler).set({name:'Test Traveler',email:traveler,qaOnly:true});
  await db.collection('users').doc(ids.operator).set({
    name:'Test Operator',email:operator,qaOnly:true,stripeAccountId:acct.id,
    operatingMarket:{id:'fl-miami-dade'},
    insuranceDisclosure:{version:DISCLOSURE_VERSION,at:now-1000},
    documents:{license:doc(),registration:doc({plate:'QATEST1'}),insurance},
    insuranceMonitoring:{status:'verified_active',source:'local_qa_fixture',checkedAt:now,expiresAt:Date.parse('2099-01-01')},
    screening:{decision:'pass',recheckDue:now+86400000},
  });
  await db.collection('operators').doc(ids.operator).set({
    uid:ids.operator,available:true,onlineAt:now,commissioned:true,
    disclosureVersion:DISCLOSURE_VERSION,
    insuranceExpiry:'2099-01-01',lat:25.7617,lng:-80.1918,plate:'QATEST1',vehicleClass:'Standard',
    stripeAccountId:acct.id,qaOnly:true,
  });
  console.log('PASS: two LOCAL emulator identities, synthetic insured Operator, and Stripe TEST Connect fixture created');
  console.log('Stripe TEST payouts enabled:',!!acct.payouts_enabled,'transfers:',acct.capabilities?.transfers);
  if(!acct.payouts_enabled)throw Error('Connected TEST Operator payouts disabled: cannot certify payout portion of native journey');
  console.log('QA_NATIVE_FIXTURES_READY=1 (not a production Operator; not real insurance or background check)');
}
main().catch(e=>{console.error('NATIVE_QA_SETUP_BLOCKED:',e.message);process.exitCode=1;});
