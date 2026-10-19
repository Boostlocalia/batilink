import { Image } from 'expo-image';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/** "Dupont Construction SRL" → "DC". */
function initials(name: string): string {
  const words = name.replace(/\b(srl|sprl|sa|bv|bvba|nv|sc|asbl|vzw)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** A company's photo or logo, or its initials in lime on black when it has none. */
export function CompanyAvatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={url} accessibilityLabel={name} contentFit="cover" style={[round, { backgroundColor: '#ffffff' }]} />;
  }
  return (
    <View accessibilityLabel={name} style={[round, { backgroundColor: '#09090b', borderWidth: 1, borderColor: '#d4ff3a', alignItems: 'center', justifyContent: 'center' }]}>
      <ThemedText style={{ color: '#d4ff3a', fontWeight: '700', fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.46) }}>{initials(name)}</ThemedText>
    </View>
  );
}
