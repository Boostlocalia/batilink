/**
 * BatiLink colours ("Volt"): a near-black base with electric lime for the main
 * call to action (`signal`) and white as the second accent (`brand`: selected
 * pills, user chat bubbles). The app is dark only, so both schemes share one palette.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#f4f4f6',
  textSecondary: '#9b9ba6',
  background: '#09090b',
  backgroundElement: '#131316',
  backgroundSelected: '#1e1e23',
  line: '#2a2a31',
  brand: '#f4f4f6',
  onBrand: '#09090b',
  signal: '#d4ff3a',
  onSignal: '#09090b',
  good: '#3dffa2',
  goodBackground: '#0d2a1d',
  warn: '#ffc53d',
  warnBackground: '#2d2410',
  danger: '#ff6b78',
} as const;

export const Colors = { light: palette, dark: palette } as const;

export type ThemeColor = keyof typeof palette;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = 14;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 960;
