"use strict";
// Source-only corporate website acceptance. No cloud deploy, payments or live mail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname,"..");
execFileSync(process.execPath,[path.join(__dirname,"build-corporate-website.cjs")],{stdio:"inherit"});
const root = path.join(repo,"dist-corporate");
const page = (p="") => fs.readFileSync(path.join(root,p,"index.html"),"utf8");
const pages=["","travel","operate","safety","company","support","recruitment","smart-travel","join","terms","privacy","account-deletion"];
for (const route of pages) {
  const html=page(route);
  assert.match(html,/<!doctype html>/i,route+" HTML");
  assert.match(html,/<main id="main">/,route+" semantic main");
  assert.match(html,/<h1\b/,route+" heading");
  assert.match(html,/<title>/,route+" document title");
  assert.match(html,/americanrider\.tech/,route+" canonical domain");
  assert.doesNotMatch(html,/americanrider\.app/,route+" must not publish old .app domain");
  assert.match(html,/href="\/assets\/site.css"/,route+" shared CSS");
}
const home=page();
assert.match(home,/A national transportation platform\./);
assert.match(home,/SAFE\.<\/span><span>RELIABLE\.<\/span><span>AMERICAN\./);
assert.match(home,/99%/);
assert.match(home,/beginning in select markets|begin in select areas/i);
assert.doesNotMatch(home,/Book now|Book a ride now|Reserve now/i,"no fictitious booking");
const recruiter=page("recruitment");
assert.match(recruiter,/Email Recruitment Relations/);
assert.match(recruiter,/mailto:relations@americanrider\.tech\?subject=Independent%20recruiter%20inquiry/);
assert.match(recruiter,/not yet open for enrollment/);
assert.match(recruiter,/No commission rate, payment date, or payout provider/);
assert.doesNotMatch(recruiter,/Friday payouts|Apply now|Join today/i);
const support=page("support");
for(const address of ["support@americanrider.tech","relations@americanrider.tech","insurance@americanrider.tech"]) assert.ok(support.includes(address));
const operator=page("operate");
assert.match(operator,/99%/);
assert.match(operator,/starts at \$2\.50/);
for(const lang of ["es","fr","it","de"]){
 for(const doc of ["terms","privacy"]){
   const html=page(doc+"/"+lang);
   assert.match(html,new RegExp('<html lang="'+lang+'">'));
   assert.doesNotMatch(html,/americanrider\.app/);
 }
}
for(const p of ["favicon.svg","assets/site.css","sitemap.xml","robots.txt"]) assert.ok(fs.existsSync(path.join(root,p)),p+" exists");
const css=fs.readFileSync(path.join(root,"assets/site.css"),"utf8");
assert.match(css,/@media\(max-width:700px\)/);
assert.match(css,/focus-visible/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/\.credo/);
assert.ok(!fs.existsSync(path.join(root,".env")),"no server secrets in site");
console.log("PASS: corporate website, recruitment, accessible CSS, local legal pages, and domain truth");
