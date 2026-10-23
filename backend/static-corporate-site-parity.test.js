'use strict';
// Both copies of the public site must avoid superseded fees and unavailable features.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {HOME_HTML,OPERATE_HTML,TRAVEL_HTML,SMART_HTML}=require('./site');
const {ABOUT_HTML}=require('./legal');
const pages=[
  ['index.html',HOME_HTML,'Travel,'],
  ['operate/index.html',OPERATE_HTML,'99%'],
  ['about/index.html',ABOUT_HTML,'One all-in Total'],
  ['travel/index.html',TRAVEL_HTML,'Currently unavailable'],
  ['smart-travel/index.html',SMART_HTML,'Currently unavailable'],
];
for(const [file,served,key] of pages){
  const html=fs.readFileSync(path.join(__dirname,'../legal',file),'utf8');
  assert.match(html,/<html lang="en">/);
  assert.ok(html.includes(key),file+' missing '+key);
  assert.ok(served.includes(key),file+' backend drift');
  assert.equal(html,served,file+' must byte-match canonical backend-generated page');
  for(const old of ['$1.50 or 5%','Brickell to Dadeland','$26.00']){
    assert.ok(!html.includes(old),file+' still claims '+old);
  }
}
console.log('PASS: static and backend corporate site pages agree on current fares and availability');
