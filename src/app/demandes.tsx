import { Stack } from 'expo-router';

import { MyRequests, useMyRequests } from '@/components/my-requests';
import { Screen } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Every price request of the company, from the home shortcut. */
export default function RequestsScreen() {
  const { t } = useI18n();
  const requests = useMyRequests();
  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: t.home.myRequests }} />
      <MyRequests {...requests} title={false} />
    </Screen>
  );
}
