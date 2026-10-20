import { APP_NAME } from '@/constants/brand';
import { type bannersFr } from './banners.fr';

const s = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const bannersNl: typeof bannersFr = {
  news: {
    nodi: 'Nodi meldt',
    tip: 'Tip van Nodi',
    read: 'Lezen',
    source: (name: string, other?: boolean) => `Bron: ${name}${other ? ' (Franstalig artikel)' : ''}`,
    topics: { ecology: 'Ecologie', regulation: 'Regelgeving', grants: 'Premies', products: 'Producten', market: 'Markt', safety: 'Veiligheid' },
  },
  contractor: {
    trial: {
      kicker: 'Premium-proef',
      title: (days: number) => `Nog ${days} ${s(days, 'dag', 'dagen')} om alles te testen`,
      text: 'Verstuur nu een aanvraag en zie hoeveel u bespaart op uw materialen.',
      cta: 'Mijn plan kiezen',
    },
    waiting: {
      kicker: 'Lopend',
      title: (n: number) => `${n} ${s(n, 'aanvraag wacht', 'aanvragen wachten')} op offertes`,
      text: 'Leveranciers hebben 48 u. De prijzen komen hier binnen, regel per regel.',
      cta: 'Offertes bekijken',
    },
    materials: {
      kicker: 'Materialen',
      title: 'Betaal niet langer te veel voor uw materialen',
      text: 'Eén aanvraag, alle leveranciers in uw regio, offertes binnen 48 u. Zonder één telefoontje.',
      cta: 'Aanvraag starten',
    },
    network: {
      kicker: 'Partners',
      title: (n: number) => (n > 0 ? `${n} ${s(n, 'nieuwe aannemer', 'nieuwe aannemers')} deze week` : 'Uw volgende onderaannemer is er al'),
      text: 'Publiceer een opdracht of reageer op zoekertjes in uw regio. Enkel geverifieerde bedrijven.',
      cta: 'Partners bekijken',
    },
    delivery: {
      kicker: 'Bestellingen',
      title: 'Besteld, geleverd, opgevolgd',
      text: 'Bestelbon, voorschot, levering en factuur: alles op één plek.',
      cta: 'Mijn leveranciers',
    },
    referral: {
      kicker: 'Peterschap',
      title: 'Eén collega uitgenodigd = één maand gratis',
      text: 'Nodig een aannemer of leverancier uit: u krijgt elk een maand Premium.',
      cta: 'Collega uitnodigen',
    },
  },
  supplier: {
    waiting: {
      kicker: 'Te beantwoorden',
      title: (n: number) => `${n} ${s(n, 'werf wacht', 'werven wachten')} op uw prijs`,
      text: 'De aannemer kiest binnen 48 u. Wie eerst antwoordt, heeft vaak een voorsprong.',
      cta: 'Nu antwoorden',
    },
    zones: {
      kicker: 'Meer aanvragen',
      title: 'De werven in uw regio zoeken uw prijzen',
      text: 'Voeg uw regio’s en categorieën toe: u krijgt elke aanvraag die bij u past.',
      cta: 'Mijn regio’s',
    },
    won: {
      kicker: 'Uw verkoop',
      title: (n: number) => `${n} ${s(n, 'offerte gewonnen', 'offertes gewonnen')} via ${APP_NAME}`,
      text: 'Elke aanvraag komt van een geverifieerde aannemer. Zonder prospectie.',
      cta: 'Mijn bestellingen',
    },
    fast: {
      kicker: 'Eén klik',
      title: 'Uw prijzen, verstuurd met één klik',
      text: 'Eén link, uw prijzen regel per regel, klaar. Niets te installeren.',
      cta: 'Aanvragen bekijken',
    },
  },
  architect: {
    find: {
      kicker: 'Projecten',
      title: 'De juiste aannemers voor uw projecten',
      text: 'Publiceer uw project: geverifieerde bedrijven uit de regio reageren.',
      cta: 'Project publiceren',
    },
    trust: {
      kicker: 'Geverifieerd',
      title: 'Enkel bedrijven die in orde zijn',
      text: 'Btw en KBO live gecontroleerd, bij elke samenwerking.',
      cta: 'Partners bekijken',
    },
  },
  landing: {
    contractor: {
      kicker: 'Aannemers',
      title: 'Uw materialen aan de beste prijs, binnen 48 u',
      text: 'Alle leveranciers in uw regio antwoorden op één aanvraag.',
      cta: '7 dagen gratis proberen',
    },
    supplier: {
      kicker: 'Leveranciers',
      title: 'Werven in uw buurt, zonder prospectie',
      text: 'Ontvang de aanvragen van aannemers in uw regio en antwoord met één klik.',
      cta: 'Aanvragen ontvangen',
    },
    architect: {
      kicker: 'Architecten',
      title: 'Geverifieerde aannemers voor elk project',
      text: 'Publiceer gratis, kies uit bedrijven die in orde zijn.',
      cta: 'Project publiceren',
    },
  },
  pages: {
    signin: [
      { kicker: 'Materialen', title: 'Uw leveranciersprijzen binnen 48 u ⚡', text: 'Eén aanvraag, meerdere offertes, u kiest de beste.' },
      { kicker: 'Partners', title: 'Enkel bedrijven die in orde zijn', text: 'Btw en KBO gecontroleerd voor elke aannemer, leverancier en architect.' },
      { kicker: 'Proef', title: '7 dagen gratis, zonder bankkaart', text: 'Maak uw account aan en test vandaag nog alles van Premium.' },
    ],
    request: { kicker: 'Prijsaanvraag', title: 'Oplijsten, versturen, vergelijken', text: 'De leveranciers in uw regio hebben 48 u om te antwoorden. U kiest de offerte die u past.' },
    network: [
      { kicker: 'Onderaanneming', title: 'Vind versterking voor uw werven', text: 'Publiceer een opdracht: geverifieerde aannemers uit uw regio reageren.' },
      { kicker: 'Projecten', title: 'Architecten zoeken aannemers', text: 'Reageer op hun projecten en haal nieuwe werven binnen.' },
    ],
    plans: { kicker: 'Premium', title: 'Terugverdiend vanaf de eerste bestelling', text: 'Drie offertes vergelijken op één werf levert vaak meer op dan de prijs van een maand.' },
    settings: { kicker: 'Peterschap', title: 'Eén collega uitgenodigd = één maand gratis', text: 'Deel uw link hieronder: u krijgt elk een maand Premium zodra het bedrijf geverifieerd is.' },
  },
};
