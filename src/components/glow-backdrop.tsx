import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { ACCENTS } from '@/components/hero-carousel';

const BLOBS = [
  { color: ACCENTS.lime, size: 420, top: '-12%', left: '-18%', dx: 60, dy: 40, ms: 14000 },
  { color: ACCENTS.cyan, size: 360, top: '35%', left: '65%', dx: -70, dy: 50, ms: 17000 },
  { color: ACCENTS.magenta, size: 300, top: '75%', left: '-10%', dx: 50, dy: -60, ms: 19000 },
] as const;

/** Soft neon lights drifting slowly behind a page. Purely decorative. */
export function GlowBackdrop() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {BLOBS.map((b) => (
        <Blob key={b.color} {...b} />
      ))}
    </View>
  );
}

function Blob({ color, size, top, left, dx, dy, ms }: (typeof BLOBS)[number]) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(t, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, ms]);
  const look =
    Platform.OS === 'web'
      ? ({ backgroundImage: `radial-gradient(circle, ${color}40 0%, ${color}00 70%)` } as object)
      : { backgroundColor: color, opacity: 0.08 };
  return (
    <Animated.View
      style={[
        { position: 'absolute', top, left, width: size, height: size, borderRadius: size / 2 },
        look,
        { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) }, { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) }] },
      ]}
    />
  );
}
