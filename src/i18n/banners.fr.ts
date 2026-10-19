import { APP_NAME } from '@/constants/brand';

const s = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const bannersFr = {
  contractor: {
    trial: {
      kicker: 'Essai Premium',
      title: (days: number) => `Plus que ${days} ${s(days, 'jour', 'jours')} pour tout tester`,
      text: 'Envoyez une demande maintenant et voyez combien vous économisez sur vos matériaux.',
      cta: 'Choisir mon plan',
    },
    waiting: {
      kicker: 'En cours',
      title: (n: number) => `${n} ${s(n, 'demande attend', 'demandes attendent')} vos offres`,
      text: 'Les fournisseurs ont 48 h. Les prix arrivent ici, ligne par ligne.',
      cta: 'Voir les offres',
    },
    materials: {
      kicker: 'Matériaux',
      title: 'Arrêtez de payer vos matériaux trop cher',
      text: 'Une demande, tous les fournisseurs de votre zone, des offres en 48 h. Sans un coup de fil.',
      cta: 'Lancer une demande',
    },
    network: {
      kicker: 'Réseau',
      title: (n: number) => (n > 0 ? `${n} ${s(n, 'nouvel entrepreneur', 'nouveaux entrepreneurs')} cette semaine` : 'Votre prochain sous-traitant est déjà ici'),
      text: 'Publiez une mission ou répondez aux annonces de votre région. Entreprises vérifiées uniquement.',
      cta: 'Ouvrir le réseau',
    },
    delivery: {
      kicker: 'Commandes',
      title: 'Commandé, livré, suivi',
      text: 'Bon de commande, acompte, livraison et facture : tout est au même endroit.',
      cta: 'Mes fournisseurs',
    },
    referral: {
      kicker: 'Parrainage',
      title: 'Un collègue invité = un mois offert',
      text: 'Invitez un entrepreneur ou un fournisseur : vous recevez chacun un mois de Premium.',
      cta: 'Inviter un collègue',
    },
  },
  supplier: {
    waiting: {
      kicker: 'À répondre',
      title: (n: number) => `${n} ${s(n, 'chantier attend', 'chantiers attendent')} votre prix`,
      text: 'L’entrepreneur choisit dans les 48 h. Le premier à répondre a souvent l’avantage.',
      cta: 'Répondre maintenant',
    },
    zones: {
      kicker: 'Plus de demandes',
      title: 'Les chantiers de votre zone cherchent vos prix',
      text: 'Ajoutez vos zones et vos catégories : vous recevez chaque demande qui vous correspond.',
      cta: 'Mes zones',
    },
    won: {
      kicker: 'Vos ventes',
      title: (n: number) => `${n} ${s(n, 'offre gagnée', 'offres gagnées')} via ${APP_NAME}`,
      text: 'Chaque demande vient d’un entrepreneur vérifié. Sans prospection.',
      cta: 'Voir mes commandes',
    },
    fast: {
      kicker: 'En un clic',
      title: 'Vos prix, envoyés en un clic',
      text: 'Un lien, vos prix ligne par ligne, et c’est parti. Rien à installer.',
      cta: 'Voir les demandes',
    },
  },
  architect: {
    find: {
      kicker: 'Projets',
      title: 'Les bons entrepreneurs pour vos projets',
      text: 'Publiez votre projet : des entreprises vérifiées de la région vous répondent.',
      cta: 'Publier un projet',
    },
    trust: {
      kicker: 'Vérifié',
      title: 'Uniquement des entreprises en règle',
      text: 'TVA et BCE vérifiées en direct, à chaque mise en relation.',
      cta: 'Voir le réseau',
    },
  },
  landing: {
    contractor: {
      kicker: 'Entrepreneurs',
      title: 'Vos matériaux au meilleur prix, en 48 h',
      text: 'Tous les fournisseurs de votre zone répondent à une seule demande.',
      cta: 'Essayer 7 jours gratuits',
    },
    supplier: {
      kicker: 'Fournisseurs',
      title: 'Des chantiers près de chez vous, sans prospecter',
      text: 'Recevez les demandes des entrepreneurs de votre zone et répondez en un clic.',
      cta: 'Recevoir des demandes',
    },
    architect: {
      kicker: 'Architectes',
      title: 'Des entrepreneurs vérifiés pour chaque projet',
      text: 'Publiez gratuitement, choisissez parmi des entreprises en règle.',
      cta: 'Publier un projet',
    },
  },
};
