import { APP_NAME } from './brand.ts';

// Transactional e-mails, sent through Brevo's HTTP API in the recipient's language.

export type Lang = 'fr' | 'nl';

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Relay address replies should go to, so the platform can pass them on. */
  replyTo?: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'demandes@batilink.be';
  if (!apiKey) {
    // Local development: log instead of sending.
    console.log(`[mail] to=${mail.to} reply-to=${mail.replyTo ?? '-'} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: APP_NAME },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      ...(mail.replyTo ? { replyTo: { email: mail.replyTo, name: APP_NAME } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(paragraphs: string[], cta?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const button = cta
    ? `<p style="margin:22px 0"><a href="${esc(cta.url)}" style="background:#d4ff3a;color:#09090b;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : '';
  const foot = footer ? `<p style="margin:24px 0 0;color:#9b9ba6;font-size:12px">${footer}</p>` : '';
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#f4f4f6;background:#09090b;padding:28px;border-radius:14px;max-width:560px">
<p style="margin:0 0 20px;font-weight:800;font-size:18px;color:#d4ff3a">${APP_NAME}</p>${body}${button}${foot}</div>`;
}

const dateFmt = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'fr' ? 'fr-BE' : 'nl-BE', { day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

export type InvitationData = {
  lang: Lang;
  to: string;
  contractor: string;
  contractorVerified: boolean;
  title: string;
  postalCode: string;
  city: string | null;
  items: { label: string; quantity: number; unit: string }[];
  neededBy: string | null;
  replyBy: string;
  delivery: boolean;
  url: string;
  /** Commission due if the offer is awarded, e.g. 0.05. */
  commissionRate: number;
  /** Supplier's relay address: replying to the e-mail asks the contractor a question. */
  replyTo?: string;
};

const pct = (rate: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-BE' : 'nl-BE', { style: 'percent', maximumFractionDigits: 2 }).format(rate);
const eur = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-BE' : 'nl-BE', { style: 'currency', currency: 'EUR' }).format(n);

const UNITS: Record<Lang, Record<string, string>> = {
  fr: { piece: 'pièce(s)', bag: 'sac(s)', t: 't', kg: 'kg', m: 'm', m2: 'm²', m3: 'm³', l: 'l', pallet: 'palette(s)' },
  nl: { piece: 'stuk(s)', bag: 'zak(ken)', t: 't', kg: 'kg', m: 'm', m2: 'm²', m3: 'm³', l: 'l', pallet: 'pallet(s)' },
};

function itemLines(d: InvitationData): { html: string; text: string } {
  const lines = d.items.map((i) => `${i.quantity} ${UNITS[d.lang][i.unit] ?? i.unit} · ${i.label}`);
  return {
    html: `<ul style="margin:0 0 14px;padding-left:18px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
    text: lines.map((l) => `- ${l}`).join('\n'),
  };
}

export function invitationMail(d: InvitationData, reminder = false): Mail {
  const place = `${d.postalCode}${d.city ? ` ${d.city}` : ''}`;
  const items = itemLines(d);
  if (d.lang === 'nl') {
    const who = `${d.contractor}${d.contractorVerified ? ' (geverifieerd bedrijf)' : ''}`;
    const when = d.neededBy ? `${d.delivery ? 'levering op de werf' : 'afhaling'} op ${dateFmt(d.neededBy, 'nl')}` : d.delivery ? 'levering op de werf' : 'afhaling';
    const intro = `${esc(who)} vraagt u een prijs voor ${d.items.length} product(en) in ${esc(place)}, ${when}. Antwoord gewenst voor ${dateFmt(d.replyBy, 'nl')}.`;
    const subject = `${reminder ? 'Herinnering: ' : ''}Nieuwe prijsaanvraag: ${d.title} (${place})`;
    const ask = 'Een vraag over de aanvraag? Beantwoord gewoon deze e-mail: we sturen uw vraag door naar de aannemer en bezorgen u zijn antwoord.';
    const footer = `Antwoorden is gratis en zonder account. Wordt uw offerte gekozen, dan factureert ${APP_NAME} een commissie van ${pct(d.commissionRate, 'nl')} excl. btw op het bedrag van de offerte. U krijgt deze e-mail omdat uw handel deze categorie en regio bedient op ${APP_NAME}.`;
    return {
      to: d.to,
      subject,
      html: layout(['Goedendag,', intro, items.html], { label: 'Mijn prijs doorgeven', url: d.url }, `${ask}<br><br>${footer}`),
      text: `Goedendag,\n\n${who} vraagt u een prijs voor:\n${items.text}\n\nAntwoorden: ${d.url}\n\n${ask}\n\n${footer}`,
      replyTo: d.replyTo,
    };
  }
  const who = `${d.contractor}${d.contractorVerified ? ' (entreprise vérifiée)' : ''}`;
  const when = d.neededBy ? `${d.delivery ? 'livraison sur chantier' : 'enlèvement'} le ${dateFmt(d.neededBy, 'fr')}` : d.delivery ? 'livraison sur chantier' : 'enlèvement';
  const intro = `${esc(who)} vous demande un prix pour ${d.items.length} produit(s) à ${esc(place)}, ${when}. Réponse souhaitée avant le ${dateFmt(d.replyBy, 'fr')}.`;
  const subject = `${reminder ? 'Rappel : ' : ''}Nouvelle demande de prix : ${d.title} (${place})`;
  const ask = "Une question sur la demande ? Répondez simplement à cet e-mail : nous transmettons votre question à l'entrepreneur et vous renvoyons sa réponse.";
  const footer = `Répondre est gratuit et ne demande pas de compte. Si votre offre est retenue, ${APP_NAME} facture une commission de ${pct(d.commissionRate, 'fr')} HTVA sur le montant de l'offre. Vous recevez cet e-mail parce que votre négoce couvre cette catégorie et cette zone sur ${APP_NAME}.`;
  return {
    to: d.to,
    subject,
    html: layout(['Bonjour,', intro, items.html], { label: 'Remettre mon prix', url: d.url }, `${esc(ask)}<br><br>${footer}`),
    text: `Bonjour,\n\n${who} vous demande un prix pour :\n${items.text}\n\nRépondre : ${d.url}\n\n${ask}\n\n${footer}`,
    replyTo: d.replyTo,
  };
}

export type CommissionLine = { base: number; rate: number; amount: number };

export function awardedMail(
  lang: Lang,
  to: string,
  contractor: string,
  contractorEmail: string | null,
  title: string,
  commission: CommissionLine,
): Mail {
  if (lang === 'nl') {
    const p = [
      `Goed nieuws: ${esc(contractor)} heeft uw offerte voor « ${esc(title)} » gekozen.`,
      `Neem contact op om de levering te regelen${contractorEmail ? `: ${esc(contractorEmail)}` : ''}.`,
      `Commissie ${APP_NAME}: ${pct(commission.rate, 'nl')} van ${eur(commission.base, 'nl')}, of ${eur(commission.amount, 'nl')} excl. btw, gefactureerd aan het einde van de maand.`,
    ];
    return { to, subject: `Uw offerte is gekozen: ${title}`, html: layout(p), text: p.join('\n\n') };
  }
  const p = [
    `Bonne nouvelle : ${esc(contractor)} a retenu votre offre pour « ${esc(title)} ».`,
    `Prenez contact pour organiser la livraison${contractorEmail ? ` : ${esc(contractorEmail)}` : ''}.`,
    `Commission ${APP_NAME} : ${pct(commission.rate, 'fr')} de ${eur(commission.base, 'fr')}, soit ${eur(commission.amount, 'fr')} HTVA, facturée en fin de mois.`,
  ];
  return { to, subject: `Votre offre est retenue : ${title}`, html: layout(p), text: p.join('\n\n') };
}

export function notSelectedMail(lang: Lang, to: string, contractor: string, title: string): Mail {
  if (lang === 'nl') {
    const p = [`${esc(contractor)} heeft voor « ${esc(title)} » een andere offerte gekozen.`, 'Bedankt voor uw antwoord. U ontvangt binnenkort nieuwe aanvragen uit uw regio.'];
    return { to, subject: `Aanvraag afgesloten: ${title}`, html: layout(p), text: p.join('\n\n') };
  }
  const p = [`${esc(contractor)} a retenu une autre offre pour « ${esc(title)} ».`, 'Merci pour votre réponse. Vous recevrez bientôt de nouvelles demandes de votre zone.'];
  return { to, subject: `Demande clôturée : ${title}`, html: layout(p), text: p.join('\n\n') };
}

export function newQuoteMail(lang: Lang, to: string, supplier: string, title: string, url: string): Mail {
  if (lang === 'nl') {
    const p = [`${esc(supplier)} heeft een offerte ingediend voor « ${esc(title)} ».`];
    return { to, subject: `Nieuwe offerte: ${title}`, html: layout(p, { label: 'Offertes vergelijken', url }), text: `${p[0]}\n\n${url}` };
  }
  const p = [`${esc(supplier)} a remis une offre pour « ${esc(title)} ».`];
  return { to, subject: `Nouvelle offre : ${title}`, html: layout(p, { label: 'Comparer les offres', url }), text: `${p[0]}\n\n${url}` };
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => esc(p.trim()).replace(/\n/g, '<br>'))
    .filter(Boolean);

/** A supplier's question (or news), relayed to the contractor. Replying answers the supplier. */
export function questionToContractorMail(
  lang: Lang,
  to: string,
  supplier: string,
  title: string,
  relayed: string,
  url: string,
  replyTo: string,
): Mail {
  if (lang === 'nl') {
    const intro = `${esc(supplier)} heeft een vraag over uw prijsaanvraag « ${esc(title)} »:`;
    const hint = 'Beantwoord gewoon deze e-mail, of antwoord in de app. Wij bezorgen uw antwoord aan de leverancier.';
    return {
      to,
      subject: `Vraag van ${supplier}: ${title}`,
      html: layout([intro, ...paragraphs(relayed), esc(hint)], { label: 'Antwoorden in de app', url }),
      text: `${intro}\n\n${relayed}\n\n${hint}\n${url}`,
      replyTo,
    };
  }
  const intro = `${esc(supplier)} a une question sur votre demande de prix « ${esc(title)} » :`;
  const hint = "Répondez simplement à cet e-mail, ou répondez dans l'application. Nous transmettons votre réponse au fournisseur.";
  return {
    to,
    subject: `Question de ${supplier} : ${title}`,
    html: layout([intro, ...paragraphs(relayed), esc(hint)], { label: "Répondre dans l'application", url }),
    text: `${intro}\n\n${relayed}\n\n${hint}\n${url}`,
    replyTo,
  };
}

/**
 * The contractor's answer, relayed to the supplier. Replying asks a follow-up question.
 * No price link: only its hash is stored, and the invitation's link still works.
 */
export function answerToSupplierMail(lang: Lang, to: string, contractor: string, title: string, relayed: string, replyTo: string): Mail {
  if (lang === 'nl') {
    const intro = `${esc(contractor)} antwoordt op uw vraag over « ${esc(title)} »:`;
    const hint = 'Nog een vraag? Beantwoord deze e-mail. Uw prijs geeft u door via de link in de oorspronkelijke aanvraag.';
    return { to, subject: `Antwoord van ${contractor}: ${title}`, html: layout([intro, ...paragraphs(relayed), esc(hint)]), text: `${intro}\n\n${relayed}\n\n${hint}`, replyTo };
  }
  const intro = `${esc(contractor)} répond à votre question sur « ${esc(title)} » :`;
  const hint = 'Une autre question ? Répondez à cet e-mail. Votre prix se remet par le lien de la demande initiale.';
  return { to, subject: `Réponse de ${contractor} : ${title}`, html: layout([intro, ...paragraphs(relayed), esc(hint)]), text: `${intro}\n\n${relayed}\n\n${hint}`, replyTo };
}
