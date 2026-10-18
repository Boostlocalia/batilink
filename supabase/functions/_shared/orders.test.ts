import { describe, expect, it } from 'vitest';

import { canDo, normalizeIban, orderAmounts, statusAfterConfirm } from './orders';
import { checkInvoice, normalizeVat, parseUbl } from './ubl';

describe('order amounts', () => {
  it('adds 21 % VAT', () => {
    expect(orderAmounts(1000)).toEqual({ exVat: 1000, vat: 210, incVat: 1210 });
  });

  it('bills the commission with VAT', () => {
    expect(orderAmounts(75.25)).toEqual({ exVat: 75.25, vat: 15.8, incVat: 91.05 });
  });
});

describe('order steps', () => {
  it('holds the order until the deposit is received', () => {
    expect(statusAfterConfirm(300)).toBe('awaiting_deposit');
    expect(statusAfterConfirm(0)).toBe('in_progress');
  });

  it('allows each step only at the right moment', () => {
    expect(canDo('supplier_confirm', 'awaiting_supplier')).toBe(true);
    expect(canDo('supplier_confirm', 'in_progress')).toBe(false);
    expect(canDo('deposit_proof', 'awaiting_deposit')).toBe(true);
    expect(canDo('deposit_received', 'deposit_proof_sent')).toBe(true);
    expect(canDo('delivered', 'awaiting_deposit')).toBe(false);
    expect(canDo('contractor_cancel', 'in_progress')).toBe(false);
    expect(canDo('payment_proof', 'delivered')).toBe(true);
    expect(canDo('payment_proof', 'awaiting_supplier')).toBe(false);
  });
});

describe('IBAN', () => {
  it('accepts a valid Belgian IBAN in any spacing', () => {
    expect(normalizeIban('be68 5390 0754 7034')).toBe('BE68539007547034');
  });

  it('rejects a wrong check digit or length', () => {
    expect(normalizeIban('BE68539007547035')).toBeNull();
    expect(normalizeIban('BE6853900754703')).toBeNull();
  });
});

const ubl = (opts: { ref?: string; supplier?: string; buyer?: string; total?: string; root?: string } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<${opts.root ?? 'Invoice'} xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ID>F2026-0412</cbc:ID>
  <cbc:IssueDate>2026-10-20</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  ${opts.ref === undefined ? '<cac:OrderReference><cbc:ID>BL-2026-000042</cbc:ID></cac:OrderReference>' : opts.ref}
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0208">0123456749</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID>SUP-1</cbc:ID></cac:PartyIdentification>
    <cac:PartyTaxScheme><cbc:CompanyID>${opts.supplier ?? 'BE0123456749'}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0208">0987654321</cbc:EndpointID>
    <cac:PartyTaxScheme><cbc:CompanyID>${opts.buyer ?? 'BE 0987.654.321'}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">1000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${opts.total ?? '1040.00'}</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">1258.40</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID></cac:InvoiceLine>
</${opts.root ?? 'Invoice'}>`;

const order = { number: 'BL-2026-000042', supplierVat: 'BE0123456749', contractorVat: 'BE0987654321', totalExVat: 1000 };

describe('Peppol invoice', () => {
  it('reads the fields that prove the sale', () => {
    expect(parseUbl(ubl())).toEqual({
      kind: 'invoice',
      number: 'F2026-0412',
      issueDate: '2026-10-20',
      orderReference: 'BL-2026-000042',
      supplierVat: 'BE0123456749',
      buyerVat: 'BE0987654321',
      totalExVat: 1040,
      currency: 'EUR',
    });
  });

  it('matches an invoice that names the order, the supplier and the contractor', () => {
    expect(checkInvoice(parseUbl(ubl())!, order)).toEqual({ status: 'matched', findings: [] });
  });

  it('rejects an invoice from another seller or to another buyer', () => {
    expect(checkInvoice(parseUbl(ubl({ supplier: 'BE0111111111' }))!, order).status).toBe('mismatch');
    expect(checkInvoice(parseUbl(ubl({ buyer: 'BE0222222222' }))!, order).status).toBe('mismatch');
  });

  it('sends an invoice without the order number to manual review', () => {
    const check = checkInvoice(parseUbl(ubl({ ref: '' }))!, order);
    expect(check).toEqual({ status: 'manual_review', findings: ['no_order_reference'] });
  });

  it('flags a large difference with the offer', () => {
    expect(checkInvoice(parseUbl(ubl({ total: '400.00' }))!, order).findings).toContain('amount_differs');
  });

  it('does not accept a credit note as proof', () => {
    expect(checkInvoice(parseUbl(ubl({ root: 'CreditNote' }))!, order).status).toBe('mismatch');
  });

  it('ignores files that are not UBL', () => {
    expect(parseUbl('<html><body>facture</body></html>')).toBeNull();
  });

  it('normalises Belgian numbers', () => {
    expect(normalizeVat('0123.456.749')).toBe('BE0123456749');
    expect(normalizeVat('be 0123 456 749')).toBe('BE0123456749');
  });
});
