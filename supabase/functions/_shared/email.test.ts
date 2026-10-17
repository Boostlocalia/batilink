import { describe, expect, it } from 'vitest';

import { invitationMail } from './email.ts';
import { hashToken, newToken } from './tokens.ts';

const base = {
  to: 'offres@exemple.be',
  contractor: 'Bati Services SRL',
  contractorVerified: true,
  title: 'Chape <urgent>',
  postalCode: '1410',
  city: 'Waterloo',
  items: [{ label: 'Ciment CEM II', quantity: 40, unit: 'bag' }],
  neededBy: '2026-10-28',
  replyBy: '2026-10-22',
  delivery: true,
  url: 'https://app.batilink.be/offre/abc',
};

describe('invitationMail', () => {
  it('writes to a French-speaking supplier in French', () => {
    const mail = invitationMail({ ...base, lang: 'fr' });
    expect(mail.subject).toBe('Nouvelle demande de prix : Chape <urgent> (1410 Waterloo)');
    expect(mail.text).toContain('40 sac(s) · Ciment CEM II');
    expect(mail.html).toContain('Remettre mon prix');
  });

  it('writes to a Dutch-speaking supplier in Dutch', () => {
    const mail = invitationMail({ ...base, lang: 'nl' });
    expect(mail.subject).toBe('Nieuwe prijsaanvraag: Chape <urgent> (1410 Waterloo)');
    expect(mail.text).toContain('40 zak(ken) · Ciment CEM II');
    expect(mail.html).toContain('Mijn prijs doorgeven');
  });

  it('marks reminders in the subject', () => {
    expect(invitationMail({ ...base, lang: 'fr' }, true).subject.startsWith('Rappel : ')).toBe(true);
  });

  it('escapes HTML coming from users', () => {
    const mail = invitationMail({ ...base, lang: 'fr', contractor: '<script>x</script>' });
    expect(mail.html).not.toContain('<script>');
  });
});

describe('reply tokens', () => {
  it('are long, unique and stored only as a SHA-256 hash', async () => {
    const a = newToken();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(newToken());
    expect(await hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(a)).toBe(await hashToken(a));
  });
});
