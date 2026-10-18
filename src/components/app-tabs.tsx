import { NativeTabs } from 'expo-router/native-tabs';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';

export default function AppTabs() {
  const colors = Colors.dark;
  const { t } = useI18n();
  // Architects work in the network only; price requests and plans are for contractors.
  const kind = useSession().company?.kind;
  const contractor = kind === 'contractor';

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ selected: { color: colors.signal } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t.tabs.home}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reseau" hidden={kind === 'supplier'}>
        <NativeTabs.Trigger.Label>{t.tabs.network}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="nouvelle" hidden={!contractor}>
        <NativeTabs.Trigger.Label>{t.tabs.newRequest}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus.rectangle.on.rectangle" md="add_box" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="abonnement" hidden={!contractor}>
        <NativeTabs.Trigger.Label>{t.tabs.plans}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="creditcard" md="credit_card" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reglages">
        <NativeTabs.Trigger.Label>{t.tabs.settings}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
