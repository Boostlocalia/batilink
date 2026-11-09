import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { LegalLinks } from '@/components/legal-links';
import { Button, Card, Check, Field, Option, Screen, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { isBelgianPostalCode, isBelgianVat, normalizeVat, parseAmount } from '@/lib/format';
import { useSession } from '@/lib/session';
import {
  CLIENT_TYPES,
  HEARD_FROM,
  isEmail,
  isPhone,
  MONTHLY_PURCHASES,
  PROJECT_TYPES,
  PROJECTS_PER_YEAR,
  regionOf,
  REGIONS,
  SUPPLIER_TYPES,
  TEAM_SIZES,
  TERMS_VERSION,
  WORK_TYPES,
  type Profile,
  type Region,
} from '@/lib/signup';
import { clearIntent, readIntent } from '@/lib/signup-intent';
import { track } from '@/lib/meta-pixel';
import { supabase } from '@/lib/supabase';
import { DEFAULT_COMMISSION_RATE, formatRate, SUPPLIER_COMMISSION_ACTIVE } from '../../supabase/functions/_shared/commission';

type Item = { id: number; label_fr: string; label_nl: string };

const STEPS = 4;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** First sign-in: the company answers questions that fit its profile, then is checked. */
export default function SignupScreen() {
  const { t, language, locale } = useI18n();
  const s = t.signup;
  const theme = useTheme();
  const { refresh, browsing } = useSession();

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Company
  const [vat, setVat] = useState('');
  const [kboName, setKboName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [teamSize, setTeamSize] = useState<(typeof TEAM_SIZES)[number]>('2-5');
  // Activity
  const [regions, setRegions] = useState<Region[]>([]);
  const [trades, setTrades] = useState<number[]>([]);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [monthlyPurchases, setMonthlyPurchases] = useState<string | null>(null);
  const [supplierType, setSupplierType] = useState<string | null>(null);
  const [categories, setCategories] = useState<number[]>([]);
  const [delivers, setDelivers] = useState(true);
  const [pickup, setPickup] = useState(true);
  const [minOrder, setMinOrder] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [peppol, setPeppol] = useState<'yes' | 'no'>('no');
  const [architectNumber, setArchitectNumber] = useState('');
  const [projectTypes, setProjectTypes] = useState<string[]>([]);
  const [projectsPerYear, setProjectsPerYear] = useState<string | null>(null);
  // Finish
  const [heardFrom, setHeardFrom] = useState<string | null>(null);
  const [referral, setReferral] = useState('');
  const [terms, setTerms] = useState(false);
  const [commission, setCommission] = useState(false);

  const [tradeList, setTradeList] = useState<Item[]>([]);
  const [categoryList, setCategoryList] = useState<Item[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readIntent().then((intent) => {
      if (intent.profile) setProfile(intent.profile);
      if (intent.referral) setReferral(intent.referral);
    });
    supabase.from('trades').select('id, label_fr, label_nl').order('id').then(({ data }) => setTradeList(data ?? []));
    supabase.from('categories').select('id, label_fr, label_nl').order('id').then(({ data }) => setCategoryList(data ?? []));
  }, []);

  const label = (item: Item) => (language === 'nl' ? item.label_nl : item.label_fr);
  const rate = useMemo(() => formatRate(DEFAULT_COMMISSION_RATE, locale), [locale]);

  // The BCE/KBO name pre-fills the form (open data, loaded monthly).
  const lookUp = async () => {
    if (!isBelgianVat(vat)) return;
    const { data } = await supabase.rpc('lookup_company', { p_vat: normalizeVat(vat) });
    const found = (data as { name: string | null }[] | null)?.[0]?.name ?? null;
    setKboName(found);
    if (found && !name.trim()) setName(found);
  };

  const onPostalCode = (value: string) => {
    setPostalCode(value);
    const region = regionOf(value.trim());
    if (region && regions.length === 0) setRegions([region]);
  };

  const validate = (n: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (n === 1 && !profile) e.profile = s.errors.profile;
    if (n === 2) {
      if (!isBelgianVat(vat)) e.vat = t.onboarding.invalidVat;
      if (name.trim().length < 2) e.name = s.errors.name;
      if (!isBelgianPostalCode(postalCode)) e.postalCode = t.onboarding.invalidPostal;
      if (contactName.trim().length < 2) e.contactName = s.errors.contactName;
      if (!isPhone(phone)) e.phone = s.errors.phone;
    }
    if (n === 3) {
      if (regions.length === 0) e.regions = s.errors.regions;
      if (profile === 'contractor' && trades.length === 0) e.trades = s.errors.trades;
      if (profile === 'supplier') {
        if (!supplierType) e.supplierType = s.errors.supplierType;
        if (categories.length === 0) e.categories = s.errors.categories;
        if (!delivers && !pickup) e.service = s.errors.service;
        if (quoteEmail.trim() && !isEmail(quoteEmail)) e.quoteEmail = s.errors.email;
        if (minOrder.trim() && parseAmount(minOrder) === null) e.minOrder = t.common.error;
      }
    }
    if (n === 4) {
      if (!terms) e.terms = s.errors.terms;
      if (profile === 'supplier' && SUPPLIER_COMMISSION_ACTIVE && !commission) e.commission = s.errors.commission;
    }
    return e;
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep(step + 1);
  };

  const create = async () => {
    const e = validate(4);
    setErrors(e);
    if (Object.keys(e).length || !profile) return;
    setBusy(true);
    const answers: Record<string, unknown> = {
      terms: true,
      terms_version: TERMS_VERSION,
      street: street.trim(),
      contact_name: contactName.trim(),
      phone: phone.trim(),
      website: website.trim(),
      team_size: teamSize,
      regions,
      heard_from: heardFrom,
    };
    if (profile === 'contractor') Object.assign(answers, { work_types: workTypes, client_types: clientTypes, monthly_purchases: monthlyPurchases });
    if (profile === 'supplier') {
      Object.assign(answers, {
        commission: SUPPLIER_COMMISSION_ACTIVE,
        supplier_type: supplierType,
        delivers,
        pickup,
        min_order_ex_vat: minOrder.trim() ? String(parseAmount(minOrder)) : '',
        quote_email: quoteEmail.trim(),
        peppol: peppol === 'yes',
      });
    }
    if (profile === 'architect') Object.assign(answers, { architect_number: architectNumber.trim(), project_types: projectTypes, projects_per_year: projectsPerYear });

    const { error } = await supabase.rpc('create_company', {
      p_kind: profile,
      p_name: name.trim(),
      p_vat: normalizeVat(vat),
      p_postal_code: postalCode.trim(),
      p_city: city.trim(),
      p_language: language,
      p_profile: answers,
      p_trades: profile === 'contractor' ? trades : [],
      p_categories: profile === 'supplier' ? categories : [],
      p_referral: referral.trim() || null,
    });
    if (error) {
      setBusy(false);
      if (error.message.includes('vat_taken')) {
        setStep(2);
        return setErrors({ vat: s.errors.vat_taken });
      }
      return setErrors({ form: t.common.error });
    }
    track('CompleteRegistration', { content_name: profile });
    await clearIntent();
    // Checks VAT and BCE/KBO; the result shows in Réglages.
    await supabase.functions.invoke('verify-company', { body: {} }).catch(() => undefined);
    // Trial, welcome e-mail and referral reward.
    await supabase.functions.invoke('welcome', { body: {} }).catch(() => undefined);
    setBusy(false);
    await refresh();
  };

  const regionPicker = (title: string) => (
    <Group title={title} error={errors.regions}>
      {REGIONS.map((r) => (
        <Option key={r} label={s.regionLabels[r]} selected={regions.includes(r)} onPress={() => setRegions(toggle(regions, r))} />
      ))}
    </Group>
  );

  return (
    <Screen withTabBar={false}>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">
          {s.step(step, STEPS)}
        </ThemedText>
        <View style={[styles.progress, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.signal, width: `${(step / STEPS) * 100}%` }]} />
        </View>
      </View>

      {step === 1 ? (
        <>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="title">{s.profileTitle}</ThemedText>
            <ThemedText themeColor="textSecondary">{s.profileLead}</ThemedText>
          </View>
          {(['contractor', 'supplier', 'architect'] as const).map((p) => {
            const selected = profile === p;
            return (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setProfile(p)}
                style={[
                  styles.profile,
                  { borderColor: selected ? theme.signal : theme.line, backgroundColor: theme.backgroundElement },
                ]}>
                <View style={[styles.radio, { borderColor: selected ? theme.signal : theme.line }]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: theme.signal }]} /> : null}
                </View>
                <View style={{ flex: 1, gap: Spacing.one }}>
                  <ThemedText type="subtitle">{s.profiles[p].title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {s.profiles[p].lead}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
          {errors.profile ? <ThemedText themeColor="danger">{errors.profile}</ThemedText> : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="title">{s.companyTitle}</ThemedText>
            <ThemedText themeColor="textSecondary">{s.companyLead}</ThemedText>
          </View>
          <Card>
            <Field
              label={t.onboarding.vat}
              value={vat}
              onChangeText={setVat}
              onBlur={lookUp}
              autoCapitalize="characters"
              hint={kboName ? s.vatFound(kboName) : t.onboarding.vatHint}
              error={errors.vat}
            />
            <Field label={t.onboarding.name} value={name} onChangeText={setName} error={errors.name} />
            <Field label={s.street} value={street} onChangeText={setStreet} autoComplete="street-address" />
            <View style={styles.row}>
              <Field
                label={t.onboarding.postalCode}
                value={postalCode}
                onChangeText={onPostalCode}
                keyboardType="number-pad"
                maxLength={4}
                error={errors.postalCode}
              />
              <Field label={t.onboarding.city} value={city} onChangeText={setCity} />
            </View>
            <Field label={s.contactName} value={contactName} onChangeText={setContactName} autoComplete="name" error={errors.contactName} />
            <Field
              label={s.phone}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="+32 470 12 34 56"
              hint={s.phoneHint}
              error={errors.phone}
            />
            <Field label={s.website} value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />
            <Group title={s.teamSize}>
              {TEAM_SIZES.map((v) => (
                <Option key={v} label={s.teamSizes[v]} selected={teamSize === v} onPress={() => setTeamSize(v)} />
              ))}
            </Group>
          </Card>
        </>
      ) : null}

      {step === 3 && profile ? (
        <>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="title">{s.activityTitle}</ThemedText>
            <ThemedText themeColor="textSecondary">{s.activityLead[profile]}</ThemedText>
          </View>
          <Card>
            {profile === 'contractor' ? (
              <>
                <Group title={s.trades} error={errors.trades}>
                  {tradeList.map((tr) => (
                    <Option key={tr.id} label={label(tr)} selected={trades.includes(tr.id)} onPress={() => setTrades(toggle(trades, tr.id))} />
                  ))}
                </Group>
                <Group title={s.workTypes}>
                  {WORK_TYPES.map((v) => (
                    <Option key={v} label={s.workTypeLabels[v]} selected={workTypes.includes(v)} onPress={() => setWorkTypes(toggle(workTypes, v))} />
                  ))}
                </Group>
                <Group title={s.clientTypes}>
                  {CLIENT_TYPES.map((v) => (
                    <Option key={v} label={s.clientTypeLabels[v]} selected={clientTypes.includes(v)} onPress={() => setClientTypes(toggle(clientTypes, v))} />
                  ))}
                </Group>
                {regionPicker(s.regions)}
                <Group title={s.monthlyPurchases} hint={s.monthlyPurchasesHint}>
                  {MONTHLY_PURCHASES.map((v) => (
                    <Option key={v} label={s.monthlyPurchaseLabels[v]} selected={monthlyPurchases === v} onPress={() => setMonthlyPurchases(v)} />
                  ))}
                </Group>
              </>
            ) : null}

            {profile === 'supplier' ? (
              <>
                <Group title={s.supplierType} error={errors.supplierType}>
                  {SUPPLIER_TYPES.map((v) => (
                    <Option key={v} label={s.supplierTypeLabels[v]} selected={supplierType === v} onPress={() => setSupplierType(v)} />
                  ))}
                </Group>
                <Group title={s.categories} error={errors.categories}>
                  {categoryList.map((c) => (
                    <Option key={c.id} label={label(c)} selected={categories.includes(c.id)} onPress={() => setCategories(toggle(categories, c.id))} />
                  ))}
                </Group>
                {regionPicker(s.supplierRegions)}
                <Group title={s.service} error={errors.service}>
                  <Option label={s.delivers} selected={delivers} onPress={() => setDelivers(!delivers)} />
                  <Option label={s.pickup} selected={pickup} onPress={() => setPickup(!pickup)} />
                </Group>
                <Field label={s.minOrder} value={minOrder} onChangeText={setMinOrder} keyboardType="decimal-pad" error={errors.minOrder} />
                <Field
                  label={s.quoteEmail}
                  value={quoteEmail}
                  onChangeText={setQuoteEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  hint={s.quoteEmailHint}
                  error={errors.quoteEmail}
                />
                <View style={{ gap: Spacing.two }}>
                  <ThemedText type="smallBold">{s.peppol}</ThemedText>
                  <Segmented
                    value={peppol}
                    onChange={setPeppol}
                    options={[
                      { value: 'yes', label: s.peppolLabels.yes },
                      { value: 'no', label: s.peppolLabels.no },
                    ]}
                  />
                </View>
              </>
            ) : null}

            {profile === 'architect' ? (
              <>
                <Field label={s.architectNumber} value={architectNumber} onChangeText={setArchitectNumber} hint={s.architectNumberHint} />
                <Group title={s.projectTypes}>
                  {PROJECT_TYPES.map((v) => (
                    <Option key={v} label={s.projectTypeLabels[v]} selected={projectTypes.includes(v)} onPress={() => setProjectTypes(toggle(projectTypes, v))} />
                  ))}
                </Group>
                <Group title={s.projectsPerYear}>
                  {PROJECTS_PER_YEAR.map((v) => (
                    <Option key={v} label={s.projectsPerYearLabels[v]} selected={projectsPerYear === v} onPress={() => setProjectsPerYear(v)} />
                  ))}
                </Group>
                {regionPicker(s.regions)}
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {step === 4 && profile ? (
        <>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="title">{s.finishTitle}</ThemedText>
            <ThemedText themeColor="textSecondary">{s.summary[profile]}</ThemedText>
          </View>
          <Card>
            <Group title={s.heardFrom}>
              {HEARD_FROM.map((v) => (
                <Option key={v} label={s.heardFromLabels[v]} selected={heardFrom === v} onPress={() => setHeardFrom(v)} />
              ))}
            </Group>
            <Field label={s.referral} value={referral} onChangeText={setReferral} autoCapitalize="characters" hint={s.referralHint} />
            <Check label={s.terms} checked={terms} onChange={setTerms} error={errors.terms} />
            <LegalLinks />
            {profile === 'supplier' && SUPPLIER_COMMISSION_ACTIVE ? <Check label={s.commission(rate)} checked={commission} onChange={setCommission} error={errors.commission} /> : null}
            {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
          </Card>
        </>
      ) : null}

      <View style={styles.actions}>
        {step > 1 ? <Button label={s.back} variant="ghost" onPress={() => setStep(step - 1)} /> : null}
        {step === 1 && browsing ? <Button label={s.later.back} variant="ghost" onPress={() => router.replace('/')} /> : null}
        <View style={{ flex: 1 }}>
          {step < STEPS ? (
            <Button label={s.next} variant="signal" onPress={next} />
          ) : (
            <Button label={s.create} variant="signal" onPress={create} busy={busy} />
          )}
        </View>
      </View>
    </Screen>
  );
}

function Group({ title, hint, error, children }: { title: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <View style={styles.options}>{children}</View>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  profile: { flexDirection: 'row', gap: Spacing.three, borderWidth: 1.5, borderRadius: Radius, padding: Spacing.three, alignItems: 'flex-start' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
