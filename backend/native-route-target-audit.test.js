'use strict';
// Navigation actions that look live must link to actual Expo Router screens.
// Dynamic route expressions still require signed-device checks.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=path.join(__dirname,'../app');
function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const filename=path.join(dir,entry.name);
    return entry.isDirectory()?files(filename):
      /\.tsx$/.test(entry.name)?[filename]:[];
  });
}
const all=files(app);
const available=new Set(all.map(f=>{
  const relative=path.relative(app,f).replace(/\\/g,'/');
  return '/'+relative.replace(/\.(ios|android|web)\.tsx$/,'').replace(/\.tsx$/,'')
    .replace(/\/index$/,'');
}));
available.add('/');
let visited=0,links=0;
for(const file of all){
  visited++;
  const source=fs.readFileSync(file,'utf8');
  const reg=/router\.(?:navigate|push|replace|dismissTo)\(\s*['"]([^'"]+)['"]|pathname:\s*['"]([^'"]+)['"]/g;
  for(const match of source.matchAll(reg)){
    const target=match[1]||match[2];
    if(!target.startsWith('/')) continue;
    links++;
    assert(available.has(target),
      path.relative(app,file)+': unknown Expo Router destination '+target);
  }
}
assert(visited>=59,'Audit unexpectedly lost app screens');
assert(links>=100,'Audit unexpectedly lost navigation destinations');
console.log('PASS: '+links+' literal native navigation references across '+visited+
 ' app screens point to real routes; dynamic routes require device checks.');
