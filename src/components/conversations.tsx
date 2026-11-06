import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompanyAvatar } from '@/components/company-avatar';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { chat, type ConversationView } from '@/lib/chat';
import { formatDate } from '@/lib/format';

/** The company's conversations, newest first. */
export function Conversations({ onUnread }: { onUnread?: (count: number) => void }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [list, setList] = useState<ConversationView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      chat<{ conversations: ConversationView[] }>({ action: 'list' }).then((res) => {
        if (!active) return;
        if (res.error) return setFailed(true);
        const conversations = res.data?.conversations ?? [];
        setList(conversations);
        onUnread?.(conversations.filter((c) => c.unread).length);
      });
      return () => {
        active = false;
      };
    }, [onUnread]),
  );

  if (failed) return <ThemedText themeColor="danger">{t.common.error}</ThemedText>;
  if (!list) return <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>;
  if (!list.length) return <ThemedText themeColor="textSecondary">{t.chat.empty}</ThemedText>;

  return (
    <Card>
      {list.map((c, i) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/discussion/[id]', params: { id: c.id } })}
          style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
          <CompanyAvatar name={c.other?.name ?? '?'} url={c.other?.logoUrl ?? null} size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type={c.unread ? 'smallBold' : 'small'}>{c.other?.name ?? ''}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[c.other?.city, formatDate(c.lastMessageAt.slice(0, 10), locale)].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          {c.status === 'pending' && !c.mine ? <Chip label={t.chat.requestChip} tone="warn" /> : null}
          {c.deal.confirmedAt ? <Chip label={t.chat.deal.kinds[c.deal.kind ?? 'other']} tone="good" /> : null}
          {c.unread ? <Chip label={t.chat.unread} tone="brand" /> : null}
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
});
