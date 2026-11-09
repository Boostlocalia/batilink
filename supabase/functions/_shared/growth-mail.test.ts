import { describe, expect, it } from 'vitest';

import { activationMail, referralRewardMail, supplierInviteMail, trialEndingMail, welcomeMail } from './growth-mail';

describe('growth e-mails', () => {
  it('welcome each profile in its language with one link', () => {
    for (const kind of ['contractor', 'supplier', 'architect'] as const) {
      const fr = welcomeMail('fr', 'a@b.be', kind, 'https://app/x', 14);
      const nl = welcomeMail('nl', 'a@b.be', kind, 'https://app/x', 14);
      expect(fr.subject).toContain('Bienvenue');
      expect(nl.subject).toContain('Welkom');
      expect(fr.html).toContain('https://app/x');
    }
    expect(welcomeMail('fr', 'a@b.be', 'contractor', 'u', 30).text).toContain('30 jours');
  });

  it('escape names coming from users', () => {
    const mail = supplierInviteMail('fr', 'v@neg.be', '<b>Bati</b>', 'https://app/bienvenue');
    expect(mail.html).not.toContain('<b>Bati</b>');
    expect(mail.html).toContain('&lt;b&gt;Bati&lt;/b&gt;');
  });

  it('count the trial days left', () => {
    expect(trialEndingMail('fr', 'a@b.be', 1, 'u').subject).toContain('1 jour');
    expect(trialEndingMail('nl', 'a@b.be', 3, 'u').subject).toContain('3 dagen');
  });

  it('cover activation and referral rewards', () => {
    expect(activationMail('nl', 'a@b.be', 'supplier', 'u').subject).toContain('wachten');
    expect(referralRewardMail('fr', 'a@b.be', 'Neg SA', { fr: 'un mois', nl: 'een maand' }, 'u').text).toContain('un mois');
  });
});
