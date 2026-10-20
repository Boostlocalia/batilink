// The home carousel's building news (news_items, written each morning by the
// news-daily job) topped up with Nodi's tips so there are always 5 slides.
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { Accent } from '@/components/hero-carousel';
import type { Banner } from '@/lib/banners';
import { NODI_TIPS } from '@/lib/nodi-tips';
import { supabase } from '@/lib/supabase';

export const NEWS_PER_DAY = 5;
export type NewsTopic = 'ecology' | 'regulation' | 'grants' | 'products' | 'market' | 'safety';

export type NewsCard = { key: string; topic: NewsTopic; title: string; text: string; source?: string; url?: string };

/** Our own photos per topic: nothing is loaded from the news sites. */
export const TOPIC_LOOK: Record<NewsTopic, { image: Banner; accent: Accent }> = {
  ecology: { image: 'site', accent: 'lime' },
  grants: { image: 'phone', accent: 'cyan' },
  regulation: { image: 'architect', accent: 'orange' },
  products: { image: 'materials', accent: 'violet' },
  market: { image: 'delivery', accent: 'magenta' },
  safety: { image: 'supplier', accent: 'orange' },
};

type Row = { id: string; topic: NewsTopic; title_fr: string; text_fr: string; title_nl: string; text_nl: string; source_name: string; source_url: string };

export async function loadNews(lang: 'fr' | 'nl'): Promise<NewsCard[]> {
  const { data } = await supabase
    .from('news_items')
    .select('id, topic, title_fr, text_fr, title_nl, text_nl, source_name, source_url')
    .order('published_on', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(NEWS_PER_DAY);
  const news: NewsCard[] = ((data ?? []) as Row[])
    .filter((r) => r.source_url.startsWith('https://'))
    .map((r) => ({
      key: r.id,
      topic: r.topic,
      title: lang === 'nl' ? r.title_nl : r.title_fr,
      text: lang === 'nl' ? r.text_nl : r.text_fr,
      source: r.source_name,
      url: r.source_url,
    }));
  return [...news, ...tipsOfTheDay(NEWS_PER_DAY - news.length, lang)];
}

/** A different run of tips each day. */
export function tipsOfTheDay(count: number, lang: 'fr' | 'nl', now = new Date()): NewsCard[] {
  if (count <= 0) return [];
  const day = Math.floor(now.getTime() / 86_400_000);
  return Array.from({ length: Math.min(count, NODI_TIPS.length) }, (_, i) => {
    const index = (day * NEWS_PER_DAY + i) % NODI_TIPS.length;
    const tip = NODI_TIPS[index];
    const [title, text] = tip[lang];
    return { key: `tip-${index}`, topic: tip.topic, title, text };
  });
}

/** Opens the article on its own site, in a new tab (web) or the in-app browser (phones). */
export async function openNews(url: string): Promise<void> {
  if (!url.startsWith('https://')) return;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else await WebBrowser.openBrowserAsync(url);
}
