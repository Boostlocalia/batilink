import { FunctionsHttpError } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CompleteProfileCard } from '@/components/complete-profile-card';
import { ThemedText } from '@/components/themed-text';
import { UpgradeCard, type UpgradeReason } from '@/components/upgrade-card';
import { Button, Card, Chip, Field, Option, Screen, Segmented } from '@/components/ui';
import { RequestBanner } from '@/components/home-banners';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { pickFile, readPickedItems, takePendingItems, uploadCompanyFile } from '@/lib/files';
import { isBelgianPostalCode, parseAmount, replyDeadline } from '@/lib/format';
import { AUTO_SUPPLIERS, canSendPriceRequest, monthStart, PLANS } from '@/lib/plans';
import { keepPendingRequest, takePendingRequest } from '@/lib/pending-request';
import { useSession } from '@/lib/session';
import { UNITS, type ImportedItem, type Unit } from '@/lib/spreadsheet';
import { supabase } from '@/lib/supabase';

type Category = { id: number; label_fr: string; label_nl: string };
type Supplier = { id: string; name: string; city: string | null; verified: boolean };
type ItemDraft = { key: number; label: string; quantity: string; unit: Unit };

let nextKey = 1;
const emptyItem = (): ItemDraft => ({ key: nextKey++, label: '', quantity: '', unit: 'piece' });

export default function NewRequestScreen() {
  const { t, language } = useI18n();
  const { company, session, plan } = useSession();
  const theme = useTheme();
  // Starter has no supplier access; Premium sends. Someone without a company yet fills the form and is asked for it on sending.
  const access = company ? PLANS[plan].suppliers : 'full';

  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [postalCode, setPostalCode] = useState(company?.postal_code ?? '');
  const [city, setCity] = useState(company?.city ?? '');
  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState<UpgradeReason | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  // BatiNode picks 5 suppliers of the region, or the contractor picks them.
  const [choice, setChoice] = useState<'batinode' | 'own' | 'mix'>('batinode');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ text: string; error: boolean } | null>(null);

  const applyImported = useCallback(
    (imported: ImportedItem[]) => {
      setItems((list) => [...list.filter((i) => i.label.trim() || i.quantity.trim()), ...imported.map((i) => ({ ...i, key: nextKey++ }))]);
      setImportNotice({ text: t.files.imported(imported.length), error: false });
    },
    [t],
  );

  // Lines sent from the files space.
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingItems();
      if (pending) applyImported(pending);
    }, [applyImported]),
  );

  const importFile = async () => {
    setImportNotice(null);
    const asset = await pickFile(true);
    if (!asset) return;
    setImporting(true);
    const res = await readPickedItems(asset);
    setImporting(false);
    if (!res.ok) return setImportNotice({ text: t.files.errors[res.error], error: true });
    applyImported(res.items);
    // The file is also kept in the files space; the request does not depend on it.
    if (company) uploadCompanyFile(company.id, asset).catch(() => {});
  };

  // A request written before the company existed comes back once it does.
  useEffect(() => {
    if (!company) return;
    takePendingRequest().then((pending) => {
      if (!pending) return;
      setTitle(pending.title);
      setCategoryId(pending.categoryId);
      setPostalCode(pending.postalCode || company.postal_code || '');
      setCity(pending.city || company.city || '');
      setFulfilment(pending.fulfilment);
      setItems(pending.items.map((i) => ({ key: nextKey++, label: i.label, quantity: i.quantity, unit: i.unit as Unit })));
      setNote(pending.note);
      setNeedsProfile(false);
      setImportNotice({ text: t.signup.later.restored, error: false });
    });
  }, [company, t]);

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
    const filled = items.filter((i) => i.label.trim() || i.quantity.trim());
    if (!filled.length || filled.some((i) => i.label.trim().length < 2 || !(parseAmount(i.quantity) ?? 0))) {
      next.items = t.request.errors.items;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** Saves the form as a draft request and returns its id, or null when it cannot be sent yet. */
  const saveDraft = async (): Promise<string | null> => {
    if (!validate()) return null;
    if (!company) {
      await keepPendingRequest({
        title,
        categoryId,
        postalCode,
        city,
        fulfilment,
        items: items.map(({ label, quantity, unit }) => ({ label, quantity, unit })),
        note,
      });
      setNeedsProfile(true);
      return null;
    }
    setBusy(true);
    const fields = {
      title: title.trim(),
      category_id: categoryId!,
      postal_code: postalCode.trim(),
      city: city.trim() || null,
      // Suppliers get 48 hours from the moment the request is sent; the server sets the final date.
      reply_by: replyDeadline(new Date()),
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
    if (!id || insert?.error) {
      setBusy(false);
      setErrors({ form: t.common.error });
      return null;
    }
    setDraftId(id);
    return id;
  };

  const findSuppliers = async () => {
    const id = await saveDraft();
    if (!id) return;
    const match = await supabase.rpc('match_suppliers', { p_request_id: id });
    setBusy(false);
    if (match.error) return setErrors({ form: t.common.error });

    const found = (match.data ?? []) as Supplier[];
    setSuppliers(found);
    const max = PLANS[plan].suppliersPerRequest;
    // Mixed: the contractor ticks the one or two suppliers they know, BatiNode adds the rest.
    setPicked(choice === 'mix' ? new Set() : new Set(found.slice(0, Number.isFinite(max) ? max : found.length).map((s) => s.id)));
  };

  const sendToBatinode = async () => {
    const id = await saveDraft();
    if (!id) return;
    await submit(id, { choice: 'batinode' }, AUTO_SUPPLIERS);
  };

  const send = async () => {
    if (!draftId || !company) return;
    if (choice === 'mix') await submit(draftId, { choice: 'mix', supplier_ids: [...picked] }, AUTO_SUPPLIERS);
    else await submit(draftId, { supplier_ids: [...picked] }, picked.size);
  };

  const submit = async (requestId: string, target: { choice: 'batinode' } | { choice: 'mix'; supplier_ids: string[] } | { supplier_ids: string[] }, count: number) => {
    setBusy(true);
    const { count: sentThisMonth } = await supabase
      .from('price_requests')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', monthStart(new Date()).toISOString());
    const check = canSendPriceRequest(plan, sentThisMonth ?? 0, count);
    if (!check.ok) {
      setBusy(false);
      return setErrors({ form: errorText(check.reason, check.limit) });
    }
    const { data, error } = await supabase.functions.invoke('send-price-request', {
      body: { request_id: requestId, ...target },
    });
    setBusy(false);
    if (error) {
      const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
      return setErrors({ form: body?.error ? errorText(body.error, body.limit) : t.common.error });
    }
    reset();
    router.push({ pathname: '/demande/[id]', params: { id: requestId, sent: String(data?.sent ?? count) } });
  };

  const errorText = (reason: string, _limit?: number) => {
    if (reason === 'plan') {
      setLimit('suppliers');
      return t.request.errors.plan;
    }
    if (reason === 'no_supplier') return t.request.errors.no_supplier;
    return t.common.error;
  };

  const updateItem = (key: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const togglePick = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (access !== 'full') setLimit('suppliers');
      else if (next.has(id)) next.delete(id);
      else if (choice !== 'mix' || next.size < AUTO_SUPPLIERS - 1) next.add(id);
      return next;
    });

  if (access === 'none')
    return (
      <Screen>
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="title">{t.request.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.request.lead}</ThemedText>
        </View>
        <UpgradeCard reason="suppliers" />
      </Screen>
    );

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{t.request.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.request.lead}</ThemedText>
      </View>
      <RequestBanner />

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
        <ThemedText type="small" themeColor="textSecondary">
          {t.request.replyWindow}
        </ThemedText>
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
        <View style={styles.wrap}>
          <Button label={`+ ${t.request.addItem}`} variant="ghost" small onPress={() => setItems((list) => [...list, emptyItem()])} />
          <Button label={t.files.importLines} variant="ghost" small busy={importing} onPress={importFile} />
        </View>
        {importNotice ? (
          <ThemedText type="small" themeColor={importNotice.error ? 'danger' : 'textSecondary'}>
            {importNotice.text}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {t.files.importHint}
          </ThemedText>
        )}
        <Field label={t.request.note} placeholder={t.request.notePlaceholder} value={note} onChangeText={setNote} multiline style={{ minHeight: 80 }} />
      </Card>

      {suppliers === null ? (
        <Card>
          <ThemedText type="subtitle">{t.request.choice}</ThemedText>
          <View style={styles.wrap}>
            <Option label={t.request.choiceBatinode} selected={choice === 'batinode'} onPress={() => setChoice('batinode')} />
            <Option label={t.request.choiceOwn} selected={choice === 'own'} onPress={() => setChoice('own')} />
            <Option label={t.request.choiceMix} selected={choice === 'mix'} onPress={() => setChoice('mix')} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {choice === 'batinode' ? t.request.choiceBatinodeHelp : choice === 'mix' ? t.request.choiceMixHelp : t.request.choiceOwnHelp}
          </ThemedText>
          {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
          {needsProfile ? <CompleteProfileCard text={t.signup.later.send} /> : null}
          {choice === 'batinode' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t.request.consent}
              </ThemedText>
              <Button label={t.request.sendBatinode} variant="signal" onPress={sendToBatinode} busy={busy} />
            </>
          ) : (
            <Button label={t.request.findSuppliers} onPress={findSuppliers} busy={busy} />
          )}
        </Card>
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
          {access !== 'full' ? (
            <UpgradeCard reason="suppliers" />
          ) : (
            <>
              {limit ? <UpgradeCard reason={limit} /> : null}
              <ThemedText type="small" themeColor="textSecondary">
                {t.request.consent}
              </ThemedText>
              {choice === 'mix' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t.request.choiceMixHelp}
                </ThemedText>
              ) : null}
              <Button
                label={choice === 'mix' ? t.request.sendMix(picked.size, AUTO_SUPPLIERS) : t.request.send(picked.size)}
                variant="signal"
                onPress={send}
                busy={busy}
                disabled={picked.size === 0}
              />
            </>
          )}
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
