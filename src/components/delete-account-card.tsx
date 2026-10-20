import { useState } from "react";
import { View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

/** Deleting one's account from inside the app, in two taps (required by the app stores). */
export function DeleteAccountCard() {
  const { t } = useI18n();
  const d = t.settings.deleteAccount;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { data, error: failed } = await supabase.functions.invoke(
      "delete-account",
      { body: { confirm: true } },
    );
    if (failed || !data?.ok) {
      setBusy(false);
      setError(d.error);
      return;
    }
    // The account no longer exists: drop the local session.
    await supabase.auth.signOut({ scope: "local" });
  };

  return (
    <Card>
      <ThemedText type="smallBold">{d.title}</ThemedText>
      {asking ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="danger">
            {d.warning}
          </ThemedText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.two }}
          >
            <Button
              label={d.confirm}
              variant="primary"
              small
              busy={busy}
              onPress={remove}
            />
            <Button
              label={d.cancel}
              variant="ghost"
              small
              disabled={busy}
              onPress={() => setAsking(false)}
            />
          </View>
        </View>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {d.lead}
          </ThemedText>
          <View style={{ alignSelf: "flex-start" }}>
            <Button
              label={d.open}
              variant="ghost"
              small
              onPress={() => setAsking(true)}
            />
          </View>
        </>
      )}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </Card>
  );
}
