import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { PLANS } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Network exchanges (posts and answers) left this month, or null when the plan has no limit. */
export function useNetworkLeft(): number | null {
  const { company, plan } = useSession();
  const limit = company?.kind === 'contractor' ? PLANS[plan].networkExchangesPerMonth : Infinity;
  const [used, setUsed] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!Number.isFinite(limit)) return;
      supabase.rpc('my_network_exchanges').then(({ data }) => setUsed(typeof data === 'number' ? data : 0));
    }, [limit]),
  );

  if (!Number.isFinite(limit) || used === null) return null;
  return Math.max(0, limit - used);
}
