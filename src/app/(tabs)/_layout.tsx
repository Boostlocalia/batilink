import { Redirect, usePathname } from 'expo-router';
import { View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Assistant } from '@/components/assistant';
import { useSession } from '@/lib/session';

/** Screens a contractor can still open once the trial is over, to choose a plan or sign out. */
const OPEN_AFTER_TRIAL = ['/abonnement', '/reglages'];

export default function TabLayout() {
  const { company, plan, trialEndsAt } = useSession();
  const pathname = usePathname();
  // After the 7-day trial a contractor must choose Starter or Premium to keep using the app.
  const mustChoose = company?.kind === 'contractor' && plan === 'free' && trialEndsAt !== null;
  if (mustChoose && !OPEN_AFTER_TRIAL.includes(pathname)) return <Redirect href="/abonnement" />;
  return (
    <View style={{ flex: 1 }}>
      <AppTabs />
      {/* Bati speaks to contractors and architects; suppliers have their own space. */}
      {company?.kind !== 'supplier' ? <Assistant audience={company?.kind === 'architect' ? 'architect' : 'contractor'} /> : null}
    </View>
  );
}
