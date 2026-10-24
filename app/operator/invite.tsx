// The Operator's optional invitations. No contact picker, no contact upload,
// no payout claims and no simulated QR code. Same trusted link as Traveler
// sharing, with two destination roles. No separate recruitment app.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { OperatorBar, OperatorDrawer, OperatorScreen } from '../../src/components/operator';
import { BackLink, Card } from '../../src/components/UI';
import { useLanguage } from '../../src/state/LanguageContext';
import { useOperator } from '../../src/state/OperatorContext';
import { personalInvitationDetails, type InviteRole } from '../../src/backend/referrals';
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
      const invitation=await personalInvitationDetails(role);
      if(!invitation){Alert.alert(t('operator.referralInviteUnavailable'));return;}
      const message=invitation.compensationActive
        ?t('recruiter.shareDisclosure')+' '+invitation.url
        :`American Rider · ${invitation.url}`;
      await Share.share({message});
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
      <Card style={styles.choices}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={t('operator.referralInviteTraveler')}
          style={styles.choice} onPress={()=>{void share('traveler');}}>
          <Text style={styles.choiceLabel}>{t('operator.referralInviteTraveler')}</Text>
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
        </Pressable>
        <View style={styles.rule} />
        <Pressable accessibilityRole="button"
          accessibilityLabel={t('operator.referralInviteOperator')}
          style={styles.choice} onPress={()=>{void share('operator');}}>
          <Text style={styles.choiceLabel}>{t('operator.referralInviteOperator')}</Text>
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
        </Pressable>
      </Card>
      <OperatorDrawer open={menuOpen} onClose={()=>setMenuOpen(false)}
        onNote={()=>{}}/>
    </OperatorScreen>
  );
}

const styles=StyleSheet.create({
  choices:{marginTop:24,padding:0,overflow:'hidden'},
  choice:{minHeight:60,paddingHorizontal:18,flexDirection:'row',
    alignItems:'center',justifyContent:'space-between'},
  choiceLabel:{fontSize:15,fontWeight:'500',color:colors.ink},
  chevron:{fontSize:24,fontWeight:'300',color:colors.muted},
  rule:{height:1,backgroundColor:colors.hairline,marginHorizontal:18},
});
