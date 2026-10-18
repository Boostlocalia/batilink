import { describe, expect, it } from 'vitest';

import { answerToSupplierMail, invitationMail, questionToContractorMail } from './email.ts';
import { parseRelayAddress, relayAddress, senderMatches, stripQuoted } from './relay-address.ts';

const key = '0123456789abcdef0123456789abcdef';

describe('relay addresses', () => {
  it('round-trips both sides', () => {
    expect(relayAddress('supplier', key)).toBe(`s-${key}@reply.batilink.be`);
    expect(parseRelayAddress(['Info <x@y.be>', `S-${key.toUpperCase()}@Reply.BatiLink.be`])).toEqual({ author: 'supplier', replyKey: key });
    expect(parseRelayAddress([relayAddress('contractor', key)])).toEqual({ author: 'contractor', replyKey: key });
  });

  it('ignores other domains and malformed keys', () => {
    expect(parseRelayAddress([`s-${key}@evil.be`])).toBeNull();
    expect(parseRelayAddress(['s-123@reply.batilink.be'])).toBeNull();
  });
});

describe('sender check', () => {
  it('accepts the address or a colleague on the company domain', () => {
    expect(senderMatches('Offres@Negoce.be', 'offres@negoce.be')).toBe(true);
    expect(senderMatches('jean@negoce.be', 'offres@negoce.be')).toBe(true);
  });
  it('requires the exact address on public mailboxes', () => {
    expect(senderMatches('autre@gmail.com', 'negoce@gmail.com')).toBe(false);
    expect(senderMatches('x@autre.be', 'offres@negoce.be')).toBe(false);
    expect(senderMatches('x@negoce.be', null)).toBe(false);
  });
});

describe('quoted history', () => {
  it('keeps only the new text', () => {
    const fr = 'Quelle classe de résistance ?\n\nLe lun. 19 oct. 2026 à 09:12, BatiLink <s-x@reply.batilink.be> a écrit :\n> Bonjour';
    expect(stripQuoted(fr)).toBe('Quelle classe de résistance ?');
    expect(stripQuoted('Welke dikte?\r\n\r\nOp ma 19 okt. 2026 schreef BatiLink:\r\n> Goedendag')).toBe('Welke dikte?');
  });
});

describe('relay e-mails', () => {
  it('invites suppliers to ask by replying', () => {
    const mail = invitationMail({
      lang: 'fr',
      to: 'offres@negoce.be',
      contractor: 'Bati SRL',
      contractorVerified: false,
      title: 'Chape',
      postalCode: '1000',
      city: null,
      items: [],
      neededBy: null,
      replyBy: '2026-10-22',
      delivery: true,
      url: 'https://app/offre/x',
      commissionRate: 0.05,
      replyTo: relayAddress('supplier', key),
    });
    expect(mail.replyTo).toBe(`s-${key}@reply.batilink.be`);
    expect(mail.text).toContain('Répondez simplement à cet e-mail');
  });

  it('relays a question with the reply address of the other side, escaped', () => {
    const mail = questionToContractorMail('nl', 'a@b.be', 'Negoce <SA>', 'Chape', 'Welke klasse?\n\nC25/30?', 'https://app/demande/1', relayAddress('contractor', key));
    expect(mail.subject).toBe('Vraag van Negoce <SA>: Chape');
    expect(mail.html).toContain('Negoce &lt;SA&gt;');
    expect(mail.html).toContain('Welke klasse?');
    expect(mail.replyTo).toBe(`c-${key}@reply.batilink.be`);
  });

  it('relays an answer back to the supplier', () => {
    const mail = answerToSupplierMail('fr', 's@negoce.be', 'Bati SRL', 'Chape', 'C25/30, livraison le matin.', relayAddress('supplier', key));
    expect(mail.subject).toBe('Réponse de Bati SRL : Chape');
    expect(mail.text).toContain('C25/30, livraison le matin.');
  });
});
