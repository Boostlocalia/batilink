import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { AGREEMENT_COLUMNS, splitFinding, type Agreement } from '@/lib/network';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const TONE = { proposed: 'warn', awaiting_retention_ack: 'warn', confirmed: 'good', blocked: 'neutral', cancelled: 'neutral' } as const;

/** The company's agreements, with the step each side has to take. */
export function Agreements() {
  const { t } = useI18n();
  const [list, setList] = useState<Agreement[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('agreements').select(AGREEMENT_COLUMNS).order('created_at', { ascending: false }).limit(50);
    setFailed(Boolean(error));
    if (!error) setList(data as unknown as Agreement[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (failed)
    return (
      <Card>
        <ThemedText themeColor="danger">{t.common.error}</ThemedText>
        <Button label={t.common.retry} variant="ghost" small onPress={load} />
      </Card>
    );
  if (!list) return <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>;
  if (!list.length)
    return (
      <Card>
        <ThemedText themeColor="textSecondary">{t.agreements.empty}</ThemedText>
      </Card>
    );
  return (
    <>
      {list.map((a) => (
        <AgreementCard key={a.id} agreement={a} onChange={load} />
      ))}
    </>
  );
}

function AgreementCard({ agreement: a, onChange }: { agreement: Agreement; onChange: () => void }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const { company } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [ack, setAck] = useState(false);
  const [contacts, setContacts] = useState<{ company_id: string; name: string; email: string | null }[] | null>(null);

  const isClient = a.client_id === company?.id;
  const other = isClient ? a.subcontractor?.name : a.client?.name;
  const pct = (n: number) => `${Number(n).toLocaleString(locale)} %`;
  const debts = Number(a.retention_social_pct) > 0 || Number(a.retention_tax_pct) > 0;

  const act = async (body: object) => {
    setBusy(true);
    const { error: e } = await supabase.functions.invoke('accept-agreement', { body: { agreement_id: a.id, ...body } });
    setBusy(false);
    setError(Boolean(e));
    onChange();
  };

  const cancel = async () => {
    setBusy(true);
    await supabase.from('agreements').update({ status: 'cancelled' }).eq('id', a.id);
    setBusy(false);
    onChange();
  };

  const showContacts = async () => {
    const { data } = await supabase.rpc('agreement_contacts', { p_agreement_id: a.id });
    setContacts((data ?? []).filter((c: { company_id: string }) => c.company_id !== company?.id));
  };

  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          <ThemedText type="subtitle">{a.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.agreements.with(other ?? '')} · {isClient ? t.verification.client : t.verification.subcontractor}
          </ThemedText>
        </View>
        <Chip label={t.agreements.status[a.status]} tone={TONE[a.status]} />
      </View>

      {a.checked_at ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t.agreements.checkedAt(formatDate(a.checked_at.slice(0, 10), locale))}
        </ThemedText>
      ) : null}

      {a.status === 'blocked' ? (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" themeColor="danger">
            {t.agreements.blockedLead}
          </ThemedText>
          {a.blocked_findings.map((f) => {
            const { side, code } = splitFinding(f);
            return (
              <ThemedText key={f} type="small">
                • {side ? `${side === 'client' ? t.verification.client : t.verification.subcontractor} : ` : ''}
                {t.verification.findings[code] ?? code}
              </ThemedText>
            );
          })}
        </View>
      ) : null}

      {a.status === 'proposed' && !isClient ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={busy ? t.agreements.checking : t.agreements.accept} variant="signal" busy={busy} onPress={() => act({})} />
        </View>
      ) : null}

      {a.status === 'awaiting_retention_ack' ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small">{t.agreements.retentionLead(pct(a.retention_social_pct), pct(a.retention_tax_pct))}</ThemedText>
          {isClient ? (
            <>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ack }} onPress={() => setAck((v) => !v)} style={styles.row}>
                <View style={[styles.box, { borderColor: ack ? theme.brand : theme.line, backgroundColor: ack ? theme.brand : 'transparent' }]}>
                  {ack ? (
                    <ThemedText type="smallBold" themeColor="onBrand">
                      ✓
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText type="small" style={{ flex: 1 }}>
                  {t.agreements.retentionAck}
                </ThemedText>
              </Pressable>
              <View style={{ alignSelf: 'flex-start' }}>
                <Button
                  label={busy ? t.agreements.checking : t.agreements.confirmRetention}
                  variant="signal"
                  busy={busy}
                  disabled={!ack}
                  onPress={() => act({ acknowledge_retention: true })}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {a.status === 'confirmed' && a.kind === 'referral' && debts ? (
        <ThemedText type="small" themeColor="warn">
          {t.agreements.referralDebts(pct(a.retention_social_pct), pct(a.retention_tax_pct))}
        </ThemedText>
      ) : null}

      {a.status === 'confirmed' ? (
        contacts ? (
          contacts.map((c) => (
            <View key={c.company_id}>
              <ThemedText type="smallBold">{c.name}</ThemedText>
              <ThemedText type="small">{c.email ?? '–'}</ThemedText>
            </View>
          ))
        ) : (
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label={t.agreements.contacts} small onPress={showContacts} />
          </View>
        )
      ) : null}

      {isClient && ['proposed', 'awaiting_retention_ack', 'blocked'].includes(a.status) ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={t.agreements.cancel} variant="ghost" small onPress={cancel} />
        </View>
      ) : null}
      {error ? <ThemedText themeColor="danger">{t.common.error}</ThemedText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
