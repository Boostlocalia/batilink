// Clients for the registers behind company verification. Each returns a
// CheckResult and never throws: a register that cannot answer gives
// `unavailable`, which leaves the company for review instead of passing it.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  enterpriseNumber,
  isValidEnterpriseNumber,
  kboOutcome,
  type CheckResult,
  type CompanyKind,
} from './verification.ts';

const TIMEOUT_MS = 15_000;

// VAT number: EU VIES ---------------------------------------------------------

export async function checkVat(vat: string): Promise<CheckResult> {
  const number = enterpriseNumber(vat);
  if (!isValidEnterpriseNumber(number)) {
    return { kind: 'vat', outcome: 'failed', findings: ['vat_bad_check_digits'], evidence: { vat } };
  }
  // VIES often answers "busy" for a moment (MS_MAX_CONCURRENT_REQ): ask again before giving up.
  let last: CheckResult | null = null;
  for (const wait of [0, 2_000, 5_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ countryCode: 'BE', vatNumber: number }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const valid = body.valid ?? body.isValid;
      if (!res.ok || typeof valid !== 'boolean') {
        last = { kind: 'vat', outcome: 'unavailable', findings: ['vat_register_unavailable'], evidence: { status: res.status, body } };
        continue;
      }
      return {
        kind: 'vat',
        outcome: valid ? 'ok' : 'failed',
        findings: valid ? [] : ['vat_invalid'],
        evidence: { name: body.name ?? null, address: body.address ?? null, requestDate: body.requestDate ?? null },
      };
    } catch (e) {
      last = { kind: 'vat', outcome: 'unavailable', findings: ['vat_register_unavailable'], evidence: { error: String(e) } };
    }
  }
  return last!;
}

// Enterprise: BCE/KBO open data, imported monthly into kbo_enterprises ----------

export async function checkKbo(admin: SupabaseClient, vat: string, kind: CompanyKind): Promise<CheckResult> {
  const number = enterpriseNumber(vat);
  const { data, error } = await admin
    .from('kbo_enterprises')
    .select('status, juridical_form, start_date, name, nace_codes, imported_at')
    .eq('enterprise_number', number)
    .maybeSingle();
  if (error) return { kind: 'kbo', outcome: 'unavailable', findings: ['kbo_unavailable'], evidence: { error: error.message } };
  // An empty table means the import has not run yet: that is not the company's fault.
  if (!data) {
    const { count } = await admin.from('kbo_enterprises').select('enterprise_number', { count: 'exact', head: true });
    if (!count) return { kind: 'kbo', outcome: 'unavailable', findings: ['kbo_not_imported'], evidence: {} };
  }
  return { kind: 'kbo', ...kboOutcome(data, kind), evidence: data ?? { enterprise_number: number } };
}
