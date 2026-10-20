import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Platform, useWindowDimensions, View } from "react-native";
import type { AuthError } from "@supabase/supabase-js";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen, Segmented } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useI18n, type Language } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/logo";
import { SignInBanners } from "@/components/home-banners";
import { GlowBackdrop } from "@/components/glow-backdrop";
import { NodiGreeting } from "@/components/nodi-greeting";
import { LegalLinks } from "@/components/legal-links";
import { strongPassword } from "@/lib/password";

type Mode = "signin" | "signup";

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
  // Two columns on large screens: the form, and the banners beside it.
  const wide = useWindowDimensions().width >= 900;
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 600,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [enter]);
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
      if (!strongPassword(password)) e.password = a.shortPassword;
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
    <Screen withTabBar={false} backdrop={<GlowBackdrop />}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo size={34} />
        <Segmented<Language>
          value={language}
          onChange={setLanguage}
          options={[
            { value: "fr", label: "FR" },
            { value: "nl", label: "NL" },
          ]}
        />
      </View>
      <View
        style={
          wide
            ? {
                flexDirection: "row",
                gap: Spacing.five,
                alignItems: "flex-start",
              }
            : { gap: Spacing.four }
        }
      >
        <Animated.View
          style={[
            { gap: Spacing.four },
            wide && { flex: 1 },
            {
              opacity: enter,
              transform: [
                {
                  translateY: enter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <NodiGreeting
            key={mode}
            lines={mode === "signin" ? a.nodiSignIn : a.nodiSignUp}
          />
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="title">
              {mode === "signin" ? a.title : a.signUpTitle}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {mode === "signin" ? a.lead : a.signUpLead}
            </ThemedText>
          </View>
          <Segmented<Mode>
            signal
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
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
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
        </Animated.View>
        <View style={wide ? { flex: 1, paddingTop: Spacing.five } : undefined}>
          <SignInBanners tall={wide} />
        </View>
      </View>
      <LegalLinks />
    </Screen>
  );
}
