import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { FounderCounter } from "@/components/founder-counter";
import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/logo";
import { ThemedText } from "@/components/themed-text";
import {
  Button,
  Card,
  Field,
  Option,
  Screen,
  Segmented,
} from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, type Language } from "@/i18n";
import { formatEuro, parseAmount } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { useSession } from "@/lib/session";
import { saveIntent } from "@/lib/signup-intent";
import { SELLS_PLANS } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const GAPS = [1, 2, 3];
/** Yearly Starter: ten months, two are free. */
const STARTER_YEAR = Math.round(PLANS.pro.priceExVat * 10 * 100) / 100;

type Reach = {
  postal: string;
  total: number;
  categories: { fr: string; nl: string; count: number }[];
};

/** Public sales page of the founding-member offer (web only: the stores do not allow selling plans in the app). */
export default function FoundersScreen() {
  const { t, language, setLanguage, locale } = useI18n();
  const f = t.growth.founders;
  const p = f.page;
  const theme = useTheme();
  const { session } = useSession();

  const [purchases, setPurchases] = useState("100000");
  const [gap, setGap] = useState(1);
  const [postal, setPostal] = useState("");
  const [reach, setReach] = useState<Reach | null>(null);
  const [searching, setSearching] = useState(false);

  if (!SELLS_PLANS) return <Redirect href="/" />;

  const start = async (profile?: "supplier" | "architect") => {
    if (session) return router.push(profile ? "/" : "/abonnement");
    await saveIntent({ profile: profile ?? "contractor" });
    router.push({ pathname: "/connexion", params: { mode: "inscription" } });
  };

  const yearly = parseAmount(purchases);
  const saving = yearly && yearly > 0 ? (yearly * gap) / 100 : null;

  const lookUp = async () => {
    const code = postal.trim();
    if (!/^[1-9][0-9]{3}$/.test(code)) return;
    setSearching(true);
    const { data } = await supabase.rpc("supplier_reach", { p_postal: code });
    setSearching(false);
    const r = data as Omit<Reach, "postal"> | null;
    if (r) setReach({ postal: code, ...r });
  };

  return (
    <Screen withTabBar={false}>
      <View style={styles.top}>
        <Pressable onPress={() => router.push("/")}>
          <Logo size={26} />
        </Pressable>
        <Segmented<Language>
          value={language}
          onChange={setLanguage}
          options={[
            { value: "fr", label: "FR" },
            { value: "nl", label: "NL" },
          ]}
        />
      </View>

      <View style={styles.hero}>
        <ThemedText type="small" themeColor="signal" style={styles.eyebrow}>
          {f.eyebrow.toUpperCase()}
        </ThemedText>
        <ThemedText type="title" style={styles.heroTitle}>
          {p.heroTitle}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{p.heroLead}</ThemedText>
        <View style={{ alignSelf: "flex-start" }}>
          <Button label={p.heroCta} variant="signal" onPress={() => start()} />
        </View>
      </View>

      <FounderCounter />

      <ThemedText type="subtitle">{p.problemTitle}</ThemedText>
      <View style={styles.grid}>
        {p.facts.map((fact) => (
          <Card key={fact.value} style={styles.cell}>
            <ThemedText type="title" themeColor="signal">
              {fact.value}
            </ThemedText>
            <ThemedText type="small">{fact.text}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {fact.source}
            </ThemedText>
          </Card>
        ))}
      </View>

      <ThemedText type="subtitle">{p.howTitle}</ThemedText>
      <View style={styles.grid}>
        {p.how.map((step, i) => (
          <View key={step.title} style={[styles.cell, styles.step]}>
            <View
              style={[styles.stepNumber, { backgroundColor: theme.signal }]}
            >
              <ThemedText type="smallBold" themeColor="onSignal">
                {i + 1}
              </ThemedText>
            </View>
            <View style={{ flex: 1, gap: Spacing.one }}>
              <ThemedText type="smallBold">{step.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {step.text}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {p.radius}
      </ThemedText>

      <Card>
        <ThemedText type="subtitle">{p.calcTitle}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {p.calcLead}
        </ThemedText>
        <Field
          label={p.calcPurchases}
          value={purchases}
          onChangeText={setPurchases}
          keyboardType="numeric"
          inputMode="numeric"
        />
        <ThemedText type="smallBold">{p.calcGap}</ThemedText>
        <View style={styles.row}>
          {GAPS.map((g) => (
            <Option
              key={g}
              label={`${g} %`}
              selected={gap === g}
              onPress={() => setGap(g)}
            />
          ))}
        </View>
        {saving !== null ? (
          <>
            <ThemedText type="subtitle" themeColor="signal">
              {p.calcResult(formatEuro(saving, locale))}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {p.calcCompare(formatEuro(STARTER_YEAR, locale))}
            </ThemedText>
          </>
        ) : null}
      </Card>

      <Card>
        <ThemedText type="subtitle">{p.reachTitle}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {p.reachLead}
        </ThemedText>
        <View style={styles.row}>
          <View style={{ flexGrow: 1, flexBasis: 160 }}>
            <Field
              label=""
              value={postal}
              onChangeText={(v) => setPostal(v.replace(/\D/g, "").slice(0, 4))}
              placeholder={p.reachPlaceholder}
              keyboardType="number-pad"
              inputMode="numeric"
              onSubmitEditing={lookUp}
            />
          </View>
          <View style={{ alignSelf: "flex-end" }}>
            <Button
              label="OK"
              onPress={lookUp}
              busy={searching}
              disabled={!/^[1-9][0-9]{3}$/.test(postal)}
            />
          </View>
        </View>
        {reach ? (
          reach.total > 0 ? (
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="smallBold">
                {p.reachResult(reach.total, reach.postal)}
              </ThemedText>
              {reach.categories.map((c) => (
                <ThemedText key={c.fr} type="small" themeColor="textSecondary">
                  {language === "nl" ? c.nl : c.fr} · {c.count}
                </ThemedText>
              ))}
            </View>
          ) : (
            <ThemedText type="small">{p.reachNone}</ThemedText>
          )
        ) : null}
      </Card>

      <Card>
        <ThemedText type="subtitle">{p.verifyTitle}</ThemedText>
        <ThemedText type="small">{p.verifyText}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {p.verify30bis}
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="subtitle">{p.founderTitle}</ThemedText>
        <ThemedText type="small">{p.founderText}</ThemedText>
      </Card>

      <Card style={{ borderColor: theme.signal }}>
        <ThemedText type="subtitle">{p.offerTitle}</ThemedText>
        <View style={{ gap: Spacing.one }}>
          {p.offerPoints.map((point) => (
            <ThemedText key={point} type="small">
              <ThemedText type="small" themeColor="signal">
                ●{" "}
              </ThemedText>
              {point}
            </ThemedText>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {p.offerAfter}
        </ThemedText>
        <View style={{ alignSelf: "flex-start" }}>
          <Button label={f.cta} variant="signal" onPress={() => start()} />
        </View>
      </Card>

      <ThemedText type="subtitle">{p.faqTitle}</ThemedText>
      <Card>
        {p.faq.map((item, i) => (
          <View
            key={item.q}
            style={[
              { gap: Spacing.one, paddingVertical: Spacing.two },
              i > 0 && { borderTopWidth: 1, borderTopColor: theme.line },
            ]}
          >
            <ThemedText type="smallBold">{item.q}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.a}
            </ThemedText>
          </View>
        ))}
      </Card>

      <Pressable
        onPress={() => start()}
        style={[styles.final, { backgroundColor: theme.signal }]}
      >
        <ThemedText type="subtitle" themeColor="onSignal">
          {p.finalTitle}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="onSignal">
          {p.heroCta} →
        </ThemedText>
      </Pressable>

      <View style={styles.links}>
        <Pressable onPress={() => start("supplier")}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.link}
          >
            {p.supplierLink}
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => start("architect")}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.link}
          >
            {p.architectLink}
          </ThemedText>
        </Pressable>
      </View>
      <LegalLinks />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  hero: { gap: Spacing.three, paddingVertical: Spacing.three },
  heroTitle: { fontSize: 36, lineHeight: 42 },
  eyebrow: { letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 240 },
  step: { flexDirection: "row", gap: Spacing.two, alignItems: "flex-start" },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    alignItems: "center",
  },
  final: { borderRadius: Radius, padding: Spacing.four, gap: Spacing.two },
  links: { gap: Spacing.two, alignItems: "center" },
  link: { textDecorationLine: "underline" },
});
