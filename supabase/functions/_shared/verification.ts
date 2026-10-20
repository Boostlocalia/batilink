// Rules that turn register answers into a verification decision. Import-free so
// the app's tests run them; the register clients live in checks.ts.

export type CheckKind = 'vat' | 'kbo';
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
  // The imported extract keeps only the building trades (decided by Henrique, 20/10/2026):
  // a company missing from it goes to a person for review instead of being refused.
  if (!row) return { outcome: 'warning', findings: ['kbo_not_found'] };
  if (row.status !== 'AC') return { outcome: 'failed', findings: ['kbo_not_active'] };
  if (kind === 'contractor' && !hasConstructionActivity(row.nace_codes)) {
    return { outcome: 'warning', findings: ['kbo_no_construction_activity'] };
  }
  if (kind === 'architect' && !hasArchitectureActivity(row.nace_codes)) {
    return { outcome: 'warning', findings: ['kbo_no_architecture_activity'] };
  }
  return { outcome: 'ok', findings: [] };
}

/** Every company must have a valid VAT number and an active enterprise at the BCE/KBO. */
export function requiredChecks(_kind: CompanyKind): CheckKind[] {
  return ['vat', 'kbo'];
}

/**
 * A company is verified only when every register answered and nothing is wrong.
 * A failed check rejects it; anything else (a warning, a register that did not
 * answer) leaves it for a person to review, never silently verified.
 */
export function decide(results: CheckResult[], required: CheckKind[] = ['vat', 'kbo']): VerificationStatus {
  if (results.some((r) => r.outcome === 'failed')) return 'rejected';
  const byKind = new Map(results.map((r) => [r.kind, r]));
  if (required.every((k) => byKind.get(k)?.outcome === 'ok')) return 'verified';
  return 'needs_review';
}

export type AgreementDecision = { status: 'blocked'; findings: string[] } | { status: 'confirmed' };

/**
 * Right before an agreement is confirmed. Both companies must be in good
 * standing: a valid VAT number and an active enterprise at the BCE/KBO, checked
 * now. A register that says no, or does not answer, blocks the agreement.
 */
export function decideAgreement(client: CheckResult[], subcontractor: CheckResult[]): AgreementDecision {
  const blocking = [
    ...client.filter((r) => r.outcome === 'failed' || r.outcome === 'unavailable').flatMap((r) => tag('client', r)),
    ...subcontractor.filter((r) => r.outcome === 'failed' || r.outcome === 'unavailable').flatMap((r) => tag('subcontractor', r)),
  ];
  return blocking.length ? { status: 'blocked', findings: blocking } : { status: 'confirmed' };
}

function tag(side: 'client' | 'subcontractor', r: CheckResult): string[] {
  const codes = r.findings.length ? r.findings : [`${r.kind}_${r.outcome}`];
  return codes.map((c) => `${side}:${c}`);
}
