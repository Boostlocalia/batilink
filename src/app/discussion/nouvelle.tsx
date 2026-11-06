import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { chat } from '@/lib/chat';

/** The first message to a company: a contact request. */
export default function NewConversationScreen() {
  const { company, name, post } = useLocalSearchParams<{ company: string; name?: string; post?: string }>();
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await chat<{ id: string }>({ action: 'start', company_id: company, body, opportunity_id: post });
    setBusy(false);
    if (res.error || !res.data) return setError(res.error === 'too_many' ? t.chat.tooMany : t.common.error);
    router.replace({ pathname: '/discussion/[id]', params: { id: res.data.id } });
  };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: name ? t.chat.writeTo(name) : t.chat.write }} />
      <ThemedText type="title">{name ? t.chat.writeTo(name) : t.chat.write}</ThemedText>
      <ThemedText themeColor="textSecondary">{t.chat.firstLead}</ThemedText>
      <Card>
        <Field
          label={t.chat.placeholder}
          placeholder={t.chat.firstPlaceholder}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />
        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
        <Button label={t.chat.send} variant="signal" busy={busy} disabled={body.trim().length < 2} onPress={send} />
        <ThemedText type="small" themeColor="textSecondary">
          {t.chat.privacy}
        </ThemedText>
      </Card>
    </Screen>
  );
}
