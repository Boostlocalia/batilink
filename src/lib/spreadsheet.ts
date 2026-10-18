/** Units a price request line can use. */
export const UNITS = ['piece', 'bag', 't', 'kg', 'm', 'm2', 'm3', 'l', 'pallet'] as const;
export type Unit = (typeof UNITS)[number];

export type Cell = string | number | boolean | Date | null | undefined;
export type ImportedItem = { label: string; quantity: string; unit: Unit };

/** Lines read from one file; more is almost always a whole catalogue, not a request. */
export const MAX_IMPORTED_ITEMS = 100;

export type SpreadsheetKind = 'xlsx' | 'csv' | 'xls' | null;

export function spreadsheetKind(name: string, mimeType?: string | null): SpreadsheetKind {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (ext === 'csv' || mimeType === 'text/csv' || mimeType === 'text/comma-separated-values') return 'csv';
  // The old Excel format cannot be read here; the app asks to save it as .xlsx.
  if (ext === 'xls' || mimeType === 'application/vnd.ms-excel') return 'xls';
  return null;
}

/** CSV as saved by Excel in Belgium (";") or elsewhere (","), with quoted fields. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = count(firstLine, ';') >= count(firstLine, ',') && firstLine.includes(';') ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

const HEADERS = {
  label: ['désignation', 'designation', 'description', 'article', 'produit', 'libellé', 'libelle', 'matériau', 'materiau', 'omschrijving', 'artikel', 'product', 'benaming', 'materiaal', 'item', 'label'],
  quantity: ['quantité', 'quantite', 'qté', 'qte', 'qty', 'quantity', 'nombre', 'aantal', 'hoeveelheid', 'hoev'],
  unit: ['unité', 'unite', 'unit', 'u.', 'eenheid', 'eenh'],
} as const;

const UNIT_WORDS: Record<string, Unit> = {
  piece: 'piece', pièce: 'piece', pièces: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', p: 'piece', u: 'piece', st: 'piece', stuk: 'piece', stuks: 'piece', unité: 'piece', unite: 'piece', ff: 'piece',
  sac: 'bag', sacs: 'bag', zak: 'bag', zakken: 'bag', bag: 'bag',
  t: 't', tonne: 't', tonnes: 't', ton: 't',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  m: 'm', ml: 'm', mct: 'm', mètre: 'm', metre: 'm', mètres: 'm', meter: 'm', lm: 'm',
  m2: 'm2', 'm²': 'm2', mc: 'm2',
  m3: 'm3', 'm³': 'm3',
  l: 'l', litre: 'l', litres: 'l', liter: 'l',
  palette: 'pallet', palettes: 'pallet', pallet: 'pallet', pal: 'pallet',
};

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function headerIndex(row: string[], words: readonly string[]): number {
  return row.findIndex((c) => {
    const v = normalise(c);
    return v !== '' && words.some((w) => v === w || v.startsWith(`${w} `) || v.startsWith(`${w}(`) || v.startsWith(`${w}.`));
  });
}

export function toUnit(raw: string): Unit {
  const v = normalise(raw).replace(/\.$/, '');
  return UNIT_WORDS[v] ?? 'piece';
}

/** "1.250,5" (Belgian), "1250.5" or 12 → "1250.5"; anything else → "". */
export function toQuantity(cell: Cell): string {
  if (typeof cell === 'number') return Number.isFinite(cell) && cell > 0 ? String(Math.round(cell * 1000) / 1000) : '';
  const v = text(cell).replace(/\s/g, '');
  if (!v) return '';
  const normalised = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  const n = Number(normalised);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000) / 1000) : '';
}

/**
 * Turns the rows of a bill of quantities into price request lines. A header row
 * (Désignation / Quantité / Unité, or Omschrijving / Aantal / Eenheid) is looked
 * for in the first rows; without one, the columns are label, quantity, unit.
 */
export function rowsToItems(rows: Cell[][]): ImportedItem[] {
  const table = rows.map((r) => r.map(text));
  let start = 0;
  let col = { label: 0, quantity: 1, unit: 2 };
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const label = headerIndex(table[i], HEADERS.label);
    const quantity = headerIndex(table[i], HEADERS.quantity);
    if (label >= 0 && quantity >= 0) {
      col = { label, quantity, unit: headerIndex(table[i], HEADERS.unit) };
      start = i + 1;
      break;
    }
  }
  const items: ImportedItem[] = [];
  for (let i = start; i < rows.length && items.length < MAX_IMPORTED_ITEMS; i++) {
    const label = table[i][col.label] ?? '';
    const quantity = toQuantity(rows[i][col.quantity]);
    // Section titles and totals have no quantity; blank lines have no label.
    if (!label || !quantity) continue;
    items.push({ label: label.slice(0, 200), quantity, unit: col.unit >= 0 ? toUnit(table[i][col.unit] ?? '') : 'piece' });
  }
  return items;
}
