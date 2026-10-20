import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { CompanyAvatar } from '@/components/company-avatar';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Option, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { chat, DEAL_KINDS, type ChatMessage, type ConversationView, type DealKind } from '@/lib/chat';
import { formatEuro, parseAmount } from '@/lib/format';

const REFRESH_MS = 5000;

/** Asks before an action the user cannot easily take back. */
function confirm(text: string): boolean {
  if (Platform.OS === 'web') return typeof window === 'undefined' || window.confirm(text);
  return true;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dealOpen, setDealOpen] = useState(false);
  const [dealKind, setDealKind] = useState<DealKind>('subcontract');
  const [dealAmount, setDealAmount] = useState('');
  const [dealNote, setDealNote] = useState('');

  const load = useCallback(async () => {
    const res = await chat<{ conversation: ConversationView; messages: ChatMessage[] }>({ action: 'thread', id });
    if (res.error || !res.data) return setFailed(true);
    setFailed(false);
    setConversation(res.data.conversation);
    setMessages(res.data.messages);
  }, [id]);

  // New messages show up while the conversation is open.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    const res = await chat<{ ok: boolean }>({ ...body, id });
    setBusy(null);
    if (res.error) {
      setError(res.error === 'too_many' ? t.chat.tooMany : t.common.error);
      return false;
    }
    await load();
    return true;
  };

  const send = async () => {
    if (await run('send', { action: 'send', body: draft })) setDraft('');
  };

  const confirmDeal = async () => {
    const amount = dealAmount.trim() ? parseAmount(dealAmount) : null;
    if (await run('deal', { action: 'deal', kind: dealKind, amount, note: dealNote })) setDealOpen(false);
  };

  if (failed && !conversation)
    return (
      <Screen withTabBar={false}>
        <ThemedText themeColor="danger">{t.common.error}</ThemedText>
        <Button label={t.common.retry} variant="ghost" small onPress={load} />
      </Screen>
    );
  if (!conversation)
    return (
      <Screen withTabBar={false}>
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      </Screen>
    );

  const other = conversation.other;
  const name = other?.name ?? '';
  const open = conversation.status === 'accepted' || (conversation.status === 'pending' && !conversation.mine);
  const deal = conversation.deal;

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: name }} />
      <View style={styles.header}>
        <CompanyAvatar name={name || '?'} url={other?.logoUrl ?? null} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText type="subtitle">{name}</ThemedText>
          {other?.city ? (
            <ThemedText type="small" themeColor="textSecondary">
              {other.city}
            </ThemedText>
          ) : null}
        </View>
        {other?.verified ? <Chip label={t.verification.status.verified} tone="good" /> : null}
      </View>

      {conversation.status === 'pending' && !conversation.mine ? (
        <Card style={{ backgroundColor: theme.warnBackground, borderColor: theme.warnBackground }}>
          <ThemedText type="smallBold">{t.chat.pendingTheirs(name)}</ThemedText>
          <View style={styles.wrap}>
            <Button label={t.chat.accept} small busy={busy === 'accept'} onPress={() => run('accept', { action: 'answer', answer: 'accept' })} />
            <Button label={t.chat.decline} variant="ghost" small busy={busy === 'decline'} onPress={() => run('decline', { action: 'answer', answer: 'decline' })} />
            <Button
              label={t.chat.block}
              variant="ghost"
              small
              busy={busy === 'block'}
              onPress={() => confirm(t.chat.blockConfirm) && run('block', { action: 'answer', answer: 'block' })}
            />
          </View>
        </Card>
      ) : null}
      {conversation.status === 'pending' && conversation.mine ? <ThemedText themeColor="textSecondary">{t.chat.pendingMine}</ThemedText> : null}
      {conversation.status === 'declined' ? <ThemedText themeColor="textSecondary">{t.chat.declined}</ThemedText> : null}
      {conversation.status === 'blocked' ? <ThemedText themeColor="textSecondary">{t.chat.blocked}</ThemedText> : null}

      <View style={{ gap: Spacing.two }}>
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.bubble,
              m.mine
                ? { alignSelf: 'flex-end', backgroundColor: theme.brand }
                : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement, borderColor: theme.line, borderWidth: 1 },
            ]}>
            <ThemedText themeColor={m.mine ? 'onBrand' : 'text'}>{m.body}</ThemedText>
            <ThemedText type="small" themeColor={m.mine ? 'onBrand' : 'textSecondary'} style={{ opacity: 0.7 }}>
              {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(m.createdAt))}
            </ThemedText>
          </View>
        ))}
      </View>

      {open ? (
        <Card>
          <Field label={t.chat.placeholder} value={draft} onChangeText={setDraft} multiline maxLength={4000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label={t.chat.send} variant="signal" busy={busy === 'send'} disabled={!draft.trim()} onPress={send} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t.chat.privacy}
          </ThemedText>
        </Card>
      ) : null}

      {conversation.status === 'accepted' ? (
        <Card>
          <ThemedText type="subtitle">{t.chat.deal.title}</ThemedText>
          {deal.confirmedAt ? (
            <ThemedText themeColor="good">{t.chat.deal.done}</ThemedText>
          ) : deal.mine ? (
            <ThemedText themeColor="textSecondary">{t.chat.deal.waiting(name)}</ThemedText>
          ) : deal.theirs ? (
            <ThemedText>{t.chat.deal.theirs(name)}</ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {t.chat.deal.lead}
            </ThemedText>
          )}
          {deal.kind && (deal.mine || deal.theirs) ? (
            <ThemedText type="small" themeColor="textSecondary">
              {[t.chat.deal.kinds[deal.kind], deal.amount !== null ? formatEuro(deal.amount, locale) : null, deal.note].filter(Boolean).join(' · ')}
            </ThemedText>
          ) : null}
          {deal.mine ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button label={t.chat.deal.undo} variant="ghost" small busy={busy === 'undeal'} onPress={() => run('undeal', { action: 'undeal' })} />
            </View>
          ) : dealOpen ? (
            <>
              <ThemedText type="smallBold">{t.chat.deal.kind}</ThemedText>
              <View style={styles.wrap}>
                {DEAL_KINDS.map((k) => (
                  <Option key={k} label={t.chat.deal.kinds[k]} selected={dealKind === k} onPress={() => setDealKind(k)} />
                ))}
              </View>
              <Field label={t.chat.deal.amount} value={dealAmount} onChangeText={setDealAmount} keyboardType="decimal-pad" />
              <Field label={t.chat.deal.note} value={dealNote} onChangeText={setDealNote} maxLength={500} />
              <View style={{ alignSelf: 'flex-start' }}>
                <Button label={t.chat.deal.confirm} variant="signal" busy={busy === 'deal'} onPress={confirmDeal} />
              </View>
            </>
          ) : (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button
                label={t.chat.deal.button}
                onPress={() => {
                  if (deal.kind) setDealKind(deal.kind);
                  if (deal.amount !== null) setDealAmount(String(deal.amount));
                  if (deal.note) setDealNote(deal.note);
                  setDealOpen(true);
                }}
              />
            </View>
          )}
        </Card>
      ) : null}

      {notice ? <ThemedText themeColor="good">{notice}</ThemedText> : null}
      <View style={styles.wrap}>
        <Button
          label={t.chat.report}
          variant="ghost"
          small
          busy={busy === 'report'}
          onPress={async () => {
            if (confirm(t.chat.reportConfirm) && (await run('report', { action: 'report' }))) setNotice(t.chat.reported);
          }}
        />
        {conversation.status === 'accepted' ? (
          <Button label={t.chat.block} variant="ghost" small busy={busy === 'block'} onPress={() => confirm(t.chat.blockConfirm) && run('block', { action: 'block' })} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  bubble: { maxWidth: '85%', borderRadius: Radius, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
});
