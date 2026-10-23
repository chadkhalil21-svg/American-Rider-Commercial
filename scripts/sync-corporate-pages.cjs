'use strict';
// Keep the static corporate mirror byte-for-byte aligned to backend route HTML.
// Run: node scripts/sync-corporate-pages.cjs        (write)
// Run: node scripts/sync-corporate-pages.cjs --check (read-only CI)
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {HOME_HTML,OPERATE_HTML,TRAVEL_HTML,SAFETY_HTML,SUPPORT_HTML,SMART_HTML}=require('../backend/site');
const {ABOUT_HTML}=require('../backend/legal');
const pages=[
  ['index.html',HOME_HTML],
  ['operate/index.html',OPERATE_HTML],
  ['travel/index.html',TRAVEL_HTML],
  ['safety/index.html',SAFETY_HTML],
  ['support/index.html',SUPPORT_HTML],
  ['smart-travel/index.html',SMART_HTML],
  ['about/index.html',ABOUT_HTML],
];
const check=process.argv.includes('--check');
const missing=[];
for(const [relative,html] of pages){
  const file=path.join(root,'legal',relative);
  if(check){
    if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==html)missing.push(relative);
  }else{
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,html,'utf8');
  }
}
if(missing.length){console.error('Static corporate pages differ from backend: '+missing.join(', '));process.exitCode=1;}
else console.log('PASS: seven static corporate pages '+(check?'match':'regenerated from')+' backend source');
