import { Stack } from 'expo-router';

import { ReferralCard } from '@/components/referral-card';
import { Screen } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Where "Inviter un collègue" leads: the referral code and link, nothing else to scroll past. */
export default function ReferralScreen() {
  const { t } = useI18n();
  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: t.growth.referral.title }} />
      <ReferralCard />
    </Screen>
  );
}
