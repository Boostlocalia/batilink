import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { functionsUrl, supabase } from '@/lib/supabase';

// Same order rules as the edge functions enforce.
export * from '../../supabase/functions/_shared/orders';

export type DocumentKind = 'deposit_proof' | 'delivery_note' | 'invoice' | 'payment_proof';

export type OrderDocument = {
  id: string;
  kind: DocumentKind;
  file_name: string;
  sha256: string;
  check_status: 'matched' | 'mismatch' | 'manual_review' | null;
  findings: string[];
  invoice_number: string | null;
  created_at: string;
};

export const ORDER_DOCUMENT_COLUMNS = 'id, kind, file_name, sha256, check_status, findings, invoice_number, created_at';

const ACCEPTED = ['application/pdf', 'image/*', 'application/xml', 'text/xml'];

/**
 * Lets the user pick a file (PDF, photo, screenshot or Peppol XML) and sends it to
 * the order. Returns null when the picker was closed.
 */
export async function pickAndUpload(
  orderId: string,
  kind: DocumentKind,
): Promise<{ ok: true; check?: { status: string; findings: string[] } } | { ok: false; error: string } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const form = new FormData();
  form.append('order_id', orderId);
  form.append('kind', kind);
  if (Platform.OS === 'web' && asset.file) form.append('file', asset.file, asset.name);
  // React Native sends local files described by their URI.
  else form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);

  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${functionsUrl}/order-action`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    body: form,
  }).catch(() => null);
  if (!res) return { ok: false, error: 'network' };
  const body = (await res.json().catch(() => ({}))) as { error?: string; check?: { status: string; findings: string[] } };
  return res.ok ? { ok: true, check: body.check } : { ok: false, error: body.error ?? 'error' };
}

/** Opens a Stripe payment page (plans): the same tab on the web, an in-app browser on phones. */
export async function openPaymentPage(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
