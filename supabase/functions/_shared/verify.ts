// Runs the register checks for one company, records them and updates its status.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { checkKbo, checkVat } from './checks.ts';
import { decide, requiredChecks, type CheckResult, type CompanyKind, type VerificationStatus } from './verification.ts';

export type CompanyVerification = {
  companyId: string;
  status: VerificationStatus;
  results: CheckResult[];
};

export async function verifyCompany(
  admin: SupabaseClient,
  companyId: string,
  reason: 'signup' | 'periodic' | 'agreement' | 'manual',
  agreementId?: string,
): Promise<CompanyVerification | null> {
  const { data: company } = await admin.from('companies').select('id, kind, vat_number, verification_status, verified_at').eq('id', companyId).maybeSingle();
  if (!company) return null;
  const kind = company.kind as CompanyKind;
  const required = requiredChecks(kind);

  let results: CheckResult[];
  if (!company.vat_number) {
    results = [{ kind: 'vat', outcome: 'failed', findings: ['vat_missing'], evidence: {} }];
  } else {
    results = await Promise.all([checkVat(company.vat_number), checkKbo(admin, company.vat_number, kind)]);
  }

  const now = new Date().toISOString();
  let status = decide(results, required);
  // A register that does not answer is not a reason to withdraw a verification already
  // granted (by the registers or by the BatiNode team): only a "no" from a register is.
  const keep = status === 'needs_review' && company.verification_status === 'verified' && !results.some((r) => r.outcome === 'failed');
  if (keep) status = 'verified';
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
      verified_at: status === 'verified' ? (keep ? company.verified_at : now) : null,
      last_checked_at: now,
    })
    .eq('id', companyId);
  return { companyId, status, results };
}
