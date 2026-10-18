// Clients for the registers behind company verification. Each returns a
// CheckResult and never throws: a register that cannot answer gives
// `unavailable`, which leaves the company for review instead of passing it.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { parseRetention } from './checks-parse.ts';
import {
  enterpriseNumber,
  isValidEnterpriseNumber,
  kboOutcome,
  retentionOutcome,
  type CheckResult,
  type CompanyKind,
  type Retention,
} from './verification.ts';

const TIMEOUT_MS = 15_000;

// VAT number: EU VIES ---------------------------------------------------------

export async function checkVat(vat: string): Promise<CheckResult> {
  const number = enterpriseNumber(vat);
  if (!isValidEnterpriseNumber(number)) {
    return { kind: 'vat', outcome: 'failed', findings: ['vat_bad_check_digits'], evidence: { vat } };
  }
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
      return { kind: 'vat', outcome: 'unavailable', findings: ['vat_register_unavailable'], evidence: { status: res.status, body } };
    }
    return {
      kind: 'vat',
      outcome: valid ? 'ok' : 'failed',
      findings: valid ? [] : ['vat_invalid'],
      evidence: { name: body.name ?? null, address: body.address ?? null, requestDate: body.requestDate ?? null },
    };
  } catch (e) {
    return { kind: 'vat', outcome: 'unavailable', findings: ['vat_register_unavailable'], evidence: { error: String(e) } };
  }
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

// Retention obligation (30bis social + tax debts): ONSS billRetainment ----------
//
// REST service of socialsecurity.be (OAuth2 client credentials with a signed JWT,
// after BatiLink's REST channel is set up in Chaman). One call returns both the
// social (ONSS/INASTI) and the tax (SPF Finances) decisions for a company number.
// Request and response shapes below follow the published v2 service and must be
// validated in the simulation environment before going live; anything not
// understood is reported as `unavailable`, never as "no debts".

type RetentionConfig = { baseUrl: string; tokenUrl: string; clientId: string; privateKeyPem: string; scope: string };

function retentionConfig(): RetentionConfig | null {
  const clientId = Deno.env.get('BILLRETAINMENT_CLIENT_ID');
  const privateKeyPem = Deno.env.get('BILLRETAINMENT_PRIVATE_KEY');
  if (!clientId || !privateKeyPem) return null;
  const sim = Deno.env.get('BILLRETAINMENT_ENV') !== 'production';
  return {
    baseUrl: sim ? 'https://services-sim.socialsecurity.be/REST/billRetainment/v2' : 'https://services.socialsecurity.be/REST/billRetainment/v2',
    tokenUrl: Deno.env.get('BILLRETAINMENT_TOKEN_URL') ??
      (sim ? 'https://services-sim.socialsecurity.be/REST/oauth/v5/token' : 'https://services.socialsecurity.be/REST/oauth/v5/token'),
    clientId,
    privateKeyPem,
    scope: Deno.env.get('BILLRETAINMENT_SCOPE') ?? 'scope:billretainment:retainmentobligations:consult',
  };
}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function signedAssertion(cfg: RetentionConfig): Promise<string> {
  const der = Uint8Array.from(atob(cfg.privateKeyPem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: cfg.clientId, sub: cfg.clientId, aud: cfg.tokenUrl, iat: now, exp: now + 300, jti: crypto.randomUUID() }),
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

async function accessToken(cfg: RetentionConfig): Promise<string> {
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await signedAssertion(cfg),
      scope: cfg.scope,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function checkRetention(vat: string): Promise<CheckResult & { retention: Retention | null }> {
  const cfg = retentionConfig();
  const unavailable = (finding: string, evidence: Record<string, unknown>) => ({
    kind: 'retention' as const,
    outcome: 'unavailable' as const,
    findings: [finding],
    evidence,
    retention: null,
  });
  if (!cfg) return unavailable('retention_not_configured', {});
  const number = enterpriseNumber(vat);
  try {
    const token = await accessToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/retainmentObligations/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ companies: [{ companyID: number }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const entries = (body?.items ?? body?.retainmentObligations ?? body?.companies) as unknown[] | undefined;
    const retention = res.ok && Array.isArray(entries) ? parseRetention(entries[0]) : null;
    if (!retention) return unavailable('retention_unreadable', { status: res.status, body });
    return { kind: 'retention', ...retentionOutcome(retention), evidence: { body }, retention };
  } catch (e) {
    return unavailable('retention_register_unavailable', { error: String(e) });
  }
}
