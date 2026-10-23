// The Operator's optional invitations. No contact picker, no contact upload,
// no payout claims and no simulated QR code. Same trusted link as Traveler
// sharing, with two destination roles. No separate recruitment app.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { OperatorBar, OperatorDrawer, OperatorScreen } from '../../src/components/operator';
import { BackLink, Card, PrimaryButton } from '../../src/components/UI';
import { useLanguage } from '../../src/state/LanguageContext';
import { useOperator } from '../../src/state/OperatorContext';
import { personalInvitation, type InviteRole } from '../../src/backend/referrals';
import { colors } from '../../src/theme';

export default function OperatorInvitations(){
  const router=useRouter(), {t}=useLanguage(), op=useOperator();
  const [menuOpen,setMenuOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const share=async(role:InviteRole)=>{
    if(busy)return;
    if(process.env.EXPO_PUBLIC_REFERRALS_ENABLED !== '1'){
      Alert.alert(t('operator.referralInviteUnavailable'));
      return;
    }
    setBusy(true);
    try{
      const url=await personalInvitation(role);
      if(!url){Alert.alert(t('operator.referralInviteUnavailable'));return;}
      await Share.share({message:`American Rider · ${url}`});
    }catch{Alert.alert(t('operator.referralInviteUnavailable'));}
    finally{setBusy(false);}
  };
  return (
    <OperatorScreen nav="profile">
      <OperatorBar onMenu={()=>setMenuOpen(true)} initials={op.opInitials} />
      <BackLink label={t('common.back')} onPress={()=>router.back()} />
      <Text style={{fontSize:24,fontWeight:'600',color:colors.ink,marginTop:14}}>
        {t('operator.referralInviteTitle')}
      </Text>
      <Text style={{fontSize:14,lineHeight:22,color:colors.muted,marginTop:12}}>
        {t('operator.referralInviteIntro')}
      </Text>
      <Card style={{padding:18,marginTop:24}}>
        <PrimaryButton label={t('operator.referralInviteTraveler')}
          onPress={()=>{void share('traveler');}} />
        <View style={{height:14}}/>
        <PrimaryButton label={t('operator.referralInviteOperator')}
          onPress={()=>{void share('operator');}} />
      </Card>
      <OperatorDrawer open={menuOpen} onClose={()=>setMenuOpen(false)}
        onNote={()=>{}}/>
    </OperatorScreen>
  );
}
