// American Rider — OPERATOR-side shared surfaces, transcribed from the founders'
// operator demo (docs/demo-reference/operator-institutional.html): the operator bar
// (hamburger · AMERICAN RIDER · OPERATOR · initials avatar), the three-tab bottom
// bar (Operations / Revenue / Profile), the ✓ badge, and the drawn navigation map.
// Palette rule stands: no blue anywhere — the demo's blue accents resolve to ink.
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { LEGAL_URL } from '../config';
import { menuTitleCase } from '../menuTitleCase';
import { useOperator } from '../state/OperatorContext';
import { useLanguage } from '../state/LanguageContext';
import { colors, mono, radii } from '../theme';
import { useNative } from './anim';
import { Avatar, Drawer, DrawerRow } from './UI';

// ---- screen shell: demo .pad (58/24/40) with the optional .padnav bottom bar ----
// The operator nav bar's height ABOVE the home indicator. The bar renders at
// NAV_BAR_HEIGHT + insets.bottom, and the content above it must reserve the same amount.
//
// THE BUG THIS FIXES: the bar was `76 + insets.bottom` (110 on an iPhone with a home
// indicator) while the content reserved a hardcoded 96 — so the last 14 points of every
// operator screen sat underneath the bar. On the home screen that was the bottom of the
// "Go Available" button, rounded corners and all, which is the one control the screen exists
// for. Two numbers meant to describe the same strip of screen, written independently, drifted.
const NAV_BAR_HEIGHT = 76;

export function OperatorScreen({
  children,
  nav,
  note,
  scroll = true,
}: {
  children: React.ReactNode;
  nav?: 'home' | 'revenue' | 'profile';
  note?: string | null;
  scroll?: boolean;
}) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: insets.top + 16,
    paddingBottom: nav ? NAV_BAR_HEIGHT + insets.bottom + 20 : insets.bottom + 40,
    paddingHorizontal: 24,
  };
  const noteBottom = nav ? NAV_BAR_HEIGHT + insets.bottom + 20 : insets.bottom + 26;
  const overlay = note ? (
    <View pointerEvents="none" style={[styles.noteWrap, { bottom: noteBottom }]}>
      <View style={styles.note}>
        <Text style={styles.noteText}>{note}</Text>
      </View>
    </View>
  ) : null;
  const body = scroll ? (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.grow, pad]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <View style={[styles.screen, pad]}>{children}</View>
  );
  return (
    <View style={styles.screen}>
      {body}
      {overlay}
      {nav ? <OperatorNav active={nav} /> : null}
    </View>
  );
}

// ---- the operator bar: hamburger · wordmark + · OPERATOR · initials avatar ----
export function OperatorBar({
  onMenu,
  initials,
}: {
  onMenu: () => void;
  initials: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Pressable onPress={onMenu} hitSlop={12} style={styles.barIcon}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 7h16M4 12h16M4 17h16"
            stroke={colors.faint}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
      <Text style={styles.wm}>
        AMERICAN RIDER <Text style={styles.wmOp}>· {t('traveler.operatorCaps')}</Text>
      </Text>
      <Pressable onPress={() => router.navigate('/operator/profile')} hitSlop={12}>
        <Avatar initials={initials} size={34} />
      </Pressable>
    </View>
  );
}

// ---- bottom bar: Operations / Revenue / Profile (demo .nav, 76px, icons 21) ----
const NAV_ITEMS: { key: 'home' | 'revenue' | 'profile'; label: string; d: string; href: '/operator' | '/operator/revenue' | '/operator/profile' }[] = [
  { key: 'home', label: 'Operations', d: 'M4 11l8-7 8 7M6 10v9h12v-9', href: '/operator' },
  { key: 'revenue', label: 'Revenue', d: 'M12 3v18M6 8h9a2.5 2.5 0 0 1 0 5H6h11', href: '/operator/revenue' },
  { key: 'profile', label: 'Profile', d: 'M12 8a3.4 3.4 0 1 0 0-.1M5.5 20c1.4-3.3 11.6-3.3 13 0', href: '/operator/profile' },
];

export function OperatorNav({ active }: { active: 'home' | 'revenue' | 'profile' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.navBar, { height: NAV_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}
    >
      {NAV_ITEMS.map((it) => {
        const on = it.key === active;
        const tint = on ? colors.ink : colors.faint;
        return (
          <Pressable
            key={it.key}
            style={styles.navItem}
            onPress={() => {
              if (!on) router.navigate(it.href);
            }}
          >
            <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
              <Path
                d={it.d}
                stroke={tint}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={[styles.navLabel, { color: tint }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- the demo's quick-access drawer, operator edition: profile head, Switch to
// Traveler view, the operations rows. Rows the build hasn't earned show the demo's
// own full-build notes (via onNote).
export function OperatorDrawer({
  open,
  onClose,
  onNote,
}: {
  open: boolean;
  onClose: () => void;
  onNote: (t: string) => void;
}) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const op = useOperator();
  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const note = (t: string) => {
    onClose();
    onNote(t);
  };
  const ROWS: { label: string; onPress: () => void }[] = [
    {
      label: t('traveler.switchToTraveler'),
      onPress: () =>
        go(() => {
          // Reset the stack so neither view keeps the other's screens alive beneath it.
          op.setRole('traveler');
          if (router.canDismiss()) router.dismissAll();
          router.replace('/');
        }),
    },
    // Hide the not-yet-commissioned feature rather than exposing dead buttons.
    ...(process.env.EXPO_PUBLIC_REFERRALS_ENABLED === '1'
      ? [{ label: t('operator.referralInviteTitle'), onPress: () => go(() => router.navigate('/operator/invite')) }]
      : []),
    { label: 'Documents', onPress: () => go(() => router.navigate('/operator/documents')) },
    { label: 'Insurance', onPress: () => go(() => router.navigate('/operator/insurance')) },
    { label: 'Communications', onPress: () => go(() => router.navigate('/operator/inbox')) },
    // About opens the real company page. §10A of the founders' brief puts the
    // operator-retention statement in a permanent company-information section, said once
    // as an institutional fact — this is that section, and the only place in the operator
    // app the 99% is spelled out in prose.
    {
      label: t('traveler.aboutAmericanRider'),
      onPress: () => go(() => Linking.openURL(`${LEGAL_URL}/about`)),
    },
    // REMOVED 15 Aug 2026 for App Store review: Revenue Roadmap, Vehicle, Patron Support
    // and Settings. Each carried a chevron and each only raised "…opens in the full
    // build" — placeholder features under guideline 2.1, on a menu a reviewer opens.
    //
    // Nothing was lost that exists: Documents already takes the vehicle paperwork an
    // operator must file, and Insurance is a real screen. Operator Settings and a
    // dedicated operator support desk are genuinely unbuilt; a row promising them is a
    // claim the app cannot honour. Restore each one WITH the screen behind it, never
    // before.
  ];
  return (
    <Drawer open={open} onClose={onClose}>
      <Pressable
        onPress={() => go(() => router.navigate('/operator/profile'))}
        style={styles.drawerHead}
      >
        <Avatar initials={op.opInitials} size={48} />
        <View>
          <Text style={styles.drawerName}>{op.opName}</Text>
          {/* The 4.98 was a literal. No operator record carries a rating, so this printed the
              same score for every operator in the fleet — including one who had never driven.
              Same defect as the borrowed rating removed from the traveler's ride screen and
              receipt. Restore it when operators have real ratings. */}
          <Text style={styles.drawerProfileLink}>{menuTitleCase(t('traveler.viewProfile'), language)} ›</Text>
        </View>
      </Pressable>
      {ROWS.map((item) => (
        <DrawerRow key={item.label} label={menuTitleCase(item.label, language)} onPress={item.onPress} />
      ))}
      <View style={{ flex: 1 }} />
    </Drawer>
  );
}

// ---- the demo's ✓ badge (badge-ok): green on green tint, radius 999 ----
export function BadgeOk({ label, big = false }: { label: string; big?: boolean }) {
  return (
    <View style={[styles.badgeOk, big && styles.badgeOkBig]}>
      <Text style={[styles.badgeOkText, big && styles.badgeOkTextBig]}>✓ {label}</Text>
    </View>
  );
}

// ---- the demo's drawn navigation map: grid, one route, animated car, corner tag ----
const ROUTE = [
  { x: 60, y: 144 },
  { x: 210, y: 144 },
  { x: 210, y: 44 },
  { x: 308, y: 44 },
];
const SEGMENTS = [150, 100, 98]; // leg lengths along the route
const TOTAL = 348;

export function OperatorMap({ tag, animate = true }: { tag: string; animate?: boolean }) {
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 7000,
        easing: (t) => t,
        useNativeDriver: useNative,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, progress]);

  const sx = width > 0 ? width / 364 : 1;
  const stops = [0, SEGMENTS[0] / TOTAL, (SEGMENTS[0] + SEGMENTS[1]) / TOTAL, 1];
  const translateX = progress.interpolate({
    inputRange: stops,
    outputRange: ROUTE.map((p) => p.x * sx - 6.5),
  });
  const translateY = progress.interpolate({
    inputRange: stops,
    outputRange: ROUTE.map((p) => p.y - 4),
  });
  const rotate = progress.interpolate({
    inputRange: [0, 0.42, 0.44, 0.7, 0.72, 1],
    outputRange: ['0deg', '0deg', '-90deg', '-90deg', '0deg', '0deg'],
  });

  const route = `M60,144 L210,144 L210,44 L308,44`;
  return (
    <View style={styles.map} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={180} viewBox="0 0 364 180" preserveAspectRatio="none">
        <Rect width={364} height={180} fill={colors.mapBg} />
        <Rect x={210} y={96} width={92} height={46} rx={4} fill="#E4EADD" />
        {[70, 150, 236, 312].map((x) => (
          <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={180} stroke="#F6F5F1" strokeWidth={7} />
        ))}
        {[50, 100, 150].map((y) => (
          <Line key={`h${y}`} x1={0} y1={y} x2={364} y2={y} stroke="#F6F5F1" strokeWidth={7} />
        ))}
        <Path d={route} fill="none" stroke={colors.mapRoute} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={route} fill="none" stroke={colors.ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={308} cy={44} r={5.5} fill={colors.ink} stroke="#fff" strokeWidth={2.2} />
      </Svg>
      {width > 0 && (
        <Animated.View
          style={[styles.car, { transform: [{ translateX }, { translateY }, { rotate }] }]}
        >
          <View style={styles.carWindshield} />
        </Animated.View>
      )}
      <View style={styles.mapTag}>
        <Text style={styles.mapTagText}>{tag}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  grow: { flexGrow: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34, // the 34px avatar sets the row; the demo centers its 26px bar the same way
    marginBottom: 22,
  },
  barIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  wm: { fontSize: 12, fontWeight: '600', letterSpacing: 2.64, color: colors.ink },
  wmOp: { color: colors.muted }, // the demo colors this accent; ink-only palette says neutral
  navBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    flexDirection: 'row',
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  navLabel: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.315 },
  badgeOk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeOkBig: { paddingVertical: 6, paddingHorizontal: 14 },
  badgeOkText: { fontSize: 11.5, fontWeight: '600', color: colors.green },
  badgeOkTextBig: { fontSize: 12.5 },
  map: {
    height: 180,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.mapBg,
    overflow: 'hidden',
  },
  car: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 13,
    height: 8,
    borderRadius: 2.5,
    backgroundColor: colors.ink,
  },
  carWindshield: {
    position: 'absolute',
    left: 8.5,
    top: 1.4,
    width: 3,
    height: 5.2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  mapTag: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  mapTagText: {
    fontFamily: mono.regular,
    fontSize: 9,
    letterSpacing: 1.26,
    color: colors.muted,
  },
  noteWrap: { position: 'absolute', left: 24, right: 24 },
  note: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noteText: { fontSize: 13.5, color: '#fff', lineHeight: 19.5 },
  // The demo's drawer head: avatar · name/link, gap 13, air below — no rule (the
  // first row's top hairline draws the line).
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingBottom: 20 },
  drawerName: { fontSize: 17, fontWeight: '600', color: colors.ink },
  drawerProfileLink: { fontSize: 12.5, fontWeight: '500', color: colors.blue, marginTop: 3 },
});
