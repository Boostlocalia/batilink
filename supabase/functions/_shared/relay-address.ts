// Per-quote relay addresses. A supplier's reply goes to s-<key>@<domain> and the
// contractor's to c-<key>@<domain>, so the platform sees (and relays) every
// exchange and neither side learns the other's address before an award.
// Import-free so the app's tests can run it.

export type Author = 'supplier' | 'contractor';

export const DEFAULT_RELAY_DOMAIN = 'reply.batinode.be';

export function relayAddress(author: Author, replyKey: string, domain = DEFAULT_RELAY_DOMAIN): string {
  return `${author === 'supplier' ? 's' : 'c'}-${replyKey}@${domain}`;
}

/** Finds the relay address among the recipients, if any. */
export function parseRelayAddress(
  addresses: string[],
  domain = DEFAULT_RELAY_DOMAIN,
): { author: Author; replyKey: string } | null {
  const pattern = /^([sc])-([0-9a-f]{32})@(.+)$/;
  for (const raw of addresses) {
    const m = pattern.exec(raw.trim().toLowerCase());
    if (m && m[3] === domain.toLowerCase()) return { author: m[1] === 's' ? 'supplier' : 'contractor', replyKey: m[2] };
  }
  return null;
}

// Shared mailbox providers: there, only the exact address proves who wrote.
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.be', 'outlook.com', 'outlook.be', 'live.com', 'live.be',
  'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'skynet.be', 'telenet.be', 'proximus.be', 'scarlet.be', 'voo.be',
  'gmx.com', 'gmx.net', 'orange.fr', 'free.fr', 'protonmail.com', 'proton.me',
]);

/**
 * Whether an e-mail really comes from the company it claims to. A colleague at the
 * same company domain counts; on a public mailbox domain only the exact address does.
 */
export function senderMatches(from: string, expected: string | null): boolean {
  if (!expected) return false;
  const a = from.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  if (a === b) return true;
  const domainA = a.split('@')[1];
  const domainB = b.split('@')[1];
  return Boolean(domainA) && domainA === domainB && !PUBLIC_DOMAINS.has(domainA);
}

/** Drops the quoted history under a reply ("> …", "Le … a écrit :", "Op … schreef …"). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^(le|on|op|am)\s.+(a écrit|wrote|schreef|schrieb).*:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(original message|message d'origine|oorspronkelijk bericht)/i.test(line.trim())) break;
    out.push(line);
  }
  return out.join('\n').trim();
}
