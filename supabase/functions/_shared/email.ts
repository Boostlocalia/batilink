import { APP_NAME, EMAIL_LOGO_LIGHT_URL, EMAIL_LOGO_URL } from './brand.ts';

// Transactional e-mails, sent through Brevo's HTTP API in the recipient's language.

export type Lang = 'fr' | 'nl';

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Relay address replies should go to, so the platform can pass them on. */
  replyTo?: string;
  /** Sender name shown to the recipient; BatiNode when not set. */
  fromName?: string;
  /** One-click unsubscribe endpoint (List-Unsubscribe), for mails the recipient did not sign up for. */
  unsubscribeUrl?: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'support@batinode.be';
  if (!apiKey) {
    // Local development: log instead of sending.
    console.log(`[mail] to=${mail.to} reply-to=${mail.replyTo ?? '-'} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: mail.fromName ?? APP_NAME },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      ...(mail.replyTo ? { replyTo: { email: mail.replyTo, name: mail.fromName ?? APP_NAME } } : {}),
      ...(mail.unsubscribeUrl
        ? { headers: { 'List-Unsubscribe': `<${mail.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
        : {}),
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
<p style="margin:0 0 20px"><img src="${EMAIL_LOGO_URL}" width="200" height="47" alt="${APP_NAME}" style="display:block;border:0;width:200px;height:47px;color:#d4ff3a;font-weight:800;font-size:18px"></p>${body}${button}${foot}</div>`;
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
  /** The client's company details, so the supplier recognises a real customer. */
  contractorVat: string | null;
  contractorAddress: string | null;
  /** The person who signs the request, from the company profile. */
  contactName?: string | null;
  /** The contractor's note on the request, if any. */
  note?: string | null;
  title: string;
  postalCode: string;
  city: string | null;
  items: { label: string; quantity: number; unit: string }[];
  neededBy: string | null;
  replyBy: string;
  delivery: boolean;
  url: string;
  /** Commission due if the offer is awarded, e.g. 0.05; null while suppliers answer for free. */
  commissionRate: number | null;
  /** Supplier's relay address: replying to the e-mail asks the contractor a question. */
  replyTo?: string;
  /** One-click unsubscribe endpoint, shown to mail clients in the List-Unsubscribe header. */
  unsubscribeUrl?: string;
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

/** Hours a supplier has to answer a price request, from the moment it is sent. */
export const REPLY_HOURS = 48;

/** "Rue X 1, 1000 Bruxelles" from a company's address fields, or null. */
export function contractorAddress(c: { street: string | null; postal_code: string | null; city: string | null } | null | undefined): string | null {
  if (!c) return null;
  const town = [c.postal_code, c.city].filter(Boolean).join(' ');
  return [c.street, town].filter(Boolean).join(', ') || null;
}

/** A plain, white e-mail as a person writes it: no logo, no button. */
function plainLayout(paragraphs: string[], footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${body}<p style="margin:28px 0 0;color:#888;font-size:12px">${footer}</p></div>`;
}

/**
 * The price request a supplier receives. It reads like the contractor's own e-mail
 * to their merchant, sent in their name "via BatiNode": suppliers took the branded
 * version for advertising. Replying with a price or a PDF is enough.
 */
export function invitationMail(d: InvitationData, reminder = false): Mail {
  const place = `${d.postalCode}${d.city ? ` ${d.city}` : ''}`;
  const items = itemLines(d);
  const stopUrl = `${d.url}?stop=1`;
  const fromName = `${d.contractor} (via ${APP_NAME})`;
  const town = d.city ?? d.postalCode;
  const nl = d.lang === 'nl';
  const subject = nl
    ? `${reminder ? 'Herinnering: ' : ''}Prijsaanvraag – ${d.title} – ${town}`
    : `${reminder ? 'Rappel : ' : ''}Demande de prix – ${d.title} – ${town}`;
  const signature = [
    d.contactName,
    d.contractor,
    d.contractorVat ? `${nl ? 'btw' : 'TVA'} ${d.contractorVat}` : null,
    d.contractorAddress,
  ].filter(Boolean) as string[];
  const lines = nl
    ? {
        hello: 'Goedendag,',
        reminder: 'Kleine herinnering voor mijn aanvraag hieronder.',
        ask: 'Kunt u mij uw beste prijs geven voor:',
        site: `Werf in ${place}, ${d.delivery ? 'levering op de werf' : 'afhaling'}.`,
        note: d.note ? `Opmerking: ${d.note}` : null,
        when: `Een antwoord tegen ${dateFmt(d.replyBy, 'nl')} zou mij goed uitkomen.`,
        reply: 'U kunt gewoon op deze e-mail antwoorden met uw prijs of uw offerte in pdf.',
        thanks: 'Alvast bedankt,',
        tagline: `${APP_NAME}, de oplossing voor bouwondernemers`,
        footer: `Aanvraag verstuurd via ${APP_NAME} namens ${esc(d.contractor)}. Liever online invullen? <a href="${esc(d.url)}" style="color:#888">Offerte invullen</a>. ${
          d.commissionRate ? `Wordt uw offerte gekozen, dan factureert ${APP_NAME} een commissie van ${pct(d.commissionRate, 'nl')} excl. btw. ` : ''
        }Geen aanvragen meer ontvangen via ${APP_NAME}? <a href="${esc(stopUrl)}" style="color:#888">Afmelden</a>.`,
        footerText: `Aanvraag verstuurd via ${APP_NAME} namens ${d.contractor}.\nOnline invullen: ${d.url}\n${
          d.commissionRate ? `Wordt uw offerte gekozen, dan factureert ${APP_NAME} een commissie van ${pct(d.commissionRate, 'nl')} excl. btw.\n` : ''
        }Afmelden: ${stopUrl}`,
      }
    : {
        hello: 'Bonjour,',
        reminder: 'Petit rappel pour ma demande ci-dessous.',
        ask: 'Pourriez-vous me faire votre meilleur prix pour :',
        site: `Chantier à ${place}, ${d.delivery ? 'livraison sur chantier' : 'enlèvement'}.`,
        note: d.note ? `Remarque : ${d.note}` : null,
        when: `Une réponse pour le ${dateFmt(d.replyBy, 'fr')} m'arrangerait.`,
        reply: 'Vous pouvez simplement répondre à cet e-mail avec votre prix ou votre offre en PDF.',
        thanks: "Merci d'avance,",
        tagline: `${APP_NAME}, la solution des entrepreneurs du bâtiment`,
        footer: `Demande envoyée via ${APP_NAME} pour le compte de ${esc(d.contractor)}. Vous préférez remplir l'offre en ligne ? <a href="${esc(d.url)}" style="color:#888">Remplir l'offre</a>. ${
          d.commissionRate ? `Si votre offre est retenue, ${APP_NAME} facture une commission de ${pct(d.commissionRate, 'fr')} HTVA. ` : ''
        }Ne plus recevoir de demandes via ${APP_NAME} : <a href="${esc(stopUrl)}" style="color:#888">se désinscrire</a>.`,
        footerText: `Demande envoyée via ${APP_NAME} pour le compte de ${d.contractor}.\nRemplir l'offre en ligne : ${d.url}\n${
          d.commissionRate ? `Si votre offre est retenue, ${APP_NAME} facture une commission de ${pct(d.commissionRate, 'fr')} HTVA.\n` : ''
        }Se désinscrire : ${stopUrl}`,
      };
  const html = plainLayout(
    [
      lines.hello,
      ...(reminder ? [lines.reminder] : []),
      lines.ask,
      items.html,
      esc(lines.site),
      ...(lines.note ? [esc(lines.note)] : []),
      esc(lines.when),
      esc(lines.reply),
      `${esc(lines.thanks)}<br>${signature.map(esc).join('<br>')}`,
      `<img src="${EMAIL_LOGO_LIGHT_URL}" width="100" height="24" alt="${APP_NAME}" style="display:block;border:0;width:100px;height:24px;margin-top:8px"><span style="color:#888;font-size:12px">${esc(lines.tagline)}</span>`,
    ],
    lines.footer,
  );
  const text = [
    lines.hello,
    ...(reminder ? [lines.reminder] : []),
    `${lines.ask}\n${items.text}`,
    lines.site,
    ...(lines.note ? [lines.note] : []),
    lines.when,
    lines.reply,
    `${lines.thanks}\n${signature.join('\n')}`,
    lines.tagline,
    `--\n${lines.footerText}`,
  ].join('\n\n');
  return { to: d.to, subject, html, text, fromName, replyTo: d.replyTo, unsubscribeUrl: d.unsubscribeUrl };
}

export function awardedMail(
  lang: Lang,
  to: string,
  contractor: string,
  title: string,
  commission: CommissionLine | null,
  order: { number: string; url: string },
): Mail {
  if (lang === 'nl') {
    const p = [
      `Goed nieuws: ${esc(contractor)} heeft uw offerte voor « ${esc(title)} » gekozen. Bestelbon: <b>${esc(order.number)}</b>.`,
      'Bevestig de bestelling via de knop hieronder. U kunt er een voorschot vragen: de aannemer betaalt u rechtstreeks en stuurt het betalingsbewijs voordat u de bestelling start.',
      `Vermeld het nummer ${esc(order.number)} als bestelreferentie op uw (Peppol-)factuur.`,
      commission
        ? `Commissie ${APP_NAME}: ${pct(commission.rate, 'nl')} van het gefactureerde bedrag excl. btw (offerte: ${eur(commission.base, 'nl')}, of ${eur(commission.amount, 'nl')}), gefactureerd aan het einde van de maand.`
        : null,
    ].filter((l): l is string => l !== null);
    return {
      to,
      subject: `Uw offerte is gekozen: ${title} (${order.number})`,
      html: layout(p, { label: 'Bestelling bevestigen', url: order.url }),
      text: `${p.join('\n\n').replace(/<\/?b>/g, '')}\n\n${order.url}`,
    };
  }
  const p = [
    `Bonne nouvelle : ${esc(contractor)} a retenu votre offre pour « ${esc(title)} ». Bon de commande : <b>${esc(order.number)}</b>.`,
    "Confirmez la commande avec le bouton ci-dessous. Vous pouvez y demander un acompte : l'entrepreneur vous le paie directement et envoie la preuve de paiement avant que vous lanciez la commande.",
    `Indiquez le numéro ${esc(order.number)} comme référence de commande sur votre facture (Peppol).`,
    commission
      ? `Commission ${APP_NAME} : ${pct(commission.rate, 'fr')} du montant facturé HTVA (offre : ${eur(commission.base, 'fr')}, soit ${eur(commission.amount, 'fr')}), facturée en fin de mois.`
      : null,
  ].filter((l): l is string => l !== null);
  return {
    to,
    subject: `Votre offre est retenue : ${title} (${order.number})`,
    html: layout(p, { label: 'Confirmer la commande', url: order.url }),
    text: `${p.join('\n\n').replace(/<\/?b>/g, '')}\n\n${order.url}`,
  };
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

// Orders -----------------------------------------------------------------------

export type Localized = { subject: string; paragraphs: string[]; cta?: { label: string; url: string } };

/** A short bilingual notice; paragraphs are plain text (escaped here). */
export function notice(lang: Lang, to: string, content: Record<Lang, Localized>): Mail {
  const c = content[lang];
  const html = layout(c.paragraphs.map(esc), c.cta);
  const text = [...c.paragraphs, ...(c.cta ? [c.cta.url] : [])].join('\n\n');
  return { to, subject: c.subject, html, text };
}

export type OrderMailData = {
  lang: Lang;
  to: string;
  number: string;
  title: string;
  /** Name of the other party. */
  other: string;
  url: string;
};

/** To the contractor: the supplier confirmed, with or without a deposit to pay first. */
export function orderConfirmedMail(d: OrderMailData, deposit: { amount: number; iban: string | null } | null): Mail {
  const fr: Localized = deposit
    ? {
        subject: `Acompte demandé : ${d.title} (${d.number})`,
        paragraphs: [
          `${d.other} a confirmé la commande ${d.number} et demande un acompte de ${eur(deposit.amount, 'fr')} avant de la lancer.`,
          deposit.iban
            ? `Payez-le directement au fournisseur, par virement au compte ${deposit.iban} avec la communication ${d.number}, puis déposez la preuve du virement (capture d'écran ou PDF) dans l'application. Nous la transmettons au fournisseur.`
            : "Payez-le directement au fournisseur, puis déposez la preuve du virement (capture d'écran ou PDF) dans l'application. Nous la transmettons au fournisseur.",
        ],
        cta: { label: 'Envoyer la preuve', url: d.url },
      }
    : {
        subject: `Commande confirmée : ${d.title} (${d.number})`,
        paragraphs: [`${d.other} a confirmé la commande ${d.number} et la prépare.`],
        cta: { label: 'Suivre la commande', url: d.url },
      };
  const nl: Localized = deposit
    ? {
        subject: `Voorschot gevraagd: ${d.title} (${d.number})`,
        paragraphs: [
          `${d.other} heeft bestelling ${d.number} bevestigd en vraagt een voorschot van ${eur(deposit.amount, 'nl')} voordat ze start.`,
          deposit.iban
            ? `Betaal het rechtstreeks aan de leverancier, via overschrijving naar ${deposit.iban} met mededeling ${d.number}, en laad daarna het betalingsbewijs op in de app (schermafbeelding of pdf). Wij bezorgen het aan de leverancier.`
            : 'Betaal het rechtstreeks aan de leverancier en laad daarna het betalingsbewijs op in de app (schermafbeelding of pdf). Wij bezorgen het aan de leverancier.',
        ],
        cta: { label: 'Bewijs opladen', url: d.url },
      }
    : {
        subject: `Bestelling bevestigd: ${d.title} (${d.number})`,
        paragraphs: [`${d.other} heeft bestelling ${d.number} bevestigd en bereidt ze voor.`],
        cta: { label: 'Bestelling volgen', url: d.url },
      };
  return notice(d.lang, d.to, { fr, nl });
}

/** To the supplier: the contractor sent proof of the deposit. */
export function depositProofMail(d: OrderMailData, amount: number): Mail {
  return notice(d.lang, d.to, {
    fr: {
      subject: `Preuve d'acompte reçue : ${d.number}`,
      paragraphs: [
        `${d.other} a envoyé la preuve de paiement de l'acompte de ${eur(amount, 'fr')} pour la commande ${d.number}.`,
        'Vérifiez la preuve, puis confirmez la réception du paiement pour lancer la commande.',
      ],
      cta: { label: 'Voir la preuve', url: d.url },
    },
    nl: {
      subject: `Bewijs van voorschot ontvangen: ${d.number}`,
      paragraphs: [
        `${d.other} heeft het betalingsbewijs van het voorschot van ${eur(amount, 'nl')} voor bestelling ${d.number} gestuurd.`,
        'Controleer het bewijs en bevestig daarna de ontvangst van de betaling om de bestelling te starten.',
      ],
      cta: { label: 'Bewijs bekijken', url: d.url },
    },
  });
}

/** To the contractor: the supplier received the deposit (or rejected the proof). */
export function depositAnsweredMail(d: OrderMailData, received: boolean, reason?: string): Mail {
  return notice(d.lang, d.to, {
    fr: received
      ? {
          subject: `Acompte reçu, commande lancée : ${d.number}`,
          paragraphs: [`${d.other} a reçu votre acompte et lance la commande ${d.number}.`],
          cta: { label: 'Suivre la commande', url: d.url },
        }
      : {
          subject: `Acompte non reçu : ${d.number}`,
          paragraphs: [
            `${d.other} n'a pas encore reçu votre acompte pour la commande ${d.number}.`,
            ...(reason ? [`Motif : ${reason}`] : []),
            "Vérifiez le virement et renvoyez une preuve si besoin.",
          ],
          cta: { label: 'Voir la commande', url: d.url },
        },
    nl: received
      ? {
          subject: `Voorschot ontvangen, bestelling gestart: ${d.number}`,
          paragraphs: [`${d.other} heeft uw voorschot ontvangen en start bestelling ${d.number}.`],
          cta: { label: 'Bestelling volgen', url: d.url },
        }
      : {
          subject: `Voorschot niet ontvangen: ${d.number}`,
          paragraphs: [
            `${d.other} heeft uw voorschot voor bestelling ${d.number} nog niet ontvangen.`,
            ...(reason ? [`Reden: ${reason}`] : []),
            'Controleer de overschrijving en stuur zo nodig een nieuw bewijs.',
          ],
          cta: { label: 'Bestelling bekijken', url: d.url },
        },
  });
}

/** To the contractor: the supplier cannot deliver. */
export function orderDeclinedMail(d: OrderMailData, reason: string | null): Mail {
  return notice(d.lang, d.to, {
    fr: {
      subject: `Commande annulée par le fournisseur : ${d.number}`,
      paragraphs: [`${d.other} ne peut pas honorer la commande ${d.number}.`, ...(reason ? [`Motif : ${reason}`] : [])],
      cta: { label: 'Voir la commande', url: d.url },
    },
    nl: {
      subject: `Bestelling geannuleerd door de leverancier: ${d.number}`,
      paragraphs: [`${d.other} kan bestelling ${d.number} niet uitvoeren.`, ...(reason ? [`Reden: ${reason}`] : [])],
      cta: { label: 'Bestelling bekijken', url: d.url },
    },
  });
}

/** To the supplier: the contractor confirmed delivery, or reported paying (with proof). */
export function orderNewsMail(d: OrderMailData, news: 'payment_reported' | 'delivered'): Mail {
  if (news === 'payment_reported') {
    return notice(d.lang, d.to, {
      fr: {
        subject: `Paiement annoncé : ${d.number}`,
        paragraphs: [`${d.other} indique avoir payé la commande ${d.number} et a joint une preuve de paiement.`],
        cta: { label: 'Voir la preuve', url: d.url },
      },
      nl: {
        subject: `Betaling gemeld: ${d.number}`,
        paragraphs: [`${d.other} meldt bestelling ${d.number} betaald te hebben en heeft een betalingsbewijs toegevoegd.`],
        cta: { label: 'Bewijs bekijken', url: d.url },
      },
    });
  }
  return notice(d.lang, d.to, {
    fr: {
      subject: `Livraison confirmée : ${d.number}`,
      paragraphs: [
        `${d.other} a confirmé la réception de la commande ${d.number}.`,
        `Envoyez votre facture par Peppol avec la référence de commande ${d.number}.`,
      ],
    },
    nl: {
      subject: `Levering bevestigd: ${d.number}`,
      paragraphs: [`${d.other} heeft de ontvangst van bestelling ${d.number} bevestigd.`, `Stuur uw factuur via Peppol met bestelreferentie ${d.number}.`],
    },
  });
}

export type BillLine = { number: string; title: string; contractor: string; baseExVat: number; commissionExVat: number };

/** To the supplier: the month's commission, with every order it covers, payable online. */
export function commissionBillMail(
  lang: Lang,
  to: string,
  bill: { number: string; month: string; exVat: number; incVat: number; lines: BillLine[]; creditExVat?: number },
  url: string,
): Mail {
  const rows = bill.lines.map(
    (l) => `${l.number} · ${l.contractor} · ${l.title} · ${eur(l.baseExVat, lang)} → ${eur(l.commissionExVat, lang)}`,
  );
  const intro =
    lang === 'nl'
      ? `Commissie voor ${bill.lines.length} bestelling(en) gegund via ${APP_NAME} in ${bill.month}: ${eur(bill.exVat, 'nl')} excl. btw, of ${eur(bill.incVat, 'nl')} incl. btw.`
      : `Commission sur ${bill.lines.length} commande(s) passée(s) via ${APP_NAME} en ${bill.month} : ${eur(bill.exVat, 'fr')} HTVA, soit ${eur(bill.incVat, 'fr')} TVAC.`;
  if (bill.creditExVat) {
    rows.push(lang === 'nl' ? `Peterschapskrediet: −${eur(bill.creditExVat, 'nl')}` : `Crédit de parrainage : −${eur(bill.creditExVat, 'fr')}`);
  }
  const outro =
    lang === 'nl'
      ? 'De factuur ontvangt u via Peppol met dezelfde referentie. U kunt veilig online betalen (Bancontact, kaart of overschrijving).'
      : 'La facture vous parvient par Peppol avec la même référence. Vous pouvez payer en ligne de façon sécurisée (Bancontact, carte ou virement).';
  const html = layout(
    [esc(intro), `<ul style="margin:0;padding-left:18px">${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`, esc(outro)],
    { label: lang === 'nl' ? 'Commissie betalen' : 'Payer la commission', url },
  );
  return {
    to,
    subject: lang === 'nl' ? `Commissie ${APP_NAME} ${bill.month}: ${bill.number}` : `Commission ${APP_NAME} ${bill.month} : ${bill.number}`,
    html,
    text: [intro, ...rows.map((r) => `- ${r}`), outro, url].join('\n\n'),
  };
}
