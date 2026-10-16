// The map on the home screen: where the traveler is, and nothing else.
//
// NO BADGE, NO CLAIM. This shows one thing, the traveler's own position, from the device's
// own fix — the same position the pickup is quoted from. It does not say LIVE or invent
// operators, and disappears rather than guessing when there is no confirmed departure.
// Unlike the route thumbnail, this MapLibre map supports ordinary pan and zoom gestures.
import { GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import Svg, { Circle, Path } from 'react-native-svg';
import { useLanguage } from '../state/LanguageContext';
import { MonoMap } from './MonoMap';
import { colors } from '../theme';

const ZOOM = 15.1; // street names and local landmarks are legible at the initial view

export function HomeMap({ lat, lng, onExploringChange }: {
  lat?: number | null;
  lng?: number | null;
  /** Disables parent page scrolling only during intentional map exploration. */
  onExploringChange?: (exploring: boolean) => void;
}) {
  const { t } = useLanguage();
  const camera = useRef<CameraRef>(null);
  const [exploring, setExploring] = useState(false);
  useEffect(() => () => onExploringChange?.(false), [onExploringChange]);
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const setExplore = (next: boolean) => {
    setExploring(next);
    onExploringChange?.(next);
  };
  const recenter = () => {
    // Reuse the already confirmed departure point. No GPS watch, network query,
    // new Firestore read, or change to the Traveler's booked pickup.
    camera.current?.easeTo({ center: [lng, lat], duration: 300 });
  };
  const here: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
  return (
    <MonoMap interactive={exploring} cameraRef={camera}
      frameKey={`${lat},${lng}`} view={{ center: [lng, lat], zoom: ZOOM }}
      overlay={
        <View style={styles.controls} pointerEvents="box-none">
          {exploring && (
            <Pressable accessibilityRole="button"
              accessibilityLabel={t('traveler.recenterPickup')}
              onPress={recenter} style={styles.control}>
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={7} stroke={colors.ink} strokeWidth={1.7} />
                <Path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" />
              </Svg>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" style={styles.control}
            onPress={() => setExplore(!exploring)}>
            <Text style={styles.controlText}>{t(exploring ? 'traveler.doneExploringMap' : 'traveler.exploreMap')}</Text>
          </Pressable>
        </View>
      }>
      <GeoJSONSource id="traveler" data={here}>
        {/* An ink dot with a muted-blue accuracy-style halo (not an accuracy guarantee): the app's own pin, not a platform's blue one. */}
        <Layer
          id="traveler-halo"
          type="circle"
          paint={{ 'circle-radius': 15, 'circle-color': '#DCE6EE', 'circle-opacity': 0.72 }}
        />
        <Layer
          id="traveler-dot"
          type="circle"
          paint={{
            'circle-radius': 6.5,
            'circle-color': colors.ink,
            'circle-stroke-color': colors.card,
            'circle-stroke-width': 2,
          }}
        />
      </GeoJSONSource>
    </MonoMap>
  );
}

const styles = StyleSheet.create({
  controls: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', gap: 8 },
  control: { minHeight: 42, paddingHorizontal: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.hairline, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 12.5, color: colors.ink, fontWeight: '600' },
});

export default HomeMap;
