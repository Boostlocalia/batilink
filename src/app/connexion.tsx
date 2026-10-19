import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import type { AuthError } from "@supabase/supabase-js";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen, Segmented } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useI18n, type Language } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { Logo } from '@/components/logo';

type Mode = "signin" | "signup";

const MIN_PASSWORD = 8;

/** Where the confirmation and reset links bring the user back. */
const returnUrl = () =>
  Platform.OS === "web" ? new URL(".", window.location.href).href : undefined;

/** Account with e-mail and password; the company is added on the next screen. */
export default function SignInScreen() {
  const { t, language, setLanguage } = useI18n();
  const a = t.auth;
  const { mode: initial } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(
    initial === "inscription" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const address = email.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);

  const authMessage = (e: AuthError) => {
    if (e.code === "invalid_credentials") return a.wrongPassword;
    if (e.code === "email_not_confirmed") return a.notConfirmed;
    if (e.code === "user_already_exists") return a.alreadyUsed;
    if (e.code === "weak_password") return a.shortPassword;
    if (e.status === 429) return a.tooMany;
    return t.common.error;
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setNotice(null);
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!validEmail) e.email = a.invalidEmail;
    if (mode === "signup") {
      if (password.length < MIN_PASSWORD) e.password = a.shortPassword;
      else if (password !== confirm) e.confirm = a.mismatch;
    } else if (!password) e.password = a.wrongPassword;
    setErrors(e);
    setNotice(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      setBusy(false);
      // On success the session listener moves the user on.
      if (error) setErrors({ form: authMessage(error) });
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      // The confirmation and reset e-mails are written in this language.
      options: { emailRedirectTo: returnUrl(), data: { language } },
    });
    setBusy(false);
    if (error) return setErrors({ form: authMessage(error) });
    // An address already registered comes back without identities.
    if (data.user && data.user.identities?.length === 0)
      return setErrors({ form: a.alreadyUsed });
    if (!data.session) {
      setNotice(a.confirmSent(address));
      setMode("signin");
      setConfirm("");
    }
  };

  const forgot = async () => {
    if (!validEmail) return setErrors({ email: a.invalidEmail });
    setBusy(true);
    setErrors({});
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: returnUrl(),
    });
    setBusy(false);
    if (error) return setErrors({ form: authMessage(error) });
    setNotice(a.resetSent(address));
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
        <Logo size={34} />
        <ThemedText type="subtitle">
          {mode === "signin" ? a.title : a.signUpTitle}
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {mode === "signin" ? a.lead : a.signUpLead}
        </ThemedText>
      </View>
      <Segmented<Mode>
        value={mode}
        onChange={switchMode}
        options={[
          { value: "signin", label: a.signInTab },
          { value: "signup", label: a.signUpTab },
        ]}
      />
      {notice ? <ThemedText themeColor="good">{notice}</ThemedText> : null}
      <Card>
        <Field
          label={a.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          inputMode="email"
          error={errors.email}
        />
        <Field
          label={mode === "signin" ? a.password : a.newPassword}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          textContentType={mode === "signin" ? "password" : "newPassword"}
          hint={mode === "signup" ? a.passwordHint : undefined}
          error={errors.password}
          onSubmitEditing={mode === "signin" ? submit : undefined}
        />
        {mode === "signup" ? (
          <Field
            label={a.confirmPassword}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.confirm}
            onSubmitEditing={submit}
          />
        ) : null}
        {errors.form ? (
          <ThemedText themeColor="danger">{errors.form}</ThemedText>
        ) : null}
        <Button
          label={mode === "signin" ? a.signIn : a.signUp}
          variant="signal"
          onPress={submit}
          busy={busy}
        />
        {mode === "signin" ? (
          <Button label={a.forgot} variant="ghost" small onPress={forgot} />
        ) : null}
      </Card>
    </Screen>
  );
}
