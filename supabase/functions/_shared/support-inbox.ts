// Suppliers who forward our request, or write to support@ instead of replying:
// support@ keeps a copy going to the reply domain, and a PDF from a supplier with
// an open request is put on that offer. Import-free so the app's tests can run it.

import { senderMatches } from './relay-address.ts';

export type OpenQuote = { id: string; supplierEmail: string | null; title: string; invitedAt: string };

/** Whether this e-mail reached the shared support copy rather than a relay address. */
export function isSupportCopy(recipients: string[], domain: string, support: string): boolean {
  return recipients.some((raw) => {
    const a = raw.trim().toLowerCase();
    return a === support.toLowerCase() || a === `support@${domain.toLowerCase()}`;
  });
}

/** Links and relay addresses of our own e-mail, still in the text of a forward. */
export function quotedReferences(text: string, domain: string): { replyKeys: string[]; tokens: string[] } {
  const escaped = domain.toLowerCase().replace(/[.]/g, '\\.');
  const replyKeys = [...text.toLowerCase().matchAll(new RegExp(`\\bs-([0-9a-f]{32})@${escaped}`, 'g'))].map((m) => m[1]);
  const tokens = [...text.matchAll(/\/offre\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/g)].map((m) => m[1]);
  return { replyKeys: [...new Set(replyKeys)], tokens: [...new Set(tokens)] };
}

/**
 * The offer an e-mail is about: the sender's own address before a colleague's, then a
 * request whose title appears in the e-mail, then the latest invitation.
 */
export function pickOpenQuote(from: string, text: string, quotes: OpenQuote[]): OpenQuote | null {
  const exact = quotes.filter((q) => q.supplierEmail?.trim().toLowerCase() === from.trim().toLowerCase());
  const pool = exact.length ? exact : quotes.filter((q) => senderMatches(from, q.supplierEmail));
  if (!pool.length) return null;
  const haystack = text.toLowerCase();
  const named = pool.filter((q) => q.title.trim().length >= 4 && haystack.includes(q.title.trim().toLowerCase()));
  const latest = (list: OpenQuote[]) => [...list].sort((a, b) => b.invitedAt.localeCompare(a.invitedAt))[0];
  return latest(named.length ? named : pool);
}
