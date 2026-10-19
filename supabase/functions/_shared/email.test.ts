import { describe, expect, it } from 'vitest';

import { commissionFor, offerTotalExVat } from './commission.ts';
import { awardedMail, invitationMail } from './email.ts';
import { hashToken, newToken } from './tokens.ts';

const base = {
  to: 'offres@exemple.be',
  contractor: 'Bati Services SRL',
  contractorVerified: true,
  contractorVat: 'BE0403170701',
  contractorAddress: 'Rue de la Station 12, 1410 Waterloo',
  title: 'Chape <urgent>',
  postalCode: '1410',
  city: 'Waterloo',
  items: [{ label: 'Ciment CEM II', quantity: 40, unit: 'bag' }],
  neededBy: '2026-10-28',
  replyBy: '2026-10-22',
  delivery: true,
  url: 'https://app.batinode.be/offre/abc',
  commissionRate: null,
};

describe('invitationMail', () => {
  it('writes to a French-speaking supplier in French', () => {
    const mail = invitationMail({ ...base, lang: 'fr' });
    expect(mail.subject).toBe('Demande de prix de Bati Services SRL : Chape <urgent> (1410 Waterloo)');
    expect(mail.text).toContain('40 sac(s) · Ciment CEM II');
    expect(mail.html).toContain('Remettre mon offre');
  });

  it('writes to a Dutch-speaking supplier in Dutch', () => {
    const mail = invitationMail({ ...base, lang: 'nl' });
    expect(mail.subject).toBe('Prijsaanvraag van Bati Services SRL: Chape <urgent> (1410 Waterloo)');
    expect(mail.text).toContain('40 zak(ken) · Ciment CEM II');
    expect(mail.html).toContain('Mijn offerte indienen');
  });

  it('presents the client, the 48-hour deadline and a way to unsubscribe', () => {
    const mail = invitationMail({ ...base, lang: 'fr' });
    expect(mail.text).toContain('Client : Bati Services SRL · TVA BE0403170701 · Rue de la Station 12, 1410 Waterloo');
    expect(mail.text).toContain('48 heures');
    expect(mail.text).toContain('https://app.batinode.be/offre/abc?stop=1');
    expect(mail.text).not.toMatch(/commission/i);
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

describe('commission', () => {
  it('is 5 % of the offer total excluding VAT, delivery included', () => {
    const total = offerTotalExVat([{ quantity: 40, unitPrice: 6.2 }, { quantity: 80, unitPrice: 14.9 }], 65);
    expect(total).toBe(1505);
    expect(commissionFor(total)).toBe(75.25);
  });

  it('gives the invitation a one-click unsubscribe and no wished date', () => {
    const mail = invitationMail({ ...base, lang: 'fr', unsubscribeUrl: 'https://f/supplier-quote?token=t&unsubscribe=1' });
    expect(mail.unsubscribeUrl).toBe('https://f/supplier-quote?token=t&unsubscribe=1');
    expect(mail.text).toContain('plateforme des entrepreneurs du bâtiment');
    expect(mail.html).not.toContain('28 octobre');
  });

  it('honours a negotiated rate', () => {
    expect(commissionFor(2274, 0.03)).toBe(68.22);
  });

  it('is announced in the invitation and detailed in the award e-mail once active', () => {
    expect(invitationMail({ ...base, lang: 'fr', commissionRate: 0.05 }).text).toMatch(/commission de 5\s?%/);
    expect(invitationMail({ ...base, lang: 'nl', commissionRate: 0.05 }).text).toMatch(/commissie van 5\s?%/);
    expect(awardedMail('fr', 'a@b.be', 'Bati', 'Chape', null, { number: 'BL-1', url: 'https://x' }).text).not.toMatch(/commission/i);
    const mail = awardedMail('fr', 'a@b.be', 'Bati', 'Chape', { base: 1505, rate: 0.05, amount: 75.25 }, { number: 'BL-2026-000042', url: 'https://x/bon/t' });
    expect(mail.text).toContain('75,25');
    expect(mail.text).toContain('BL-2026-000042');
    expect(mail.html).toContain('https://x/bon/t');
  });
});
