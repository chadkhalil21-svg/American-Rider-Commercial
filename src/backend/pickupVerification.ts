import { auth } from '../firebase';
import { PAYMENT_SERVER_URL } from '../config';

type Status = { enabled: boolean; required: boolean; verified: boolean };
async function request(path:string, method: 'GET'|'POST'='GET', body?: unknown) {
  const token=await auth.currentUser?.getIdToken();
  if(!token)throw Error('sign_in_required');
  const res=await fetch(PAYMENT_SERVER_URL+path,{
    method, headers:{ Authorization:`Bearer ${token}`,
      ...(method==='POST'?{'Content-Type':'application/json'}:{}) },
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(String(data?.code||'pickup_verification_unavailable'));
  return data;
}

// No non-secret Travel-Number formula exists in the client.
export async function travelerPickupCode(rideId:string):Promise<Status&{pin:string|null}>{
  const x=await request('/travel/pickup/code?rideId='+encodeURIComponent(rideId));
  return {enabled:x.enabled===true,required:x.required===true,
    verified:x.verified===true,pin:/^\d{4}(?:\d{2})?$/.test(String(x.pin||''))?x.pin:null};
}
export async function operatorPickupStatus(rideId:string):Promise<Status>{
  const x=await request('/travel/adult-pickup/status?rideId='+encodeURIComponent(rideId));
  return {enabled:x.enabled===true,required:x.required===true,verified:x.verified===true};
}
export async function verifyOperatorPickupCode(rideId:string,pin:string):Promise<boolean>{
  const x=await request('/travel/adult-pickup/verify','POST',{rideId,pin});
  return x.verified===true;
}
