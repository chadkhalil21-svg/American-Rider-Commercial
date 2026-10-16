// Web preview proxy for the native MapLibre home map.
//
// This is deliberately not a second map provider and it does not claim geographic precision.
// It reproduces the native MapLibre frame's exact proportion, palette, visual density, road
// hierarchy, water treatment, and traveler-position marker so design review on the Render
// preview sees the same compositional weight that the iOS/Android map occupies.
//
// Native builds continue to use HomeMap.tsx + MonoMap.tsx + the real MapLibre/OpenFreeMap map.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from './AppText';
import { colors } from '../theme';
import { useLanguage } from '../state/LanguageContext';

const MAP_ASPECT = 2.4; // must match MonoMap.tsx

// Static web design proxy intentionally cannot enter native MapLibre exploration mode.
export function HomeMap({ lat, lng }: { lat?: number | null; lng?: number | null; onExploringChange?: (exploring: boolean) => void }) {
  const { t } = useLanguage();
  const hasFix = typeof lat === 'number' && typeof lng === 'number';

  return (
    <View style={styles.wrap}>
      <View style={styles.frame} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 360 150" preserveAspectRatio="none">
          <Rect x="0" y="0" width="360" height="150" fill={colors.bg} />

          {/* restrained landcover / park fields */}
          <Path d="M0 0H118L94 55L0 74Z" fill={colors.fill} opacity={0.72} />
          <Path d="M252 0H360V150H308L291 101Z" fill={colors.border} opacity={0.86} />

          {/* minor streets */}
          <Path d="M-12 128L145 18M34 158L194 20M91 158L245 29M140 161L288 50" stroke={colors.border} strokeWidth="1.1" />
          <Path d="M-8 37L287 126M-9 67L274 147M29 8L316 92M88 -8L329 64" stroke={colors.border} strokeWidth="1.05" />

          {/* middle streets */}
          <Path d="M-8 107L178 -3M48 154L248 -1M121 156L302 29" stroke={colors.faint} strokeWidth="1.5" />
          <Path d="M-8 48L306 143M4 13L332 110" stroke={colors.faint} strokeWidth="1.35" />

          {/* one major corridor; the native style uses muted for major streets */}
          <Path d="M-12 88C74 76 124 63 193 49C238 40 279 32 319 12" stroke={colors.muted} strokeWidth="2.1" fill="none" strokeLinecap="round" />

          {/* subtle river/channel cut through the proxy, echoing the monochrome water treatment */}
          <Path d="M233 -5C242 30 233 56 246 83C256 104 279 116 295 155" stroke={colors.border} strokeWidth="13" fill="none" opacity={0.92} />

          {hasFix && (
            <>
              <Circle cx="179" cy="76" r="11" fill={colors.card} opacity={0.88} />
              <Circle cx="179" cy="76" r="6" fill={colors.ink} stroke={colors.card} strokeWidth="2" />
            </>
          )}
        </Svg>
      </View>
      <Text style={styles.attribution}>{t('traveler.mapAttribution')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  frame: {
    aspectRatio: MAP_ASPECT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.fill,
    overflow: 'hidden',
  },
  attribution: { fontSize: 10.5, color: colors.muted, textAlign: 'right', marginTop: 4 },
});

export default HomeMap;
