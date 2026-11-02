'use strict';
// HERE Routing v8 encodes section geometry with Flexible Polyline v1.
// Limited, dependency-free 2D decoder for the already-selected HERE provider.
// Official reference: https://github.com/heremaps/flexible-polyline
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function decodeHerePolyline(text) {
  if(typeof text!=='string'||text.length<3||text.length>60000) return null;
  let at=0;
  function unsigned(){
    let value=0,multiplier=1;
    for(let n=0;n<11&&at<text.length;n++){
      const digit=ALPHABET.indexOf(text[at++]);
      if(digit<0)return null;
      value+=(digit&31)*multiplier;
      if(!Number.isSafeInteger(value))return null;
      if(!(digit&32))return value;
      multiplier*=32;
    }
    return null;
  }
  function signed(v){ return v%2===0?v/2:-(Math.floor(v/2)+1); }
  const version=unsigned(),header=unsigned();
  if(version!==1||header===null) return null;
  const precision=header&15,thirdDimension=(header>>4)&7;
  // No elevation is requested from Routing v8. Fail safely on a 3D response.
  if(precision>10||thirdDimension!==0)return null;
  const factor=10**precision;
  let lat=0,lng=0;
  const coords=[];
  while(at<text.length){
    if(coords.length>=20000)return null;
    const a=unsigned(),b=unsigned();
    if(a===null||b===null)return null;
    lat+=signed(a);lng+=signed(b);
    const p={lat:lat/factor,lng:lng/factor};
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||
      Math.abs(p.lat)>90||Math.abs(p.lng)>180)return null;
    coords.push(p);
  }
  return coords.length>=2?coords:null;
}
module.exports={decodeHerePolyline};
