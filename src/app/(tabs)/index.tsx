import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompleteProfileCard } from '@/components/complete-profile-card';
import { NewsCarousel } from '@/components/home-banners';
import { RegisteredContractors } from '@/components/registered-contractors';
import { StartChecklist } from '@/components/start-checklist';
import { SupplierHome } from '@/components/supplier-home';
import { ThemedText } from '@/components/themed-text';
import { MyRequests, receivedOffers, useMyRequests, type RequestRow } from '@/components/my-requests';
import { Button, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { chat, type ConversationView } from '@/lib/chat';
import { useSession } from '@/lib/session';

export default function HomeScreen() {
  // Architects have no price requests: their home is the network.
  const { company } = useSession();
  if (company?.kind === 'architect') return <Redirect href="/reseau" />;
  if (company?.kind === 'supplier') return <SupplierHome />;
  return <ContractorHome />;
}

function ContractorHome() {
  const { t } = useI18n();
  const { company } = useSession();
  const mine = useMyRequests();
  const open = mine.requests?.filter((r) => r.status === 'sent').length ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="label" themeColor="textSecondary">
            {company?.name}
          </ThemedText>
          <ThemedText type="title">{t.home.hello}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.home.lead(open)}</ThemedText>
        </View>
        <Button label={t.home.newRequest} variant="signal" onPress={() => router.navigate('/nouvelle')} />
      </View>

      <Shortcuts requests={mine.requests} />

      {company ? null : <CompleteProfileCard text={t.signup.later.home} />}

      <NewsCarousel />

      {company ? <StartChecklist /> : null}

      <MyRequests {...mine} limit={5} />

      <RegisteredContractors />

      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={t.growth.favourites.open} variant="ghost" onPress={() => router.push('/fournisseurs')} />
      </View>
    </Screen>
  );
}

/** Two big doors at the top of the home: the supplier prices and the exchanges between contractors. */
function Shortcuts({ requests }: { requests: RequestRow[] | null }) {
  const { t } = useI18n();
  const s = t.home.shortcuts;
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      chat<{ conversations: ConversationView[] }>({ action: 'list' }).then((res) => {
        if (active) setUnread((res.data?.conversations ?? []).filter((c) => c.unread).length);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const open = requests?.filter((r) => r.status === 'sent') ?? [];
  const offers = open.reduce((n, r) => n + receivedOffers(r), 0);
  return (
    <View style={styles.tiles}>
      <Tile
        title={s.requests}
        text={requests === null ? '' : requests.length ? s.requestsLead(open.length, offers) : s.requestsEmpty}
        badge={offers ? s.offersBadge(offers) : null}
        onPress={() => router.push(requests?.length ? '/demandes' : '/nouvelle')}
      />
      <Tile
        title={s.exchanges}
        text={unread ? s.unread(unread) : s.exchangesLead}
        badge={unread ? String(unread) : null}
        onPress={() => router.push({ pathname: '/reseau', params: unread ? { vue: 'messages' } : {} })}
      />
    </View>
  );
}

function Tile({ title, text, badge, onPress }: { title: string; text: string; badge: string | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.line }, pressed && { opacity: 0.7 }]}>
      <View style={styles.tileHead}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {badge ? <Chip label={badge} tone="good" /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: 220, gap: Spacing.one, padding: Spacing.three, borderRadius: Spacing.three, borderWidth: 1 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.three },
  headerText: { gap: Spacing.one, flexShrink: 1, minWidth: 220 },
});
