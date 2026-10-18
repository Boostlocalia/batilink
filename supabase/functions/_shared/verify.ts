// Runs the register checks for one company, records them and updates its status.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { checkKbo, checkRetention, checkVat } from './checks.ts';
import { decide, requiredChecks, type CheckResult, type CompanyKind, type Retention, type VerificationStatus } from './verification.ts';

export type CompanyVerification = {
  companyId: string;
  status: VerificationStatus;
  results: CheckResult[];
  retention: Retention | null;
};

export async function verifyCompany(
  admin: SupabaseClient,
  companyId: string,
  reason: 'signup' | 'periodic' | 'agreement' | 'manual',
  agreementId?: string,
): Promise<CompanyVerification | null> {
  const { data: company } = await admin.from('companies').select('id, kind, vat_number').eq('id', companyId).maybeSingle();
  if (!company) return null;
  const kind = company.kind as CompanyKind;
  const required = requiredChecks(kind);

  let results: CheckResult[];
  let retention: Retention | null = null;
  if (!company.vat_number) {
    results = [{ kind: 'vat', outcome: 'failed', findings: ['vat_missing'], evidence: {} }];
  } else {
    const [vat, kbo, ret] = await Promise.all([
      checkVat(company.vat_number),
      checkKbo(admin, company.vat_number, kind),
      required.includes('retention') ? checkRetention(company.vat_number) : Promise.resolve(null),
    ]);
    results = [vat, kbo];
    if (ret) {
      const { retention: r, ...result } = ret;
      results.push(result);
      retention = r;
    }
  }

  const status = decide(results, required);
  const now = new Date().toISOString();
  await admin.from('company_checks').insert(
    results.map((r) => ({
      company_id: companyId,
      kind: r.kind,
      outcome: r.outcome,
      reason,
      agreement_id: agreementId ?? null,
      findings: r.findings,
      evidence: r.evidence,
    })),
  );
  await admin
    .from('companies')
    .update({
      verification_status: status,
      verified_at: status === 'verified' ? now : null,
      last_checked_at: now,
      ...(retention ? { retention_social_pct: retention.socialPct, retention_tax_pct: retention.taxPct } : {}),
    })
    .eq('id', companyId);
  return { companyId, status, results, retention };
}
