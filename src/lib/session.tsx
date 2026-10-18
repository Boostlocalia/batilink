import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { PLANS, type Plan } from '@/lib/plans';
import { supabase } from '@/lib/supabase';

export type Company = {
  id: string;
  name: string;
  vat_number: string | null;
  postal_code: string | null;
  city: string | null;
  verified_at: string | null;
  kind: 'contractor' | 'architect' | 'supplier';
  verification_status: 'pending' | 'verified' | 'needs_review' | 'rejected';
  last_checked_at: string | null;
};

type SessionContextValue = {
  /** False until the stored session and the company have been read. */
  ready: boolean;
  session: Session | null;
  company: Company | null;
  plan: Plan;
  /** End of the free Pro trial, when the plan comes from it. */
  trialEndsAt: string | null;
  /** Whether the company may post and answer in the network (architects always, contractors on Pro/Complet). */
  canUseNetwork: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [plan, setPlan] = useState<Plan>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

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
        .select('id, name, vat_number, postal_code, city, verified_at, kind, verification_status, last_checked_at')
        .eq('id', profile.company_id)
        .single(),
      supabase.from('subscriptions').select('plan, status, trial_ends_at').eq('company_id', profile.company_id).maybeSingle(),
    ]);
    setCompany(c ?? null);
    setPlan(sub?.status === 'active' ? (sub.plan as Plan) : 'free');
    setTrialEndsAt(sub?.trial_ends_at ?? null);
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

  const canUseNetwork =
    !!company &&
    company.verification_status !== 'rejected' &&
    (company.kind === 'architect' || (company.kind === 'contractor' && PLANS[plan].network === 'full'));

  const refresh = useCallback(() => loadCompany(session), [loadCompany, session]);

  return (
    <SessionContext.Provider value={{ ready, session, company, plan, trialEndsAt, canUseNetwork, refresh }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
