import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HeroCarousel } from '@/components/hero-carousel';
import { ThemedText } from '@/components/themed-text';
import { LegalLinks } from '@/components/legal-links';
import { Button, Card, Chip, Screen, Segmented } from '@/components/ui';
import { Logo } from '@/components/logo';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n, type Language } from '@/i18n';
import { formatEuro } from '@/lib/format';
import { PLANS } from '@/lib/plans';
import { type Profile } from '@/lib/signup';
import { saveIntent } from '@/lib/signup-intent';

const PROFILES: Profile[] = ['contractor', 'supplier', 'architect'];

/** Public welcome page: what Batinode does for each trade, and one tap to start. */
export default function WelcomeScreen() {
  const { t, language, setLanguage, locale } = useI18n();
  const l = t.growth.landing;
  const theme = useTheme();
  const { ref, profil } = useLocalSearchParams<{ ref?: string; profil?: string }>();

  // A referral or invitation link keeps its code and profile through sign-in.
  useEffect(() => {
    const profile = PROFILES.includes(profil as Profile) ? (profil as Profile) : undefined;
    if (ref || profile) saveIntent({ referral: ref?.slice(0, 20), profile });
  }, [ref, profil]);

  const start = async (profile?: Profile) => {
    if (profile) await saveIntent({ profile });
    router.push({ pathname: '/connexion', params: { mode: 'inscription' } });
  };

  return (
    <Screen withTabBar={false}>
      <View style={styles.top}>
        <Logo size={26} />
        <View style={styles.topActions}>
          <Segmented<Language>
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'fr', label: 'FR' },
              { value: 'nl', label: 'NL' },
            ]}
          />
          <Button label={l.signIn} variant="ghost" small onPress={() => router.push('/connexion')} />
        </View>
      </View>

      <View style={styles.hero}>
        <ThemedText type="small" themeColor="signal">
          {l.eyebrow.toUpperCase()}
        </ThemedText>
        <ThemedText type="title" style={styles.heroTitle}>
          {l.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{l.lead}</ThemedText>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={l.start} variant="signal" onPress={() => start()} />
        </View>
        <View style={styles.proof}>
          {l.proof.map((p) => (
            <ThemedText key={p} type="small" themeColor="textSecondary">
              ✓ {p}
            </ThemedText>
          ))}
        </View>
      </View>

      <HeroCarousel
        height={280}
        slides={[
          { key: 'contractor', image: 'site', accent: 'lime', ...t.banners.landing.contractor, onPress: () => start('contractor') },
          { key: 'supplier', image: 'supplier', accent: 'cyan', ...t.banners.landing.supplier, onPress: () => start('supplier') },
          { key: 'architect', image: 'architect', accent: 'magenta', ...t.banners.landing.architect, onPress: () => start('architect') },
        ]}
      />

      <ThemedText type="subtitle">{l.personasTitle}</ThemedText>
      <View style={styles.grid}>
        {PROFILES.map((p) => (
          <Card key={p} style={styles.cell}>
            <ThemedText type="subtitle">{l.personas[p].title}</ThemedText>
            <View style={{ gap: Spacing.one }}>
              {l.personas[p].points.map((point) => (
                <ThemedText key={point} type="small">
                  <ThemedText type="small" themeColor="signal">
                    ●{' '}
                  </ThemedText>
                  {point}
                </ThemedText>
              ))}
            </View>
            <View style={{ marginTop: 'auto' }}>
              <Button label={l.personas[p].cta} variant={p === 'contractor' ? 'signal' : 'primary'} onPress={() => start(p)} />
            </View>
          </Card>
        ))}
      </View>

      <ThemedText type="subtitle">{l.howTitle}</ThemedText>
      <View style={styles.grid}>
        {l.how.map((step, i) => (
          <View key={step.title} style={[styles.cell, styles.step]}>
            <View style={[styles.stepNumber, { backgroundColor: theme.signal }]}>
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

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="subtitle">{l.pricingTitle}</ThemedText>
        <ThemedText themeColor="textSecondary">{l.pricingLead}</ThemedText>
      </View>
      <View style={styles.grid}>
        {(['pro', 'full'] as const).map((id) => (
          <Card key={id} style={[styles.cell, id === 'full' && { borderColor: theme.signal }]}>
            <View style={styles.planHead}>
              <ThemedText type="smallBold">{t.plans.names[id]}</ThemedText>
              {id === 'full' ? <Chip label={t.growth.plans.recommended} tone="good" /> : null}
            </View>
            <ThemedText type="subtitle">
              {formatEuro(PLANS[id].priceExVat, locale).replace(/[,.]00/, '')}{' '}
              <ThemedText type="small" themeColor="textSecondary">
                {t.plans.perMonth}
              </ThemedText>
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t.plans.features.suppliers(PLANS[id].suppliers)}
            </ThemedText>
          </Card>
        ))}
      </View>

      <ThemedText type="subtitle">{l.faqTitle}</ThemedText>
      <Card>
        {l.faq.map((item, i) => (
          <View key={item.q} style={[{ gap: Spacing.one, paddingVertical: Spacing.two }, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
            <ThemedText type="smallBold">{item.q}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.a}
            </ThemedText>
          </View>
        ))}
      </Card>

      <Pressable onPress={() => start()} style={[styles.final, { backgroundColor: theme.signal }]}>
        <ThemedText type="subtitle" themeColor="onSignal">
          {l.finalTitle}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="onSignal">
          {l.start} →
        </ThemedText>
      </Pressable>

      <ThemedText type="small" themeColor="textSecondary">
        {l.footer}
      </ThemedText>
      <LegalLinks />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  hero: { gap: Spacing.three, paddingVertical: Spacing.three },
  heroTitle: { fontSize: 36, lineHeight: 42 },
  proof: { gap: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 240 },
  step: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  final: { borderRadius: Radius, padding: Spacing.four, gap: Spacing.two },
});
