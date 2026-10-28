'use strict';
// Generate stable-ID Maestro flows at CI runtime without writing test login
// material to CI logs or altering the checked-in fixture identities.
// The originals stay as auditable source fixtures; only generated copies run.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const generated=path.join(root,'.maestro','generated');
const edit=(src,oldValue,newValue,title)=>{
  const matches=src.split(oldValue).length-1;
  assert.equal(matches,1,title+': source selector changed or ambiguous ('+matches+')');
  return src.replace(oldValue,newValue);
};
function generate(role){
  const file=path.join(root,'.maestro','qa-commercial-'+role+'.yml');
  const original=fs.readFileSync(file,'utf8');
  let result=original;
  // Run 40716321434 screenshot showed the welcome form and its actual
  // native auth-email-entry ID while text assertion AMERICAN RIDER failed.
  // Wait for the unique editable control, not a duplicated title rendered
  // in both the underlying screen and the foreground authentication layer.
  // This adjusts QA test startup only; no application runtime is changed.
  result=edit(result,
    '- assertVisible: "AMERICAN RIDER"',
    '- extendedWaitUntil:\n    visible:\n      id: "auth-email-entry"\n    timeout: 60000\n- assertVisible:\n    id: "auth-email-entry"',
    'stable iOS native login readiness');
  // The same screenshot also displayed "American Rider Network — Unreachable".
  // Reject a disconnected app before attempting a synthetic credential or
  // claiming a valid booking. The isolated QA API must become reachable.
  result=edit(result,
    '- assertVisible:\n    id: "auth-email-entry"\n- tapOn:',
    '- assertVisible:\n    id: "auth-email-entry"\n- extendedWaitUntil:\n    notVisible: "American Rider Network — Unreachable"\n    timeout: 60000\n- tapOn:',
    'isolated network readiness before native login');
  if(role==='traveler'){
    const pairs=[
      ['- tapOn: "Select your destination"','- tapOn:\n    id: "traveler-open-destination"'],
      ['- tapOn: "Search a place or address"','- tapOn:\n    id: "destination-search-input"'],
      ['visible: ".*Wynwood, Estimated travel time.*"','visible:\n      id: "destination-option-wynwood"'],
      ['- tapOn: ".*Wynwood, Estimated travel time.*"','- tapOn:\n    id: "destination-option-wynwood"'],
      ['visible: "Complete Travel Cost"','visible:\n      id: "traveler-quote-ready"'],
      ['text: "Confirm Travel"\n    enabled: true','id: "traveler-confirm-travel"\n    enabled: true'],
      ['- tapOn: "Confirm Travel"','- tapOn:\n    id: "traveler-confirm-travel"'],
    ];
    for(const [a,b] of pairs) result=edit(result,a,b,'traveler');
    // Native iOS Stripe TEST row is proven in run 40712660657:
    // screen-hierarchy/step-038-assertCondition-Card_number.json has
    // accessibility identifier (resource-id) "New card", bounds [20,470][382,518].
    // The preceding positional tap returned success but never opened card entry.
    // Wait for the actual native element by ID rather than brittle coordinates
    // or a short-lived conditional check. Retry only this non-payment selector.
    if (result.includes('visible: "Card"')) {
      result=edit(result,
        '- extendedWaitUntil:\n    visible: "Card"\n    timeout: 45000',
        '- extendedWaitUntil:\n    visible:\n      id: "New card"\n    timeout: 45000\n- tapOn:\n    id: "New card"\n    retryTapIfNoChange: true',
        'iOS Stripe native New card accessibility ID');
      result=edit(result,
        '- tapOn: "Card"\n- extendedWaitUntil:\n    visible: "Card number"',
        '- extendedWaitUntil:\n    visible: "Card number"',
        'iOS Stripe require actual card-entry form');
    }
  } else if(role==='operator'){
    const ids=[
      ['Commence Operations','operator-commence-operations'],
      ['Accept Traveler','operator-accept-traveler'],
      ['Confirm Arrival','operator-confirm-arrival'],
      ['Commence Travel','operator-commence-travel'],
      ['Complete Operation','operator-complete-operation'],
    ];
    for(const [label,id] of ids){
      result=edit(result,'visible: "'+label+'"','visible:\n      id: "'+id+'"','operator wait '+id);
      result=edit(result,'- tapOn: "'+label+'"','- tapOn:\n    id: "'+id+'"','operator tap '+id);
    }
  } else throw Error('Unknown native role');
  assert.ok(!result.includes('tapOn: "Wynwood"'));
  assert.ok(!result.includes('- tapOn: "Confirm Travel"'));
  fs.mkdirSync(generated,{recursive:true});
  const out=path.join(generated,'qa-commercial-'+role+'.yml');
  fs.writeFileSync(out,result);
  console.log('PASS: generated stable native ID flow for '+role+' ('+result.length+' bytes)');
}
generate('traveler');
generate('operator');
