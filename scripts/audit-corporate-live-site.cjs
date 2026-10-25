'use strict';
// Read-only live public-user journey audit. Never signs in, creates an account or makes a payment.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.SITE_AUDIT_BASE||'https://americanrider.tech';
const paths=['/','/travel/','/operate/','/safety/','/company/','/support/','/recruitment/','/recruiters/portal/','/recruitment/accept/','/join/','/smart-travel/','/terms/','/privacy/','/account-deletion/','/assets/site.css','/assets/qrcode-generator-2.0.4.js','/favicon.svg','/robots.txt','/sitemap.xml'];
async function http(){
 let failures=[],checked=0, links=new Set();
 for(const p of paths){
  try{
   const r=await fetch(base+p,{headers:{'User-Agent':'AmericanRiderFounderWebsiteAudit/1.0','Accept':'text/html,*/*'},signal:AbortSignal.timeout(18000),redirect:'follow'});
   const body=await r.text(); checked++;
   console.log('LIVE',r.status,p,'bytes',body.length,'final',r.url);
   if(r.status!==200||r.url!==base+p)failures.push(p+' status or unexpected redirect '+r.status+' '+r.url);
   if((p.endsWith('/')||p==='/')&&!body.includes('<main id="main">'))failures.push(p+' missing page main');
   if(p.endsWith('/')||p==='/'){
    for(const match of body.matchAll(/href=["']([^"']+)["']/g)){
     const href=match[1]; if(href.startsWith('/')&&!href.startsWith('//'))links.add(href.split('#')[0].split('?')[0]);
    }
   }
   if(p==='/recruitment/'){
    const n=(body.match(/href="\/recruiters\/portal\/"/g)||[]).length;
    console.log('UX_NOTICE recruitment portal CTA occurrences',n);
    if(n>1)console.log('UX_NOTICE duplicate recruiter portal actions in public recruitment page');
   }
   if(p==='/recruiters/portal/'&&!body.includes('id="recruiter-sign-in"'))failures.push('portal form missing');
   if(p==='/join/'&&(!body.includes('join-referral-code')||!body.includes('join-copy')))failures.push('referral retention controls missing');
   if(p==='/recruitment/accept/'&&!body.includes('id="accept-panel"'))failures.push('invitation acceptance controls missing');
  }catch(e){failures.push(p+' '+String(e.message).slice(0,160));}
 }
 for(const p of links){
  if(!p||paths.includes(p))continue;
  try{const r=await fetch(base+p,{signal:AbortSignal.timeout(16000),redirect:'follow'});checked++;console.log('LINK',r.status,p);if(r.status>=400)failures.push('internal link '+p+' returned '+r.status);}catch(e){failures.push('internal '+p+' '+String(e.message).slice(0,100));}
 }
 console.log('LIVE_HTTP_AUDIT',JSON.stringify({checked,failures,distinctInternalLinks:links.size}));
 if(failures.length)process.exitCode=1;
}
async function browser(){
 const {chromium}=require('/tmp/ar-playwright/node_modules/playwright');
 const b=await chromium.launch({headless:true,args:['--no-sandbox']});let failures=[];
 fs.mkdirSync('site-audit-images',{recursive:true});
 for(const [kind,viewport] of Object.entries({iphone:{width:390,height:844},ipad:{width:1024,height:768},desktop:{width:1440,height:900}})){
  const context=await b.newContext({viewport,deviceScaleFactor:1});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e.message)));
  try{
   await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:25000});
   await page.screenshot({path:'site-audit-images/home-'+kind+'.png',fullPage:true});
   const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
   if(overflow>3)failures.push(kind+' horizontal overflow '+overflow);
   if(kind==='iphone'){
    await page.locator('.mobile-nav summary').click();
    await page.locator('.mobile-nav a[href="/support/"]').click();
    if(!page.url().endsWith('/support/'))failures.push('mobile menu Support does not navigate');
   }else{
    await page.locator('.nav a[href="/recruitment/"]').click();
    if(!page.url().endsWith('/recruitment/'))failures.push(kind+' recruiter navigation failed');
   }
   await page.goto(base+'/recruitment/',{waitUntil:'domcontentloaded',timeout:25000});
   await page.screenshot({path:'site-audit-images/recruitment-'+kind+'.png',fullPage:true});
   for(const phrase of [/public (mobile-)?app release is (in preparation|being prepared)/i,/app will be released soon/i,/not yet open for enrollment/i,/before paid recruiting is activated/i]){
     const pageText=await page.locator('main').innerText();
     if(phrase.test(pageText))failures.push(kind+' stale recruitment wording '+phrase);
   }

   const recruiterLinks=await page.locator('main a[href="/recruiters/portal/"]').count();
   console.log('BROWSER',kind,'recruitment portal actions',recruiterLinks);
   if(recruiterLinks!==1)failures.push(kind+' expected one private Recruiter sign-in, got '+recruiterLinks);
   await page.locator('main a[href="/recruiters/portal/"]').first().click();
   if(!page.url().endsWith('/recruiters/portal/'))failures.push(kind+' recruiter sign-in link failed');
   const email=page.locator('#recruiter-email');
   if(!await email.isVisible())failures.push(kind+' recruiter email input not visible');
   await page.screenshot({path:'site-audit-images/recruiter-portal-'+kind+'.png',fullPage:true});

   // No invitation or payment mutation: check code handling on a deliberately fake local code.
   await page.goto(base+'/join/?r=FAKECODE01&role=operator',{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForFunction(()=>document.getElementById('join-referral-code')?.textContent==='FAKECODE01');
   if(!await page.locator('#join-copy').isVisible())failures.push(kind+' referral copy action not available for valid-form code');
   if(!page.url().endsWith('/join/'))failures.push(kind+' sensitive referral query left in browser URL');
   await page.goto(base+'/join/',{waitUntil:'domcontentloaded',timeout:25000});
   await page.screenshot({path:'site-audit-images/join-'+kind+'.png',fullPage:true});
   if(!await page.locator('#join-referral-code').count())failures.push(kind+' referral-code display missing');
   for(const e of errors)console.log('BROWSER_CONSOLE_ERROR',kind,e.slice(0,300));
  }catch(e){failures.push(kind+' '+String(e.message).slice(0,240));}
  await context.close();
 }
 await b.close();console.log('LIVE_BROWSER_AUDIT',JSON.stringify({failures}));if(failures.length)process.exitCode=1;
}
(process.argv[2]==='browser'?browser():http()).catch(e=>{console.error('AUDIT_FATAL',e.stack);process.exitCode=1;});
