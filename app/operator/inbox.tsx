import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import { Card, LetterheadBar, Screen, SectionLabel, Title } from '../../src/components/UI';
import { fetchOperatorInbox, markOperatorMessageRead, type PlatformMessage } from '../../src/backend/platformInbox';
import { colors } from '../../src/theme';
import { t } from '../../src/i18n';

export default function OperatorInbox() {
  const router = useRouter();
  const travelerView = usePathname() === '/inbox';
  const [items, setItems] = useState<PlatformMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchOperatorInbox().then((x) => { setItems(x); setError(null); }).catch((e) => setError(e.message));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (m: PlatformMessage) => {
    if (opening) return;
    setOpening(m.id);
    try {
      if (!m.readAt) {
        const recorded = await markOperatorMessageRead(m.id);
        if (!recorded) {
          setError(t(travelerView ? 'traveler.platformCommunicationReadFailed' : 'operator.inboxReadFailed'));
          return;
        }
        setItems((xs) => xs.map((x) => x.id === m.id ? { ...x, readAt: Date.now() } : x));
      }
      if (m.action?.screen) router.navigate(m.action.screen as never);
    } finally {
      setOpening(null);
    }
  };

  return (
    <Screen>
      <LetterheadBar onBack={() => router.back()} />
      <Title>American Rider</Title>
      <Text style={styles.sub}>{t(travelerView ? 'traveler.platformCommunicationsBody' : 'operator.inboxBody')}</Text>
      <SectionLabel style={styles.label}>{t(travelerView ? 'traveler.platformCommunications' : 'operator.communications')}</SectionLabel>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && items.length === 0 ? <Text style={styles.empty}>{t(travelerView ? 'traveler.noPlatformCommunications' : 'operator.noCommunications')}</Text> : null}
      {items.map((m) => (
        <Pressable key={m.id} onPress={() => open(m)} disabled={opening === m.id}>
          <Card style={styles.card}>
            <View style={styles.head}>
              <Text style={[styles.title, !m.readAt && styles.unread]}>{m.title}</Text>
              {!m.readAt ? <Text style={styles.new}>{t(travelerView ? 'traveler.newPlatformCommunication' : 'operator.newCommunication')}</Text> : null}
            </View>
            <Text style={styles.body}>{m.body}</Text>
            <Text style={styles.date}>{new Date(m.createdAt).toLocaleString()}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
const styles = StyleSheet.create({
  sub:{fontSize:13.5,color:colors.muted,marginTop:6,lineHeight:20},
  label:{marginTop:24,marginBottom:10},
  card:{padding:18,marginBottom:10},
  head:{flexDirection:'row',justifyContent:'space-between',gap:12},
  title:{fontSize:15,color:colors.ink}, unread:{fontWeight:'700'},
  new:{fontSize:10,fontWeight:'700',letterSpacing:1,color:colors.ink},
  body:{fontSize:13.5,color:colors.ink2,lineHeight:20,marginTop:7},
  date:{fontSize:11.5,color:colors.muted,marginTop:10},
  empty:{fontSize:13.5,color:colors.muted,marginTop:10},
  error:{fontSize:13.5,color:colors.red,marginTop:10},
});
