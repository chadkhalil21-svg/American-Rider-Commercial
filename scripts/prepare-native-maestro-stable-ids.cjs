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
    // Android run 40706775328: Maestro returned tap success while destination
    // remained on Home (the accessibility tree still showed the same button).
    // Maestro's official retryTapIfNoChange handles an unconsumed early tap.
    // Apply ONLY to idempotent destination navigation, never booking or Pay.
    const pairs=[
      ['- tapOn: "Select your destination"','- tapOn:\n    id: "traveler-open-destination"\n    retryTapIfNoChange: true'],
      ['- tapOn: "Search a place or address"','- tapOn:\n    id: "destination-search-input"'],
      ['visible: ".*Wynwood, Estimated travel time.*"','visible:\n      id: "destination-option-wynwood"'],
      ['- tapOn: ".*Wynwood, Estimated travel time.*"','- tapOn:\n    id: "destination-option-wynwood"'],
      ['visible: "Complete Travel Cost"','visible:\n      id: "traveler-quote-ready"'],
      ['text: "Confirm Travel"\n    enabled: true','id: "traveler-confirm-travel"\n    enabled: true'],
      ['- tapOn: "Confirm Travel"','- tapOn:\n    id: "traveler-confirm-travel"'],
    ];
    for(const [a,b] of pairs) result=edit(result,a,b,'traveler');
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
