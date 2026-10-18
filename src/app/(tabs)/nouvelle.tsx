import { FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { UpgradeCard, type UpgradeReason } from '@/components/upgrade-card';
import { Button, Card, Chip, Field, Screen, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { isBelgianPostalCode, parseAmount, parseBelgianDate } from '@/lib/format';
import { canSendPriceRequest, monthStart, PLANS } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const UNITS = ['piece', 'bag', 't', 'kg', 'm', 'm2', 'm3', 'l', 'pallet'] as const;
type Unit = (typeof UNITS)[number];

type Category = { id: number; label_fr: string; label_nl: string };
type Supplier = { id: string; name: string; city: string | null; verified: boolean };
type ItemDraft = { key: number; label: string; quantity: string; unit: Unit };

let nextKey = 1;
const emptyItem = (): ItemDraft => ({ key: nextKey++, label: '', quantity: '', unit: 'piece' });

export default function NewRequestScreen() {
  const { t, language } = useI18n();
  const { company, session, plan } = useSession();
  const theme = useTheme();

  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [postalCode, setPostalCode] = useState(company?.postal_code ?? '');
  const [city, setCity] = useState(company?.city ?? '');
  const [neededBy, setNeededBy] = useState('');
  const [replyBy, setReplyBy] = useState('');
  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState<UpgradeReason | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, label_fr, label_nl')
      .order('id')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  const reset = () => {
    setTitle('');
    setCategoryId(null);
    setNeededBy('');
    setReplyBy('');
    setItems([emptyItem()]);
    setNote('');
    setDraftId(null);
    setSuppliers(null);
    setPicked(new Set());
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (title.trim().length < 3) next.title = t.request.errors.name;
    if (categoryId === null) next.category = t.request.errors.category;
    if (!isBelgianPostalCode(postalCode)) next.postalCode = t.request.errors.postalCode;
    if (neededBy.trim() && !parseBelgianDate(neededBy)) next.neededBy = t.request.errors.date;
    const reply = parseBelgianDate(replyBy);
    if (!reply) next.replyBy = t.request.errors.date;
    else if (reply < new Date().toISOString().slice(0, 10)) next.replyBy = t.request.errors.replyBy;
    const filled = items.filter((i) => i.label.trim() || i.quantity.trim());
    if (!filled.length || filled.some((i) => i.label.trim().length < 2 || !(parseAmount(i.quantity) ?? 0))) {
      next.items = t.request.errors.items;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const findSuppliers = async () => {
    if (!validate() || !company) return;
    setBusy(true);
    const fields = {
      title: title.trim(),
      category_id: categoryId!,
      postal_code: postalCode.trim(),
      city: city.trim() || null,
      needed_by: neededBy.trim() ? parseBelgianDate(neededBy) : null,
      reply_by: parseBelgianDate(replyBy)!,
      fulfilment,
      note: note.trim() || null,
    };
    let id = draftId;
    if (id) {
      const { error } = await supabase.from('price_requests').update(fields).eq('id', id);
      if (!error) await supabase.from('request_items').delete().eq('request_id', id);
      if (error) id = null;
    } else {
      const { data } = await supabase
        .from('price_requests')
        .insert({ ...fields, company_id: company.id, created_by: session?.user.id })
        .select('id')
        .single();
      id = data?.id ?? null;
    }
    const rows = items
      .filter((i) => i.label.trim())
      .map((i, position) => ({
        request_id: id,
        position,
        label: i.label.trim(),
        quantity: parseAmount(i.quantity),
        unit: i.unit,
      }));
    const insert = id ? await supabase.from('request_items').insert(rows) : null;
    const match = id && !insert?.error ? await supabase.rpc('match_suppliers', { p_request_id: id }) : null;
    setBusy(false);
    if (!id || insert?.error || !match || match.error) return setErrors({ form: t.common.error });

    const found = (match.data ?? []) as Supplier[];
    setDraftId(id);
    setSuppliers(found);
    const max = PLANS[plan].suppliersPerRequest;
    setPicked(new Set(found.slice(0, Number.isFinite(max) ? max : found.length).map((s) => s.id)));
  };

  const send = async () => {
    if (!draftId || !company) return;
    setBusy(true);
    const { count } = await supabase
      .from('price_requests')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', monthStart(new Date()).toISOString());
    const check = canSendPriceRequest(plan, count ?? 0, picked.size);
    if (!check.ok) {
      setBusy(false);
      return setErrors({ form: errorText(check.reason, check.limit) });
    }
    const { data, error } = await supabase.functions.invoke('send-price-request', {
      body: { request_id: draftId, supplier_ids: [...picked] },
    });
    setBusy(false);
    if (error) {
      const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
      return setErrors({ form: body?.error ? errorText(body.error, body.limit) : t.common.error });
    }
    const id = draftId;
    reset();
    router.push({ pathname: '/demande/[id]', params: { id, sent: String(data?.sent ?? picked.size) } });
  };

  const errorText = (reason: string, limit?: number) => {
    if (reason === 'monthly_limit' || reason === 'too_many_suppliers') setLimit(reason);
    if (reason === 'monthly_limit') return t.request.errors.monthly_limit(limit ?? 1);
    if (reason === 'too_many_suppliers') return t.request.errors.too_many_suppliers(limit ?? 3);
    if (reason === 'no_supplier') return t.request.errors.no_supplier;
    return t.common.error;
  };

  const updateItem = (key: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const togglePick = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < PLANS[plan].suppliersPerRequest) next.add(id);
      else setLimit('too_many_suppliers');
      return next;
    });

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{t.request.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.request.lead}</ThemedText>
      </View>

      <Card>
        <Field label={t.request.name} placeholder={t.request.namePlaceholder} value={title} onChangeText={setTitle} error={errors.title} />
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">{t.request.category}</ThemedText>
          <View style={styles.wrap}>
            {categories.map((c) => {
              const selected = c.id === categoryId;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.option,
                    { borderColor: selected ? theme.brand : theme.line, backgroundColor: selected ? theme.brand : 'transparent' },
                  ]}>
                  <ThemedText type="small" themeColor={selected ? 'onBrand' : 'text'}>
                    {language === 'fr' ? c.label_fr : c.label_nl}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {errors.category ? (
            <ThemedText type="small" themeColor="danger">
              {errors.category}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.wrap}>
          <Field label={t.request.postalCode} value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" maxLength={4} error={errors.postalCode} />
          <Field label={t.request.city} value={city} onChangeText={setCity} />
        </View>
        <View style={styles.wrap}>
          <Field label={t.request.neededBy} value={neededBy} onChangeText={setNeededBy} placeholder="28/10/2026" error={errors.neededBy} />
          <Field label={t.request.replyBy} value={replyBy} onChangeText={setReplyBy} placeholder="22/10/2026" error={errors.replyBy} />
        </View>
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">{t.request.fulfilment}</ThemedText>
          <Segmented
            value={fulfilment}
            onChange={setFulfilment}
            options={[
              { value: 'delivery', label: t.request.delivery },
              { value: 'pickup', label: t.request.pickup },
            ]}
          />
        </View>
      </Card>

      <Card>
        <ThemedText type="subtitle">{t.request.items}</ThemedText>
        {items.map((item, index) => (
          <View key={item.key} style={[styles.item, index > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
            <View style={styles.wrap}>
              <Field label={t.request.item} value={item.label} onChangeText={(label) => updateItem(item.key, { label })} />
              <Field
                label={t.request.quantity}
                value={item.quantity}
                onChangeText={(quantity) => updateItem(item.key, { quantity })}
                keyboardType="decimal-pad"
                style={{ maxWidth: 140 }}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.units}>
              {UNITS.map((u) => {
                const selected = u === item.unit;
                return (
                  <Pressable
                    key={u}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => updateItem(item.key, { unit: u })}
                    style={[styles.unit, { borderColor: selected ? theme.brand : theme.line }]}>
                    <ThemedText type="small" themeColor={selected ? 'brand' : 'textSecondary'}>
                      {t.units[u]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            {items.length > 1 ? (
              <Button label={t.request.removeItem} variant="ghost" small onPress={() => setItems((list) => list.filter((i) => i.key !== item.key))} />
            ) : null}
          </View>
        ))}
        {errors.items ? <ThemedText themeColor="danger">{errors.items}</ThemedText> : null}
        <Button label={`+ ${t.request.addItem}`} variant="ghost" small onPress={() => setItems((list) => [...list, emptyItem()])} />
        <Field label={t.request.note} placeholder={t.request.notePlaceholder} value={note} onChangeText={setNote} multiline style={{ minHeight: 80 }} />
      </Card>

      {suppliers === null ? (
        <>
          {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
          <Button label={t.request.findSuppliers} onPress={findSuppliers} busy={busy} />
        </>
      ) : (
        <Card>
          <ThemedText type="subtitle">{t.request.suppliers}</ThemedText>
          {suppliers.length === 0 ? (
            <ThemedText themeColor="textSecondary">{t.request.noSuppliers}</ThemedText>
          ) : (
            suppliers.map((s) => {
              const selected = picked.has(s.id);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => togglePick(s.id)}
                  style={styles.supplier}>
                  <View style={[styles.box, { borderColor: selected ? theme.brand : theme.line, backgroundColor: selected ? theme.brand : 'transparent' }]}>
                    {selected ? <ThemedText type="smallBold" themeColor="onBrand">✓</ThemedText> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{s.name}</ThemedText>
                    {s.city ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {s.city}
                      </ThemedText>
                    ) : null}
                  </View>
                  {s.verified ? <Chip label={t.request.verified} tone="good" /> : null}
                </Pressable>
              );
            })
          )}
          {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
          {limit ? <UpgradeCard reason={limit} /> : null}
          <Button label={t.request.send(picked.size)} variant="signal" onPress={send} busy={busy} disabled={picked.size === 0} />
          <Button label={t.request.findSuppliers} variant="ghost" small onPress={findSuppliers} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  item: { gap: Spacing.two, paddingTop: Spacing.two },
  units: { gap: Spacing.one },
  unit: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  supplier: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  box: { width: 22, height: 22, borderRadius: Radius / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
