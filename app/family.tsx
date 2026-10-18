import {useLocalSearchParams,useRouter} from 'expo-router';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,StyleSheet,TextInput,View} from 'react-native';
import {Text} from '../src/components/AppText';
import {Card,LetterheadBar,PrimaryButton,Screen,SectionLabel,Title,useNote} from '../src/components/UI';
import {useGoBack} from '../src/components/nav';
import {acceptFamilyInvite,createFamilyInvite,fetchFamily,fetchGuardianTravels,revokeFamilyLink,type FamilyLink,type GuardianTravel} from '../src/backend/family';
import {useLanguage} from '../src/state/LanguageContext';
import {colors} from '../src/theme';

export default function FamilyScreen(){
 const back=useGoBack(),router=useRouter(),{note,showNote}=useNote(),{t}=useLanguage();
 const params=useLocalSearchParams<{invite?:string;token?:string}>();
 const inviteId=useMemo(()=>typeof params.invite==='string'?params.invite:'',[params.invite]);
 const inviteToken=useMemo(()=>typeof params.token==='string'?params.token:'',[params.token]);
 const [links,setLinks]=useState<FamilyLink[]>([]),[travels,setTravels]=useState<GuardianTravel[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadFailed,setLoadFailed]=useState(false),[accepting,setAccepting]=useState(false),[accepted,setAccepted]=useState(false),[acceptFailed,setAcceptFailed]=useState(false),[acceptAttempt,setAcceptAttempt]=useState(0);
 const acceptRequest=useRef('');
 const [teenName,setTeenName]=useState(''),[teenEmail,setTeenEmail]=useState(''),[teenDob,setTeenDob]=useState('');
 const familyStatus=(status:FamilyLink['status'])=>status==='active'?t('traveler.familyStatusActive'):status==='invited'?t('traveler.familyStatusInvited'):status==='revoked'?t('traveler.familyStatusRevoked'):t('traveler.familyStatusAgedOut');
 const refresh=async()=>{setLoading(true);setLoadFailed(false);try{const [l,r]=await Promise.all([fetchFamily(),fetchGuardianTravels()]);setLinks(l);setTravels(r);}catch{setLoadFailed(true);}finally{setLoading(false);}};
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{const request=`${inviteId}:${inviteToken}:${acceptAttempt}`;if(!inviteId||!inviteToken||accepted||acceptRequest.current===request)return;acceptRequest.current=request;setAccepting(true);setAcceptFailed(false);acceptFamilyInvite(inviteId,inviteToken).then(async()=>{setAccepted(true);await refresh();}).catch(()=>setAcceptFailed(true)).finally(()=>setAccepting(false));},[inviteId,inviteToken,accepted,acceptAttempt]);
 const invite=async()=>{if(busy)return;setBusy(true);try{await createFamilyInvite({guardianName:'',teenName,teenEmail,teenDob});setTeenName('');setTeenEmail('');setTeenDob('');await refresh();}catch{showNote(t('traveler.familyInviteSendUnconfirmed'));}finally{setBusy(false);}};
 return <Screen note={note}><LetterheadBar onBack={back}/><Title size={24}>{t('traveler.familyTitle')}</Title>
  {(inviteId&&inviteToken)?<Card style={styles.notice}><Text style={styles.name}>{accepting?t('traveler.familyAccepting'):accepted?t('traveler.familyAccepted'):t('traveler.familyInviteUnable')}</Text>{acceptFailed?<Pressable accessibilityRole="button" onPress={()=>setAcceptAttempt(v=>v+1)}><Text style={styles.action}>{t('traveler.tryAgain')}</Text></Pressable>:null}</Card>:null}
  {loadFailed?<Card style={styles.notice}><Text style={styles.meta}>{t('traveler.familyLoadUnable')}</Text><Pressable accessibilityRole="button" onPress={refresh}><Text style={styles.action}>{t('traveler.tryAgain')}</Text></Pressable></Card>:null}
  {loading?<Text style={styles.meta}>{t('traveler.familyWorking')}</Text>:null}
  {!loading&&!loadFailed&&travels.length?<><SectionLabel style={{marginTop:20}}>{t('traveler.familyActiveTravel')}</SectionLabel><Card style={styles.card}>{travels.map(r=><Pressable accessibilityRole="button" key={r.id} onPress={()=>router.navigate({pathname:'/family-travel',params:{rideId:r.id,tripNo:r.tripNo,travelerName:r.travelerName,operatorName:r.operatorName,operatorId:r.operatorId,travelerUid:r.travelerUid,followUrl:r.followUrl||''}})}><View style={styles.row}><View style={{flex:1}}><Text style={styles.name}>{r.travelerName}</Text><Text style={styles.meta}>{r.dep} → {r.dest}</Text></View><Text style={styles.action}>{t('traveler.familyViewTravel')}</Text></View></Pressable>)}</Card></>:null}
  {!loading&&!loadFailed?<><SectionLabel style={{marginTop:20}}>{t('traveler.familyAuthorized')}</SectionLabel><Card style={styles.card}>{links.length?links.map(x=><View key={x.id} style={styles.row}><View style={{flex:1}}><Text style={styles.name}>{x.teenName||t('traveler.familyTeenTraveler')}</Text><Text style={styles.meta}>{x.status==='active'&&x.eligible?t('traveler.familyAuthorizedStatus'):familyStatus(x.status)}</Text></View>{x.role==='guardian'&&x.status!=='revoked'?<Pressable accessibilityRole="button" onPress={async()=>{if(busy)return;setBusy(true);try{await revokeFamilyLink(x.id);await refresh();}catch{showNote(t('traveler.familyRevokeUnable'));}finally{setBusy(false);}}}><Text style={styles.action}>{t('traveler.familyRevoke')}</Text></Pressable>:null}</View>):<Text style={styles.meta}>{t('traveler.familyNone')}</Text>}</Card></>:null}
  <SectionLabel style={{marginTop:24}}>{t('traveler.familyAddTeen')}</SectionLabel><Card style={styles.card}>
   <Text style={styles.meta}>{t('traveler.familyAuthorizationSteps')}</Text>
   <TextInput value={teenName} onChangeText={setTeenName} placeholder={t('traveler.familyTeenName')} style={styles.input}/>
   <TextInput value={teenEmail} onChangeText={setTeenEmail} placeholder={t('traveler.familyTeenEmail')} autoCapitalize="none" keyboardType="email-address" style={styles.input}/>
   <TextInput value={teenDob} onChangeText={setTeenDob} placeholder={t('traveler.familyTeenDob')} autoCapitalize="none" style={styles.input}/>
   <Text style={styles.meta}>{t('traveler.familyInviteDelivery')}</Text>
   <PrimaryButton label={busy?t('traveler.familyWorking'):t('traveler.familyCreateInvite')} onPress={invite} disabled={busy||!teenName.trim()||!teenEmail.trim()||!teenDob.trim()}/>
  </Card>
 </Screen>;
}
const styles=StyleSheet.create({card:{marginTop:10,padding:16,gap:12},notice:{marginTop:16,padding:16},row:{flexDirection:'row',alignItems:'center',paddingVertical:8},name:{fontSize:14.5,color:colors.ink},meta:{fontSize:12,color:colors.muted,marginTop:3,lineHeight:18},action:{fontSize:13,fontWeight:'600',color:colors.accent},input:{borderBottomWidth:1,borderBottomColor:colors.hairline,paddingVertical:12,color:colors.ink}});
