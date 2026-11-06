import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { NODI_FACE } from '@/constants/nodi';

const LINE_MS = 4200;

/** Nodi's face with a speech bubble whose lines change every few seconds. */
export function NodiGreeting({ lines }: { lines: readonly string[] }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (lines.length < 2) return;
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: native }).start(() => {
        setIndex((i) => (i + 1) % lines.length);
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: native }).start();
      });
    }, LINE_MS);
    return () => clearTimeout(timer);
  }, [index, lines, opacity, native]);

  return (
    <View style={styles.row}>
      <View style={[styles.face, { borderColor: theme.signal }]}>
        <Image source={NODI_FACE} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="Nodi" />
      </View>
      <View style={[styles.bubble, { backgroundColor: theme.backgroundElement, borderColor: theme.signal }]}>
        <Animated.View style={{ opacity }}>
          <ThemedText type="smallBold">{lines[index % lines.length]}</ThemedText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  face: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, overflow: 'hidden' },
  bubble: { flexShrink: 1, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 40, justifyContent: 'center' },
});
