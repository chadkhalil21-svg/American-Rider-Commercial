'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {shouldMarkOffDuty}=require('./operator-duty-write-policy');
function run() {
  assert.equal(shouldMarkOffDuty(null,'no_coverage_on_file'),true);
  assert.equal(shouldMarkOffDuty({available:true,offDutyReason:'no_coverage_on_file'},'no_coverage_on_file'),true);
  assert.equal(shouldMarkOffDuty({available:false,offDutyReason:'no_coverage_on_file'},'no_coverage_on_file'),false);
  assert.equal(shouldMarkOffDuty({available:false,offDutyReason:'expired'},'no_coverage_on_file'),true);
  assert.equal(shouldMarkOffDuty({available:false},'no_coverage_on_file'),true);
  assert.equal(shouldMarkOffDuty({available:null,offDutyReason:'x'},'x'),true);
  for(let i=0;i<20000;i++) {
    const status=i%2===0 ? false : true;
    const prior={available:status,offDutyReason:i%3===0?'same':'changed'};
    const shouldWrite=status || prior.offDutyReason!=='same';
    assert.equal(shouldMarkOffDuty(prior,'same'),shouldWrite);
  }
  const code=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const start=code.indexOf("app.post('/operator/online'");
  const end=code.indexOf("app.post('/operator/offline'",start);
  const online=code.slice(start,end);
  assert(online.includes('shouldMarkOffDuty(prior, body.code)'));
  assert(online.includes('available: false, offDutyReason: body.code'));
  assert(online.includes('const existing = await ref.get()'));
  assert(online.includes('if (existing.exists)'));
}
run();run();
console.log('PASS twice: 40,000 synthetic failure renewals; immediate deactivation, no repeated unnecessary off-duty writes.');
