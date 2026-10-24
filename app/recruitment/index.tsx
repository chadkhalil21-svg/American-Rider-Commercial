import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Share, StyleSheet, View} from 'react-native';
import {useRouter} from 'expo-router';
import {Text} from '../../src/components/AppText';
import {Card, LetterheadBar, Screen, Title, Sub} from '../../src/components/UI';
import {useAuth} from '../../src/state/AuthContext';
import {auth} from '../../src/firebase';
import {PAYMENT_SERVER_URL} from '../../src/config';
import {colors} from '../../src/theme';

// Independent Recruiter workspace. No commissions or bank onboarding are
// represented until the verified backend authorizes them. No other account's
// referrals or sensitive identities are fetched into the device.
type Summary={
  ok:boolean;
  status?:string;
  counts?:{operatorIntroductions:number;travelerIntroductions:number};
  linksAvailable?:boolean;
  bankSetup?:string;
  compensation?:string;
};
export default function RecruitmentWorkspace(){
  const router=useRouter();
  const {user,initializing}=useAuth();
  const [loading,setLoading]=useState(true);
  const [details,setDetails]=useState<Summary|null>(null);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    (async()=>{
      if(initializing)return;
      if(!user){if(active)setLoading(false);return;}
      try{
        const token=await user.getIdToken();
        const res=await fetch(PAYMENT_SERVER_URL+'/recruiters/me',{
          headers:{Authorization:'Bearer '+token},
        });
        const body=await res.json().catch(()=>null);
        if(active){setDetails(res.ok?body:null);
          setNotice(res.status===404?'An invitation is required to enter the recruitment program.':
            res.ok?'':'This service is momentarily unavailable. Please try again.');}
      }catch{if(active)setNotice('Your recruitment information is unavailable. Please try again.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[initializing,user?.uid]);
  const share=async(role:'operator'|'traveler')=>{
    if(!user||!details?.linksAvailable)return;
    try{
      const token=await user.getIdToken(true);
      const r=await fetch(PAYMENT_SERVER_URL+'/recruiters/link?role='+role,{
        headers:{Authorization:'Bearer '+token},
      });
      const body=await r.json().catch(()=>null);
      if(!r.ok||typeof body?.url!=='string'||!body.url.startsWith('https://americanrider.tech/join?')){
        setNotice('Personal links are not available until account verification is complete.');return;
      }
      await Share.share({message:body.url});
    }catch{setNotice('The invitation could not be shared. Please try again.');}
  };
  return <Screen>
    <LetterheadBar onBack={()=>router.back()}/>
    <Title>Recruitment</Title>
    <Sub>A considered introduction to American Rider.</Sub>
    {loading?<ActivityIndicator accessibilityLabel="Loading your recruitment information" color={colors.ink}/>:
    !user?<Text style={styles.note}>Sign in with your verified account to review your recruitment information.</Text>:
    !details?<Text style={styles.note}>{notice||'Recruitment is not yet available.'}</Text>:
    <>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>YOUR RELATIONSHIP</Text>
        <Text style={styles.heading}>{details.status==='approved'?'Approved':
          details.status==='pending_review'?'Under review':
          details.status==='suspended'?'Suspended':'Not currently active'}</Text>
        <Text style={styles.note}>Introductions are recorded against your verified account. They do not establish Operator eligibility or compensation.</Text>
      </Card>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>YOUR INTRODUCTIONS</Text>
        <View style={styles.line}><Text style={styles.name}>Operator introductions</Text>
          <Text style={styles.value}>{details.counts?.operatorIntroductions??0}</Text></View>
        <View style={styles.line}><Text style={styles.name}>Traveler introductions</Text>
          <Text style={styles.value}>{details.counts?.travelerIntroductions??0}</Text></View>
        <Text style={styles.note}>Verified Operators and qualifying Travels will appear only after independent eligibility checks.</Text>
      </Card>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>PERSONAL INVITATIONS</Text>
        <Text style={styles.note}>Your personal referral links become available once enrollment, disclosures and app-link verification are complete.</Text>
        <Pressable accessibilityRole="button" disabled={!details.linksAvailable}
          onPress={()=>share('operator')} style={[styles.button,!details.linksAvailable&&styles.disabled]}>
          <Text style={styles.buttonLabel}>Invite an Operator</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!details.linksAvailable}
          onPress={()=>share('traveler')} style={[styles.button,!details.linksAvailable&&styles.disabled]}>
          <Text style={styles.buttonLabel}>Invite a Traveler</Text></Pressable>
      </Card>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>COMPENSATION</Text>
        <Text style={styles.note}>Compensation and bank enrollment are not yet available. Any future terms will be governed by a signed agreement and verified payment arrangements. Never send bank or tax information by email.</Text>
      </Card>
      {!!notice&&<Text style={styles.note}>{notice}</Text>}
    </>}
  </Screen>;
}
const styles=StyleSheet.create({
  panel:{marginTop:18,padding:20},
  eyebrow:{fontSize:11,letterSpacing:1.5,color:colors.muted,fontWeight:'600'},
  heading:{fontSize:22,fontWeight:'600',color:colors.ink,marginTop:14,marginBottom:10},
  line:{marginTop:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  name:{fontSize:15,color:colors.ink},
  value:{fontSize:19,fontWeight:'600',color:colors.ink},
  note:{fontSize:13,color:colors.muted,lineHeight:20,marginTop:12},
  button:{backgroundColor:colors.solid,padding:14,borderRadius:12,marginTop:14,alignItems:'center'},
  disabled:{opacity:.35},
  buttonLabel:{color:colors.solidFg,fontWeight:'600',fontSize:14},
});
