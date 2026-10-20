import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Scrollable page with the content column centred and capped on wide screens. */
export function Screen({ children, withTabBar = true }: { children: ReactNode; withTabBar?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: (withTabBar ? BottomTabInset : 0) + Spacing.five }]}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.line }, style]}
      {...props}
    />
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'signal' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
};

export function Button({ label, onPress, variant = 'primary', disabled, busy, small }: ButtonProps) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.brand : variant === 'signal' ? theme.signal : 'transparent';
  const fg: ThemeColor = variant === 'primary' ? 'onBrand' : variant === 'signal' ? 'onSignal' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, borderColor: variant === 'ghost' ? theme.line : bg },
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color={theme[fg]} />
      ) : (
        <ThemedText type="smallBold" themeColor={fg}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'brand' }) {
  const theme = useTheme();
  const colors = {
    neutral: [theme.backgroundSelected, 'textSecondary'],
    good: [theme.goodBackground, 'good'],
    warn: [theme.warnBackground, 'warn'],
    brand: [theme.brand, 'onBrand'],
  } as const;
  const [bg, fg] = colors[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <ThemedText type="smallBold" themeColor={fg} style={styles.chipText}>
        {label}
      </ThemedText>
    </View>
  );
}

/** A pill that can be selected, for picking categories or trades. */
export function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.option, { borderColor: selected ? theme.brand : theme.line, backgroundColor: selected ? theme.brand : 'transparent' }]}>
      <ThemedText type="small" themeColor={selected ? 'onBrand' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A box to tick, for consents and yes/no answers. */
export function Check({ label, checked, onChange, error }: { label: string; checked: boolean; onChange: (checked: boolean) => void; error?: string | null }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.check}>
        <View style={[styles.checkBox, { borderColor: error ? theme.danger : checked ? theme.signal : theme.line, backgroundColor: checked ? theme.signal : 'transparent' }]}>
          {checked ? (
            <ThemedText type="smallBold" themeColor="onSignal" style={styles.checkMark}>
              ✓
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" style={styles.flex}>
          {label}
        </ThemedText>
      </Pressable>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null; hint?: string };

export function Field({ label, error, hint, style, ...input }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, borderColor: error ? theme.danger : theme.line, backgroundColor: theme.backgroundElement },
          style,
        ]}
        {...input}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A row of mutually exclusive options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  signal = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Black with the lime signal colour on the selected option, for choices that must stand out. */
  signal?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, signal ? { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.signal } : { backgroundColor: theme.backgroundSelected }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: signal ? theme.signal : theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor={selected ? (signal ? 'onSignal' : 'text') : signal ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.four },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  card: { borderWidth: 1, borderRadius: Radius, padding: Spacing.three, gap: Spacing.three },
  button: {
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: 12 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  chipText: { fontSize: 12, lineHeight: 18 },
  field: { gap: Spacing.one, flexGrow: 1, minWidth: 180 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  check: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkMark: { fontSize: 14, lineHeight: 18 },
  segmented: { flexDirection: 'row', borderRadius: 999, padding: 3, gap: 2, alignSelf: 'flex-start' },
  segment: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
