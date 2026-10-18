import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from './orders.ts';
import { appUrl } from './supabase.ts';
import { hashToken, newToken } from './tokens.ts';

export const BUCKET = 'order-documents';
/** Supplier links to an order stay valid long enough to cover delivery and invoicing. */
export const ORDER_LINK_DAYS = 120;

export const contractorOrderUrl = (orderId: string) => `${appUrl()}/commande/${orderId}`;
export const supplierOrderUrl = (token: string) => `${appUrl()}/bon/${token}`;

/** A new link to the order for an e-mail to the supplier. */
export async function issueSupplierLink(admin: SupabaseClient, orderId: string): Promise<string> {
  const token = newToken();
  const { error } = await admin.from('order_links').insert({
    token_hash: await hashToken(token),
    order_id: orderId,
    expires_at: new Date(Date.now() + ORDER_LINK_DAYS * 86_400_000).toISOString(),
  });
  if (error) throw new Error(`order link: ${error.message}`);
  return supplierOrderUrl(token);
}

/** The order a supplier link points to, if the link is valid. */
export async function orderIdFromLink(admin: SupabaseClient, token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || token.length < 20) return null;
  const { data } = await admin.from('order_links').select('order_id, expires_at').eq('token_hash', await hashToken(token)).maybeSingle();
  return data && new Date(data.expires_at) > new Date() ? data.order_id : null;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sniffs the real type from the first bytes: the declared type is not trusted. */
export function sniffType(bytes: Uint8Array): string | null {
  const head = (n: number) => Array.from(bytes.slice(0, n));
  const is = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (is([0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (is([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (is([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (is([0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...head(12).slice(8)) === 'WEBP') return 'image/webp';
  if (/^ftyp(heic|heix|mif1|msf1)/.test(String.fromCharCode(...head(12).slice(4)))) return 'image/heic';
  const start = new TextDecoder().decode(bytes.slice(0, 200)).replace(/^﻿/, '').trimStart();
  if (start.startsWith('<?xml') || start.startsWith('<Invoice') || start.startsWith('<CreditNote') || /^<[A-Za-z]+:(Invoice|CreditNote)/.test(start)) {
    return 'application/xml';
  }
  return null;
}

export type StoredDocument = { id: string; storage_path: string; sha256: string; content_type: string; bytes: Uint8Array<ArrayBuffer> };

/** Validates and stores a file for an order. Returns null when the file is refused. */
export async function storeDocument(
  admin: SupabaseClient,
  input: { orderId: string; kind: 'deposit_proof' | 'delivery_note' | 'invoice' | 'payment_proof'; file: File; userId: string | null; extra?: Record<string, unknown> },
): Promise<{ doc: StoredDocument } | { error: 'too_large' | 'file_type' | 'storage' | 'duplicate' }> {
  if (input.file.size === 0 || input.file.size > MAX_DOCUMENT_BYTES) return { error: 'too_large' };
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) return { error: 'file_type' };
  const hash = await sha256(bytes);
  const path = `${input.orderId}/${crypto.randomUUID()}.${DOCUMENT_TYPES[type]}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (uploadError) {
    console.error('upload', uploadError.message);
    return { error: 'storage' };
  }
  const { data, error } = await admin
    .from('order_documents')
    .insert({
      order_id: input.orderId,
      kind: input.kind,
      uploaded_by: input.userId,
      storage_path: path,
      file_name: input.file.name.slice(0, 200) || `document.${DOCUMENT_TYPES[type]}`,
      content_type: type,
      size_bytes: bytes.length,
      sha256: hash,
      ...input.extra,
    })
    .select('id')
    .single();
  if (error || !data) {
    await admin.storage.from(BUCKET).remove([path]);
    // 23505: the same invoice was already used for an order.
    return { error: error?.code === '23505' ? 'duplicate' : 'storage' };
  }
  return { doc: { id: data.id, storage_path: path, sha256: hash, content_type: type, bytes } };
}

/** A link to read a document, valid five minutes. */
export async function documentLink(admin: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
