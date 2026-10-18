import { useCallback, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { referralUrl } from '@/lib/links';
import { supabase } from '@/lib/supabase';

type Referral = { name: string; verified: boolean; rewarded: boolean };

/** The company's referral code, a share button and who signed up with it. */
export function ReferralCard() {
  const { t } = useI18n();
  const r = t.growth.referral;
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('my_company_profile').then(({ data }) => setCode((data as { referral_code?: string } | null)?.referral_code ?? null));
      supabase.rpc('my_referrals').then(({ data }) => setReferrals((data as Referral[] | null) ?? []));
    }, []),
  );

  if (!code) return null;
  const url = referralUrl(code);

  const share = async () => {
    const message = r.message(url);
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) await nav.share({ text: message }).catch(() => undefined);
      else {
        await nav?.clipboard?.writeText(message).catch(() => undefined);
        setCopied(true);
      }
      return;
    }
    await Share.share({ message }).catch(() => undefined);
  };

  return (
    <Card>
      <ThemedText type="subtitle">{r.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {r.lead}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
        <ThemedText type="small" themeColor="textSecondary">
          {r.code}
        </ThemedText>
        <ThemedText type="subtitle" themeColor="signal" selectable>
          {code}
        </ThemedText>
      </View>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={r.share} variant="signal" small onPress={share} />
      </View>
      {copied ? (
        <ThemedText type="small" themeColor="good">
          {r.copied}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {r.count(referrals.length)}
      </ThemedText>
      {referrals.map((ref) => (
        <View key={ref.name} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' }}>
          <ThemedText type="small">{ref.name}</ThemedText>
          <Chip label={ref.rewarded ? r.rewarded : r.waiting} tone={ref.rewarded ? 'good' : 'neutral'} />
        </View>
      ))}
    </Card>
  );
}
