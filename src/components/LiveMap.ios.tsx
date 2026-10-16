// The live trip map — the REAL one, on iPhone.
//
// Metro picks this file over LiveMap.tsx on iOS. Web (and Android, until we add a provider
// there) keeps the hand-drawn SVG version, which needs no API key and works offline.
//
// Apple Maps is free and needs no key, which is why it's the provider for an iOS-first launch.
// See docs/MAPS.md for the decision and when Google becomes worth paying for.
//
// Live Operator marker authority: use only a recent position from the Operator's phone,
// received through the existing Travel listener. Route and status are not evidence
// that a vehicle physically moved. Without a fresh report the marker is hidden.
// Demonstration-only operators may animate, but never on a paid production Travel.
// The map must not default to Miami when the journey's coordinates are unavailable.
import { AppleMaps } from 'expo-maps';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRide } from '../state/RideContext';
import { colors } from '../theme';

// Matches the SVG version's proportions so the ride screen doesn't jump between platforms.
const ASPECT = 358 / 170;

// Pick a zoom that fits a span with a little breathing room.
// Apple's zoom is logarithmic: +1 halves the visible span.
function zoomFor(latSpan: number, lngSpan: number) {
  const span = Math.max(Math.abs(latSpan), Math.abs(lngSpan), 0.003); // floor: don't over-zoom
  const z = Math.log2(360 / span) - 1.2; // -1.2 leaves margin so pins aren't at the edge
  return Math.min(16, Math.max(9, z));
}

type LatLng = { latitude: number; longitude: number };
type Marker = AppleMaps.Marker;
// The polyline type isn't re-exported by name, so lift it off the view's own props.
type Polyline = NonNullable<AppleMaps.MapProps['polylines']>[number];

// How far along his current path the car should be, per demo status step. Two phases:
// approaching the pickup (status 0-2), then driving the trip (status 3-5).
function targetFraction(status: number) {
  if (status <= 0) return 0.15;
  if (status === 1) return 0.6;
  if (status === 2) return 1; // "Miguel is here" — he has reached the pickup
  if (status === 3) return 0.45;
  if (status === 4) return 0.9;
  return 1; // arrived
}

// Point a fraction of the way along a polyline, measured by distance (not point count, which
// would make the car sprint through dense-curve sections and crawl on straights).
function pointAlong(line: LatLng[], lengths: number[], fraction: number): LatLng {
  const total = lengths[lengths.length - 1];
  if (total === 0) return line[0];
  const want = Math.min(1, Math.max(0, fraction)) * total;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < want) i++;
  const segLen = lengths[i] - lengths[i - 1] || 1;
  const t = (want - lengths[i - 1]) / segLen;
  return {
    latitude: line[i - 1].latitude + (line[i].latitude - line[i - 1].latitude) * t,
    longitude: line[i - 1].longitude + (line[i].longitude - line[i - 1].longitude) * t,
  };
}

function cumulative(line: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    const dx =
      (line[i].longitude - line[i - 1].longitude) *
      Math.cos((line[i].latitude * Math.PI) / 180);
    const dy = line[i].latitude - line[i - 1].latitude;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return cum;
}

const toLatLng = (c: { lat: number; lng: number }): LatLng => ({
  latitude: c.lat,
  longitude: c.lng,
});

export function LiveMap() {
  const { tripCoords, route, approachRoute, status, matchedOp, operatorLivePosition } = useRide();

  const phase: 'approach' | 'trip' = status <= 2 ? 'approach' : 'trip';

  // The path the car is currently driving. Street route when we have one; straight line
  // when we don't (routing down) — same animation either way.
  const carPath = useMemo<LatLng[] | null>(() => {
    if (!tripCoords) return null;
    const pickup = toLatLng(tripCoords.pickup);
    if (phase === 'approach') {
      if (!matchedOp) return null; // still "Finding your operator…" — no car yet
      return approachRoute
        ? approachRoute.coords.map(toLatLng)
        : [{ latitude: matchedOp.lat, longitude: matchedOp.lng }, pickup];
    }
    return route ? route.coords.map(toLatLng) : [pickup, toLatLng(tripCoords.dest)];
  }, [tripCoords, phase, matchedOp, approachRoute, route]);

  const carPathLengths = useMemo(
    () => (carPath && carPath.length > 1 ? cumulative(carPath) : null),
    [carPath],
  );

  // The car eases toward each status target rather than jumping. When the phase flips
  // (he reached you; now the trip starts) the car snaps back to the start of its new path.
  const [shownFraction, setShownFraction] = useState(0);
  const shownRef = useRef(0);
  const phaseRef = useRef(phase);
  useEffect(() => {
    if (phaseRef.current !== phase) {
      phaseRef.current = phase;
      shownRef.current = 0;
      setShownFraction(0);
    }
    const target = targetFraction(status);
    const timer = setInterval(() => {
      const gap = target - shownRef.current;
      if (Math.abs(gap) < 0.004) {
        shownRef.current = target;
        setShownFraction(target);
        clearInterval(timer);
        return;
      }
      shownRef.current += gap * 0.08;
      setShownFraction(shownRef.current);
    }, 250);
    return () => clearInterval(timer);
  }, [status, phase]);

  // Production never moves a car based on status or elapsed time. Use the fresh,
  // authenticated Travel's reported GPS; without one show NO car marker.
  const carPos = matchedOp?.demo === true
    ? (carPath && carPathLengths ? pointAlong(carPath, carPathLengths, shownFraction) : null)
    : (matchedOp && operatorLivePosition ? toLatLng(operatorLivePosition) : null);

  const { camera, markers, polylines } = useMemo(() => {
    if (!tripCoords) {
      return {
        camera: null as { coordinates: LatLng; zoom: number } | null,
        markers: [] as Marker[],
        polylines: [] as Polyline[],
      };
    }
    const pickup = toLatLng(tripCoords.pickup);
    const dest = toLatLng(tripCoords.dest);

    const markerList: Marker[] = [
      { id: 'pickup', coordinates: pickup, title: 'Pickup', tintColor: colors.ink },
      { id: 'dest', coordinates: dest, title: 'Destination', tintColor: colors.blue },
    ];
    if (carPos) {
      markerList.push({
        id: 'car',
        coordinates: carPos,
        systemImage: 'car.fill',
        tintColor: colors.ink,
      });
    }

    const lines: Polyline[] = [];
    const tripLine = route ? route.coords.map(toLatLng) : [pickup, dest];
    if (phase === 'approach') {
      // His path to you, drawn solid — the line the traveler is actually watching.
      if (carPath) lines.push({ coordinates: carPath, color: colors.blue, width: 4 });
      // The trip ahead, drawn soft — context, not the main event yet.
      lines.push({ coordinates: tripLine, color: colors.mapRoute, width: 3 });
    } else {
      lines.push({ coordinates: tripLine, color: colors.blue, width: 4 });
    }

    // THE SMART CAMERA. Approaching: follow the car — frame car↔pickup, so the view
    // tightens as he closes in. Riding: pull back and frame the whole trip.
    const camera =
      phase === 'approach' && carPos
        ? {
            coordinates: {
              latitude: (carPos.latitude + pickup.latitude) / 2,
              longitude: (carPos.longitude + pickup.longitude) / 2,
            },
            zoom: zoomFor(
              carPos.latitude - pickup.latitude,
              carPos.longitude - pickup.longitude,
            ),
          }
        : {
            coordinates: {
              latitude: (pickup.latitude + dest.latitude) / 2,
              longitude: (pickup.longitude + dest.longitude) / 2,
            },
            zoom: zoomFor(pickup.latitude - dest.latitude, pickup.longitude - dest.longitude),
          };

    return { camera, markers: markerList, polylines: lines };
  }, [tripCoords, phase, carPath, carPos, route]);

  // Unknown endpoints are not an excuse to show a fixed Miami map.
  if (!tripCoords || !camera) return null;

  return (
    <View style={styles.map}>
      <AppleMaps.View
        style={StyleSheet.absoluteFill}
        cameraPosition={camera}
        markers={markers}
        polylines={polylines}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    aspectRatio: ASPECT,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mapBg,
    overflow: 'hidden',
  },
});
