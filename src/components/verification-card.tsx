import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Check = { kind: 'vat' | 'kbo'; outcome: 'ok' | 'warning' | 'failed' | 'unavailable'; findings: string[]; checked_at: string };

const STATUS_TONE = { pending: 'neutral', verified: 'good', needs_review: 'warn', rejected: 'neutral' } as const;
const OUTCOME_TONE = { ok: 'good', warning: 'warn', failed: 'neutral', unavailable: 'neutral' } as const;

/** The company's verification status and the latest answer from each register. */
export function VerificationCard() {
  const { t, locale } = useI18n();
  const { company, refresh } = useSession();
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('company_checks').select('kind, outcome, findings, checked_at').in('kind', ['vat', 'kbo']).order('checked_at', { ascending: false }).limit(20);
    // Latest result per register.
    const latest = new Map<string, Check>();
    for (const c of (data ?? []) as Check[]) if (!latest.has(c.kind)) latest.set(c.kind, c);
    setChecks([...latest.values()]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const recheck = async () => {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.functions.invoke('verify-company', { body: {} });
    setBusy(false);
    // A 429 means a check ran in the last few minutes.
    if (error) setNotice((error as { context?: { status?: number } }).context?.status === 429 ? t.verification.tooSoon : t.common.error);
    await refresh();
    load();
  };

  if (!company) return null;
  return (
    <Card>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>
          {t.verification.title}
        </ThemedText>
        <Chip label={t.verification.status[company.verification_status]} tone={STATUS_TONE[company.verification_status]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t.verification.lead}
      </ThemedText>
      {checks.map((c) => (
        <View key={c.kind} style={{ gap: 2 }}>
          <View style={styles.row}>
            <ThemedText type="small" style={{ flex: 1 }}>
              {t.verification.kinds[c.kind]}
            </ThemedText>
            <Chip label={t.verification.outcomes[c.outcome]} tone={OUTCOME_TONE[c.outcome]} />
          </View>
          {c.findings.map((f) => (
            <ThemedText key={f} type="small" themeColor="textSecondary">
              • {t.verification.findings[f] ?? f}
            </ThemedText>
          ))}
        </View>
      ))}
      {company.last_checked_at ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t.verification.lastChecked(formatDate(company.last_checked_at.slice(0, 10), locale))}
        </ThemedText>
      ) : null}
      {notice ? <ThemedText type="small">{notice}</ThemedText> : null}
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={t.verification.recheck} variant="ghost" small busy={busy} onPress={recheck} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
