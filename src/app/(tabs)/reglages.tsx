import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { LogoCard } from '@/components/logo-card';
import { DeleteAccountCard } from '@/components/delete-account-card';
import { LegalLinks } from '@/components/legal-links';
import { ReferralCard } from '@/components/referral-card';
import { VerificationCard } from '@/components/verification-card';
import { router } from 'expo-router';
import { Button, Card, Screen, Segmented } from '@/components/ui';
import { SettingsBanner } from '@/components/home-banners';
import { Spacing } from '@/constants/theme';
import { useI18n, type Language } from '@/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useI18n();
  const { session, company } = useSession();

  const [news, setNews] = useState<boolean | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => {
    if (!session) return;
    supabase.rpc('is_platform_admin').then(({ data }) => setPlatformAdmin(data === true));
  }, [session]);
  useEffect(() => {
    if (company?.kind !== 'contractor') return;
    supabase
      .from('companies')
      .select('news_emails')
      .eq('id', company.id)
      .single()
      .then(({ data }) => setNews(data?.news_emails ?? true));
  }, [company?.id, company?.kind]);

  const changeNews = (next: 'on' | 'off') => {
    if (!company) return;
    setNews(next === 'on');
    supabase.from('companies').update({ news_emails: next === 'on' }).eq('id', company.id).then(() => {});
  };

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    // E-mails to this company follow the same language.
    if (session) {
      supabase.from('profiles').update({ language: next }).eq('id', session.user.id).then(() => {});
      if (company) supabase.from('companies').update({ language: next }).eq('id', company.id).then(() => {});
    }
  };

  return (
    <Screen>
      <ThemedText type="title">{t.settings.title}</ThemedText>
      {company ? <SettingsBanner /> : null}
      <LogoCard />
      <Card>
        <ThemedText type="smallBold">{t.settings.language}</ThemedText>
        <Segmented<Language>
          value={language}
          onChange={changeLanguage}
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'nl', label: 'Nederlands' },
          ]}
        />
      </Card>
      {company ? (
        <Card>
          <ThemedText type="smallBold">{t.settings.company}</ThemedText>
          <View style={{ gap: Spacing.half }}>
            <ThemedText>{company.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[company.vat_number, [company.postal_code, company.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {session?.user.email}
            </ThemedText>
          </View>
        </Card>
      ) : null}
      {company?.kind === 'contractor' && news !== null ? (
        <Card>
          <ThemedText type="smallBold">{t.settings.news}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.settings.newsLead}
          </ThemedText>
          <Segmented<'on' | 'off'>
            value={news ? 'on' : 'off'}
            onChange={changeNews}
            options={[
              { value: 'on', label: t.settings.on },
              { value: 'off', label: t.settings.off },
            ]}
          />
        </Card>
      ) : null}
      <VerificationCard />
      <ReferralCard />
      {company ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={t.files.open} variant="ghost" onPress={() => router.push('/fichiers')} />
        </View>
      ) : null}
      {company?.kind === 'contractor' ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={t.growth.favourites.open} variant="ghost" onPress={() => router.push('/fournisseurs')} />
        </View>
      ) : company?.kind === 'supplier' ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={t.growth.supplierSpace.zones} variant="ghost" onPress={() => router.push('/zones')} />
        </View>
      ) : null}
      {platformAdmin && session ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label="Admin BatiNode" variant="signal" onPress={() => router.push('/admin')} />
        </View>
      ) : null}
      <Button label={t.settings.signOut} variant="ghost" onPress={() => supabase.auth.signOut()} />
      {session ? <DeleteAccountCard /> : null}
      <LegalLinks />
    </Screen>
  );
}
