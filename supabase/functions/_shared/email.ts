// Transactional e-mails, sent through Brevo's HTTP API in the recipient's language.

export type Lang = 'fr' | 'nl';

export type Mail = { to: string; subject: string; html: string; text: string };

export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'demandes@batilink.be';
  if (!apiKey) {
    // Local development: log instead of sending.
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: 'BatiLink' },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(paragraphs: string[], cta?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const button = cta
    ? `<p style="margin:22px 0"><a href="${esc(cta.url)}" style="background:#f2b705;color:#2a2100;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : '';
  const foot = footer ? `<p style="margin:24px 0 0;color:#56616d;font-size:12px">${footer}</p>` : '';
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#16202b;max-width:560px">
<p style="margin:0 0 20px;font-weight:800;font-size:18px;color:#1d3a5f">BatiLink</p>${body}${button}${foot}</div>`;
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
};

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
    const footer = 'U krijgt deze e-mail omdat uw handel deze categorie en regio bedient op BatiLink. Geen account nodig om te antwoorden.';
    return {
      to: d.to,
      subject,
      html: layout(['Goedendag,', intro, items.html], { label: 'Mijn prijs doorgeven', url: d.url }, footer),
      text: `Goedendag,\n\n${who} vraagt u een prijs voor:\n${items.text}\n\nAntwoorden: ${d.url}\n\n${footer}`,
    };
  }
  const who = `${d.contractor}${d.contractorVerified ? ' (entreprise vérifiée)' : ''}`;
  const when = d.neededBy ? `${d.delivery ? 'livraison sur chantier' : 'enlèvement'} le ${dateFmt(d.neededBy, 'fr')}` : d.delivery ? 'livraison sur chantier' : 'enlèvement';
  const intro = `${esc(who)} vous demande un prix pour ${d.items.length} produit(s) à ${esc(place)}, ${when}. Réponse souhaitée avant le ${dateFmt(d.replyBy, 'fr')}.`;
  const subject = `${reminder ? 'Rappel : ' : ''}Nouvelle demande de prix : ${d.title} (${place})`;
  const footer = "Vous recevez cet e-mail parce que votre négoce couvre cette catégorie et cette zone sur BatiLink. Aucun compte n'est nécessaire pour répondre.";
  return {
    to: d.to,
    subject,
    html: layout(['Bonjour,', intro, items.html], { label: 'Remettre mon prix', url: d.url }, footer),
    text: `Bonjour,\n\n${who} vous demande un prix pour :\n${items.text}\n\nRépondre : ${d.url}\n\n${footer}`,
  };
}

export function awardedMail(lang: Lang, to: string, contractor: string, contractorEmail: string | null, title: string): Mail {
  if (lang === 'nl') {
    const p = [`Goed nieuws: ${esc(contractor)} heeft uw offerte voor « ${esc(title)} » gekozen.`, `Neem contact op om de levering te regelen${contractorEmail ? `: ${esc(contractorEmail)}` : ''}.`];
    return { to, subject: `Uw offerte is gekozen: ${title}`, html: layout(p), text: p.join('\n\n') };
  }
  const p = [`Bonne nouvelle : ${esc(contractor)} a retenu votre offre pour « ${esc(title)} ».`, `Prenez contact pour organiser la livraison${contractorEmail ? ` : ${esc(contractorEmail)}` : ''}.`];
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
