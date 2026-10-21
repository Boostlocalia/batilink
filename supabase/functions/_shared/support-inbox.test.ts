import { describe, expect, it } from 'vitest';

import { addressesIn, isSupportCopy, pickOpenQuote, quotedReferences } from './support-inbox';

const quotes = [
  { id: 'a', supplierEmail: 'ramillies@walmat.eu', title: 'Produit terrasse', invitedAt: '2026-10-20T08:00:00Z' },
  { id: 'b', supplierEmail: 'ramillies@walmat.eu', title: 'Isolation plancher', invitedAt: '2026-10-21T11:42:00Z' },
  { id: 'c', supplierEmail: 'wavre@walmat.eu', title: 'Toiture', invitedAt: '2026-10-21T12:00:00Z' },
  { id: 'd', supplierEmail: 'negoce@gmail.com', title: 'Dalles', invitedAt: '2026-10-21T12:00:00Z' },
];

describe('support inbox', () => {
  it('recognises the support copy', () => {
    expect(isSupportCopy(['support@reply.batinode.be'], 'reply.batinode.be', 'support@batinode.be')).toBe(true);
    expect(isSupportCopy(['Support@Batinode.be'], 'reply.batinode.be', 'support@batinode.be')).toBe(true);
    expect(isSupportCopy(['autre@batinode.be'], 'reply.batinode.be', 'support@batinode.be')).toBe(false);
  });

  it('takes the latest invitation of a colleague at the same company', () => {
    expect(pickOpenQuote('cbu@walmat.eu', 'Voici l’offre de prix demandée', quotes)?.id).toBe('c');
  });

  it('prefers the request named in the e-mail', () => {
    expect(pickOpenQuote('cbu@walmat.eu', 'TR: Demande de prix : Produit terrasse', quotes)?.id).toBe('a');
  });

  it('finds our links in a forward', () => {
    const token = 'VpCDLlfzvEkOPDFR-ABreAZLC3Qa3Znw3PAAkwjGdeI';
    const text = `De : BatiNode\nRépondre : s-9771BDECB214499F881F0D9044E2095B@reply.batinode.be\n<https://app.batinode.be/offre/${token}>`;
    expect(quotedReferences(text, 'reply.batinode.be')).toEqual({ replyKeys: ['9771bdecb214499f881f0d9044e2095b'], tokens: [token] });
    expect(quotedReferences('rien', 'reply.batinode.be')).toEqual({ replyKeys: [], tokens: [] });
  });

  it('prefers the exact address', () => {
    expect(pickOpenQuote('ramillies@walmat.eu', 'offre', quotes)?.id).toBe('b');
  });

  it('needs the exact address on a public mailbox', () => {
    expect(pickOpenQuote('autre@gmail.com', 'offre', quotes)).toBeNull();
    expect(pickOpenQuote('negoce@gmail.com', 'offre', quotes)?.id).toBe('d');
  });

  it('finds the original sender of a forward', () => {
    const text = 'De : Jean <Jean.Dupont@GobertGroupe.com>\nÀ : support@batinode.be\nCc: s-abc@reply.batinode.be';
    expect(addressesIn(text, ['batinode.be'])).toEqual(['jean.dupont@gobertgroupe.com']);
  });
});
