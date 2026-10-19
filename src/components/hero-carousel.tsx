import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { bannerUrl, type Banner } from '@/lib/banners';

/** Neon accents that light up each slide in turn, on top of the lime signal colour. */
export const ACCENTS = { lime: '#d4ff3a', cyan: '#2ee6ff', magenta: '#ff3dc8', orange: '#ff8a1f', violet: '#9d6bff' } as const;
export type Accent = keyof typeof ACCENTS;

export type Slide = {
  key: string;
  image: Banner;
  accent: Accent;
  kicker: string;
  title: string;
  text: string;
  cta: string;
  onPress: () => void;
};

const ROTATE_MS = 6500;

// Dark on the text side, clear on the photo side: left to right on wide screens,
// bottom to top on phones where the text spans the whole width. Native shows a plain veil.
function veil(narrow: boolean): object {
  if (Platform.OS !== 'web') return { backgroundColor: 'rgba(9,9,11,0.6)' };
  return {
    backgroundImage: narrow
      ? 'linear-gradient(0deg, rgba(9,9,11,0.96) 0%, rgba(9,9,11,0.8) 55%, rgba(9,9,11,0.15) 100%)'
      : 'linear-gradient(90deg, rgba(9,9,11,0.94) 0%, rgba(9,9,11,0.72) 42%, rgba(9,9,11,0.05) 100%)',
  };
}

/** Photo banners with a hook line, rotating on their own; a tap on a dot jumps to that slide. */
export function HeroCarousel({ slides, height = 240 }: { slides: Slide[]; height?: number }) {
  const narrow = useWindowDimensions().width < 640;
  const [index, setIndex] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  const [lift] = useState(() => new Animated.Value(0));
  const count = slides.length;
  const current = slides[Math.min(index, count - 1)];

  const go = (next: number) => {
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      setIndex(next);
      lift.setValue(14);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(lift, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    });
  };

  useEffect(() => {
    if (count < 2) return;
    const timer = setTimeout(() => go((index + 1) % count), ROTATE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  if (!current) return null;
  const accent = ACCENTS[current.accent];

  return (
    <Pressable accessibilityRole="link" onPress={current.onPress} style={[styles.frame, { minHeight: narrow ? height + 120 : height, borderColor: accent, justifyContent: narrow ? 'flex-end' : 'center' }, glow(accent)]}>
      {/* Every photo stays mounted so the next one is already loaded when it fades in. */}
      {slides.map((s, i) => (
        <Image
          key={s.key}
          source={{ uri: bannerUrl(s.image) }}
          contentFit="cover"
          transition={400}
          style={[StyleSheet.absoluteFill, { opacity: i === index ? 1 : 0 }]}
        />
      ))}
      <View style={[StyleSheet.absoluteFill, veil(narrow)]} />
      <Animated.View style={[styles.content, narrow && { paddingBottom: Spacing.five }, { opacity, transform: [{ translateY: lift }] }]}>
        <View style={[styles.kicker, { backgroundColor: accent }]}>
          <ThemedText type="smallBold" style={styles.kickerText}>
            {current.kicker.toUpperCase()}
          </ThemedText>
        </View>
        <ThemedText type="title" style={[styles.title, { textShadowColor: accent }]}>
          {current.title}
        </ThemedText>
        <ThemedText style={styles.text}>{current.text}</ThemedText>
        <View style={[styles.cta, { backgroundColor: accent }, glow(accent)]}>
          <ThemedText type="smallBold" style={styles.ctaText}>
            {current.cta} →
          </ThemedText>
        </View>
      </Animated.View>
      {count > 1 ? (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={s.kicker}
              hitSlop={8}
              onPress={() => i !== index && go(i)}
              style={[styles.dot, i === index ? { width: 22, backgroundColor: accent } : null]}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function glow(color: string) {
  return Platform.OS === 'web' ? ({ boxShadow: `0 0 24px ${color}55` } as object) : { shadowColor: color, shadowOpacity: 0.5, shadowRadius: 16 };
}

const styles = StyleSheet.create({
  frame: { borderRadius: Radius + 4, borderWidth: 1, overflow: 'hidden', backgroundColor: '#09090b' },
  content: { padding: Spacing.four, gap: Spacing.two, maxWidth: 520 },
  kicker: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  kickerText: { color: '#09090b', fontSize: 11, letterSpacing: 1 },
  title: { color: '#ffffff', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  text: { color: '#e4e4ea' },
  cta: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, marginTop: Spacing.one },
  ctaText: { color: '#09090b' },
  dots: { position: 'absolute', right: Spacing.three, bottom: Spacing.three, flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
});
