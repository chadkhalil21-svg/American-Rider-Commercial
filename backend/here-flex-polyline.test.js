'use strict';
const assert=require('node:assert/strict');
const {decodeHerePolyline}=require('./here-flex-polyline');
const p=decodeHerePolyline('BFoz5xJ67i1B1B7PzIhaxL7Y');
const expected=[
 [50.1022829,8.6982122],[50.1020076,8.6956695],
 [50.1006313,8.6914960],[50.0987800,8.6875156]
];
assert.equal(p.length,4);
expected.forEach(([lat,lng],i)=>{
 assert(Math.abs(p[i].lat-lat)<.00002,'latitude '+i);
 assert(Math.abs(p[i].lng-lng)<.00002,'longitude '+i);
});
for(const bad of ['',null,'BA','BFA','BF!','AFA','BF_____bad',
 'A'.repeat(60001)])assert.equal(decodeHerePolyline(bad),null);
console.log('PASS HERE official Flexible Polyline 2D fixture, valid geo points, malformed and unbounded data rejected');
