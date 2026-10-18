import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { parseCsv, rowsToItems, spreadsheetKind, type Cell, type ImportedItem } from '@/lib/spreadsheet';
import { supabase } from '@/lib/supabase';

const BUCKET = 'company-files';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type CompanyFile = { id: string; name: string; storage_path: string; content_type: string; size_bytes: number; created_at: string };
export const COMPANY_FILE_COLUMNS = 'id, name, storage_path, content_type, size_bytes, created_at';

/** The bucket only takes these types; pickers report CSV and Excel files inconsistently. */
const TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  txt: 'text/plain',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};
const SPREADSHEETS = [TYPES.xlsx, TYPES.xls, TYPES.csv, 'text/comma-separated-values'];

export function contentTypeOf(name: string, picked?: string | null): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return TYPES[ext] ?? (picked && Object.values(TYPES).includes(picked) ? picked : null);
}

type Picked = DocumentPicker.DocumentPickerAsset;

export async function pickFile(spreadsheetsOnly = false): Promise<Picked | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: spreadsheetsOnly ? SPREADSHEETS : Object.values(TYPES),
    copyToCacheDirectory: true,
    multiple: false,
  });
  return picked.canceled ? null : (picked.assets[0] ?? null);
}

async function bytesOf(asset: Picked): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' && asset.file) return asset.file.arrayBuffer();
  return new File(asset.uri).arrayBuffer();
}

async function textOf(asset: Picked): Promise<string> {
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  return new File(asset.uri).text();
}

export type UploadError = 'type' | 'size' | 'error';

/** Stores a picked file in the company's private folder and lists it in its files space. */
export async function uploadCompanyFile(companyId: string, asset: Picked): Promise<{ ok: true; file: CompanyFile } | { ok: false; error: UploadError }> {
  const contentType = contentTypeOf(asset.name, asset.mimeType);
  if (!contentType) return { ok: false, error: 'type' };
  const body = await bytesOf(asset).catch(() => null);
  if (!body) return { ok: false, error: 'error' };
  if (body.byteLength === 0 || body.byteLength > MAX_FILE_BYTES) return { ok: false, error: 'size' };

  const name = asset.name.trim().slice(0, 200) || 'fichier';
  const safe = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  const path = `${companyId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}-${safe}`;

  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (up.error) return { ok: false, error: 'error' };
  const { data, error } = await supabase
    .from('company_files')
    .insert({ company_id: companyId, storage_path: path, name, content_type: contentType, size_bytes: body.byteLength })
    .select(COMPANY_FILE_COLUMNS)
    .single();
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: 'error' };
  }
  return { ok: true, file: data as CompanyFile };
}

export async function listCompanyFiles(): Promise<CompanyFile[] | null> {
  const { data, error } = await supabase.from('company_files').select(COMPANY_FILE_COLUMNS).order('created_at', { ascending: false });
  return error ? null : (data as CompanyFile[]);
}

async function signedUrl(file: CompanyFile, download = false): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 300, download ? { download: file.name } : undefined);
  return data?.signedUrl ?? null;
}

/** Opens the file in the browser (web) or an in-app viewer (phones). */
export async function openCompanyFile(file: CompanyFile): Promise<boolean> {
  const url = await signedUrl(file, Platform.OS === 'web' && SPREADSHEETS.includes(file.content_type));
  if (!url) return false;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else await WebBrowser.openBrowserAsync(url);
  return true;
}

export async function removeCompanyFile(file: CompanyFile): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
  if (error) return false;
  const res = await supabase.from('company_files').delete().eq('id', file.id);
  return !res.error;
}

export type ReadError = 'xls' | 'not_spreadsheet' | 'unreadable' | 'empty';
export type ReadResult = { ok: true; items: ImportedItem[] } | { ok: false; error: ReadError };

async function itemsFrom(kind: ReturnType<typeof spreadsheetKind>, bytes: () => Promise<ArrayBuffer>, text: () => Promise<string>): Promise<ReadResult> {
  if (kind === 'xls') return { ok: false, error: 'xls' };
  if (!kind) return { ok: false, error: 'not_spreadsheet' };
  try {
    let rows: Cell[][];
    if (kind === 'csv') rows = parseCsv(await text());
    else {
      // Loaded on demand: only people importing a spreadsheet need it.
      const { readSheet } = await import('read-excel-file/universal');
      rows = (await readSheet(await bytes())) as Cell[][];
    }
    const items = rowsToItems(rows);
    return items.length ? { ok: true, items } : { ok: false, error: 'empty' };
  } catch {
    return { ok: false, error: 'unreadable' };
  }
}

/** Price request lines from a file just picked. */
export function readPickedItems(asset: Picked): Promise<ReadResult> {
  return itemsFrom(spreadsheetKind(asset.name, asset.mimeType), () => bytesOf(asset), () => textOf(asset));
}

/** Price request lines from a file already in the files space. */
export async function readStoredItems(file: CompanyFile): Promise<ReadResult> {
  const kind = spreadsheetKind(file.name, file.content_type);
  if (kind !== 'xlsx' && kind !== 'csv') return itemsFrom(kind, async () => new ArrayBuffer(0), async () => '');
  const url = await signedUrl(file);
  if (!url) return { ok: false, error: 'unreadable' };
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return { ok: false, error: 'unreadable' };
  return itemsFrom(kind, () => res.arrayBuffer(), () => res.text());
}

export function isSpreadsheet(file: CompanyFile): boolean {
  return spreadsheetKind(file.name, file.content_type) !== null;
}

// Lines handed from the files space to the price request screen.
let pending: ImportedItem[] | null = null;
export function setPendingItems(items: ImportedItem[]): void {
  pending = items;
}
export function takePendingItems(): ImportedItem[] | null {
  const items = pending;
  pending = null;
  return items;
}
