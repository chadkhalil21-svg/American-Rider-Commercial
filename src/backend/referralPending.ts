// A referral waiting through sign-up on THIS device. No contact info or identity
// is stored here; the authenticated server determines eligibility and attribution.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InviteRole } from './referrals';
const KEY='ar:pending-invitation-v1';
const AGE_MS=72*60*60*1000;
export type PendingInvite={code:string;role:InviteRole;at:number};
export async function savePendingInvite(code:string,role:InviteRole):Promise<boolean>{
  if(!/^[A-Z0-9]{8,32}$/.test(code)||!['operator','traveler'].includes(role))
    return false;
  try{
    await AsyncStorage.setItem(KEY,JSON.stringify({code,role,at:Date.now()}));
    return true;
  }catch{return false;}
}
export async function readPendingInvite():Promise<PendingInvite|null>{
  try{
    const raw=await AsyncStorage.getItem(KEY);
    if(!raw)return null;
    const d=JSON.parse(raw);
    if(typeof d?.code==='string'&&/^[A-Z0-9]{8,32}$/.test(d.code)&&
       (d.role==='operator'||d.role==='traveler')&&
       Number.isSafeInteger(d.at)&&d.at<=Date.now()&&Date.now()-d.at<=AGE_MS)
      return {code:d.code,role:d.role,at:d.at};
    await AsyncStorage.removeItem(KEY);
  }catch{}
  return null;
}
export async function clearPendingInvite(){
  try{await AsyncStorage.removeItem(KEY);}catch{}
}
