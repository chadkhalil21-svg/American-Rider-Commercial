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
    // iOS run 40706419985: PaymentSheet visibly contains a "New card" row
    // at y ~= 57% of the fixed iPhone 17 Pro QA simulator, but Stripe's native
    // modal is absent from the Maestro accessibility snapshot. Text selectors
    // falsely fail against the underlying app. Official Maestro tapOn supports
    // positional taps for non-accessible elements. This is an iOS QA-only
    // interaction fallback, NOT a payment success assertion or production edit.
    // Strictly require "Card number" after the tap, before entering TEST data.
    if (result.includes('visible: "Card"')) {
      result=edit(result,
        '- extendedWaitUntil:\\n    visible: "Card"\\n    timeout: 45000',
        '- tapOn:\\n    point: "50%,57%"',
        'iOS Stripe card row behind native accessibility boundary');
      result=edit(result,
        '- tapOn: "Card"\\n- extendedWaitUntil:\\n    visible: "Card number"',
        '- extendedWaitUntil:\\n    visible: "Card number"',
        'iOS Stripe card entry requires actual card form');
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
