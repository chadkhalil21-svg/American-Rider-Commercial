import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Share, StyleSheet, View} from 'react-native';
import {useRouter} from 'expo-router';
import {Text} from '../../src/components/AppText';
import {Card, LetterheadBar, Screen, Title, Sub} from '../../src/components/UI';
import {useAuth} from '../../src/state/AuthContext';
import {useLanguage} from '../../src/state/LanguageContext';
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
  const {t}=useLanguage();
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
          setNotice(res.status===404?t('recruiter.invitationRequired'):
            res.ok?'':t('recruiter.serviceUnavailable'));}
      }catch{if(active)setNotice(t('recruiter.infoUnavailable'));}
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
        setNotice(t('recruiter.linksUnavailable'));return;
      }
      await Share.share({message:body.url});
    }catch{setNotice(t('recruiter.shareFailed'));}
  };
  return <Screen>
    <LetterheadBar onBack={()=>router.back()}/>
    <Title>{t('recruiter.title')}</Title>
    <Sub>{t('recruiter.subtitle')}</Sub>
    {loading?<ActivityIndicator accessibilityLabel={t('recruiter.loading')} color={colors.ink}/>:
    !user?<Text style={styles.note}>{t('recruiter.signIn')}</Text>:
    !details?<Text style={styles.note}>{notice||t('recruiter.programClosed')}</Text>:
    <>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>{t('recruiter.relationship')}</Text>
        <Text style={styles.heading}>{details.status==='approved'?t('recruiter.approved'):
          details.status==='pending_review'?t('recruiter.pendingReview'):
          details.status==='suspended'?t('recruiter.suspended'):t('recruiter.inactive')}</Text>
        <Text style={styles.note}>{t('recruiter.relationshipNote')}</Text>
      </Card>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>{t('recruiter.introductions')}</Text>
        <View style={styles.line}><Text style={styles.name}>{t('recruiter.operatorIntroductions')}</Text>
          <Text style={styles.value}>{details.counts?.operatorIntroductions??0}</Text></View>
        <View style={styles.line}><Text style={styles.name}>{t('recruiter.travelerIntroductions')}</Text>
          <Text style={styles.value}>{details.counts?.travelerIntroductions??0}</Text></View>
        <Text style={styles.note}>{t('recruiter.countsNote')}</Text>
      </Card>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>{t('recruiter.personalInvitations')}</Text>
        <Text style={styles.note}>{t('recruiter.personalLinksNote')}</Text>
        <Pressable accessibilityRole="button" disabled={!details.linksAvailable}
          onPress={()=>share('operator')} style={[styles.button,!details.linksAvailable&&styles.disabled]}>
          <Text style={styles.buttonLabel}>{t('recruiter.inviteOperator')}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!details.linksAvailable}
          onPress={()=>share('traveler')} style={[styles.button,!details.linksAvailable&&styles.disabled]}>
          <Text style={styles.buttonLabel}>{t('recruiter.inviteTraveler')}</Text></Pressable>
      </Card>
      <Card style={styles.panel}>
        <Text style={styles.eyebrow}>{t('recruiter.compensation')}</Text>
        <Text style={styles.note}>{t('recruiter.compensationNote')}</Text>
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
