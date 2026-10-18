import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Option } from '@/components/ui';
import { APP_NAME, ASSISTANT_NAME } from '@/constants/brand';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { anonHeaders, functionsUrl, supabase } from '@/lib/supabase';

export type Audience = 'contractor' | 'architect' | 'supplier';

type Turn = { role: 'user' | 'assistant'; content: string };

/**
 * The assistant: a welcome guide the first time (per audience), then a round
 * button that opens a chat. Suppliers pass the token of their link.
 */
export function Assistant({ audience, token }: { audience: Audience; token?: string }) {
  const [open, setOpen] = useState<'guide' | 'chat' | null>(null);
  const key = `guide-seen:${audience}`;

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (!seen) setOpen('guide');
      })
      .catch(() => undefined);
  }, [key]);

  const closeGuide = (next: 'chat' | null) => {
    AsyncStorage.setItem(key, '1').catch(() => undefined);
    setOpen(next);
  };

  return (
    <>
      <LauncherButton onPress={() => setOpen('chat')} />
      <Modal visible={open === 'guide'} transparent animationType="fade" onRequestClose={() => closeGuide(null)}>
        <Guide audience={audience} onStart={() => closeGuide(null)} onAsk={() => closeGuide('chat')} />
      </Modal>
      <Modal visible={open === 'chat'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(null)}>
        <Chat audience={audience} token={token} onClose={() => setOpen(null)} />
      </Modal>
    </>
  );
}

function LauncherButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.assistant.open(ASSISTANT_NAME)}
      onPress={onPress}
      style={[styles.launcher, { backgroundColor: theme.signal, shadowColor: theme.signal }]}>
      <ThemedText type="subtitle" themeColor="onSignal">
        ?
      </ThemedText>
    </Pressable>
  );
}

function Guide({ audience, onStart, onAsk }: { audience: Audience; onStart: () => void; onAsk: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.backdrop}>
      <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
        <ScrollView contentContainerStyle={{ gap: Spacing.three, padding: Spacing.four }}>
          <Avatar />
          <ThemedText type="title">{t.guide.title(APP_NAME)}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.guide.intro(ASSISTANT_NAME)}</ThemedText>
          {t.guide.steps[audience].map(([title, text], i) => (
            <View key={title} style={styles.step}>
              <View style={[styles.number, { backgroundColor: theme.brand }]}>
                <ThemedText type="smallBold" themeColor="onBrand">
                  {i + 1}
                </ThemedText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold">{title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {text}
                </ThemedText>
              </View>
            </View>
          ))}
          <View style={styles.actions}>
            <Button label={t.guide.start} variant="signal" onPress={onStart} />
            <Button label={t.guide.ask(ASSISTANT_NAME)} variant="ghost" onPress={onAsk} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function Chat({ audience, token, onClose }: { audience: Audience; token?: string; onClose: () => void }) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setFailed(false);
    try {
      const body = { messages: next, language, token };
      let reply: string | undefined;
      if (token) {
        const res = await fetch(`${functionsUrl}/assistant`, {
          method: 'POST',
          headers: { ...anonHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        reply = res.ok ? ((await res.json()) as { reply?: string }).reply : undefined;
      } else {
        const { data } = await supabase.functions.invoke('assistant', { body });
        reply = (data as { reply?: string } | null)?.reply;
      }
      if (reply) setTurns([...next, { role: 'assistant', content: reply }]);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: theme.line }]}>
          <Avatar small />
          <ThemedText type="smallBold" style={{ flex: 1 }}>
            {t.assistant.title(ASSISTANT_NAME)}
          </ThemedText>
          <Button label={t.assistant.close} variant="ghost" small onPress={onClose} />
        </View>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          <Bubble role="assistant" text={t.assistant.hello(ASSISTANT_NAME)} />
          {turns.length === 0 ? (
            <View style={styles.suggestions}>
              {t.assistant.suggestions[audience].map((s) => (
                <Option key={s} label={s} selected={false} onPress={() => ask(s)} />
              ))}
            </View>
          ) : null}
          {turns.map((turn, i) => (
            <Bubble key={i} role={turn.role} text={turn.content} />
          ))}
          {busy ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t.assistant.thinking(ASSISTANT_NAME)}
            </ThemedText>
          ) : null}
          {failed ? (
            <ThemedText type="small" themeColor="danger">
              {t.assistant.unavailable}
            </ThemedText>
          ) : null}
        </ScrollView>
        <View style={[styles.composer, { borderTopColor: theme.line }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t.assistant.placeholder}
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={2000}
            style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
          />
          <Button label={t.assistant.send} variant="signal" busy={busy} disabled={!input.trim()} onPress={() => ask(input)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ role, text }: { role: Turn['role']; text: string }) {
  const theme = useTheme();
  const mine = role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        mine ? { alignSelf: 'flex-end', backgroundColor: theme.brand } : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement },
      ]}>
      <ThemedText type="small" themeColor={mine ? 'onBrand' : 'text'}>
        {text}
      </ThemedText>
    </View>
  );
}

/** The assistant's face: its initial on the brand colour (a proper character comes with the branding). */
function Avatar({ small }: { small?: boolean }) {
  const theme = useTheme();
  const size = small ? 32 : 56;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.brand }]}>
      <ThemedText type={small ? 'smallBold' : 'subtitle'} themeColor="onBrand">
        {ASSISTANT_NAME.slice(0, 1)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  launcher: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Platform.OS === 'web' ? Spacing.three : 96,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: Spacing.three },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 16 },
  step: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  number: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderBottomWidth: 1 },
  messages: { gap: Spacing.two, padding: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  bubble: { padding: Spacing.two + 2, borderRadius: 12, maxWidth: '85%' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
