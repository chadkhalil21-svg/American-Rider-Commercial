'use strict';
// Repository-wide static protection against a visually active, unwired
// LetterheadBar back arrow. This does NOT certify actual screen transitions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = path.join(__dirname, '..', 'app');
let routes = 0;
let headers = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(filename); continue; }
    if (!/\.tsx$/.test(entry.name)) continue;
    routes++;
    const source = fs.readFileSync(filename, 'utf8');
    for (const found of source.matchAll(/<LetterheadBar\b([^>]*?)\/>/gs)) {
      headers++;
      const props = found[1];
      assert(/\bonBack\s*=|\bonMenu\s*=/.test(props),
        path.relative(app, filename) + ': header renders a Back arrow but provides no handler');
    }
  }
}
for (let pass = 0; pass < 2; pass++) {
  routes = headers = 0;
  walk(app);
  assert(routes >= 50, 'app route inventory unexpectedly incomplete');
  assert(headers >= 30, 'header inventory unexpectedly incomplete');
}
const helper = fs.readFileSync(path.join(__dirname, '..', 'src/components/nav.ts'), 'utf8');
assert(helper.includes('router.canGoBack()') && helper.includes("router.dismissTo('/')"),
  'Back must have a safe cold-entry fallback');
console.log('PASS twice: standard header back/menu handlers present across '+routes+' route files, '+headers+' headers');
