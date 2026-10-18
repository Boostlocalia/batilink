// Reads a Peppol BIS Billing 3.0 (UBL 2.1) invoice and checks it against a
// purchase order. Since 2026 Belgian B2B invoices travel on Peppol in this
// format, so the supplier's own structured invoice is the proof of the sale.
// No XML library: only a handful of well-known elements are needed, read with
// namespace-prefix-agnostic patterns. Free of imports (shared with the tests).

export type UblInvoice = {
  kind: 'invoice' | 'credit_note';
  number: string | null;
  issueDate: string | null;
  orderReference: string | null;
  supplierVat: string | null;
  buyerVat: string | null;
  totalExVat: number | null;
  currency: string | null;
};

const tag = (name: string) => `(?:[A-Za-z0-9_]+:)?${name}`;

/** Content of the first <name> element inside `xml` (attributes allowed). */
function first(xml: string, name: string): string | null {
  const m = new RegExp(`<${tag(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag(name)}>`).exec(xml);
  return m ? m[1] : null;
}

function attr(xml: string, name: string, attribute: string): string | null {
  const m = new RegExp(`<${tag(name)}\\s[^>]*\\b${attribute}="([^"]*)"`).exec(xml);
  return m ? m[1] : null;
}

const text = (s: string | null) =>
  s === null
    ? null
    : s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim() || null;

/** Element content without nested sub-elements of the same parent (first level only). */
function topLevel(xml: string, name: string): string | null {
  // Strip the parties, lines and references, whose own cbc:ID would otherwise match first.
  const stripped = xml.replace(
    new RegExp(`<(${tag('(?:AccountingSupplierParty|AccountingCustomerParty|InvoiceLine|CreditNoteLine|OrderReference|BillingReference|AdditionalDocumentReference|ContractDocumentReference|PayeeParty|Delivery|PaymentMeans|TaxTotal|AllowanceCharge|ProjectReference|InvoicePeriod|DespatchDocumentReference|ReceiptDocumentReference|OriginatorDocumentReference)')})[\\s>][\\s\\S]*?</\\1>`, 'g'),
    '',
  );
  return text(first(stripped, name));
}

/** BE0123456789 from "BE 0123.456.789", "0123456789" (KBO number) or "be0123456789". */
export function normalizeVat(raw: string | null): string | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s.\-]/g, '').toUpperCase();
  if (/^BE[01][0-9]{9}$/.test(compact)) return compact;
  if (/^[01][0-9]{9}$/.test(compact)) return `BE${compact}`;
  return /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(compact) ? compact : null;
}

function partyVat(party: string | null): string | null {
  if (!party) return null;
  // VAT registration first, then legal entity, then the Peppol endpoint (0208 = KBO, 9925 = BE VAT).
  const taxScheme = first(party, 'PartyTaxScheme');
  const fromTax = normalizeVat(text(taxScheme ? first(taxScheme, 'CompanyID') : null));
  if (fromTax) return fromTax;
  const legal = first(party, 'PartyLegalEntity');
  const fromLegal = normalizeVat(text(legal ? first(legal, 'CompanyID') : null));
  if (fromLegal) return fromLegal;
  const scheme = attr(party, 'EndpointID', 'schemeID');
  if (scheme === '0208' || scheme === '9925') return normalizeVat(text(first(party, 'EndpointID')));
  return null;
}

export function parseUbl(xml: string): UblInvoice | null {
  const isCredit = new RegExp(`<${tag('CreditNote')}[\\s>]`).test(xml);
  if (!isCredit && !new RegExp(`<${tag('Invoice')}[\\s>]`).test(xml)) return null;
  const supplier = first(xml, 'AccountingSupplierParty');
  const customer = first(xml, 'AccountingCustomerParty');
  const order = first(xml, 'OrderReference');
  const totals = first(xml, 'LegalMonetaryTotal');
  const total = totals ? text(first(totals, 'TaxExclusiveAmount')) : null;
  const amount = total !== null ? Number(total) : NaN;
  return {
    kind: isCredit ? 'credit_note' : 'invoice',
    number: topLevel(xml, 'ID'),
    issueDate: topLevel(xml, 'IssueDate'),
    orderReference: order ? text(first(order, 'ID')) : null,
    supplierVat: partyVat(supplier),
    buyerVat: partyVat(customer),
    totalExVat: Number.isFinite(amount) ? amount : null,
    currency: topLevel(xml, 'DocumentCurrencyCode'),
  };
}

export type InvoiceCheck = {
  status: 'matched' | 'mismatch' | 'manual_review';
  findings: string[];
};

/**
 * Compares the invoice with the order. A mismatch on who sold to whom rejects
 * it; a missing order number or a large price difference goes to manual review.
 */
export function checkInvoice(
  invoice: UblInvoice,
  order: { number: string; supplierVat: string | null; contractorVat: string | null; totalExVat: number },
): InvoiceCheck {
  const findings: string[] = [];
  let hard = false;
  if (invoice.kind === 'credit_note') {
    findings.push('credit_note');
    hard = true;
  }
  if (!invoice.number) findings.push('no_invoice_number');
  if (invoice.currency && invoice.currency !== 'EUR') {
    findings.push('currency');
    hard = true;
  }
  if (!invoice.supplierVat) findings.push('no_supplier_vat');
  else if (order.supplierVat && invoice.supplierVat !== order.supplierVat) {
    findings.push('supplier_vat_mismatch');
    hard = true;
  }
  if (!invoice.buyerVat) findings.push('no_buyer_vat');
  else if (order.contractorVat && invoice.buyerVat !== order.contractorVat) {
    findings.push('buyer_vat_mismatch');
    hard = true;
  }
  const ref = (invoice.orderReference ?? '').toUpperCase().replace(/\s/g, '');
  if (!ref) findings.push('no_order_reference');
  else if (!ref.includes(order.number.toUpperCase())) findings.push('order_reference_mismatch');
  if (invoice.totalExVat === null) findings.push('no_total');
  else if (order.totalExVat > 0 && Math.abs(invoice.totalExVat - order.totalExVat) / order.totalExVat > 0.2) {
    findings.push('amount_differs');
  }
  if (hard) return { status: 'mismatch', findings };
  return { status: findings.length ? 'manual_review' : 'matched', findings };
}
