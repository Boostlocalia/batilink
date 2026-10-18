import { View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Assistant } from '@/components/assistant';
import { useSession } from '@/lib/session';

export default function TabLayout() {
  const { company } = useSession();
  return (
    <View style={{ flex: 1 }}>
      <AppTabs />
      <Assistant audience={company?.kind === 'architect' ? 'architect' : 'contractor'} />
    </View>
  );
}
