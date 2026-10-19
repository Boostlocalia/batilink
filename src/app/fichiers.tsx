import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CompleteProfileCard } from '@/components/complete-profile-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import {
  isSpreadsheet,
  listCompanyFiles,
  openCompanyFile,
  pickFile,
  readStoredItems,
  removeCompanyFile,
  setPendingItems,
  uploadCompanyFile,
  type CompanyFile,
} from '@/lib/files';
import { formatDate } from '@/lib/format';
import { PLANS } from '@/lib/plans';
import { useSession } from '@/lib/session';

/** Files space of a contractor, supplier or architect. */
export default function FilesScreen() {
  const { t, locale } = useI18n();
  const f = t.files;
  const theme = useTheme();
  const { company, plan } = useSession();
  const [files, setFiles] = useState<CompanyFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'danger' | 'textSecondary' } | null>(null);
  // Contractors turn a bill of quantities into a price request (Starter has no supplier access).
  const canRequest = company?.kind === 'contractor' && PLANS[plan].suppliers !== 'none';

  const load = useCallback(async () => {
    const list = await listCompanyFiles();
    setFailed(list === null);
    if (list) setFiles(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async () => {
    if (!company) return;
    setNotice(null);
    const asset = await pickFile();
    if (!asset) return;
    setBusy('upload');
    const res = await uploadCompanyFile(company.id, asset);
    setBusy(null);
    if (!res.ok) return setNotice({ text: f.errors[res.error], tone: 'danger' });
    setFiles((list) => [res.file, ...(list ?? [])]);
  };

  const remove = async (file: CompanyFile) => {
    if (confirming !== file.id) return setConfirming(file.id);
    setConfirming(null);
    setBusy(file.id);
    const ok = await removeCompanyFile(file);
    setBusy(null);
    if (!ok) return setNotice({ text: t.common.error, tone: 'danger' });
    setFiles((list) => (list ?? []).filter((x) => x.id !== file.id));
  };

  const toRequest = async (file: CompanyFile) => {
    setNotice(null);
    setBusy(file.id);
    const res = await readStoredItems(file);
    setBusy(null);
    if (!res.ok) return setNotice({ text: f.errors[res.error], tone: 'danger' });
    setPendingItems(res.items);
    router.push('/nouvelle');
  };

  if (!company)
    return (
      <Screen withTabBar={false}>
        <CompleteProfileCard text={t.signup.later.home} />
      </Screen>
    );

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: f.title }} />
      <ThemedText type="title">{f.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{f.lead}</ThemedText>
      <Card>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={f.upload} variant="signal" busy={busy === 'upload'} onPress={add} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {f.types}
        </ThemedText>
        {canRequest ? (
          <ThemedText type="small" themeColor="textSecondary">
            {f.importHint}
          </ThemedText>
        ) : null}
        {notice ? (
          <ThemedText type="small" themeColor={notice.tone}>
            {notice.text}
          </ThemedText>
        ) : null}
      </Card>

      {failed ? (
        <Card>
          <ThemedText themeColor="danger">{t.common.error}</ThemedText>
          <Button label={t.common.retry} variant="ghost" small onPress={load} />
        </Card>
      ) : files === null ? (
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      ) : files.length === 0 ? (
        <ThemedText themeColor="textSecondary">{f.empty}</ThemedText>
      ) : (
        <Card>
          {files.map((file, index) => (
            <View key={file.id} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
              <ThemedText type="smallBold">{file.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[formatDate(file.created_at, locale), f.size((file.size_bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 1 }))].join(' · ')}
              </ThemedText>
              <View style={styles.actions}>
                <Button label={f.view} variant="ghost" small onPress={() => openCompanyFile(file)} />
                {canRequest && isSpreadsheet(file) ? (
                  <Button label={f.toRequest} small busy={busy === file.id && confirming === null} onPress={() => toRequest(file)} />
                ) : null}
                <Button
                  label={confirming === file.id ? f.confirmRemove : f.remove}
                  variant="ghost"
                  small
                  busy={busy === file.id}
                  onPress={() => remove(file)}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.half, paddingVertical: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
