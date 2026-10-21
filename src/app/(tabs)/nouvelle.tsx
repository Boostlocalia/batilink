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
import { dropFormDraft, keepFormDraft, keepPendingRequest, readFormDraft, takePendingRequest } from '@/lib/pending-request';
import { useSession } from '@/lib/session';
import { UNITS, type ImportedItem, type Unit } from '@/lib/spreadsheet';
import { supabase } from '@/lib/supabase';

type Category = { id: number; label_fr: string; label_nl: string };
type Supplier = {
  id: string;
  name: string;
  city: string | null;
  verified: boolean;
};
type ItemDraft = { key: number; label: string; quantity: string; unit: Unit };
type Step = 1 | 2 | 3;

let nextKey = 1;
const emptyItem = (): ItemDraft => ({
  key: nextKey++,
  label: '',
  quantity: '',
  unit: 'piece',
});

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
  // Three short steps: what, where, which suppliers.
  const [step, setStep] = useState<Step>(1);
  const [more, setMore] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const userId = session?.user.id;

  // BatiNode picks 5 suppliers of the region, or the contractor picks them.
  const [choice, setChoice] = useState<'batinode' | 'own' | 'mix'>('batinode');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Suppliers the contractor found by typing their name: always listed and ticked.
  const [known, setKnown] = useState<Supplier[]>([]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  const applyImported = useCallback(
    (imported: ImportedItem[]) => {
      setItems((list) => [...list.filter((i) => i.label.trim() || i.quantity.trim()), ...imported.map((i) => ({ ...i, key: nextKey++ }))]);
      setImportNotice({
        text: t.files.imported(imported.length),
        error: false,
      });
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
      setItems(
        pending.items.map((i) => ({
          key: nextKey++,
          label: i.label,
          quantity: i.quantity,
          unit: i.unit as Unit,
        })),
      );
      setNote(pending.note);
      setNeedsProfile(false);
      setImportNotice({ text: t.signup.later.restored, error: false });
    });
  }, [company, t]);

  // The form left half-written comes back where it was.
  useEffect(() => {
    if (!userId) return;
    let live = true;
    readFormDraft(userId).then((draft) => {
      if (!live) return;
      if (draft) {
        setTitle((v) => v || draft.title);
        setCategoryId((v) => v ?? draft.categoryId);
        setPostalCode((v) => draft.postalCode || v);
        setCity((v) => draft.city || v);
        setFulfilment(draft.fulfilment);
        setItems((list) =>
          list.some((i) => i.label.trim())
            ? list
            : draft.items.map((i) => ({
                key: nextKey++,
                label: i.label,
                quantity: i.quantity,
                unit: i.unit as Unit,
              })),
        );
        setNote((v) => v || draft.note);
        setStep(draft.step);
      }
      setDraftReady(true);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !draftReady) return;
    const timer = setTimeout(() => {
      keepFormDraft(userId, {
        step,
        title,
        categoryId,
        postalCode,
        city,
        fulfilment,
        items: items.map(({ label, quantity, unit }) => ({
          label,
          quantity,
          unit,
        })),
        note,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [userId, draftReady, step, title, categoryId, postalCode, city, fulfilment, items, note]);

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
    setStep(1);
    setMore(false);
    if (userId) dropFormDraft(userId);
  };

  const whatErrors = () => {
    const next: Record<string, string> = {};
    if (title.trim().length < 3) next.title = t.request.errors.name;
    const filled = items.filter((i) => i.label.trim() || i.quantity.trim());
    if (!filled.length || filled.some((i) => i.label.trim().length < 2 || !(parseAmount(i.quantity) ?? 0))) {
      next.items = t.request.errors.items;
    }
    return next;
  };

  const whereErrors = (): Record<string, string> => (isBelgianPostalCode(postalCode) ? {} : { postalCode: t.request.errors.postalCode });

  /** Checks the whole form and brings the contractor back to the step that needs fixing. */
  const validate = () => {
    const what = whatErrors();
    const where = whereErrors();
    setErrors({ ...what, ...where });
    if (Object.keys(what).length) setStep(1);
    else if (Object.keys(where).length) setStep(2);
    return !Object.keys(what).length && !Object.keys(where).length;
  };

  const next = () => {
    const found = step === 1 ? whatErrors() : whereErrors();
    setErrors(found);
    if (!Object.keys(found).length) setStep(step === 1 ? 2 : 3);
  };

  const back = () => {
    setErrors({});
    setStep(step === 3 ? 2 : 1);
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
        items: items.map(({ label, quantity, unit }) => ({
          label,
          quantity,
          unit,
        })),
        note,
      });
      setNeedsProfile(true);
      return null;
    }
    setBusy(true);
    const fields = {
      title: title.trim(),
      category_id: categoryId,
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
        .insert({
          ...fields,
          company_id: company.id,
          created_by: session?.user.id,
        })
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
    const knownIds = new Set(known.map((k) => k.id));
    setSuppliers([...known, ...found.filter((s) => !knownIds.has(s.id))]);
    const max = PLANS[plan].suppliersPerRequest;
    // Mixed: the contractor ticks the one or two suppliers they know, BatiNode adds the rest.
    const preset = choice === 'mix' ? [] : found.filter((s) => !knownIds.has(s.id)).map((s) => s.id);
    const all = [...knownIds, ...preset];
    setPicked(new Set(all.slice(0, Number.isFinite(max) ? max : all.length)));
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
    const { count: sentThisMonth } = await supabase.from('price_requests').select('id', { count: 'exact', head: true }).gte('sent_at', monthStart(new Date()).toISOString());
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
      return setErrors({
        form: body?.error ? errorText(body.error, body.limit) : t.common.error,
      });
    }
    reset();
    router.push({
      pathname: '/demande/[id]',
      params: { id: requestId, sent: String(data?.sent ?? count) },
    });
  };

  const errorText = (reason: string, _limit?: number) => {
    if (reason === 'plan') {
      setLimit('suppliers');
      return t.request.errors.plan;
    }
    if (reason === 'no_supplier') return t.request.errors.no_supplier;
    return t.common.error;
  };

  const updateItem = (key: number, patch: Partial<ItemDraft>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const changeChoice = (next: 'batinode' | 'own' | 'mix') => {
    setChoice(next);
    setErrors({});
    // Back to the first step, where "Envoyer la demande" lets BatiNode pick.
    if (next === 'batinode') return setSuppliers(null);
    // Mixed keeps at most 4 of the contractor's own suppliers.
    if (next === 'mix') setPicked((current) => new Set([...current].slice(0, AUTO_SUPPLIERS - 1)));
  };

  // A supplier typed by name joins the contractor's favourites, so it may receive this request.
  const addKnown = async (s: Supplier) => {
    if (access !== 'full') return setLimit('suppliers');
    if (choice === 'mix' && picked.size >= AUTO_SUPPLIERS - 1 && !picked.has(s.id)) return;
    if (company) {
      const { error } = await supabase.from('preferred_suppliers').insert({ contractor_id: company.id, supplier_id: s.id });
      if (error && error.code !== '23505') return setErrors({ form: t.common.error });
    }
    setKnown((list) => (list.some((k) => k.id === s.id) ? list : [...list, s]));
    setSuppliers((list) => (list === null || list.some((k) => k.id === s.id) ? list : [s, ...list]));
    setPicked((current) => new Set(current).add(s.id));
  };

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
      {step === 1 ? <RequestBanner /> : null}

      <View style={{ gap: Spacing.one }}>
        <View style={styles.progress}>
          {([1, 2, 3] as const).map((n) => (
            <View key={n} style={[styles.dot, { backgroundColor: n <= step ? theme.signal : theme.line }]} />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t.request.steps.of(step, 3)}
        </ThemedText>
        <ThemedText type="subtitle">{step === 1 ? t.request.steps.what : step === 2 ? t.request.steps.where : t.request.steps.who}</ThemedText>
      </View>

      {step === 1 ? (
        <Card>
          <Field label={t.request.name} placeholder={t.request.namePlaceholder} value={title} onChangeText={setTitle} error={errors.title} />
          <ThemedText type="smallBold">{t.request.items}</ThemedText>
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
              {items.length > 1 ? <Button label={t.request.removeItem} variant="ghost" small onPress={() => setItems((list) => list.filter((i) => i.key !== item.key))} /> : null}
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
                    onPress={() => setCategoryId(selected ? null : c.id)}
                    style={[
                      styles.option,
                      {
                        borderColor: selected ? theme.brand : theme.line,
                        backgroundColor: selected ? theme.brand : 'transparent',
                      },
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
          <Button label={more ? t.request.steps.less : t.request.steps.more} variant="ghost" small onPress={() => setMore(!more)} />
          {more ? <Field label={t.request.note} placeholder={t.request.notePlaceholder} value={note} onChangeText={setNote} multiline style={{ minHeight: 80 }} /> : null}
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
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
      ) : null}

      {step < 3 ? (
        <View style={styles.nav}>
          {step > 1 ? <Button label={`← ${t.request.steps.back}`} variant="ghost" onPress={back} /> : null}
          <View style={{ flex: 1 }}>
            <Button label={`${t.request.steps.next} →`} variant="signal" onPress={next} />
          </View>
        </View>
      ) : null}

      {step < 3 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t.request.steps.draftKept}
        </ThemedText>
      ) : null}

      {step === 3 ? <Button label={`← ${t.request.steps.back}`} variant="ghost" onPress={back} /> : null}

      {step !== 3 ? null : suppliers === null ? (
        <Card>
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
            <>
              <SupplierSearch onPick={addKnown} chosen={picked} />
              {known.map((k) => (
                <Pressable key={k.id} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(k.id) }} onPress={() => togglePick(k.id)} style={styles.supplier}>
                  <View
                    style={[
                      styles.box,
                      {
                        borderColor: picked.has(k.id) ? theme.signal : theme.line,
                        backgroundColor: picked.has(k.id) ? theme.signal : 'transparent',
                      },
                    ]}>
                    {picked.has(k.id) ? (
                      <ThemedText type="smallBold" themeColor="onSignal">
                        ✓
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="smallBold" style={{ flex: 1 }}>
                    {[k.name, k.city].filter(Boolean).join(' · ')}
                  </ThemedText>
                </Pressable>
              ))}
              <Button label={t.request.findSuppliers} onPress={findSuppliers} busy={busy} />
            </>
          )}
        </Card>
      ) : (
        <Card>
          {/* The contractor can still change their mind, e.g. let BatiNode find the suppliers after all. */}
          <View style={styles.wrap}>
            <Option label={t.request.choiceBatinode} selected={false} onPress={() => changeChoice('batinode')} />
            <Option label={t.request.choiceOwn} selected={choice === 'own'} onPress={() => changeChoice('own')} />
            <Option label={t.request.choiceMix} selected={choice === 'mix'} onPress={() => changeChoice('mix')} />
          </View>
          <ThemedText type="subtitle">{t.request.suppliers}</ThemedText>
          <SupplierSearch onPick={addKnown} chosen={picked} />
          {suppliers.length === 0 ? (
            <ThemedText themeColor="textSecondary">{t.request.noSuppliers}</ThemedText>
          ) : (
            // A short box that scrolls on its own, so a long list doesn't push the page down.
            <ScrollView nestedScrollEnabled style={[styles.scrollBox, { borderColor: theme.line }]} contentContainerStyle={styles.scrollBoxContent}>
              {suppliers.map((s) => {
                const selected = picked.has(s.id);
                return (
                  <Pressable key={s.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => togglePick(s.id)} style={styles.supplier}>
                    <View
                      style={[
                        styles.box,
                        {
                          borderColor: selected ? theme.brand : theme.line,
                          backgroundColor: selected ? theme.brand : 'transparent',
                        },
                      ]}>
                      {selected ? (
                        <ThemedText type="smallBold" themeColor="onBrand">
                          ✓
                        </ThemedText>
                      ) : null}
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
              })}
            </ScrollView>
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

/** Type a supplier's name (or town) to find them in the directory and add them. */
function SupplierSearch({ onPick, chosen }: { onPick: (s: Supplier) => void; chosen: Set<string> }) {
  const { t } = useI18n();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Supplier[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_suppliers', { p_query: q });
      if (live) setMatches((data as Supplier[] | null) ?? []);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = query.trim().length >= 2 ? matches : [];
  return (
    <View style={{ gap: Spacing.one }}>
      <Field label={t.request.searchSupplier} placeholder={t.request.searchSupplierPlaceholder} value={query} onChangeText={setQuery} autoCapitalize="words" />
      {shown.length ? (
        <ScrollView nestedScrollEnabled style={[styles.scrollBox, { borderColor: theme.line }]} contentContainerStyle={styles.scrollBoxContent}>
          {shown.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => {
                onPick(s);
                setQuery('');
              }}
              style={[
                styles.match,
                {
                  borderColor: theme.line,
                  backgroundColor: theme.backgroundSelected,
                },
              ]}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">{s.name}</ThemedText>
                {s.city ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {s.city}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="smallBold" themeColor={chosen.has(s.id) ? 'good' : 'signal'}>
                {chosen.has(s.id) ? '✓' : t.request.addSupplier}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {query.trim().length >= 2 && !matches.length ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/fournisseurs')}>
          <ThemedText type="small" themeColor="signal">
            {t.request.supplierNotListed}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollBox: { maxHeight: 280, borderWidth: 1, borderRadius: Radius },
  scrollBoxContent: { padding: Spacing.two, gap: Spacing.one },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius,
    padding: Spacing.two,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  nav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  progress: { flexDirection: 'row', gap: Spacing.one },
  dot: { flex: 1, height: 6, borderRadius: 3 },
  option: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  item: { gap: Spacing.two, paddingTop: Spacing.two },
  units: { gap: Spacing.one },
  unit: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  supplier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: Radius / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
