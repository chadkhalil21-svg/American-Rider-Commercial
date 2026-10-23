// Minimal referral API. The server owns invite identity and is OFF by default.
// No contact permissions, email harvesting or money transfer on this client.
import { PAYMENT_SERVER_URL } from '../config';
import { auth } from '../firebase';
export type InviteRole='traveler'|'operator';
const deadline=async (url:string, method:'GET'|'POST',body?:Record<string,string>)=>{
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),10_000);
  try{
    const token=await auth.currentUser?.getIdToken();
    if(!token)return null;
    const res=await fetch(url,{method,signal:ctrl.signal,
      headers:{'Authorization':`Bearer ${token}`,
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    const data=await res.json().catch(()=>null);
    return {status:res.status,data};
  }catch{return null;}finally{clearTimeout(timeout);}
};
export async function personalInvitation(role:InviteRole):Promise<string|null>{
  const out=await deadline(`${PAYMENT_SERVER_URL}/referrals/share?role=${role}`,'GET');
  const url=out?.status===200?out.data?.url:null;
  return typeof url==='string'&&
    /^https:\/\/americanrider\.app\/join\?r=[0-9A-F]{24}&role=(traveler|operator)$/.test(url)?url:null;
}
export async function recordInvitation(code:string,role:InviteRole):Promise<'recorded'|'finished'|'retry'>{
  const out=await deadline(`${PAYMENT_SERVER_URL}/referrals/claim`,'POST',{code,role});
  if(!out||out.status>=500)return 'retry';
  return out.status===200&&out.data?.recorded===true?'recorded':'finished';
}
