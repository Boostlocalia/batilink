import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { strongPassword } from '@/lib/password';
import { supabase } from '@/lib/supabase';

/** Shown after a "forgot password" link: the user picks the password they will sign in with. */
export function NewPassword() {
  const { t } = useI18n();
  const a = t.auth;
  const { endRecovery } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!strongPassword(password)) return setErrors({ password: a.shortPassword });
    if (password !== confirm) return setErrors({ confirm: a.mismatch });
    setBusy(true);
    setErrors({});
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setErrors({ form: error.code === 'same_password' ? a.mismatch : error.code === 'weak_password' ? a.shortPassword : t.common.error });
    endRecovery();
  };

  return (
    <Screen withTabBar={false}>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="subtitle">{a.resetTitle}</ThemedText>
        <ThemedText themeColor="textSecondary">{a.resetLead}</ThemedText>
      </View>
      <Card>
        <Field
          label={a.newPassword}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          hint={a.passwordHint}
          error={errors.password}
        />
        <Field
          label={a.confirmPassword}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.confirm}
          onSubmitEditing={save}
        />
        {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
        <Button label={a.save} variant="signal" onPress={save} busy={busy} />
      </Card>
    </Screen>
  );
}
