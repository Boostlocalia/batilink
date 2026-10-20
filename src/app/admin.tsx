import { FunctionsHttpError } from '@supabase/supabase-js';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Loading, Option, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { REGIONS, type Region } from '@/lib/signup';
import { supabase } from '@/lib/supabase';

// The platform team's space. Only the team uses it, so it is written in French only.

type Figures = {
  contractors: number;
  suppliers: number;
  architects: number;
  newWeek: number;
  toVerify: number;
  waiting: number;
  quotesWeek: number;
  ordersWeek: number;
  byPlan: Record<string, number>;
  trials: number;
};
type Waiting = {
  id: string;
  title: string;
  place: string;
  reply_by: string;
  sent_at: string | null;
  company: string | null;
  invited: number;
  answered: number;
  batinode: boolean;
  target: number | null;
};
type ToVerify = { id: string; kind: string; name: string; vat_number: string | null; city: string | null; created_at: string; verification_status: string };
type Incomplete = { id: string; name: string; city: string | null; phone: string | null; created_at: string; added_by: string[] };
type Recent = { id: string; kind: string; name: string; city: string | null; created_at: string };
type Overview = { figures: Figures; waiting: Waiting[]; toVerify: ToVerify[]; incomplete: Incomplete[]; recent: Recent[] };

type Supplier = {
  id?: string;
  name: string;
  vat_number: string;
  email: string;
  quote_email: string;
  phone: string;
  contact_name: string;
  street: string;
  postal_code: string;
  city: string;
  language: 'fr' | 'nl';
  regions: Region[];
  categories: number[];
};
type SupplierRow = { id: string; name: string; city: string | null; postal_code: string | null; email: string | null; quote_email: string | null; verification_status: string };

const EMPTY: Supplier = {
  name: '',
  vat_number: '',
  email: '',
  quote_email: '',
  phone: '',
  contact_name: '',
  street: '',
  postal_code: '',
  city: '',
  language: 'fr',
  regions: [],
  categories: [],
};

const KIND: Record<string, string> = { contractor: 'Entrepreneur', supplier: 'Fournisseur', architect: 'Architecte' };
const ERRORS: Record<string, string> = {
  invalid_name: 'Le nom est trop court.',
  invalid_vat: 'Numéro de TVA invalide (BE0123456789).',
  invalid_email: 'Adresse e-mail invalide.',
  invalid_phone: 'Numéro de téléphone invalide.',
  invalid_postal_code: 'Code postal invalide.',
  vat_taken: 'Une entreprise avec ce numéro de TVA existe déjà.',
  not_open: 'Cette demande n’attend plus d’offres.',
  none_found: 'Aucun autre fournisseur avec e-mail ne couvre cette catégorie et cette zone. Ajoutez-en un plus bas.',
  already_invited: 'Ce fournisseur a déjà reçu cette demande.',
  unsubscribed: 'Ce fournisseur s’est désinscrit des demandes de prix.',
  no_email: 'Ce fournisseur n’a pas d’adresse e-mail.',
  send_failed: 'L’envoi a échoué.',
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin', { body });
  if (!error) return { data: data as T };
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => ({}))) as { error?: string };
    return { error: payload.error ?? 'error' };
  }
  return { error: 'error' };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Figure({ label, value }: { label: string; value: number | string }) {
  const theme = useTheme();
  return (
    <View style={{ minWidth: 130, flexGrow: 1, padding: Spacing.three, borderRadius: 12, backgroundColor: theme.backgroundSelected, gap: Spacing.one }}>
      <ThemedText type="number">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Row({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const theme = useTheme();
  const content = <View style={{ paddingVertical: Spacing.two, borderTopWidth: 1, borderTopColor: theme.backgroundSelected, gap: Spacing.one }}>{children}</View>;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export default function AdminScreen() {
  const { t } = useI18n();
  const [denied, setDenied] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [categories, setCategories] = useState<{ id: number; label_fr: string }[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SupplierRow[] | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  // Completing a request BatiNode looks after: which one, the supplier search, the outcome.
  const [completing, setCompleting] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [pickResults, setPickResults] = useState<SupplierRow[] | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await call<Overview>({ action: 'overview' });
    if (res.error === 'forbidden' || res.error === 'unauthorized') return setDenied(true);
    if (res.data) setOverview(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      supabase.from('categories').select('id, label_fr').order('id').then(({ data }) => setCategories(data ?? []));
    }, [load]),
  );

  const search = async () => {
    const res = await call<{ suppliers: SupplierRow[] }>({ action: 'suppliers', q: query });
    setResults(res.data?.suppliers ?? []);
  };

  const open = async (id: string) => {
    setMessage(null);
    const res = await call<{ supplier: Record<string, unknown> }>({ action: 'supplier', id });
    const s = res.data?.supplier;
    if (!s) return;
    const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '');
    setEditing({
      id,
      name: str('name'),
      vat_number: str('vat_number'),
      email: str('email'),
      quote_email: str('quote_email'),
      phone: str('phone'),
      contact_name: str('contact_name'),
      street: str('street'),
      postal_code: str('postal_code'),
      city: str('city'),
      language: s.language === 'nl' ? 'nl' : 'fr',
      regions: (s.regions as Region[] | null) ?? [],
      categories: (s.categories as number[] | null) ?? [],
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const res = await call<{ id: string }>({ action: 'save_supplier', supplier: editing });
    setSaving(false);
    if (res.error) return setMessage({ ok: false, text: ERRORS[res.error] ?? t.common.error });
    setMessage({ ok: true, text: editing.id ? 'Fournisseur mis à jour.' : 'Fournisseur ajouté.' });
    setEditing({ ...editing, id: res.data?.id });
    load();
    if (results) search();
  };

  const startCompleting = (id: string) => {
    setCompleting(completing === id ? null : id);
    setPickQuery('');
    setPickResults(null);
    setInviteMessage(null);
  };

  const searchToInvite = async () => {
    const res = await call<{ suppliers: SupplierRow[] }>({ action: 'suppliers', q: pickQuery });
    setPickResults(res.data?.suppliers ?? []);
  };

  const invite = async (requestId: string, supplierId: string | null) => {
    setInviting(supplierId ?? 'auto');
    setInviteMessage(null);
    const res = await call<{ sent: number }>(supplierId ? { action: 'invite_to_request', request_id: requestId, supplier_id: supplierId } : { action: 'auto_complete', request_id: requestId });
    setInviting(null);
    if (res.error) return setInviteMessage({ ok: false, text: ERRORS[res.error] ?? t.common.error });
    setInviteMessage({ ok: true, text: `Demande envoyée à ${res.data?.sent ?? 1} fournisseur${(res.data?.sent ?? 1) > 1 ? 's' : ''}.` });
    load();
  };

  const verify = async (id: string, status: 'verified' | 'rejected') => {
    setVerifying(id + status);
    await call({ action: 'verify', company_id: id, status });
    setVerifying(null);
    load();
  };

  if (denied) {
    return (
      <Screen withTabBar={false}>
        <Stack.Screen options={{ title: 'Admin' }} />
        <ThemedText type="title">Accès réservé</ThemedText>
        <ThemedText themeColor="textSecondary">Cet espace est réservé à l’équipe BatiNode.</ThemedText>
      </Screen>
    );
  }
  if (!overview) return <Loading />;

  const f = overview.figures;
  const set = (patch: Partial<Supplier>) => editing && setEditing({ ...editing, ...patch });

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: 'Admin' }} />
      <ThemedText type="title">Admin</ThemedText>

      <Card>
        <ThemedText type="subtitle">Chiffres clés</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          <Figure label="Entrepreneurs" value={f.contractors} />
          <Figure label="Fournisseurs" value={f.suppliers} />
          <Figure label="Architectes" value={f.architects} />
          <Figure label="Inscrits cette semaine" value={f.newWeek} />
          <Figure label="Demandes en attente" value={f.waiting} />
          <Figure label="Offres reçues (7 j)" value={f.quotesWeek} />
          <Figure label="Commandes (7 j)" value={f.ordersWeek} />
          <Figure label="À vérifier" value={f.toVerify} />
          <Figure label="Abonnés Pro" value={f.byPlan.pro ?? 0} />
          <Figure label="Abonnés Full" value={f.byPlan.full ?? 0} />
          <Figure label="En essai" value={f.trials} />
        </View>
      </Card>

      <Card>
        <ThemedText type="subtitle">Demandes en attente ({overview.waiting.length})</ThemedText>
        {overview.waiting.length === 0 ? <ThemedText themeColor="textSecondary">Aucune demande en attente.</ThemedText> : null}
        {overview.waiting.map((r) => (
          <Row key={r.id}>
            <ThemedText type="smallBold">{r.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[r.company, r.place, `envoyée le ${day(r.sent_at)}`, `réponse avant le ${day(r.reply_by)}`].filter(Boolean).join(' · ')}
            </ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
              <Chip label={`${r.answered} / ${r.invited} offres`} tone={r.invited === 0 ? 'warn' : r.answered > 0 ? 'good' : 'neutral'} />
              {r.batinode ? <Chip label="Confiée à BatiNode" tone={r.invited < (r.target ?? 0) ? 'warn' : 'neutral'} /> : null}
              {r.batinode && r.invited < (r.target ?? 0) ? <Chip label={`${(r.target ?? 0) - r.invited} fournisseur(s) à trouver`} tone="warn" /> : null}
              {!r.batinode && r.invited === 0 ? <Chip label="Aucun fournisseur invité" tone="warn" /> : null}
            </View>
            <Button label={completing === r.id ? 'Fermer' : 'Ajouter des fournisseurs'} variant="ghost" small onPress={() => startCompleting(r.id)} />
            {completing === r.id ? (
              <View style={{ gap: Spacing.two }}>
                <Button label="Chercher automatiquement dans la région" small busy={inviting === 'auto'} onPress={() => invite(r.id, null)} />
                <Field label="Ou chercher un fournisseur" value={pickQuery} onChangeText={setPickQuery} placeholder="Nom, ville, code postal ou e-mail" onSubmitEditing={searchToInvite} />
                <Button label="Rechercher" variant="ghost" small onPress={searchToInvite} />
                {pickResults?.length === 0 ? <ThemedText themeColor="textSecondary">Aucun fournisseur trouvé. Ajoutez-le plus bas avec son e-mail.</ThemedText> : null}
                {(pickResults ?? []).map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="smallBold">{s.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[[s.postal_code, s.city].filter(Boolean).join(' '), s.quote_email ?? s.email ?? 'pas d’e-mail'].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                    <Button label="Inviter" small disabled={!(s.quote_email ?? s.email)} busy={inviting === s.id} onPress={() => invite(r.id, s.id)} />
                  </View>
                ))}
                {inviteMessage ? <ThemedText themeColor={inviteMessage.ok ? 'good' : 'danger'}>{inviteMessage.text}</ThemedText> : null}
              </View>
            ) : null}
          </Row>
        ))}
      </Card>

      <Card>
        <ThemedText type="subtitle">Fournisseurs à compléter ({overview.incomplete.length})</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Ajoutés par un entrepreneur sans adresse e-mail : ils ne reçoivent pas encore les demandes.
        </ThemedText>
        {overview.incomplete.map((s) => (
          <Row key={s.id} onPress={() => open(s.id)}>
            <ThemedText type="smallBold">{s.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[s.city, s.phone, s.added_by.length ? `ajouté par ${s.added_by.join(', ')}` : null, day(s.created_at)].filter(Boolean).join(' · ')}
            </ThemedText>
          </Row>
        ))}
      </Card>

      <Card>
        <ThemedText type="subtitle">Entreprises à vérifier ({overview.toVerify.length})</ThemedText>
        {overview.toVerify.length === 0 ? <ThemedText themeColor="textSecondary">Rien à vérifier.</ThemedText> : null}
        {overview.toVerify.map((c) => (
          <Row key={c.id}>
            <ThemedText type="smallBold">{c.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[KIND[c.kind] ?? c.kind, c.vat_number, c.city, day(c.created_at), c.verification_status === 'needs_review' ? 'à revoir' : 'en attente'].filter(Boolean).join(' · ')}
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Button small label="Vérifier" variant="signal" busy={verifying === c.id + 'verified'} onPress={() => verify(c.id, 'verified')} />
              <Button small label="Refuser" variant="ghost" busy={verifying === c.id + 'rejected'} onPress={() => verify(c.id, 'rejected')} />
            </View>
          </Row>
        ))}
      </Card>

      <Card>
        <ThemedText type="subtitle">Fournisseurs</ThemedText>
        <Field label="Rechercher (nom, ville, e-mail, code postal)" value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" />
        <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
          <Button small label="Rechercher" onPress={search} />
          <Button
            small
            label="Ajouter un fournisseur"
            variant="signal"
            onPress={() => {
              setMessage(null);
              setEditing({ ...EMPTY });
            }}
          />
        </View>
        {results?.length === 0 ? <ThemedText themeColor="textSecondary">Aucun fournisseur trouvé.</ThemedText> : null}
        {results?.map((s) => (
          <Row key={s.id} onPress={() => open(s.id)}>
            <ThemedText type="smallBold">{s.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[[s.postal_code, s.city].filter(Boolean).join(' '), s.quote_email ?? s.email ?? 'pas d’e-mail'].filter(Boolean).join(' · ')}
            </ThemedText>
          </Row>
        ))}
      </Card>

      {editing ? (
        <Card>
          <ThemedText type="subtitle">{editing.id ? `Modifier ${editing.name}` : 'Nouveau fournisseur'}</ThemedText>
          <Field label="Nom" value={editing.name} onChangeText={(name) => set({ name })} />
          <Field label="Numéro de TVA" value={editing.vat_number} onChangeText={(vat_number) => set({ vat_number })} autoCapitalize="characters" placeholder="BE0123456789" />
          <Field label="E-mail" value={editing.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" />
          <Field
            label="E-mail pour les demandes de prix"
            hint="Si vide, les demandes partent vers l'e-mail ci-dessus."
            value={editing.quote_email}
            onChangeText={(quote_email) => set({ quote_email })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field label="Téléphone" value={editing.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
          <Field label="Personne de contact" value={editing.contact_name} onChangeText={(contact_name) => set({ contact_name })} />
          <Field label="Rue et numéro" value={editing.street} onChangeText={(street) => set({ street })} />
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ width: 120 }}>
              <Field label="Code postal" value={editing.postal_code} onChangeText={(postal_code) => set({ postal_code })} keyboardType="number-pad" maxLength={4} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Ville" value={editing.city} onChangeText={(city) => set({ city })} />
            </View>
          </View>
          <ThemedText type="smallBold">Langue</ThemedText>
          <Segmented
            value={editing.language}
            options={[
              { value: 'fr', label: 'Français' },
              { value: 'nl', label: 'Nederlands' },
            ]}
            onChange={(language) => set({ language })}
          />
          <ThemedText type="smallBold">Catégories vendues</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {categories.map((c) => (
              <Option key={c.id} label={c.label_fr} selected={editing.categories.includes(c.id)} onPress={() => set({ categories: toggle(editing.categories, c.id) })} />
            ))}
          </View>
          <ThemedText type="smallBold">Provinces livrées</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {REGIONS.map((r) => (
              <Option key={r} label={t.signup.regionLabels[r]} selected={editing.regions.includes(r)} onPress={() => set({ regions: toggle(editing.regions, r) })} />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Le fournisseur reçoit les demandes des catégories et provinces cochées.
          </ThemedText>
          {message ? <ThemedText themeColor={message.ok ? 'good' : 'danger'}>{message.text}</ThemedText> : null}
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button label="Enregistrer" variant="signal" busy={saving} onPress={save} />
            <Button label="Fermer" variant="ghost" onPress={() => setEditing(null)} />
          </View>
        </Card>
      ) : null}

      <Card>
        <ThemedText type="subtitle">Dernières inscriptions</ThemedText>
        {overview.recent.map((c) => (
          <Row key={c.id}>
            <ThemedText type="smallBold">{c.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[KIND[c.kind] ?? c.kind, c.city, day(c.created_at)].filter(Boolean).join(' · ')}
            </ThemedText>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
