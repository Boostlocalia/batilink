// Loads the BCE/KBO open data (monthly full extract) into public.kbo_enterprises.
//
// 1. Download the "full" zip from https://kbopub.economie.fgov.be/kbo-open-data
//    (free account) and unzip it into a folder.
// 2. SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-kbo.mjs <folder>
//
// Reads enterprise.csv, denomination.csv and activity.csv. Only the NACE codes the
// verification uses are kept (construction 41–43, architecture 71.11), to keep
// the table small.

import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { createClient } from '@supabase/supabase-js';

const dir = process.argv[2];
if (!dir || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-kbo.mjs <unzipped folder>');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** One CSV line with "quoted" fields (the KBO files have no line breaks inside fields). */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function* rows(file) {
  const lines = createInterface({ input: createReadStream(join(dir, file), 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) header = cells;
    else yield Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  }
}

const digits = (n) => n.replace(/\D/g, '');
const isoDate = (d) => (/^\d{2}-\d{2}-\d{4}$/.test(d) ? `${d.slice(6)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : null);

const enterprises = new Map();
for await (const r of rows('enterprise.csv')) {
  enterprises.set(digits(r.EnterpriseNumber), {
    enterprise_number: digits(r.EnterpriseNumber),
    status: r.Status,
    juridical_form: r.JuridicalForm || null,
    start_date: isoDate(r.StartDate),
    name: null,
    nace_codes: [],
  });
}
console.log(`enterprises: ${enterprises.size}`);

// Prefer the official name (type 001), in French (language 1), then Dutch (2), then any.
for await (const r of rows('denomination.csv')) {
  const e = enterprises.get(digits(r.EntityNumber));
  if (!e || r.TypeOfDenomination !== '001') continue;
  const score = r.Language === '1' ? 2 : r.Language === '2' ? 1 : 0;
  if (!e.name || score > (e._score ?? -1)) Object.assign(e, { name: r.Denomination, _score: score });
}

for await (const r of rows('activity.csv')) {
  const code = digits(r.NaceCode ?? '');
  if (!/^(4[123]|7111)/.test(code)) continue;
  const e = enterprises.get(digits(r.EntityNumber));
  if (e && !e.nace_codes.includes(code)) e.nace_codes.push(code);
}

const imported_at = new Date().toISOString();
let batch = [];
let done = 0;
const flush = async () => {
  if (!batch.length) return;
  const { error } = await db.from('kbo_enterprises').upsert(batch, { onConflict: 'enterprise_number' });
  if (error) throw new Error(error.message);
  done += batch.length;
  batch = [];
  if (done % 100_000 < 5_000) console.log(`upserted ${done}`);
};
for (const e of enterprises.values()) {
  const { _score, ...row } = e;
  void _score;
  batch.push({ ...row, imported_at });
  if (batch.length === 5_000) await flush();
}
await flush();

// Enterprises missing from this month's extract are no longer active.
const { error } = await db.from('kbo_enterprises').update({ status: 'gone' }).lt('imported_at', imported_at);
if (error) throw new Error(error.message);
console.log(`done: ${done}`);
