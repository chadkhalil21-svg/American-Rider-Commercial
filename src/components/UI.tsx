import { useRouter } from 'expo-router';
import React from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { useNative } from './anim';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, mono, radii } from '../theme';

// Full-height screen with the Friendly background and standard padding. `note` shows
// the demo's toast: a dark pill pinned above the bottom edge, radius 12, 13.5px.
export function Screen({
  children,
  scroll = true,
  note,
  scrollEnabled = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  note?: string | null;
  scrollEnabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // .pad{ padding:58px 24px 40px }. The demo draws its own status bar area into that
  // 58 — it decomposes as a 42px status bar + 16px of air, the same reading Drawer
  // already applies to its 56 (42 + 14). Both must decode it the same way or the two
  // drift apart on a real phone: at `insets.top + 40` this screen started 26px BELOW
  // the drawer on a Dynamic Island device, while the demo starts them 2px apart.
  // Below a 42px inset the demo's own 58 is the floor, so short status bars are safe.
  const pad = {
    paddingTop: Math.max(insets.top + 16, 58),
    paddingBottom: insets.bottom + 40,
    paddingHorizontal: 24,
  };
  const overlay = note ? (
    <View pointerEvents="none" style={[styles.noteWrap, { bottom: insets.bottom + 26 }]}>
      <View style={styles.note}>
        <Text style={styles.noteText}>{note}</Text>
      </View>
    </View>
  ) : null;
  // CONTENT PASSED UNDER THE CLOCK. The padding above is inside contentContainerStyle, so it
  // scrolls away with the content: on every scrolling screen in the app, a scrolled line was
  // drawn through the status bar — the ledger sentence collided with "12:44" and the wifi
  // icon in the operator page's own evidence capture (18 Sept 2026), and the defect had been
  // on the known list, unowned, since 15 Sept. A paper band the height of the inset sits above
  // the ScrollView, so content disappears cleanly behind the status bar instead of into it.
  // Here, not per screen: every screen renders through this component, and a fix per screen is
  // a fix that the next screen forgets.
  const statusMask = (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: colors.bg,
      }}
    />
  );
  // A NON-SCROLLING SCREEN STILL HAS TO GET OUT OF THE KEYBOARD'S WAY.
  //
  // This branch returned a bare View. Nothing could move and nothing could scroll, so on every
  // screen built with `scroll={false}` the keyboard simply covered whatever was underneath it —
  // including, on the front door, the field being typed into. A traveler could not see their
  // own email address as they entered it.
  //
  // Chad reported it on the sign-in screen, 19 Sept 2026. It was never only that screen: the
  // same branch is used by the account termination screen, where it hid the control, and by the
  // Add-a-contact sheet, which had been on the known list since 18 Sept. One container, one
  // fault, three reports.
  //
  // WHY A ScrollView AND NOT JUST PADDING. `behavior: 'padding'` shrinks the box the content
  // sits in; on a screen whose content is already the height of the phone, that compresses the
  // layout rather than lifting the field. The content needs somewhere to go. The ScrollView
  // only scrolls when it has to — `grow` keeps a short screen laid out exactly as before, so
  // nothing that fits today moves today.
  if (!scroll) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.grow, pad]}
          keyboardShouldPersistTaps="handled"
          // The layout is fixed by design on these screens; the scroll exists for the keyboard,
          // not for reading. No bars, and no bounce to suggest there is more below.
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
        {overlay}
      </KeyboardAvoidingView>
    );
  }
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.grow, pad]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >
        {children}
      </ScrollView>
      {statusMask}
      {overlay}
    </KeyboardAvoidingView>
  );
}

// State + timing for the demo's toast (2.4s, latest message wins).
export function useNote(): { note: string | null; showNote: (t: string) => void } {
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNote = React.useCallback((t: string) => {
    setNote(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 2400);
  }, []);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { note, showNote };
}

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={styles.backLink}>‹ {label}</Text>
    </Pressable>
  );
}

// The demo's letterhead bar, on EVERY screen: back chevron (or hamburger) · centered
// wordmark + NATIONAL TRANSPORTATION · thin person outline. Values from the demo CSS:
// .bar{ height:22px; margin-bottom:24px }, .wm 12/600/.26em, .wm .n 7.5/600/.34em mt2,
// .icn 22px (back = ink2, hamburger/person = faint).
//
// The bar owns the WHOLE 24px gap. Headings that follow it carry margin:0, exactly as
// the demo's h1/.title/.display do — splitting the 24 between two components is what
// let home drift to 28 while every other screen sat at 24.
export function LetterheadBar({ onBack, onMenu }: { onBack?: () => void; onMenu?: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      {onMenu ? (
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
      ) : (
        <Pressable onPress={onBack} hitSlop={12} style={styles.barIcon}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 5l-7 7 7 7"
              stroke={colors.ink2}
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      )}
      <View style={styles.barLockup}>
        <Text style={styles.barBrand}>AMERICAN RIDER</Text>
        <Text style={styles.barTagline}>NATIONAL TRANSPORTATION</Text>
      </View>
      <Pressable onPress={() => router.navigate('/profile')} hitSlop={12} style={styles.barIcon}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={8} r={3.4} stroke={colors.faint} strokeWidth={1.6} />
          <Path
            d="M5.5 19c1.4-3.3 11.6-3.3 13 0"
            stroke={colors.faint}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

// The demo's .lbl section label: 11 / 600 / .15em / uppercase / muted.
export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

// The demo's .chev row chevron: 19px, faint.
export function Chev() {
  return <Text style={styles.chev}>›</Text>;
}

// The demo's `.title{ font-size:27px; font-weight:600; letter-spacing:-.02em; margin:0 }`.
// (This was carried at 26px for a while — a rounding the exactness sweep noted but
// never corrected. 27 is the demo's number, so 27 it is.)
export function Title({
  children,
  size = 27,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.title, { fontSize: size }, style]}>{children}</Text>;
}

// The demo's `.display` — the big institutional headline ("Begin Travel").
// 34 / 600 / −.02em / line-height 1.12, and no margin of its own.
export function Display({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.display, style]}>{children}</Text>;
}

export function Sub({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.sub, style]}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// The demo's `.num{ font-variant-numeric:tabular-nums }` — the SYSTEM font with figures
// that hold their column. THIS is what every price in the demo uses, not the mono.
// Prices, fares, totals, balances, distances: <Num>. Trip numbers: <Mono>.
export function Num({
  children,
  size = 14,
  color = colors.ink,
  weight = '400',
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: '400' | '500' | '600';
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[{ fontSize: size, color, fontWeight: weight }, styles.tabular, style]}>
      {children}
    </Text>
  );
}

// The demo's `.mono` — SF Mono, shipped here as IBM Plex Mono. Used in exactly seven
// places in the traveler demo: the invite code, the estimated-search timer, the daily
// verification word, and the Travel Number on Confirmation, Enroute, Receipt and the
// Travel Log. Everything numeric that is NOT a case number belongs in <Num>.
export function Mono({
  children,
  size = 14,
  color = colors.ink,
  weight = '400',
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: '400' | '500' | '600';
  style?: StyleProp<TextStyle>;
}) {
  const family =
    weight === '600' ? mono.semibold : weight === '500' ? mono.medium : mono.regular;
  return (
    <Text style={[{ fontFamily: family, fontSize: size, color }, style]}>{children}</Text>
  );
}

export function PrimaryButton({
  label,
  onPress,
  // SOLID INK is the demo's primary button; blue is a rare variant it uses in one or two
  // places (Safe Travels). This defaulted to blue, so all 35 primary buttons in the app
  // were blue and none had asked to be — the home screen only looked right because it
  // hand-rolled its own ink style instead of using this component. Chad, 16 Aug: "the
  // blue for the bottom is not in accordance with this design, we prefer the color that
  // is as with the reserve travel button." Pass color={colors.blue} where the demo
  // genuinely calls for it.
  color = colors.solid,
  textColor = '#fff',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: disabled ? colors.disabled : color },
        pressed && !disabled && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      <Text style={[styles.primaryBtnText, { color: disabled ? colors.disabledText : textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  textColor = colors.ink,
  borderColor = colors.border,
  style,
}: {
  label: string;
  onPress: () => void;
  textColor?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineBtn,
        { borderColor },
        pressed && { transform: [{ scale: 0.97 }], borderColor: colors.ink },
        style,
      ]}
    >
      <Text style={[styles.outlineBtnText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

// The demo's .chip, exactly: padding 11/16, radius 11, 14px ink2 text on a white
// card with a line2 border; solid ink when on. No checkmark \u2014 the fill IS the state.
export function Chip({
  label,
  on,
  onPress,
  style,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      // The demo's chip is 39pt tall (11 + 17 + 11). The contract's 44pt minimum is met by
      // extending the touch area, not the drawing, so the geometry stays the demo's.
      hitSlop={{ top: 3, bottom: 3 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: on ? colors.ink : colors.card,
          borderColor: on ? colors.ink : colors.border,
        },
        pressed && { transform: [{ scale: 0.92 }] },
        style,
      ]}
    >
      <Text style={{ fontSize: 14, color: on ? colors.solidFg : colors.ink2 }}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({
  initials,
  size = 36,
}: {
  initials: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.36, fontWeight: '600', color: '#fff' }}>{initials}</Text>
    </View>
  );
}

export function Hairline() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline }} />;
}

// The demo's quick-access drawer — the ONE shell both sides share (the traveler and
// operator demos carry identical .scrim/.drawer CSS): scrim rgba(20,23,31,.42) fading
// .3s ease; left panel 78% wide (max 320) on the paper bg sliding −103% → 0 in .32s
// cubic-bezier(.2,.6,.2,1); padding 56/22/28 safe-area adjusted; the demo's own 44px
// ambient shadow (the no-shadow law is about cards — the demo shadows this panel).
export function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = React.useState(open);
  const slide = React.useRef(new Animated.Value(0)).current; // 0 offscreen · 1 open
  const fade = React.useRef(new Animated.Value(0)).current;
  const openRef = React.useRef(open);
  openRef.current = open;
  React.useEffect(() => {
    if (open) setMounted(true);
    const anim = Animated.parallel([
      Animated.timing(slide, {
        toValue: open ? 1 : 0,
        duration: 320,
        easing: Easing.bezier(0.2, 0.6, 0.2, 1),
        useNativeDriver: useNative,
      }),
      Animated.timing(fade, {
        toValue: open ? 1 : 0,
        duration: 300,
        easing: Easing.ease,
        useNativeDriver: useNative,
      }),
    ]);
    // Unmount whenever the closing motion ends — even interrupted — so a stalled
    // animation can never leave an invisible scrim over the whole app.
    anim.start(() => {
      if (!openRef.current) setMounted(false);
    });
    return () => anim.stop();
  }, [open, slide, fade]);
  // −330 clears the 320px max panel plus its shadow — the demo's −103%.
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-330, 0] });
  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* While closing, the scrim goes tap-through immediately (the demo's
          .scrim pointer-events:none the moment it's off). */}
      <View style={styles.drawerRoot} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.scrim, { opacity: fade }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.drawerPanel,
            {
              paddingTop: Math.max(insets.top + 14, 56), // the demo's 56 ≙ 42px status bar + 14
              paddingBottom: insets.bottom + 28,
              transform: [{ translateX }],
            },
          ]}
        >
          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// The demo's .drow: 15.5px regular row, hairline on TOP, faint chevron. Sign Out
// passes color=red and chev=false — the demo's sign-out drow carries no chevron.
export function DrawerRow({
  label,
  onPress,
  color = colors.ink,
  chev = true,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  chev?: boolean;
}) {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.drow}>
        <Text style={[styles.drowLabel, { color }]}>{label}</Text>
        {chev ? <Chev /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  grow: { flexGrow: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  // INK, not the demo's link blue. docs/OPEN-DECISIONS.md §0.6 asked the founders exactly this
  // — "keep the demo's link blue, or make it ink" — and Chad answered it on 18 Sept 2026 by
  // listing "‹ Back" among the blue controls to take the colour off. It was held once against
  // the open decision, which was wrong: his review IS the answer to it.
  backLink: { fontSize: 15, color: colors.ink },
  // .title{ font-size:27px; font-weight:600; letter-spacing:-.02em; margin:0 }
  title: {
    fontWeight: '600',
    letterSpacing: -0.54, // −.02em at 27px
    color: colors.ink,
    lineHeight: 32.4, // the demo leaves line-height normal (~1.2)
  },
  // .display{ font-size:34px; font-weight:600; letter-spacing:-.02em; line-height:1.12 }
  display: {
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -0.68,
    lineHeight: 38.1,
    color: colors.ink,
  },
  sub: { fontSize: 14.5, color: colors.muted, marginTop: 9, lineHeight: 21.75 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  primaryBtn: {
    borderRadius: radii.button,
    padding: 18,
    alignItems: 'center',
  },
  // Centred as an HTML button centres its label: a label that wraps ("Travel to Miami
  // International Airport again") otherwise sat left-aligned inside a centred box.
  primaryBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, textAlign: 'center' },
  // The demo's ghost button: same 18px padding and 16/600 text as the primary.
  outlineBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radii.button,
    padding: 18,
    alignItems: 'center',
  },
  outlineBtnText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.16, textAlign: 'center' },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radii.chip,
    borderWidth: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 22,
    marginBottom: 24, // .bar{ margin-bottom:24px } — the whole gap lives here
  },
  barIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  barLockup: { alignItems: 'center' },
  barBrand: { fontSize: 12, fontWeight: '600', letterSpacing: 3.12, color: colors.ink },
  barTagline: {
    fontSize: 7.5,
    fontWeight: '600',
    letterSpacing: 2.55,
    color: colors.faint,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.65,
    // ink2, NOT muted (Chad, 13 Sept 2026: the labels lack structural authority). This also
    // closes a finding of its own: muted on paper measures 3.24:1, below the 4.5:1 the
    // standing rubric asks of supporting text. ink2 measures 9.8:1. No new colour was
    // invented for it — "muted brass" is not in the palette, and the palette is hex-for-hex
    // the founders' demo.
    color: colors.ink2,
    textTransform: 'uppercase',
  },
  chev: { fontSize: 19, color: colors.faint },
  drawerRoot: { flex: 1 },
  drawerScroll: { flex: 1 },
  drawerContent: { paddingBottom: 10 },
  scrim: { flex: 1, backgroundColor: 'rgba(20,23,31,0.38)' },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '76%',
    maxWidth: 308,
    backgroundColor: colors.bg,
    paddingHorizontal: 22,
    boxShadow: '0 0 44px rgba(20,23,31,0.2)',
  },
  drow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  drowLabel: { fontSize: 14.5, color: colors.ink },
  noteWrap: { position: 'absolute', left: 24, right: 24 },
  note: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noteText: { fontSize: 13.5, color: '#fff', lineHeight: 19.5 },
});
