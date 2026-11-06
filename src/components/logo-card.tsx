import { useState } from 'react';
import { View } from 'react-native';

import { CompanyAvatar } from '@/components/company-avatar';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { pickAndUploadLogo, removeLogo, type LogoError } from '@/lib/logo';
import { useSession } from '@/lib/session';

/** The company's profile picture: a photo or its logo, shown next to its name. */
export function LogoCard() {
  const { t } = useI18n();
  const { company, refresh } = useSession();
  const [busy, setBusy] = useState<'pick' | 'remove' | null>(null);
  const [error, setError] = useState<LogoError | null>(null);
  if (!company) return null;

  const pick = async () => {
    setError(null);
    setBusy('pick');
    const res = await pickAndUploadLogo(company.id);
    setBusy(null);
    if (res && !res.ok) return setError(res.error);
    if (res?.ok) await refresh();
  };

  const remove = async () => {
    setError(null);
    setBusy('remove');
    const ok = await removeLogo(company.id);
    setBusy(null);
    if (!ok) return setError('error');
    await refresh();
  };

  return (
    <Card>
      <ThemedText type="smallBold">{t.settings.logo}</ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <CompanyAvatar name={company.name} url={company.logo_url} size={72} />
        <View style={{ flex: 1, gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            {t.settings.logoLead}
          </ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            <Button small label={company.logo_url ? t.settings.logoChange : t.settings.logoPick} variant="signal" busy={busy === 'pick'} onPress={pick} />
            {company.logo_url ? <Button small label={t.settings.logoRemove} variant="ghost" busy={busy === 'remove'} onPress={remove} /> : null}
          </View>
        </View>
      </View>
      {error ? <ThemedText themeColor="danger">{t.settings.logoErrors[error]}</ThemedText> : null}
    </Card>
  );
}
