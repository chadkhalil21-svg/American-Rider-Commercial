// The map on the home screen: where the traveler is, and nothing else.
//
// NO BADGE, NO CLAIM. This shows one thing, the traveler's own position, from the device's
// own fix — the same position the pickup is quoted from. It does not say LIVE or invent
// operators, and disappears rather than guessing when there is no confirmed departure.
// Unlike the route thumbnail, this MapLibre map supports ordinary pan and zoom gestures.
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import React from 'react';
import { MonoMap } from './MonoMap';
import { colors } from '../theme';

const ZOOM = 15.1; // street names and local landmarks are legible at the initial view

export function HomeMap({ lat, lng }: { lat?: number | null; lng?: number | null }) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const here: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
  return (
    <MonoMap interactive frameKey={`${lat},${lng}`} view={{ center: [lng, lat], zoom: ZOOM }}>
      <GeoJSONSource id="traveler" data={here}>
        {/* An ink dot with a paper halo: the app's own pin, not a platform's blue one. */}
        <Layer
          id="traveler-halo"
          type="circle"
          paint={{ 'circle-radius': 11, 'circle-color': colors.card, 'circle-opacity': 0.85 }}
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

export default HomeMap;
