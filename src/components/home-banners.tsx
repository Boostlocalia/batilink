import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { HeroCarousel, type Slide } from '@/components/hero-carousel';
import { useI18n } from '@/i18n';
import { loadNews, NEWS_PER_DAY, openNews, tipsOfTheDay, TOPIC_LOOK, type NewsCard } from '@/lib/news';

/** Contractor home: the day's building news, announced by Nodi, topped up with his tips. */
export function NewsCarousel() {
  const { t, language } = useI18n();
  const n = t.banners.news;
  const [cards, setCards] = useState<NewsCard[]>(() => tipsOfTheDay(NEWS_PER_DAY, language));

  useFocusEffect(
    useCallback(() => {
      loadNews(language).then(setCards).catch(() => undefined);
    }, [language]),
  );

  const slides: Slide[] = cards.map((c) => ({
    key: c.key,
    ...TOPIC_LOOK[c.topic],
    nodi: true,
    kicker: `${c.url ? n.nodi : n.tip} · ${n.topics[c.topic]}`,
    title: c.title,
    text: c.text,
    footnote: c.source ? n.source(c.source, c.otherLanguage) : undefined,
    cta: c.url ? n.read : undefined,
    onPress: c.url ? () => openNews(c.url!) : undefined,
  }));
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

type PageSlide = { kicker: string; title: string; text: string };
const PAGE_LOOKS: { image: Slide['image']; accent: Slide['accent'] }[] = [
  { image: 'materials', accent: 'lime' },
  { image: 'network', accent: 'cyan' },
  { image: 'phone', accent: 'magenta' },
];

/** A page header banner made of one or more hook lines, each with its own photo and accent. */
function PageBanner({ items, looks = PAGE_LOOKS }: { items: PageSlide[]; looks?: typeof PAGE_LOOKS }) {
  const slides: Slide[] = items.map((s, i) => ({ key: String(i), ...looks[i % looks.length], ...s }));
  return <HeroCarousel slides={slides} height={170} />;
}

export function SignInBanners() {
  const { t } = useI18n();
  return <PageBanner items={t.banners.pages.signin} />;
}

export function RequestBanner() {
  const { t } = useI18n();
  return <PageBanner items={[t.banners.pages.request]} looks={[{ image: 'delivery', accent: 'orange' }]} />;
}

export function NetworkBanners() {
  const { t } = useI18n();
  return <PageBanner items={t.banners.pages.network} looks={[{ image: 'site', accent: 'cyan' }, { image: 'architect', accent: 'violet' }]} />;
}

export function PlansBanner() {
  const { t } = useI18n();
  return <PageBanner items={[t.banners.pages.plans]} looks={[{ image: 'phone', accent: 'magenta' }]} />;
}

export function SettingsBanner() {
  const { t } = useI18n();
  return <PageBanner items={[t.banners.pages.settings]} looks={[{ image: 'network', accent: 'violet' }]} />;
}
