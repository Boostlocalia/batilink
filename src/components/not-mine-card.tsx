import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { useI18n } from '@/i18n';
import { keepReturnTo } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** An e-mail link to a page of another BatiNode account: say so, and reopen the page after signing in with the right one. */
export function NotMineCard({ path }: { path: string }) {
  const { t } = useI18n();
  const { company } = useSession();
  const switchAccount = async () => {
    await keepReturnTo(path);
    await supabase.auth.signOut({ scope: 'local' });
  };
  return (
    <Card>
      <ThemedText type="smallBold">{t.request.notMineTitle}</ThemedText>
      <ThemedText themeColor="textSecondary">{t.request.notMine(company?.name ?? '')}</ThemedText>
      <Button label={t.request.switchAccount} onPress={switchAccount} />
    </Card>
  );
}
