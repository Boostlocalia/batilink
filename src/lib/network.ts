import { supabase } from '@/lib/supabase';

export type Trade = { id: number; slug: string; label_fr: string; label_nl: string };

export type Opportunity = {
  id: string;
  company_id: string;
  kind: 'subcontract' | 'architect_project';
  title: string;
  description: string;
  trade_ids: number[];
  postal_code: string;
  city: string | null;
  starts_on: string | null;
  budget_ex_vat: number | null;
  status: 'open' | 'closed' | 'awarded';
  created_at: string;
  company: { name: string; verification_status: string } | null;
  responses?: { count: number }[];
};

export type Agreement = {
  id: string;
  kind: 'subcontract' | 'referral';
  client_id: string;
  subcontractor_id: string;
  title: string;
  status: 'proposed' | 'awaiting_retention_ack' | 'confirmed' | 'blocked' | 'cancelled';
  blocked_findings: string[];
  retention_social_pct: number;
  retention_tax_pct: number;
  checked_at: string | null;
  created_at: string;
  client: { name: string } | null;
  subcontractor: { name: string } | null;
};

export const OPPORTUNITY_COLUMNS =
  'id, company_id, kind, title, description, trade_ids, postal_code, city, starts_on, budget_ex_vat, status, created_at, company:companies(name, verification_status), responses:opportunity_responses(count)';

export const AGREEMENT_COLUMNS =
  'id, kind, client_id, subcontractor_id, title, status, blocked_findings, retention_social_pct, retention_tax_pct, checked_at, created_at, client:companies!agreements_client_id_fkey(name), subcontractor:companies!agreements_subcontractor_id_fkey(name)';

export async function loadTrades(): Promise<Trade[]> {
  const { data } = await supabase.from('trades').select('id, slug, label_fr, label_nl').order('id');
  return data ?? [];
}

/** "client:kbo_not_active" → { side: 'client', code: 'kbo_not_active' } */
export function splitFinding(finding: string): { side: 'client' | 'subcontractor' | null; code: string } {
  const [side, code] = finding.includes(':') ? finding.split(':', 2) : [null, finding];
  return { side: side === 'client' || side === 'subcontractor' ? side : null, code: code ?? finding };
}
