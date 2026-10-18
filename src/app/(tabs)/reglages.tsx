import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VerificationCard } from '@/components/verification-card';
import { Button, Card, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n, type Language } from '@/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useI18n();
  const { session, company } = useSession();

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
      <VerificationCard />
      <Button label={t.settings.signOut} variant="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
