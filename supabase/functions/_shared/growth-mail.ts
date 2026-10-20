import { APP_NAME } from './brand.ts';
import { notice, type Lang, type Mail } from './email.ts';

// Welcome, activation and retention e-mails. Each one carries a single next step.

export type Kind = 'contractor' | 'supplier' | 'architect';

export function welcomeMail(lang: Lang, to: string, kind: Kind, url: string, trialDays: number): Mail {
  const fr: Record<Kind, string[]> = {
    contractor: [
      `Bienvenue sur ${APP_NAME}. Vous avez ${trialDays} jours de plan Premium offerts, sans carte bancaire.`,
      'Le plus rapide pour voir la différence : envoyez votre prochaine demande de matériaux à plusieurs négoces de votre zone. Ils répondent par e-mail, vous comparez les offres ligne par ligne.',
      'Astuce : ajoutez vos fournisseurs habituels. Ils recevront vos demandes même s’ils ne sont pas encore inscrits.',
    ],
    supplier: [
      `Bienvenue sur ${APP_NAME}. Nous vérifions votre entreprise auprès de la BCE ; vos premières demandes de prix arrivent ensuite par e-mail.`,
      'Répondre est gratuit et ne demande pas de compte : un lien suffit.',
      'Dans votre espace, vous suivez vos demandes, vos commandes et votre relevé du mois.',
    ],
    architect: [
      `Bienvenue sur ${APP_NAME}. Votre compte est gratuit.`,
      'Publiez votre premier projet : les entrepreneurs vérifiés de votre zone vous répondent, et vous voyez qu’ils sont en règle (TVA, BCE) avant de les recommander.',
    ],
  };
  const nl: Record<Kind, string[]> = {
    contractor: [
      `Welkom bij ${APP_NAME}. U krijgt ${trialDays} dagen het Premium-plan cadeau, zonder bankkaart.`,
      'De snelste manier om het verschil te zien: stuur uw volgende materiaalaanvraag naar meerdere handelaars in uw regio. Zij antwoorden per e-mail, u vergelijkt de offertes regel per regel.',
      'Tip: voeg uw vaste leveranciers toe. Zij krijgen uw aanvragen, ook als ze nog niet ingeschreven zijn.',
    ],
    supplier: [
      `Welkom bij ${APP_NAME}. We controleren uw bedrijf bij de KBO; daarna komen uw eerste prijsaanvragen per e-mail.`,
      'Antwoorden is gratis en vraagt geen account: een link volstaat.',
      'In uw ruimte volgt u uw aanvragen, bestellingen en het overzicht van de maand.',
    ],
    architect: [
      `Welkom bij ${APP_NAME}. Uw account is gratis.`,
      'Publiceer uw eerste project: geverifieerde aannemers uit uw regio antwoorden, en u ziet dat ze in orde zijn (btw, KBO) voor u ze aanbeveelt.',
    ],
  };
  const cta = {
    contractor: { fr: 'Créer ma première demande', nl: 'Mijn eerste aanvraag maken' },
    supplier: { fr: 'Ouvrir mon espace', nl: 'Mijn ruimte openen' },
    architect: { fr: 'Publier un projet', nl: 'Een project publiceren' },
  }[kind];
  return notice(lang, to, {
    fr: { subject: `Bienvenue sur ${APP_NAME}`, paragraphs: fr[kind], cta: { label: cta.fr, url } },
    nl: { subject: `Welkom bij ${APP_NAME}`, paragraphs: nl[kind], cta: { label: cta.nl, url } },
  });
}

/** Sent when a new company has not taken its first step after two days. */
export function activationMail(lang: Lang, to: string, kind: Kind, url: string): Mail {
  const content = {
    contractor: {
      fr: {
        subject: 'Votre première demande de prix en 3 minutes',
        paragraphs: [
          'Vous n’avez pas encore envoyé de demande de prix. Prenez la liste de votre prochain chantier : titre, quelques lignes de produits, le code postal. Nous l’envoyons aux négoces de votre zone.',
          'Comparer au moins trois offres est le moyen le plus simple de payer le juste prix.',
        ],
        cta: { label: 'Créer ma demande', url },
      },
      nl: {
        subject: 'Uw eerste prijsaanvraag in 3 minuten',
        paragraphs: [
          'U hebt nog geen prijsaanvraag verstuurd. Neem de lijst van uw volgende werf: titel, enkele productregels, de postcode. Wij sturen ze naar de handelaars in uw regio.',
          'Minstens drie offertes vergelijken is de eenvoudigste manier om de juiste prijs te betalen.',
        ],
        cta: { label: 'Mijn aanvraag maken', url },
      },
    },
    supplier: {
      fr: {
        subject: 'Des entrepreneurs attendent votre prix',
        paragraphs: ['Vous avez des demandes de prix sans réponse. Répondre vite augmente vos chances d’être retenu.'],
        cta: { label: 'Voir mes demandes', url },
      },
      nl: {
        subject: 'Aannemers wachten op uw prijs',
        paragraphs: ['U hebt prijsaanvragen zonder antwoord. Snel antwoorden vergroot uw kans om gekozen te worden.'],
        cta: { label: 'Mijn aanvragen bekijken', url },
      },
    },
    architect: {
      fr: {
        subject: 'Publiez votre premier projet',
        paragraphs: ['Décrivez votre projet en quelques lignes : les entrepreneurs vérifiés de votre zone vous répondent directement.'],
        cta: { label: 'Publier un projet', url },
      },
      nl: {
        subject: 'Publiceer uw eerste project',
        paragraphs: ['Beschrijf uw project in enkele regels: geverifieerde aannemers uit uw regio antwoorden u rechtstreeks.'],
        cta: { label: 'Een project publiceren', url },
      },
    },
  }[kind];
  return notice(lang, to, content);
}

export function trialEndingMail(lang: Lang, to: string, daysLeft: number, url: string): Mail {
  return notice(lang, to, {
    fr: {
      subject: `Votre essai Premium se termine dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`,
      paragraphs: [
        `Après l’essai, choisissez un plan pour continuer à utiliser ${APP_NAME}. Vos demandes, offres et commandes restent enregistrées.`,
        'Gardez Premium au prix de lancement de 129,99 € HTVA par mois, ou 1 299,90 € par an (deux mois offerts). Le plan Starter (69,99 € par mois) garde le réseau sans limite, sans les fournisseurs. Sans engagement.',
      ],
      cta: { label: 'Choisir mon plan', url },
    },
    nl: {
      subject: `Uw Premium-proefperiode eindigt over ${daysLeft} dag${daysLeft > 1 ? 'en' : ''}`,
      paragraphs: [
        `Kies na de proefperiode een plan om ${APP_NAME} te blijven gebruiken. Uw aanvragen, offertes en bestellingen blijven bewaard.`,
        'Behoud Premium tegen de lanceringsprijs van € 129,99 excl. btw per maand, of € 1.299,90 per jaar (twee maanden gratis). Het Starter-plan (€ 69,99 per maand) houdt het netwerk zonder limiet, zonder de leveranciers. Zonder verbintenis.',
      ],
      cta: { label: 'Mijn plan kiezen', url },
    },
  });
}

export function trialEndedMail(lang: Lang, to: string, url: string): Mail {
  return notice(lang, to, {
    fr: {
      subject: 'Votre essai gratuit est terminé',
      paragraphs: [`Pour continuer à utiliser ${APP_NAME}, choisissez Starter ou Premium. Vos demandes, offres et commandes restent enregistrées et réapparaissent dès que votre plan est actif.`],
      cta: { label: 'Choisir mon plan', url },
    },
    nl: {
      subject: 'Uw gratis proefperiode is afgelopen',
      paragraphs: [`Kies Starter of Premium om ${APP_NAME} te blijven gebruiken. Uw aanvragen, offertes en bestellingen blijven bewaard en zijn terug beschikbaar zodra uw plan actief is.`],
      cta: { label: 'Mijn plan kiezen', url },
    },
  });
}

/** A contractor asks its usual supplier to receive its requests through the platform. */
export function supplierInviteMail(lang: Lang, to: string, contractor: string, url: string): Mail {
  return notice(lang, to, {
    fr: {
      subject: `${contractor} souhaite vous envoyer ses demandes de prix via ${APP_NAME}`,
      paragraphs: [
        `${contractor} utilise ${APP_NAME} pour ses demandes de prix et commandes de matériaux, et vous a ajouté à ses fournisseurs.`,
        'Vous recevrez ses demandes par e-mail et répondrez en un clic, sans compte. En créant votre espace gratuit, vous recevez aussi les demandes des autres entrepreneurs de votre zone.',
      ],
      cta: { label: 'Créer mon espace fournisseur', url },
    },
    nl: {
      subject: `${contractor} wil u zijn prijsaanvragen sturen via ${APP_NAME}`,
      paragraphs: [
        `${contractor} gebruikt ${APP_NAME} voor prijsaanvragen en bestellingen van materialen, en heeft u toegevoegd aan zijn leveranciers.`,
        'U ontvangt zijn aanvragen per e-mail en antwoordt met één klik, zonder account. Met een gratis ruimte ontvangt u ook de aanvragen van andere aannemers in uw regio.',
      ],
      cta: { label: 'Mijn leveranciersruimte aanmaken', url },
    },
  });
}

export function referralRewardMail(lang: Lang, to: string, referred: string, reward: { fr: string; nl: string }, url: string): Mail {
  return notice(lang, to, {
    fr: {
      subject: `Merci : ${referred} a rejoint ${APP_NAME}`,
      paragraphs: [`${referred} s’est inscrit avec votre code de parrainage et son entreprise est vérifiée.`, `Votre récompense : ${reward.fr}.`],
      cta: { label: 'Parrainer une autre entreprise', url },
    },
    nl: {
      subject: `Bedankt: ${referred} is bij ${APP_NAME} gekomen`,
      paragraphs: [`${referred} heeft zich ingeschreven met uw code en het bedrijf is geverifieerd.`, `Uw beloning: ${reward.nl}.`],
      cta: { label: 'Nog een bedrijf uitnodigen', url },
    },
  });
}

/** A paying or trial contractor that has gone quiet for a month. */
export function winbackMail(lang: Lang, to: string, url: string): Mail {
  return notice(lang, to, {
    fr: {
      subject: 'Un chantier qui démarre ? Comparez vos prix en 3 minutes',
      paragraphs: ['Vous n’avez pas envoyé de demande de prix depuis un mois. Pour votre prochain chantier, envoyez la liste aux négoces de votre zone et comparez les offres ligne par ligne.'],
      cta: { label: 'Nouvelle demande', url },
    },
    nl: {
      subject: 'Start er een werf? Vergelijk uw prijzen in 3 minuten',
      paragraphs: ['U hebt al een maand geen prijsaanvraag verstuurd. Stuur voor uw volgende werf de lijst naar de handelaars in uw regio en vergelijk de offertes regel per regel.'],
      cta: { label: 'Nieuwe aanvraag', url },
    },
  });
}

export type Newcomer = { name: string; trades: string; place: string };

/** Monday digest: verified contractors who joined last week, the reader's region first. */
export function newcomersMail(lang: Lang, to: string, newcomers: Newcomer[], url: string): Mail {
  const line = (n: Newcomer) => `• ${[n.name, n.trades, n.place].filter(Boolean).join(' · ')}`;
  const count = newcomers.length;
  return notice(lang, to, {
    fr: {
      subject: `${count} nouvel${count > 1 ? 'les' : 'le'} entreprise${count > 1 ? 's' : ''} sur ${APP_NAME} cette semaine`,
      paragraphs: [
        `Cette semaine, ${count > 1 ? `${count} entrepreneurs vérifiés ont` : 'un entrepreneur vérifié a'} rejoint ${APP_NAME} :`,
        ...newcomers.map(line),
        'Besoin d’un sous-traitant ou d’un coup de main sur un chantier ? Publiez une annonce dans Réseau.',
        'Vous ne voulez plus recevoir ce récapitulatif ? Désactivez-le dans Réglages.',
      ],
      cta: { label: 'Voir le réseau', url },
    },
    nl: {
      subject: `${count} nieuw${count > 1 ? 'e bedrijven' : ' bedrijf'} op ${APP_NAME} deze week`,
      paragraphs: [
        `Deze week ${count > 1 ? `sloten ${count} geverifieerde aannemers` : 'sloot een geverifieerde aannemer'} aan bij ${APP_NAME}:`,
        ...newcomers.map(line),
        'Een onderaannemer of extra hulp nodig op een werf? Plaats een oproep in Netwerk.',
        'Wilt u dit overzicht niet meer ontvangen? Zet het uit in Instellingen.',
      ],
      cta: { label: 'Netwerk bekijken', url },
    },
  });
}
