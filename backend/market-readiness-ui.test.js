'use strict';
const assert=require('node:assert/strict');
const {geographyMarketPage}=require('./market-readiness-ui');
const names=[{id:'fl-miami-dade',name:'<Miami & Dade>',status:'active'},
  {id:'fl-broward',name:'Broward',status:'active'},
  {id:'fl-palm-beach',name:'Palm Beach',status:'active'},
  {id:'fl-monroe',name:'Monroe',status:'waitlist'}];
const html=geographyMarketPage(names);
assert.match(html,/3 active counties/);
assert.match(html,/&lt;Miami &amp; Dade&gt;/);
assert.doesNotMatch(html,/<Miami & Dade>/);
assert.match(html,/Open for Travel/);
assert.match(html,/Outside active service area/);
assert.doesNotMatch(html,/form[^>]*evidence|manifestVersion|Activate selected|market_admission/i);
console.log('PASS geographic Operations status does not present county admission approvals');
