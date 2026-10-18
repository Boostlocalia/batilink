import { useState } from 'react';

import { useSession } from '@/lib/session';

/** Days left in the free Pro trial, or null when the company is not on one. */
export function useTrial(): { onTrial: boolean; daysLeft: number | null; ended: boolean } {
  const { plan, trialEndsAt } = useSession();
  // Read the clock once per screen: the count only needs to be right to the day.
  const [now] = useState(() => Date.now());
  if (!trialEndsAt) return { onTrial: false, daysLeft: null, ended: false };
  const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - now) / 86_400_000);
  const onTrial = daysLeft > 0 && plan === 'pro';
  return { onTrial, daysLeft: onTrial ? daysLeft : null, ended: !onTrial && plan === 'free' };
}
