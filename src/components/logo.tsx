import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@/constants/brand';

const INK = '#f4f4f6';
const SIGNAL = '#d4ff3a';

// Three links leaving the node, as angle in degrees (0 = right, clockwise).
const LINKS = [-40, 30, 160];

/** The "o" of batinode drawn as a network node: a lime ring, its hub, and three linked satellites. */
export function NodeMark({ size }: { size: number }) {
  const ring = Math.max(2, Math.round(size * 0.14));
  const hub = size * 0.3;
  const sat = Math.max(3, size * 0.18);
  const reach = size * 0.8;
  const line = Math.max(1, size * 0.07);
  return (
    <View style={{ width: size, height: size }}>
      {LINKS.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const cx = size / 2 + Math.cos(rad) * reach;
        const cy = size / 2 + Math.sin(rad) * reach;
        return (
          <View key={deg} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View
              style={{
                position: 'absolute',
                left: size / 2,
                top: size / 2 - line / 2,
                width: reach,
                height: line,
                backgroundColor: SIGNAL,
                opacity: 0.7,
                transformOrigin: 'left center',
                transform: [{ rotate: `${deg}deg` }],
              }}
            />
            <View style={{ position: 'absolute', left: cx - sat / 2, top: cy - sat / 2, width: sat, height: sat, borderRadius: sat, backgroundColor: SIGNAL }} />
          </View>
        );
      })}
      <View style={[StyleSheet.absoluteFill, { borderRadius: size, borderWidth: ring, borderColor: SIGNAL, backgroundColor: '#09090b' }]} />
      <View style={{ position: 'absolute', left: (size - hub) / 2, top: (size - hub) / 2, width: hub, height: hub, borderRadius: hub, backgroundColor: SIGNAL }} />
    </View>
  );
}

/** "batinode" written out, its "o" slightly larger than the letters and turned into a network node. */
export function Logo({ size = 22 }: { size?: number }) {
  const node = size * 0.68;
  const text = { color: INK, fontSize: size, lineHeight: size * 1.2, fontWeight: '800' as const, letterSpacing: -size * 0.02 };
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={APP_NAME} style={styles.row}>
      <Text style={text}>batin</Text>
      <View style={{ marginHorizontal: size * 0.09, marginBottom: size * 0.27 }}>
        <NodeMark size={node} />
      </View>
      <Text style={text}>de</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'flex-start' },
});
