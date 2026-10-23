// Incoming verified referral URL. The app never treats a click as a reward.
// This small handoff works with existing sign-up; no new fields or code entry.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useAuth } from '../src/state/AuthContext';
import { savePendingInvite, clearPendingInvite } from '../src/backend/referralPending';
import { recordInvitation, type InviteRole } from '../src/backend/referrals';
import { colors } from '../src/theme';

export default function JoinFromInvitation(){
  const params=useLocalSearchParams<{r?:string;role?:string}>();
  const router=useRouter(), {user,initializing,onboarding}=useAuth();
  useEffect(()=>{
    if(initializing)return;
    let live=true;
    (async()=>{
      const code=typeof params.r==='string'?params.r.toUpperCase():'';
      const role:InviteRole=params.role==='operator'?'operator':'traveler';
      const saved=await savePendingInvite(code,role);
      if(!live)return;
      if(saved&&user&&!onboarding){
        const result=await recordInvitation(code,role);
        if(!live)return;
        if(result!=='retry')await clearPendingInvite();
        if(!live)return;
        // Existing Traveler-to-Operator remains the ordinary qualified workflow.
        router.replace(role==='operator'?'/operator/qualify':'/');
      }else{
        router.replace('/');
      }
    })();
    return()=>{live=false;};
  },[params.r,params.role,user?.uid,initializing,onboarding,router]);
  return <View style={{flex:1,backgroundColor:colors.bg}}/>;
}
