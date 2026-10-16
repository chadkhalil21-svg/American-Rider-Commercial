'use strict';
// Prelaunch public copy: do not advertise an unavailable Smart Travel product or
// an unverified historical price. No network, users, funds or provider access.
const assert = require('node:assert/strict');
const { HOME_HTML, TRAVEL_HTML, SMART_HTML } = require('./site');
for (let pass = 0; pass < 2; pass++) {
  for (const html of [HOME_HTML, TRAVEL_HTML, SMART_HTML]) {
    assert.match(html, /Smart Travel/, 'retain the named feature for future launch');
    assert.match(html, /Currently unavailable/, 'public pages must state the actual hold');
    assert.doesNotMatch(html, /Brickell to Dadeland|\$21\.75|\$25\.83|Platform fee<\/span><span class="amount">\$1\.50/,
      'no old or unverified illustrative price');
  }
  assert.match(SMART_HTML, /ordinary\s+American Rider Travel/,
    'show available normal Travel as the alternative');
  const backend = require('node:fs').readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');
  const route = backend.split("app.post('/smart-quote'")[1]?.split("app.post('/smart-revalidate'")[0];
  assert.ok(route && !route.includes('await smartQuote('),
    'publicly unavailable Smart must not make planning requests');
}
console.log('PASS twice: truthful public Smart Travel availability and no obsolete fare claim');
