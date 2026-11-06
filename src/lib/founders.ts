import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

/** The founding-member offer: 50 numbered places, open until 31 March 2027 (Brussels). */
export type FounderOffer = {
  total: number;
  taken: number;
  /** Contractor companies signed up, paying or not. */
  registered: number;
  /** Of those, companies in their free 7-day trial. */
  trial: number;
  /** Suppliers BatiNode can ask for prices. */
  suppliers: number;
  endsAt: string;
  open: boolean;
};

/** Live count of the places taken, refreshed every minute; null while loading or if the count is unavailable. */
export function useFounderOffer(): FounderOffer | null {
  const [offer, setOffer] = useState<FounderOffer | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      supabase.rpc("founder_offer").then(({ data }) => {
        const o = data as {
          total: number;
          taken: number;
          registered?: number;
          trial?: number;
          suppliers?: number;
          ends_at: string;
          open: boolean;
        } | null;
        if (active && o)
          setOffer({
            total: o.total,
            taken: o.taken,
            registered: o.registered ?? 0,
            trial: o.trial ?? 0,
            suppliers: o.suppliers ?? 0,
            endsAt: o.ends_at,
            open: o.open,
          });
      });
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return offer;
}

/** The last day of the offer, as people read it (the offer ends at midnight that night). */
export function founderLastDay(offer: FounderOffer, locale: string): string {
  const last = new Date(new Date(offer.endsAt).getTime() - 1);
  return last.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
}

export type Founder = {
  number: number;
  plan: "pro" | "full";
  changed: boolean;
  ended: boolean;
};

/** The company's founder place: undefined while loading, null when it has none. */
export function useFounder(
  companyId: string | undefined,
): Founder | null | undefined {
  const [founder, setFounder] = useState<{
    company: string;
    value: Founder | null;
  } | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    supabase
      .from("subscriptions")
      .select(
        "founder_number, founder_plan, founder_plan_changed_at, founder_ended_at",
      )
      .eq("company_id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const value: Founder | null = data?.founder_number
          ? {
              number: data.founder_number,
              plan: data.founder_plan,
              changed: !!data.founder_plan_changed_at,
              ended: !!data.founder_ended_at,
            }
          : null;
        setFounder({ company: companyId, value });
      });
    return () => {
      active = false;
    };
  }, [companyId]);
  if (!companyId) return null;
  return founder?.company === companyId ? founder.value : undefined;
}

/** Whether moving to `plan` keeps the guarantee: only one move up from Starter to Premium. */
export function keepsGuarantee(
  founder: Founder,
  plan: "pro" | "full",
): boolean {
  return (
    plan === founder.plan ||
    (founder.plan === "pro" && plan === "full" && !founder.changed)
  );
}
