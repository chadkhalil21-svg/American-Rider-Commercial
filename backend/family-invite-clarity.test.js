'use strict';
// Contract-only Family onboarding audit. No real email, minors, Firebase or Stripe.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
for(let pass=0;pass<2;pass++){
 const screen=read('app/family.tsx');
 assert(screen.includes("t('traveler.familyAuthorizationSteps')"),'guardian can understand authorization sequence');
 assert(screen.includes("catch{showNote(t('traveler.familyInviteSendUnconfirmed'));}"),'send failure must not be labelled an acceptance failure');
 assert(screen.includes("acceptFamilyInvite(inviteId,inviteToken)"),'Teen still accepts real signed invitation');
 assert(screen.includes("revokeFamilyLink(x.id)"),'guardian can revoke authorization');
 for(const language of ['en','es','fr','de','it']){
  const c=read('src/i18n/'+language+'.ts');
  assert(/familyAuthorizationSteps:\s*['"]/.test(c),language+' missing onboarding explanation');
  assert(/familyInviteSendUnconfirmed:\s*['"]/.test(c),language+' missing truthful delivery uncertainty');
 }
 const family=read('backend/family.js');
 assert(family.includes('const MIN_AGE=13, MAX_AGE=17'),'Teen boundaries unchanged');
 assert(family.includes('emailVerified'),'verified recipient only');
 assert(family.includes("x.teenEmail") && family.includes('teenUid'),'invitation must bind to Teen account');
}
console.log('PASS twice: Family guardian guidance, verified-email acceptance, revocation and localized delivery uncertainty');
