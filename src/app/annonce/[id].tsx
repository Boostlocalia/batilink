import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CompanyAvatar } from '@/components/company-avatar';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Screen } from '@/components/ui';
import { UpgradeCard } from '@/components/upgrade-card';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { formatDate, formatEuro } from '@/lib/format';
import { loadTrades, OPPORTUNITY_COLUMNS, type Opportunity, type Trade } from '@/lib/network';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Response = {
  id: string;
  company_id: string;
  message: string;
  status: 'sent' | 'shortlisted' | 'declined' | 'selected';
  created_at: string;
  company: { name: string; verification_status: string; city: string | null; logo_url: string | null } | null;
};

const RESPONSE_TONE = { sent: 'neutral', shortlisted: 'warn', declined: 'neutral', selected: 'good' } as const;

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language, locale } = useI18n();
  const { company, canUseNetwork, plan } = useSession();
  const [capped, setCapped] = useState(false);
  const [post, setPost] = useState<Opportunity | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [proposed, setProposed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const mine = post?.company_id === company?.id;

  const load = useCallback(async () => {
    const [p, r, a, tr] = await Promise.all([
      supabase.from('opportunities').select(OPPORTUNITY_COLUMNS).eq('id', id).single(),
      supabase
        .from('opportunity_responses')
        .select('id, company_id, message, status, created_at, company:companies(name, verification_status, city, logo_url)')
        .eq('opportunity_id', id)
        .order('created_at'),
      supabase.from('agreements').select('response_id').eq('opportunity_id', id).neq('status', 'cancelled'),
      loadTrades(),
    ]);
    if (p.error) return setFailed(true);
    setFailed(false);
    setPost(p.data as unknown as Opportunity);
    setResponses((r.data ?? []) as unknown as Response[]);
    setProposed(new Set((a.data ?? []).map((x) => x.response_id as string)));
    setTrades(tr);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const answer = async () => {
    if (!company || message.trim().length < 10) return;
    setBusy('answer');
    const { error } = await supabase.from('opportunity_responses').insert({ opportunity_id: id, company_id: company.id, message: message.trim() });
    setBusy(null);
    if (error) return plan === 'free' ? setCapped(true) : setNotice(t.common.error);
    setMessage('');
    load();
  };

  const sort = async (responseId: string, status: 'shortlisted' | 'declined') => {
    setBusy(responseId);
    await supabase.from('opportunity_responses').update({ status }).eq('id', responseId);
    setBusy(null);
    load();
  };

  const propose = async (r: Response) => {
    if (!post || !company) return;
    setBusy(r.id);
    const { error } = await supabase.from('agreements').insert({
      client_id: company.id,
      subcontractor_id: r.company_id,
      title: post.title,
      kind: post.kind === 'architect_project' ? 'referral' : 'subcontract',
      opportunity_id: post.id,
      response_id: r.id,
      amount_ex_vat: post.budget_ex_vat,
      starts_on: post.starts_on,
    });
    setBusy(null);
    setNotice(error ? t.common.error : t.network.detail.proposed);
    load();
  };

  const close = async () => {
    setBusy('close');
    await supabase.from('opportunities').update({ status: 'closed' }).eq('id', id);
    setBusy(null);
    load();
  };

  if (failed)
    return (
      <Screen withTabBar={false}>
        <Card>
          <ThemedText themeColor="danger">{t.common.error}</ThemedText>
          <Button label={t.common.retry} variant="ghost" small onPress={load} />
        </Card>
      </Screen>
    );
  if (!post)
    return (
      <Screen withTabBar={false}>
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      </Screen>
    );

  const myResponse = responses.find((r) => r.company_id === company?.id);
  const tradeLabel = (tid: number) => {
    const trade = trades.find((x) => x.id === tid);
    return trade ? (language === 'fr' ? trade.label_fr : trade.label_nl) : '';
  };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: post.title }} />
      <View style={{ gap: Spacing.one }}>
        <View style={styles.wrap}>
          <Chip label={post.kind === 'architect_project' ? t.network.project : t.network.subcontract} tone="brand" />
          {post.status !== 'open' ? <Chip label={t.network.detail.closed} /> : null}
        </View>
        <ThemedText type="title">{post.title}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {[
            post.company?.name,
            `${post.postal_code} ${post.city ?? ''}`.trim(),
            post.starts_on ? t.network.startsOn(formatDate(post.starts_on, locale)) : null,
            post.budget_ex_vat !== null ? t.network.budget(formatEuro(Number(post.budget_ex_vat), locale)) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>

      <Card>
        <ThemedText>{post.description}</ThemedText>
        <View style={styles.wrap}>
          {post.trade_ids.map((tid) => (
            <Chip key={tid} label={tradeLabel(tid)} />
          ))}
        </View>
      </Card>

      {notice ? (
        <Card>
          <ThemedText type="small">{notice}</ThemedText>
        </Card>
      ) : null}

      {mine ? (
        <Card>
          <ThemedText type="subtitle">{t.network.detail.answers}</ThemedText>
          {responses.length === 0 ? <ThemedText themeColor="textSecondary">{t.network.detail.noAnswers}</ThemedText> : null}
          {responses.map((r) => (
            <View key={r.id} style={styles.response}>
              <View style={styles.wrap}>
                {r.company ? <CompanyAvatar name={r.company.name} url={r.company.logo_url} size={28} /> : null}
                <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
                  {r.company?.name}
                </ThemedText>
                {r.company?.verification_status === 'verified' ? <Chip label={t.verification.status.verified} tone="good" /> : null}
                <Chip label={t.network.detail.responseStatus[r.status]} tone={RESPONSE_TONE[r.status]} />
              </View>
              <ThemedText type="small">{r.message}</ThemedText>
              {post.status === 'open' && r.status !== 'selected' && r.status !== 'declined' ? (
                <View style={styles.wrap}>
                  {proposed.has(r.id) ? (
                    <Chip label={t.agreements.status.proposed} tone="warn" />
                  ) : (
                    <Button
                      label={post.kind === 'architect_project' ? t.network.detail.refer : t.network.detail.propose}
                      small
                      busy={busy === r.id}
                      onPress={() => propose(r)}
                    />
                  )}
                  {r.status === 'sent' ? <Button label={t.network.detail.shortlist} variant="ghost" small onPress={() => sort(r.id, 'shortlisted')} /> : null}
                  {!proposed.has(r.id) ? <Button label={t.network.detail.decline} variant="ghost" small onPress={() => sort(r.id, 'declined')} /> : null}
                </View>
              ) : null}
            </View>
          ))}
          {post.status === 'open' ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button label={t.network.detail.close} variant="ghost" small busy={busy === 'close'} onPress={close} />
            </View>
          ) : null}
        </Card>
      ) : myResponse ? (
        <Card>
          <View style={styles.wrap}>
            <ThemedText type="smallBold">{t.network.detail.answered}</ThemedText>
            <Chip label={t.network.detail.responseStatus[myResponse.status]} tone={RESPONSE_TONE[myResponse.status]} />
          </View>
          <ThemedText type="small">{myResponse.message}</ThemedText>
        </Card>
      ) : post.status === 'open' ? (
        <Card>
          <ThemedText type="subtitle">{t.network.detail.answer}</ThemedText>
          {company?.kind !== 'contractor' ? (
            <ThemedText themeColor="textSecondary">{t.network.detail.onlyContractors}</ThemedText>
          ) : !canUseNetwork ? (
            <ThemedText themeColor="warn">{t.network.upgrade}</ThemedText>
          ) : capped ? (
            <UpgradeCard reason="network" />
          ) : (
            <>
              <Field
                label={t.network.detail.answer}
                placeholder={t.network.detail.answerPlaceholder}
                value={message}
                onChangeText={setMessage}
                multiline
                style={{ minHeight: 100, textAlignVertical: 'top' }}
              />
              <View style={{ alignSelf: 'flex-start' }}>
                <Button label={t.network.detail.send} variant="signal" busy={busy === 'answer'} disabled={message.trim().length < 10} onPress={answer} />
              </View>
            </>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignItems: 'center' },
  response: { gap: Spacing.one, paddingTop: Spacing.two },
});
