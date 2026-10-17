/**
 * BatiLink colours: slate-blue ink (the trade's blueprint blue) with site yellow
 * used sparingly for the main action. Defined for light and dark mode.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#16202b',
    textSecondary: '#56616d',
    background: '#eef0f2',
    backgroundElement: '#ffffff',
    backgroundSelected: '#e3e7eb',
    line: '#d9dde2',
    brand: '#1d3a5f',
    onBrand: '#ffffff',
    signal: '#f2b705',
    onSignal: '#2a2100',
    good: '#1f7a4d',
    goodBackground: '#e3f3ea',
    warn: '#9a6200',
    warnBackground: '#fdf1d6',
    danger: '#b3261e',
  },
  dark: {
    text: '#e8edf2',
    textSecondary: '#9aa7b4',
    background: '#0f151c',
    backgroundElement: '#17202a',
    backgroundSelected: '#222d38',
    line: '#2c3946',
    brand: '#7fa8d9',
    onBrand: '#0f151c',
    signal: '#f2b705',
    onSignal: '#2a2100',
    good: '#5cc38f',
    goodBackground: '#173326',
    warn: '#f0b14a',
    warnBackground: '#3a2c12',
    danger: '#f2b8b5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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

export const Radius = 10;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 960;
