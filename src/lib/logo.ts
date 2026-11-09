import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUCKET = 'logos';
const MAX_BYTES = 5 * 1024 * 1024;
const SIZE = 400;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type LogoError = 'type' | 'size' | 'error';

/** Centre-crops to a square and scales to 400 px, keeping transparency (web only). */
async function squareOnWeb(file: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Lets the company pick a photo or logo, stores it and shows it on its profile. Returns the new URL. */
export async function pickAndUploadLogo(companyId: string): Promise<{ ok: true; url: string } | { ok: false; error: LogoError } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? '';
  if (!TYPES.includes(type)) return { ok: false, error: 'type' };

  let body: Blob | ArrayBuffer | null;
  let contentType = type;
  if (Platform.OS === 'web' && asset.file) {
    if (asset.file.size > MAX_BYTES) return { ok: false, error: 'size' };
    body = await squareOnWeb(asset.file);
    contentType = 'image/png';
  } else {
    body = await new File(asset.uri).arrayBuffer().catch(() => null);
    if (body && body.byteLength > MAX_BYTES) return { ok: false, error: 'size' };
  }
  if (!body) return { ok: false, error: 'error' };

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  // A new name each time, so browsers and mail clients never show a cached old picture.
  const path = `${companyId}/logo-${Date.now().toString(36)}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (up.error) return { ok: false, error: 'error' };
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const previous = await currentPath(companyId);
  const { error } = await supabase.from('companies').update({ logo_url: url }).eq('id', companyId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: 'error' };
  }
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  return { ok: true, url };
}

async function currentPath(companyId: string): Promise<string | null> {
  const { data } = await supabase.from('companies').select('logo_url').eq('id', companyId).single();
  const url: string | null = data?.logo_url ?? null;
  const marker = `/object/public/${BUCKET}/`;
  return url && url.includes(marker) ? url.slice(url.indexOf(marker) + marker.length) : null;
}

export async function removeLogo(companyId: string): Promise<boolean> {
  const previous = await currentPath(companyId);
  const { error } = await supabase.from('companies').update({ logo_url: null }).eq('id', companyId);
  if (error) return false;
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  return true;
}
