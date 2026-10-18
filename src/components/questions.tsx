import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

export type QuoteMessage = {
  id: string;
  quote_id: string;
  author: 'supplier' | 'contractor';
  body: string;
  relayed_body: string | null;
  item_labels: string[];
  created_at: string;
};

export type Conversation = { quoteId: string; supplierName: string; messages: QuoteMessage[] };

/** Supplier questions on a request, one conversation per supplier, with an answer box. */
export function Questions({ conversations, canAnswer, onSent }: { conversations: Conversation[]; canAnswer: boolean; onSent: () => void }) {
  const { t } = useI18n();
  if (!conversations.length) return null;
  return (
    <Card>
      <ThemedText type="subtitle">{t.questions.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t.questions.lead}
      </ThemedText>
      {conversations.map((c) => (
        <Thread key={c.quoteId} conversation={c} canAnswer={canAnswer} onSent={onSent} />
      ))}
    </Card>
  );
}

function Thread({ conversation, canAnswer, onSent }: { conversation: Conversation; canAnswer: boolean; onSent: () => void }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const last = conversation.messages[conversation.messages.length - 1];
  const waiting = last?.author === 'supplier';
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  const send = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('quote-message', { body: { quote_id: conversation.quoteId, body: answer } });
    setBusy(false);
    setFailed(Boolean(error));
    if (!error) {
      setAnswer('');
      onSent();
    }
  };

  return (
    <View style={[styles.thread, { borderTopColor: theme.line }]}>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>
          {conversation.supplierName}
        </ThemedText>
        {waiting ? <Chip label={t.questions.unanswered} tone="warn" /> : null}
      </View>
      {conversation.messages.map((m) => {
        const mine = m.author === 'contractor';
        return (
          <View
            key={m.id}
            style={[
              styles.bubble,
              mine ? styles.mine : styles.theirs,
              { backgroundColor: mine ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              {mine ? t.questions.you : conversation.supplierName} · {time(m.created_at)}
            </ThemedText>
            {/* The contractor reads suppliers in their own language, and their own words as written. */}
            <ThemedText type="small">{mine ? m.body : (m.relayed_body ?? m.body)}</ThemedText>
            {!mine && m.item_labels.length ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t.questions.about(m.item_labels.join(', '))}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
      {canAnswer ? (
        <View style={{ gap: Spacing.two }}>
          <Field
            label={t.questions.answer}
            value={answer}
            onChangeText={setAnswer}
            multiline
            style={{ minHeight: 72, textAlignVertical: 'top' }}
            error={failed ? t.common.error : undefined}
          />
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label={t.questions.send} small busy={busy} disabled={!answer.trim()} onPress={send} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bubble: { gap: 2, padding: Spacing.two, borderRadius: 10, maxWidth: 560 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
});
