import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** The founding-member offer: 100 numbered places, open until 31 March 2027 (Brussels). */
export type FounderOffer = { total: number; taken: number; endsAt: string; open: boolean };

/** Live count of the places taken; null while loading or if the count is unavailable. */
export function useFounderOffer(): FounderOffer | null {
  const [offer, setOffer] = useState<FounderOffer | null>(null);
  useEffect(() => {
    let active = true;
    supabase.rpc('founder_offer').then(({ data }) => {
      const o = data as { total: number; taken: number; ends_at: string; open: boolean } | null;
      if (active && o) setOffer({ total: o.total, taken: o.taken, endsAt: o.ends_at, open: o.open });
    });
    return () => {
      active = false;
    };
  }, []);
  return offer;
}

/** The last day of the offer, as people read it (the offer ends at midnight that night). */
export function founderLastDay(offer: FounderOffer, locale: string): string {
  const last = new Date(new Date(offer.endsAt).getTime() - 1);
  return last.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Brussels' });
}
