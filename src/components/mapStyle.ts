// The map uses subdued geographic colors solely inside MapLibre, while the app's
// typography, button and surface colors remain those of the institutional design system.
// Land, parks, water and street names are meaningful map context, not promotional color.
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { colors } from '../theme';

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors';

// Palette inspired by the approved home-screen concept; scoped to geographic features.
const map = {
  land: '#F7F7F4',
  park: '#E6ECDF',
  natural: '#EFF1EB',
  water: '#DCEAF0',
  minor: '#E4E4DF',
  middle: '#D4D5D1',
  major: '#B9BAB5',
  label: '#656B69',
  parkLabel: '#728270',
};

const name: unknown = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
const byZoom = (stops: [number, number][]): unknown => [
  'interpolate',
  ['exponential', 1.4],
  ['zoom'],
  ...stops.flat(),
];

// The three street ramps, by OpenMapTiles `class`. Widths are points at the zoom given.
const STREET = {
  major: { classes: ['motorway', 'trunk', 'primary'], color: map.major, width: byZoom([[9, 0.8], [13, 2.2], [16, 5], [19, 12]]) },
  middle: { classes: ['secondary', 'tertiary'], color: map.middle, width: byZoom([[11, 0.6], [13, 1.4], [16, 3.5], [19, 9]]) },
  minor: { classes: ['minor', 'service', 'residential', 'living_street', 'unclassified'], color: map.minor, width: byZoom([[13, 0.5], [15, 1.2], [17, 3], [19, 7]]) },
};

export const monoStyle: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': map.land } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: { 'fill-color': map.natural, 'fill-opacity': 0.7 },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': map.park },
    },
    {
      id: 'aeroway',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'aeroway',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': colors.fill },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': map.water, 'fill-antialias': true },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: { 'line-color': map.water, 'line-width': byZoom([[10, 0.6], [16, 2]]) as never },
    },
    {
      id: 'runway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'aeroway',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['runway', 'taxiway'], true, false]],
      paint: { 'line-color': colors.border, 'line-width': byZoom([[11, 1], [14, 4], [17, 14]]) as never },
    },
    ...(['minor', 'middle', 'major'] as const).map((k) => ({
      id: `street-${k}`,
      type: 'line' as const,
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], STREET[k].classes, true, false]] as never,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': STREET[k].color, 'line-width': STREET[k].width as never },
    })),
    {
      id: 'rail',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['rail', 'transit'], true, false]],
      paint: { 'line-color': map.middle, 'line-width': byZoom([[12, 0.6], [16, 1.6]]) as never, 'line-dasharray': [3, 2] },
    },
    {
      id: 'water-name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      minzoom: 10,
      layout: {
        'text-field': name as never,
        'text-font': ['Noto Sans Italic'],
        'text-size': 11,
        'text-letter-spacing': 0.1,
        'symbol-placement': 'point',
      },
      paint: { 'text-color': map.label, 'text-halo-color': map.land, 'text-halo-width': 1 },
    },
    {
      id: 'street-name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 14,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
      layout: {
        'text-field': name as never,
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'symbol-placement': 'line',
        'symbol-spacing': 280,
        'text-padding': 12,
      },
      paint: { 'text-color': map.label, 'text-halo-color': colors.bg, 'text-halo-width': 1.2 },
    },
    {
      id: 'park-name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'park',
      minzoom: 13,
      layout: {
        'text-field': name as never,
        'text-font': ['Noto Sans Regular'],
        'text-size': 10.5,
        'text-max-width': 9,
      },
      paint: {
        'text-color': map.parkLabel,
        'text-halo-color': map.land,
        'text-halo-width': 1,
      },
    },
    {
      id: 'place-name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 9,
      filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter'], true, false],
      layout: {
        'text-field': name as never,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['match', ['get', 'class'], 'city', 13, 'town', 12, 11] as never,
        'text-letter-spacing': 0.05,
        'text-padding': 8,
        'text-max-width': 8,
      },
      paint: { 'text-color': colors.muted, 'text-halo-color': colors.bg, 'text-halo-width': 1.2 },
    },
  ],
};
