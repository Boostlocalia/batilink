import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { effectivePlan, type Plan } from '@/lib/plans';
import { readIntent } from '@/lib/signup-intent';
import { openedFromRecovery, supabase } from '@/lib/supabase';

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
  logo_url: string | null;
};

type SessionContextValue = {
  /** False until the stored session and the company have been read. */
  ready: boolean;
  session: Session | null;
  company: Company | null;
  plan: Plan;
  /** End of the free Pro trial, when the plan comes from it. */
  trialEndsAt: string | null;
  /** Whether the company may post and answer in the network (Test contractors 3 times a month, checked by the database). */
  canUseNetwork: boolean;
  /** Signed in without a company yet: a contractor visiting the app before filling in their company details. */
  browsing: boolean;
  refresh: () => Promise<void>;
  /** Signed in from a reset link: a new password must be chosen first. */
  recovering: boolean;
  endRecovery: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [plan, setPlan] = useState<Plan>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(openedFromRecovery);
  const [browsing, setBrowsing] = useState(false);

  const loadCompany = useCallback(async (s: Session | null) => {
    if (!s) {
      setCompany(null);
      setPlan('free');
      setBrowsing(false);
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', s.user.id).maybeSingle();
    if (!profile?.company_id) {
      // Suppliers and architects invited by a link go straight to their form; everyone else may look around first.
      const { profile: intended } = await readIntent();
      setCompany(null);
      setBrowsing(intended !== 'supplier' && intended !== 'architect');
      return;
    }
    setBrowsing(false);
    const [{ data: c }, { data: sub }] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, vat_number, postal_code, city, verified_at, kind, verification_status, last_checked_at, logo_url')
        .eq('id', profile.company_id)
        .single(),
      supabase.from('subscriptions').select('plan, status, trial_ends_at, provider_subscription_id').eq('company_id', profile.company_id).maybeSingle(),
    ]);
    setCompany(c ?? null);
    setPlan(effectivePlan(sub));
    setTrialEndsAt(sub?.trial_ends_at ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadCompany(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
      loadCompany(s);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadCompany]);

  const canUseNetwork =
    !!company &&
    company.verification_status !== 'rejected' &&
    (company.kind === 'architect' || company.kind === 'contractor');

  const refresh = useCallback(() => loadCompany(session), [loadCompany, session]);
  const endRecovery = useCallback(() => setRecovering(false), []);

  return (
    <SessionContext.Provider value={{ ready, session, company, plan, trialEndsAt, canUseNetwork, browsing, refresh, recovering, endRecovery }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
