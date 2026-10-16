import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, PathProps } from 'react-native-svg';
import { colors } from '../theme';
import { RouteMap } from './RouteMap';
import { useRide } from '../state/RideContext';
import { useNative } from './anim';

// Route from the prototype: cubic bezier in a 358x170 design space.
const W = 358;
const H = 170;
const P0 = { x: 24, y: 128 };
const P1 = { x: 110, y: 44 };
const P2 = { x: 210, y: 150 };
const P3 = { x: 332, y: 54 };

const bezier = (t: number) => {
  const u = 1 - t;
  return {
    x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
    y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
  };
};

const bezierAngle = (t: number) => {
  const u = 1 - t;
  const dx =
    3 * u * u * (P1.x - P0.x) + 6 * u * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x);
  const dy =
    3 * u * u * (P1.y - P0.y) + 6 * u * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

const SAMPLES = 48;

// Animated adds collapsable={false}, which leaks to the DOM on web — strip it.
const PathSansCollapsable = React.forwardRef<Path, PathProps & { collapsable?: unknown }>(
  ({ collapsable: _collapsable, ...rest }, ref) => <Path ref={ref} {...rest} />,
);
const AnimatedPath = Animated.createAnimatedComponent(PathSansCollapsable);

// Real Android Travel uses the actual street route. Never draw a moving car on
// a fabricated six-second repeating path when an Operator is genuinely assigned.
// The iPhone-specific implementation draws a real car only from fresh Operator GPS.
export function LiveMap() {
  const { matchedOp, tripCoords, route } = useRide();
  if (!matchedOp?.demo) {
    return tripCoords ? <RouteMap pickup={tripCoords.pickup} dest={tripCoords.dest} route={route} /> : null;
  }
  return <DemoLiveMap />;
}

function DemoLiveMap() {
  const [width, setWidth] = useState(0);
  const scale = width > 0 ? width / W : 0;

  const drive = useRef(new Animated.Value(0)).current;
  const dash = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Car eases along the route, pauses briefly at the ends (like the prototype's 0-6% / 90-100% holds).
    const driveLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(drive, {
          toValue: 1,
          duration: 5900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: useNative,
        }),
        Animated.delay(700),
        Animated.timing(drive, { toValue: 0, duration: 0, useNativeDriver: useNative }),
      ]),
    );
    const dashLoop = Animated.loop(
      Animated.timing(dash, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    const ringLoop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: useNative,
      }),
    );
    driveLoop.start();
    dashLoop.start();
    ringLoop.start();
    return () => {
      driveLoop.stop();
      dashLoop.stop();
      ringLoop.stop();
    };
  }, [drive, dash, ring]);

  const { xs, ys, angles, input } = useMemo(() => {
    const input: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const angles: number[] = [];
    let prev = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      input.push(t);
      const p = bezier(t);
      xs.push(p.x);
      ys.push(p.y);
      // unwrap angles so interpolation never spins the long way round
      let a = bezierAngle(t);
      while (a - prev > 180) a -= 360;
      while (a - prev < -180) a += 360;
      angles.push(a);
      prev = a;
    }
    return { xs, ys, angles, input };
  }, []);

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let y = 36; y < H; y += 36) lines.push({ x1: 0, y1: y, x2: W, y2: y });
    for (let x = 44; x < W; x += 44) lines.push({ x1: x, y1: 0, x2: x, y2: H });
    return lines;
  }, []);

  const carX = drive.interpolate({
    inputRange: input,
    outputRange: xs.map((x) => (x - 11) * scale),
  });
  const carY = drive.interpolate({
    inputRange: input,
    outputRange: ys.map((y) => (y - 6) * scale),
  });
  const carRot = drive.interpolate({
    inputRange: input,
    outputRange: angles.map((a) => `${a}deg`),
  });
  const dashOffset = dash.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <View
      style={styles.map}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <>
          <Svg width={width} height={(H / W) * width} viewBox={`0 0 ${W} ${H}`}>
            {gridLines.map((l, i) => (
              <Line
                key={i}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="rgba(20,23,31,0.05)"
                strokeWidth={1.5}
              />
            ))}
            <Path
              d={`M${P0.x},${P0.y} C${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`}
              fill="none"
              stroke={colors.mapRoute}
              strokeWidth={6}
              strokeLinecap="round"
            />
            <AnimatedPath
              d={`M${P0.x},${P0.y} C${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`}
              fill="none"
              stroke={colors.blue}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="9 8"
              strokeDashoffset={dashOffset as unknown as number}
            />
            <Circle cx={P0.x} cy={P0.y} r={5} fill={colors.ink} stroke="#fff" strokeWidth={2.5} />
            <Circle cx={P3.x} cy={P3.y} r={6} fill={colors.blue} stroke="#fff" strokeWidth={2.5} />
          </Svg>
          {/* destination ping */}
          <Animated.View
            style={[
              styles.ring,
              {
                left: (P3.x - 13) * scale,
                top: (P3.y - 13) * scale,
                width: 26 * scale,
                height: 26 * scale,
                borderRadius: 13 * scale,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          {/* the car */}
          <Animated.View
            style={[
              styles.car,
              {
                width: 22 * scale,
                height: 12 * scale,
                borderRadius: 4 * scale,
                transform: [{ translateX: carX }, { translateY: carY }, { rotate: carRot }],
              },
            ]}
          >
            <View
              style={[
                styles.windshield,
                { left: 4 * scale, top: 2.5 * scale, width: 5 * scale, height: 7 * scale },
              ]}
            />
            <View
              style={[
                styles.rearWindow,
                { right: 4 * scale, top: 2.5 * scale, width: 4 * scale, height: 7 * scale },
              ]}
            />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    aspectRatio: W / H,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mapBg,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    backgroundColor: colors.blue,
  },
  car: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: colors.ink,
    boxShadow: '0 2px 5px rgba(20, 23, 31, 0.35)',
  },
  windshield: {
    position: 'absolute',
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  rearWindow: {
    position: 'absolute',
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
