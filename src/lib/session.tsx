import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Plan } from '@/lib/plans';
import { supabase } from '@/lib/supabase';

export type Company = {
  id: string;
  name: string;
  vat_number: string | null;
  postal_code: string | null;
  city: string | null;
  verified_at: string | null;
};

type SessionContextValue = {
  /** False until the stored session and the company have been read. */
  ready: boolean;
  session: Session | null;
  company: Company | null;
  plan: Plan;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [plan, setPlan] = useState<Plan>('free');

  const loadCompany = useCallback(async (s: Session | null) => {
    if (!s) {
      setCompany(null);
      setPlan('free');
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', s.user.id).maybeSingle();
    if (!profile?.company_id) {
      setCompany(null);
      return;
    }
    const [{ data: c }, { data: sub }] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, vat_number, postal_code, city, verified_at')
        .eq('id', profile.company_id)
        .single(),
      supabase.from('subscriptions').select('plan, status').eq('company_id', profile.company_id).maybeSingle(),
    ]);
    setCompany(c ?? null);
    setPlan(sub?.status === 'active' ? (sub.plan as Plan) : 'free');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadCompany(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadCompany(s);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadCompany]);

  const refresh = useCallback(() => loadCompany(session), [loadCompany, session]);

  return (
    <SessionContext.Provider value={{ ready, session, company, plan, refresh }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
