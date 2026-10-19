import { useState } from "react";
import { Platform, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen, Segmented } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useI18n, type Language } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/constants/brand";

export default function SignInScreen() {
  const { t, language, setLanguage } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
      return setError(t.auth.invalidEmail);
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: address,
      // Supabase's default e-mail carries a sign-in link; it brings the user back to the app.
      options:
        Platform.OS === "web"
          ? { emailRedirectTo: new URL(".", window.location.href).href }
          : undefined,
    });
    setBusy(false);
    if (e) return setError(t.common.error);
    setEmail(address);
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    // On success the session listener moves the user on.
    if (e) setError(t.auth.wrongCode);
  };

  return (
    <Screen withTabBar={false}>
      <View style={{ gap: Spacing.two }}>
        <Segmented<Language>
          value={language}
          onChange={setLanguage}
          options={[
            { value: "fr", label: "FR" },
            { value: "nl", label: "NL" },
          ]}
        />
        <ThemedText type="title" themeColor="brand">
          {APP_NAME}
        </ThemedText>
        <ThemedText type="subtitle">{t.auth.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.auth.lead}</ThemedText>
      </View>
      <Card>
        {step === "email" ? (
          <>
            <Field
              label={t.auth.email}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              error={error}
              onSubmitEditing={sendCode}
            />
            <Button
              label={t.auth.sendCode}
              variant="signal"
              onPress={sendCode}
              busy={busy}
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t.auth.codeSent(email)}
            </ThemedText>
            {/* On the web the e-mail carries a link; the app also accepts a code. */}
            {Platform.OS !== "web" ? (
              <>
                <Field
                  label={t.auth.code}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  error={error}
                  onSubmitEditing={verify}
                />
                <Button
                  label={t.auth.verify}
                  variant="signal"
                  onPress={verify}
                  busy={busy}
                  disabled={code.trim().length !== 6}
                />
              </>
            ) : null}
            <Button
              label={t.auth.resend}
              variant="ghost"
              small
              onPress={sendCode}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}
