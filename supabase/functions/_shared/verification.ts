// Rules that turn register answers into a verification decision. Import-free so
// the app's tests run them; the register clients live in checks.ts.

export type CheckKind = 'vat' | 'kbo' | 'retention';
export type Outcome = 'ok' | 'warning' | 'failed' | 'unavailable';
export type CheckResult = { kind: CheckKind; outcome: Outcome; findings: string[]; evidence: Record<string, unknown> };

export type VerificationStatus = 'verified' | 'needs_review' | 'rejected';

/** BE0123456789 → 0123456789 (the enterprise number is the VAT number's digits). */
export function enterpriseNumber(vat: string): string {
  return vat.replace(/[^0-9]/g, '').padStart(10, '0');
}

/** Belgian check digit: the last two digits are 97 − (first eight mod 97). */
export function isValidEnterpriseNumber(n: string): boolean {
  if (!/^[01][0-9]{9}$/.test(n)) return false;
  return 97 - (Number(n.slice(0, 8)) % 97) === Number(n.slice(8));
}

export type CompanyKind = 'contractor' | 'supplier' | 'architect';

/** NACE-BEL section F (construction): divisions 41, 42 and 43. */
export function hasConstructionActivity(naceCodes: string[]): boolean {
  return naceCodes.some((c) => /^4[123]/.test(c.replace(/\D/g, '')));
}

/** NACE-BEL 71.11: architecture. */
export function hasArchitectureActivity(naceCodes: string[]): boolean {
  return naceCodes.some((c) => c.replace(/\D/g, '').startsWith('7111'));
}

export function kboOutcome(
  row: { status: string; nace_codes: string[] } | null,
  kind: CompanyKind = 'contractor',
): Pick<CheckResult, 'outcome' | 'findings'> {
  if (!row) return { outcome: 'failed', findings: ['kbo_not_found'] };
  if (row.status !== 'AC') return { outcome: 'failed', findings: ['kbo_not_active'] };
  if (kind === 'contractor' && !hasConstructionActivity(row.nace_codes)) {
    return { outcome: 'warning', findings: ['kbo_no_construction_activity'] };
  }
  if (kind === 'architect' && !hasArchitectureActivity(row.nace_codes)) {
    return { outcome: 'warning', findings: ['kbo_no_architecture_activity'] };
  }
  return { outcome: 'ok', findings: [] };
}

/** Which checks a company must pass. 30bis applies to whoever works on a building site. */
export function requiredChecks(kind: CompanyKind): CheckKind[] {
  return kind === 'contractor' ? ['vat', 'kbo', 'retention'] : ['vat', 'kbo'];
}

export type Retention = { socialPct: number; taxPct: number };

export function retentionOutcome(r: Retention): Pick<CheckResult, 'outcome' | 'findings'> {
  const findings = [r.socialPct > 0 ? 'retention_social' : null, r.taxPct > 0 ? 'retention_tax' : null].filter(
    (f): f is string => f !== null,
  );
  return { outcome: findings.length ? 'warning' : 'ok', findings };
}

/**
 * A company is verified only when every register answered and nothing is wrong.
 * A failed check rejects it; anything else (a warning, a register that did not
 * answer) leaves it for a person to review, never silently verified.
 */
export function decide(results: CheckResult[], required: CheckKind[] = ['vat', 'kbo', 'retention']): VerificationStatus {
  if (results.some((r) => r.outcome === 'failed')) return 'rejected';
  const byKind = new Map(results.map((r) => [r.kind, r]));
  if (required.every((k) => byKind.get(k)?.outcome === 'ok')) return 'verified';
  return 'needs_review';
}

export type AgreementDecision =
  | { status: 'blocked'; findings: string[] }
  | { status: 'awaiting_retention_ack'; retention: Retention }
  | { status: 'confirmed'; retention: Retention };

/**
 * Right before an agreement is confirmed. Both companies must pass VAT and KBO;
 * the subcontractor's 30bis answer is required. Debts do not forbid working
 * together, but on a subcontract the client must confirm they will withhold the
 * legal share. On an architect's referral the debts are shown, not acknowledged:
 * the withholding falls on the architect's client, who pays the contractor.
 */
export function decideAgreement(
  client: CheckResult[],
  subcontractor: CheckResult[],
  retention: Retention | null,
  retentionAcknowledged: boolean,
  kind: 'subcontract' | 'referral' = 'subcontract',
): AgreementDecision {
  const blocking = [
    ...client.filter((r) => r.kind !== 'retention' && r.outcome !== 'ok' && r.outcome !== 'warning').flatMap((r) => tag('client', r)),
    ...subcontractor.filter((r) => r.outcome === 'failed' || r.outcome === 'unavailable').flatMap((r) => tag('subcontractor', r)),
  ];
  if (blocking.length || !retention) return { status: 'blocked', findings: blocking.length ? blocking : ['subcontractor:retention_unavailable'] };
  const debts = retention.socialPct > 0 || retention.taxPct > 0;
  if (kind === 'subcontract' && debts && !retentionAcknowledged) return { status: 'awaiting_retention_ack', retention };
  return { status: 'confirmed', retention };
}

function tag(side: 'client' | 'subcontractor', r: CheckResult): string[] {
  const codes = r.findings.length ? r.findings : [`${r.kind}_${r.outcome}`];
  return codes.map((c) => `${side}:${c}`);
}
