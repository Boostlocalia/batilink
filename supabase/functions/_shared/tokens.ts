// Supplier reply links carry a random token; only its SHA-256 hash is stored.

const TOKEN_BYTES = 32;
export const TOKEN_TTL_DAYS = 14;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function tokenExpiry(from = new Date()): string {
  return new Date(from.getTime() + TOKEN_TTL_DAYS * 86_400_000).toISOString();
}
