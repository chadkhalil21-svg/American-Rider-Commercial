'use strict';
const assert=require('node:assert/strict');
const {markets,listMarkets,marketFor}=require('./markets');
const source=require('./markets/fl-counties.json');
const counties=markets().filter(x=>x.state==='FL');
const listed=listMarkets().filter(x=>x.state==='FL');
assert.equal(source.counties.length,67,'complete Census Florida boundary package');
assert.equal(counties.length,67,'all 67 Florida counties are loaded');
assert.equal(listed.length,67,'all counties appear in Florida discovery');
assert.equal(counties.filter(x=>x.geographicallyAvailable).length,67);
assert.equal(listed.filter(x=>x.geographicallyAvailable).length,67);
for(const c of counties) assert.ok(listed.some(x=>x.id===c.id));
for(const [city,pt,county] of [
 ['Miami',{lat:25.7617,lng:-80.1918},'fl-miami-dade'],
 ['Orlando',{lat:28.5383,lng:-81.3792},'fl-orange'],
 ['Tampa',{lat:27.9506,lng:-82.4572},'fl-hillsborough'],
 ['Jacksonville',{lat:30.3322,lng:-81.6557},'fl-duval'],
 ['Naples',{lat:26.142,lng:-81.7948},'fl-collier'],
 ['Key West',{lat:24.5551,lng:-81.78},'fl-monroe'],
]) {
 const m=marketFor(pt);
 assert.equal(m?.id,county,city);
 assert.equal(m?.geographicallyAvailable,true,city+' geographically discoverable');
}
assert.equal(counties.filter(x=>x.status==='active').length,3,
 'paid market configuration and geographic availability are independent');
console.log('PASS: all 67 Florida counties geographically available, three existing service configurations unaffected');
