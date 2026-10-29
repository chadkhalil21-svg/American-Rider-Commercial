'use strict';
// Public READ-ONLY HTTPS checks, no referral claims, cookies or production changes.
// A 200/association does NOT prove device-installed universal links.
const fs=require('node:fs');
const endpoints=[
 {name:'join-traveler',path:'/join/?r=ARQATESTCODE123&role=traveler',type:'html',term:'invitation'},
 {name:'join-operator',path:'/join/?r=ARQATESTCODE123&role=operator',type:'html',term:'invitation'},
 {name:'recruiter-accept',path:'/recruitment/accept/',type:'html',term:'recruit'},
 {name:'recruiter-portal',path:'/recruiters/portal/',type:'html',term:'recruit'},
 {name:'ios-domain-association',path:'/.well-known/apple-app-site-association',type:'apple'},
 {name:'android-domain-association',path:'/.well-known/assetlinks.json',type:'android'},
 {name:'local-qr-library',path:'/assets/qrcode-generator-2.0.4.js',type:'js',term:'qrcode'}
];
const evidence={mode:'PUBLIC_GET_ONLY',sourceSha:process.env.GITHUB_SHA||null,
 noDeviceInstall:true,noReferralClaim:true,checks:[]};
const output=()=>{fs.mkdirSync('artifacts/invitation-http-probe',{recursive:true});fs.writeFileSync('artifacts/invitation-http-probe/outcome.json',JSON.stringify(evidence,null,2)+'\n')};
(async()=>{
 for(const e of endpoints){
  const check={name:e.name,path:e.path,status:'FAIL',http:null,verified:false};
  try{
   const res=await fetch('https://americanrider.tech'+e.path,{method:'GET',
     redirect:'follow',headers:{'User-Agent':'AmericanRider-QA-Public-Link-ReadOnly/1.0'},
     signal:AbortSignal.timeout(16000)});
   const u=new URL(res.url),data=await res.text();
   check.http=res.status;check.finalHost=u.hostname;
   check.verified=res.ok&&['americanrider.tech','www.americanrider.tech'].includes(u.hostname)&&data.length>50;
   if(e.type==='html')check.verified=check.verified&&data.toLowerCase().includes(e.term);
   if(e.type==='js')check.verified=check.verified&&data.toLowerCase().includes(e.term);
   if(e.type==='apple'){
    const parsed=JSON.parse(data);
    check.verified=check.verified&&!!parsed.applinks&&Array.isArray(parsed.applinks.details)&&
     parsed.applinks.details.length>0;
   }
   if(e.type==='android'){
    const parsed=JSON.parse(data);
    check.verified=check.verified&&Array.isArray(parsed)&&parsed.some(item=>
      item.target?.namespace==='android_app'&&item.target?.package_name==='com.americanrider.app');
   }
   check.status=check.verified?'PASS':'FAIL';
  }catch(err){check.reason=String(err.name||'fetch_error').slice(0,80);}
  evidence.checks.push(check);
  console.log(check.status+' '+check.name+' HTTP '+String(check.http??'unreachable'));
 }
 evidence.result=evidence.checks.every(x=>x.verified)?'PASS':'FAIL';
 output();
 if(evidence.result!=='PASS')process.exitCode=1;
 console.log('PUBLIC INVITATION CHECK:',evidence.result,
  '(real installed-app link opening and referral attribution UNVERIFIED)');
})().catch(err=>{evidence.result='FAIL';output();console.error('Public probe error',err.name||'unknown');process.exitCode=1});
