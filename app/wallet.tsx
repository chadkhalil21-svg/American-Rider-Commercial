// Payment & Settlement — the traveler's saved payment methods, read from their own Stripe
// Customer record, with the controls that manage them; and the Travel Log, where receipts are.
//
// Chad, 14 September 2026, on the previous version: a screen of explanation is a placeholder,
// not a portal — show the instruments and the targets that manage them. So: every row here is
// a method Stripe holds for this traveler (never typed into the app), "Set as default" changes
// the card charged when they are not asked (a gratuity, a scheduled travel), "Remove" detaches
// it, and "Add payment method" opens Stripe's sheet in setup mode, which saves a card without
// charging it. The card number never reaches this app or our server.
//
// WHAT THE SCREEN SAYS WHEN IT CANNOT READ THE RECORD. A server without a key, or one that is
// unreachable, produces "No payment method saved" only when that is what the record says;
// otherwise the screen says the record could not be read. The two must never be confused.
//
// NOT HERE, because the app cannot say it truthfully: corporate billing profiles, retainers,
// monthly statements and expense-system integrations (none exist), and card artwork drawn
// for instruments the record does not hold.
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/components/AppText';
import {
  addPaymentMethod,
  brandName,
  fetchPaymentMethods,
  platformPaySupported,
  removePaymentMethod,
  setDefaultPaymentMethod,
  type SavedMethod,
} from '../src/backend/payments';
import { useGoBack } from '../src/components/nav';
import { Card, Chev, LetterheadBar, PrimaryButton, Screen, SectionLabel, Sub, Title } from '../src/components/UI';
import { usePaymentConfig, usePaymentConfigRefresh } from '../src/state/PaymentConfigContext';
import { useLanguage } from '../src/state/LanguageContext';
import { colors } from '../src/theme';

export default function PaymentAndSettlement() {
  const { t } = useLanguage();
  const goBack = useGoBack();
  const payConfig = usePaymentConfig();
  const refreshPaymentConfig = usePaymentConfigRefresh();
  // Wallet has a narrower capability than booking. Unrelated operational dependencies
  // must not disable Stripe setup, but Stripe itself must still be configured.
  const modeNote = !payConfig.canManagePaymentMethods
    ? t('traveler.paymentUnavailable')
    : payConfig.mode === 'test'
      ? t('traveler.paymentsSimulated')
      : null;

  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unreadable'>('loading');
  const [walletReady, setWalletReady] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SavedMethod | null>(null);
  const [retrying, setRetrying] = useState(false);
  const readSequence = useRef(0);

  const load = useCallback(async () => {
    // A late response from focus must not erase newer data after Add/Retry.
    const sequence = ++readSequence.current;
    setState('loading');
    const r = await fetchPaymentMethods();
    if (sequence !== readSequence.current) return;
    setMethods(r.methods);
    setState(r.unavailable ? 'unreadable' : 'ready');
  }, []);

  // Re-read on focus; invalidate a pending read when this screen loses focus.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void load();
      if (Platform.OS !== 'web')
        void platformPaySupported().then(ok => { if (live) setWalletReady(ok); });
      return () => {
        live = false;
        readSequence.current++;
      };
    }, [load]),
  );

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      // A Stripe /config outage can disable payment throughout this session;
      // refresh that gate before checking methods, without allowing a bypass.
      await refreshPaymentConfig();
      await load();
    } catch {
      setState('unreadable');
    } finally {
      setRetrying(false);
    }
  };

  const add = async () => {
    setAdding(true);
    setError(null);
    const r = await addPaymentMethod();
    setAdding(false);
    if (r.ok) await load();
    else if (!r.canceled) setError(r.error ?? t('traveler.couldNotAddMethod'));
  };
  const makeDefault = async (id: string) => {
    setBusyId(id);
    setError(null);
    const r = await setDefaultPaymentMethod(id);
    setBusyId(null);
    if (r.ok && r.methods) { readSequence.current++; setMethods(r.methods); setState('ready'); }
    else if (!r.ok) setError(t('traveler.couldNotChangeMethod'));
  };
  const remove = async (id: string) => {
    setBusyId(id);
    setError(null);
    const r = await removePaymentMethod(id);
    setBusyId(null);
    if (r.ok && r.methods) { readSequence.current++; setMethods(r.methods); setState('ready'); }
    else if (!r.ok) setError(t('traveler.couldNotChangeMethod'));
  };

  const expiry = (m: SavedMethod) =>
    m.expMonth && m.expYear ? `${String(m.expMonth).padStart(2, '0')}/${String(m.expYear).slice(-2)}` : null;
  const methodTitle = (m: SavedMethod) =>
    m.last4 ? t('traveler.cardEnding', { brand: brandName(m.brand), last4: m.last4 }) : brandName(m.brand) || m.type;
  const walletName = (w: string | null) =>
    w === 'apple_pay' ? 'Apple Pay' : w === 'google_pay' ? 'Google Pay' : null;

  return (
    <Screen>
      <LetterheadBar onBack={goBack} />
      <Title size={24}>{t('traveler.paymentSettlement')}</Title>
      <Sub>{t('traveler.paymentSettlementSub')}</Sub>

      <SectionLabel style={{ marginTop: 24 }}>{t('traveler.paymentMethods')}</SectionLabel>
      <Card style={styles.card}>
        {state === 'loading' && (
          <View style={styles.row}>
            <Text style={styles.muted}>{t('traveler.busyChecking')}</Text>
          </View>
        )}
        {state === 'unreadable' && (
          <View style={styles.row}>
            <Text style={styles.muted}>{t('traveler.methodsUnreadable')}</Text>
          </View>
        )}
        {state === 'ready' && methods.length === 0 && (
          <View style={styles.row}>
            <Text style={styles.muted}>{t('traveler.noPaymentMethodSaved')}</Text>
          </View>
        )}
        {state === 'ready' &&
          methods.map((m, i) => {
            const via = walletName(m.wallet);
            const exp = expiry(m);
            const sub = [via, exp ? t('traveler.expires', { date: exp }) : null].filter(Boolean).join(' · ');
            const busy = busyId === m.id;
            return (
              <View key={m.id} style={[styles.row, i > 0 && styles.hair]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle}>{methodTitle(m)}</Text>
                  {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
                </View>
                <View style={styles.actions}>
                  {m.isDefault ? (
                    <Text style={styles.defaultTag}>{t('traveler.defaultMethod')}</Text>
                  ) : (
                    <Pressable accessibilityRole="button" disabled={busyId !== null || adding}
                      onPress={() => makeDefault(m.id)} hitSlop={8}>
                      <Text style={styles.action}>{t('traveler.setAsDefault')}</Text>
                    </Pressable>
                  )}
                  {/* Even the default card belongs to the Traveler. It must be
                      removable with confirmation, not a permanent invisible lock. */}
                  <Pressable accessibilityRole="button"
                    disabled={busyId !== null || adding}
                    onPress={() => setPendingRemove(m)} hitSlop={8}>
                    <Text style={styles.removeAction}>{t('traveler.remove')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        {/* The device's own wallet: whether Apple Pay (or Google Pay) can be presented here. It
            is offered inside Stripe's sheet, so this row states availability, not a choice. */}
        {walletReady !== null && payConfig.canManagePaymentMethods && (
          <View style={[styles.row, styles.hair]}>
            <Text style={styles.rowTitle}>{Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay'}</Text>
            <Text style={walletReady ? styles.defaultTag : styles.muted}>
              {walletReady ? t('traveler.availableOnDevice') : t('traveler.notAvailableOnDevice')}
            </Text>
          </View>
        )}
      </Card>

      {/* A control that cannot run today is disabled and says why beneath — never a button that
          does nothing. */}
      <PrimaryButton
        label={adding ? t('traveler.busyChecking') : t('traveler.addPaymentMethod')}
        disabled={adding || !payConfig.canManagePaymentMethods}
        onPress={add}
        style={{ marginTop: 14 }}
      />
      {(state === 'unreadable' || !payConfig.canManagePaymentMethods) && (
        <PrimaryButton
          label={retrying ? t('traveler.busyChecking') : t('traveler.tryAgain')}
          disabled={retrying || state === 'loading'}
          onPress={() => { void retry(); }}
          style={{ marginTop: 12 }}
        />
      )}
      {error && <Text style={styles.errorNote}>{error}</Text>}
      {modeNote && <Text style={styles.modeNote}>{modeNote}</Text>}


      <Modal visible={!!pendingRemove} animationType="fade" transparent onRequestClose={() => setPendingRemove(null)}>
        <Pressable style={styles.confirmScrim} onPress={() => setPendingRemove(null)}>
          <Pressable style={styles.confirmCard} accessible={false} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.confirmTitle}>{t('traveler.paymentMethod')}</Text>
            {pendingRemove ? (
              <>
                <Text style={styles.confirmBody}>{methodTitle(pendingRemove)}</Text>
                <Text style={styles.confirmBody}>{t(pendingRemove.isDefault
                  ? 'traveler.removeDefaultCardNotice' : 'traveler.removeCardNotice')}</Text>
              </>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setPendingRemove(null)} style={styles.confirmButton} accessibilityRole="button">
                <Text style={styles.confirmButtonText}>{t('traveler.cancel2')}</Text>
              </Pressable>
              <Pressable onPress={() => { const id = pendingRemove?.id; setPendingRemove(null); if (id) void remove(id); }} style={styles.confirmButton} accessibilityRole="button">
                <Text style={styles.confirmButtonText}>{t('traveler.remove')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13.5,
    gap: 12,
  },
  hair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowTitle: { fontSize: 14.5, color: colors.ink },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
  muted: { fontSize: 14, color: colors.ink2 },
  defaultTag: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  actions: { alignItems: 'flex-end', gap: 8 },
  action: { fontSize: 13, fontWeight: '600', color: colors.accent },
  removeAction: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  errorNote: { fontSize: 13, color: colors.ink, marginTop: 10 },
  modeNote: { fontSize: 12, color: colors.muted, marginTop: 10, lineHeight: 17.5 },

  confirmScrim: { flex: 1, backgroundColor: 'rgba(20,23,31,0.42)', justifyContent: 'center', paddingHorizontal: 24 },
  confirmCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 16, padding: 20 },
  confirmTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  confirmBody: { fontSize: 14, color: colors.ink2, marginTop: 8 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, alignItems: 'center' },
  confirmButtonText: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
