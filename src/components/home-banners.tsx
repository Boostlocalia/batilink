import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { HeroCarousel, type Slide } from '@/components/hero-carousel';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useTrial } from '@/lib/trial';

/** Contractor home: hooks built from their own activity first, then what they have not tried yet. */
export function ContractorBanners({ requests }: { requests: { id: string; status: string }[] }) {
  const { t } = useI18n();
  const b = t.banners.contractor;
  const trial = useTrial();
  const [newcomers, setNewcomers] = useState(0);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('new_contractors', { p_days: 7 }).then(({ data }) => setNewcomers(Array.isArray(data) ? data.length : 0));
    }, []),
  );

  const waiting = requests.filter((r) => r.status === 'sent');
  const slides: Slide[] = [];
  if (trial.onTrial && trial.daysLeft !== null) {
    slides.push({ key: 'trial', image: 'phone', accent: 'magenta', ...b.trial, title: b.trial.title(trial.daysLeft), onPress: () => router.navigate('/abonnement') });
  }
  if (waiting.length) {
    slides.push({
      key: 'waiting',
      image: 'delivery',
      accent: 'orange',
      ...b.waiting,
      title: b.waiting.title(waiting.length),
      onPress: () => router.push({ pathname: '/demande/[id]', params: { id: waiting[0].id } }),
    });
  }
  slides.push(
    { key: 'materials', image: 'materials', accent: 'lime', ...b.materials, onPress: () => router.navigate('/nouvelle') },
    { key: 'network', image: 'network', accent: 'cyan', ...b.network, title: b.network.title(newcomers), onPress: () => router.navigate('/reseau') },
  );
  if (!waiting.length) {
    slides.push({ key: 'delivery', image: 'supplier', accent: 'orange', ...b.delivery, onPress: () => router.push('/fournisseurs') });
  }
  slides.push({ key: 'referral', image: 'site', accent: 'violet', ...b.referral, onPress: () => router.navigate('/reglages') });

  return <HeroCarousel slides={slides} />;
}

/** Supplier home: what to answer now, then how to get more requests. */
export function SupplierBanners({ toAnswer, won, onAnswer }: { toAnswer: number; won: number; onAnswer: () => void }) {
  const { t } = useI18n();
  const b = t.banners.supplier;
  const slides: Slide[] = [];
  if (toAnswer) slides.push({ key: 'waiting', image: 'supplier', accent: 'lime', ...b.waiting, title: b.waiting.title(toAnswer), onPress: onAnswer });
  if (won) slides.push({ key: 'won', image: 'delivery', accent: 'orange', ...b.won, title: b.won.title(won), onPress: onAnswer });
  slides.push(
    { key: 'zones', image: 'site', accent: 'cyan', ...b.zones, onPress: () => router.push('/zones') },
    { key: 'fast', image: 'phone', accent: 'magenta', ...b.fast, onPress: onAnswer },
  );
  return <HeroCarousel slides={slides} />;
}

/** Architect network page. */
export function ArchitectBanners({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useI18n();
  const b = t.banners.architect;
  return (
    <HeroCarousel
      slides={[
        { key: 'find', image: 'architect', accent: 'lime', ...b.find, onPress: () => router.push('/annonce/nouvelle') },
        { key: 'trust', image: 'network', accent: 'cyan', ...b.trust, onPress: onBrowse },
      ]}
    />
  );
}
