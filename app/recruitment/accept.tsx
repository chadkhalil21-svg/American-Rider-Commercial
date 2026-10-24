import React,{useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {Text} from '../../src/components/AppText';
import {Card,LetterheadBar,Screen,Sub,Title} from '../../src/components/UI';
import {useAuth} from '../../src/state/AuthContext';
import {useLanguage} from '../../src/state/LanguageContext';
import {PAYMENT_SERVER_URL} from '../../src/config';
import {colors} from '../../src/theme';

// Invitation token is consumed only on an explicit action by the verified
// addressed Firebase account. A link click does not constitute acceptance.
export default function RecruiterAccept(){
  const params=useLocalSearchParams<{token?:string}>();
  const router=useRouter(),{user}=useAuth();
  const {t}=useLanguage();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const token=typeof params.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(params.token)
    ?params.token:null;
  const eligible=!!token&&!!user?.emailVerified&&!!user.email;
  const accept=async()=>{
    if(!eligible||!user||busy)return;
    setBusy(true);setMessage('');
    try{
      const bearer=await user.getIdToken(true);
      const resp=await fetch(PAYMENT_SERVER_URL+'/recruiters/accept',{
        method:'POST',
        headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
        body:JSON.stringify({token}),
      });
      const body=await resp.json().catch(()=>null);
      if(resp.ok&&body?.ok){
        router.replace('/recruitment');
      }else if(resp.status===503){
        setMessage(t('recruiter.enrollmentClosed'));
      }else{
        setMessage(t('recruiter.acceptFailed'));
      }
    }catch{setMessage(t('recruiter.verifyFailed'));}
    finally{setBusy(false);}
  };
  return <Screen>
    <LetterheadBar onBack={()=>router.back()}/>
    <Title>{t('recruiter.yourInvitation')}</Title>
    <Sub>{t('recruiter.independent')}</Sub>
    <Card style={styles.card}>
      <Text style={styles.note}>{t('recruiter.inviteNote')}</Text>
      {!token?<Text style={styles.note}>{t('recruiter.invalidInvitation')}</Text>:
      !user?<Text style={styles.note}>{t('recruiter.signInEmail')}</Text>:
      !user.emailVerified?<Text style={styles.note}>{t('recruiter.verifyEmail')}</Text>:
      <Pressable style={styles.button} accessibilityRole="button" disabled={busy}
        onPress={accept}>
        {busy?<ActivityIndicator color={colors.solidFg}/>:
        <Text style={styles.buttonText}>{t('recruiter.acceptInvitation')}</Text>}
      </Pressable>}
      {!!message&&<Text style={styles.note} accessibilityRole="alert">{message}</Text>}
      <Text style={styles.note}>{t('recruiter.notGuarantee')}</Text>
    </Card>
  </Screen>;
}
const styles=StyleSheet.create({
  card:{padding:22,marginTop:24},
  note:{color:colors.muted,fontSize:14,lineHeight:21,marginBottom:18},
  button:{backgroundColor:colors.solid,padding:16,alignItems:'center',borderRadius:12},
  buttonText:{fontSize:15,color:colors.solidFg,fontWeight:'600'},
});
