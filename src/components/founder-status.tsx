import { useEffect, useState, type ReactNode } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Founder = { number: number; ended: boolean };

/** The company's founder number and price guarantee; `fallback` for companies that are not founders. */
export function FounderStatus({ fallback }: { fallback: ReactNode }) {
  const { t } = useI18n();
  const f = t.growth.founders;
  const theme = useTheme();
  const { company } = useSession();
  const [founder, setFounder] = useState<Founder | null | undefined>(undefined);

  useEffect(() => {
    if (!company) return;
    let active = true;
    supabase
      .from('subscriptions')
      .select('founder_number, founder_ended_at')
      .eq('company_id', company.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setFounder(data?.founder_number ? { number: data.founder_number, ended: !!data.founder_ended_at } : null);
      });
    return () => {
      active = false;
    };
  }, [company]);

  if (!company) return <>{fallback}</>;
  if (founder === undefined) return null;
  if (!founder) return <>{fallback}</>;
  return (
    <Card style={!founder.ended ? { borderColor: theme.signal } : undefined}>
      <ThemedText type="subtitle" themeColor={founder.ended ? undefined : 'signal'}>
        {f.member(founder.number)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {founder.ended ? f.memberEnded(founder.number) : f.memberLead}
      </ThemedText>
    </Card>
  );
}
