// National market geography engine.
//
// County boundaries and the configured service-region activation set decide service geography.
// A county does not require a separate evidence or admission approval to sell Travel.
// Unknown counties and regions remain outside the service area.
//
// Boundary packages are Census county datasets placed in backend/markets/*-counties.json.
// Adding Texas, California, or another jurisdiction is data ingestion, not a code fork.
const fs=require('node:fs');
const path=require('node:path');
const {regionById,regionFor,REGIONS}=require('./regions');
const {readKey}=require('./env');
const SHORE_M=100;
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function boundaryPackages(){
 return fs.readdirSync(path.join(__dirname,'markets'))
  .filter(x=>/-counties\.json$/.test(x)).sort()
  .map(x=>require(path.join(__dirname,'markets',x)));
}
function regionForCounty(state,fips,name){
 return REGIONS.find(r=>r.state===state && (
   (Array.isArray(r.marketFips)&&r.marketFips.includes(fips)) ||
   (Array.isArray(r.counties)&&r.counties.includes(name))
 ))||null;
}
function buildMarkets(){
 const founderClosed = new Set(String(readKey('FOUNDER_CLOSED_FLORIDA_MARKETS')||'')
   .split(',').filter(x=>/^fl-[a-z0-9-]+$/.test(x)));
 const overrides={};
 for(const pair of String(readKey('MARKET_STATUS')||'').split(',')){const [id,st]=pair.split(':');if(id&&['active','waitlist'].includes(st))overrides[id]=st;}
 const out=[];
 for(const pack of boundaryPackages()){
  const state=String(pack.state||'').toUpperCase();
  for(const c of pack.counties||[]){
   const r=regionForCounty(state,c.fips,c.name);
   const id=`${state.toLowerCase()}-${slug(c.name)}`;
   let status=r&&Array.isArray(r.activeMarketFips)&&r.activeMarketFips.includes(c.fips)?'active':'waitlist';
   if(overrides[id]){
    if(overrides[id]==='active'&&!(r&&Array.isArray(r.marketFips)&&r.marketFips.includes(c.fips)))console.error(`[markets] activation refused: ${id} has no configured service region`);
    else status=overrides[id];
   }
   // Florida geographic discovery is statewide; paid Travel is served only in an
   // active, configured service region. Founder closures can withdraw county service.
   const founderClosedHere=state==='FL'&&founderClosed.has(id);
   if(founderClosedHere)status='waitlist';
   const geographicallyAvailable=state==='FL'&&!founderClosedHere;
   out.push(Object.freeze({id,name:`${c.name} County`,county:c.name,state,fips:c.fips,
      regionId:r?.id||null,status,geographicallyAvailable,
      geographicStatus:state==='FL'?(founderClosedHere?'closed':'open'):'unconfigured',
      geometry:c.geometry}));
  }
 }
 return out;
}
let _cache=null,_key=null;
function markets(){const key=(readKey('MARKET_STATUS')||'')+'|'+(readKey('FOUNDER_CLOSED_FLORIDA_MARKETS')||'');if(!_cache||key!==_key){_cache=buildMarkets();_key=key;}return _cache;}
const isCoord=p=>!!p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
function inRing(x,y,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(yi>y!==yj>y&&x<((xj-xi)*(y-yi))/(yj-yi)+xi)c=!c;}return c;}
const polygons=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
function contains(g,x,y){return polygons(g).some(poly=>inRing(x,y,poly[0])&&!poly.slice(1).some(h=>inRing(x,y,h)));}
function distanceKm(g,x,y){const k=Math.cos(y*Math.PI/180);let best=Infinity;for(const poly of polygons(g))for(const ring of poly)for(let i=1;i<ring.length;i++){const ax=(ring[i-1][0]-x)*k,ay=ring[i-1][1]-y,bx=(ring[i][0]-x)*k,by=ring[i][1]-y,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy)*111.32);}return best;}
function marketFor(p){if(!isCoord(p))return null;const x=Number(p.lng),y=Number(p.lat),all=markets();const hit=all.find(m=>contains(m.geometry,x,y));if(hit)return hit;const near=all.filter(m=>distanceKm(m.geometry,x,y)*1000<=SHORE_M);return near.length===1?near[0]:null;}
const marketStatus=p=>marketFor(p)?.status==='active'?'active':'waitlist';
const servesPoint=p=>marketStatus(p)==='active';
function tripOutsideMarkets(pickup,dest){
 const m=marketFor(pickup), pickupOk=m?.status==='active', r=pickupOk?regionById(m.regionId):null;
 // Endpoint labels are independent: an invalid pickup is "pickup" even when the destination
 // would be serviceable from some other origin. Only classify both when neither endpoint can
 // participate in any configured service region.
 const destRegion=regionFor(dest);
 if(!pickupOk){
   const pickupRegion=regionFor(pickup);
   return !pickupRegion && !destRegion ? 'both' : 'pickup';
 }
 return destRegion?.id===r.id ? null : 'destination';
}
function listMarkets(){return markets().filter(m=>m.geographicallyAvailable||m.status==='active'||m.regionId)
  .map(({id,name,state,fips,regionId,status,geographicallyAvailable,geographicStatus})=>
    ({id,name,state,fips,regionId,status,geographicallyAvailable,geographicStatus}));}
module.exports={marketFor,marketStatus,servesPoint,tripOutsideMarkets,listMarkets,markets,SHORE_M,boundaryPackages};
