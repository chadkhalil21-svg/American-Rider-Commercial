'use strict';
// Family navigation is discoverable from both entry points, but authorization
// remains server-owned. This test does not send invites, email, or travel.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
for(let pass=0;pass<2;pass++){
 const home=file('app/index.tsx');
 const menu=file('app/account.tsx');
 const family=file('app/family.tsx');
 const server=file('backend/server.js');
 assert.match(home,/label:\s*t\('traveler\.familyTitle'\),\s*onPress:\s*\(\)\s*=>\s*go\('\/family'\)/,
  'Home navigation must expose Family without another page');
 assert.match(menu,/title:\s*t\('traveler\.familyTitle'\),\s*onPress:\s*\(\)\s*=>\s*router\.navigate\('\/family'\)/,
  'Account menu must expose the same Family route');
 assert.match(family,/createFamilyInvite/,'guardian invitation creator exists');
 assert.match(family,/acceptFamilyInvite/,'Teen acceptance exists');
 assert.match(family,/revokeFamilyLink/,'guardian revocation exists');
 assert.match(server,/app\.post\('\/family\/invite',\s*requireAuth,\s*requireVerifiedEmail/,
  'server must require authenticated verified email for guardian invitation');
 assert.match(server,/app\.post\('\/family\/invite\/:id\/accept',\s*requireAuth,\s*requireVerifiedEmail/,
  'server must verify Teen account before acceptance');
 for(const lang of ['en','es','fr','de','it'])
   assert.match(file('src/i18n/'+lang+'.ts'),/familyTitle:\s*['"`]/,'Family label required in '+lang);
}
console.log('PASS twice: Family entrypoints, verified-email invite and acceptance, revocation; no provider calls');
