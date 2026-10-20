import { APP_NAME } from "@/constants/brand";

export const growthFr = {
  plans: {
    monthly: "Mensuel",
    yearly: "Annuel",
    yearlySave: "2 mois offerts",
    yearlyHint: "Passez à l’annuel : 2 mois offerts",
    perYear: "/ an HTVA",
    perMonthEquivalent: (amount: string) => `soit ${amount} / mois`,
    recommended: "Le plus rentable",
    roi: "Faites le calcul : en annuel, Premium revient à 108,33 € HTVA par mois. Dès que vos demandes de prix vous font économiser davantage sur vos achats, il est rentable.",
    trialLeft: (days: number) =>
      `Essai Premium : ${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""}. Choisissez un plan pour le garder.`,
    trialOver: `Votre essai gratuit de 7 jours est terminé. Choisissez Starter ou Premium pour continuer à utiliser ${APP_NAME}. Vos demandes et commandes sont conservées.`,
    networkLeft: (left: number) =>
      left > 0
        ? `Plan Test : encore ${left} échange${left > 1 ? "s" : ""} ce mois-ci dans Partenaires.`
        : "Plan Test : vos 3 échanges du mois sont utilisés.",
  },
  upgrade: {
    suppliers: {
      title: "Les demandes de prix sont réservées au plan Premium",
      text: "Avec Premium, vous envoyez des demandes illimitées à tous les fournisseurs de votre zone et vous comparez leurs offres ligne par ligne.",
      cta: "Passer au plan Premium",
    },
    network: {
      title: "Vos 3 échanges du mois sont utilisés",
      text: "Avec Starter, vous publiez et répondez aux annonces sans limite, et vous affichez votre badge vérifié.",
      cta: "Passer au plan Starter",
    },
  },
  start: {
    title: "Bien démarrer",
    progress: (done: number, total: number) => `${done} sur ${total}`,
    steps: {
      profile: "Créer votre compte",
      suppliers: "Ajouter vos fournisseurs habituels",
      request: "Envoyer votre première demande de prix",
      award: "Retenir une offre",
      invite: "Parrainer un collègue (1 mois offert)",
    },
    hide: "Masquer",
  },
  favourites: {
    title: "Mes fournisseurs",
    lead: "Vos fournisseurs habituels reçoivent toutes vos demandes de prix.",
    namePlaceholder: "Ex. Gobert Matériaux",
    inRegion: "Votre région",
    chosen: "Déjà ajouté",
    notListed:
      "Pas dans la liste ? Indiquez ses coordonnées, nous prenons contact avec lui.",
    city: "Commune (facultatif)",
    phone: "Téléphone (facultatif)",
    empty: "Aucun fournisseur ajouté pour l’instant.",
    name: "Nom du fournisseur",
    email: "Adresse e-mail (facultatif)",
    emailHint: "Si vous ne la connaissez pas, nous la trouvons pour vous.",
    add: "Ajouter",
    remove: "Retirer",
    added: (name: string) => `${name} est ajouté à vos fournisseurs.`,
    requested: (name: string) =>
      `${name} est ajouté. Nous le contactons pour vous.`,
    invited: (name: string) => `${name} est ajouté et a reçu une invitation.`,
    errors: {
      invalid_email: "Cette adresse e-mail semble incorrecte.",
      invalid_name: "Indiquez le nom du fournisseur.",
      already_invited: "Vous avez déjà invité cette adresse.",
      too_many: "Vous avez atteint la limite d’ajouts pour aujourd’hui.",
      not_found: "Ce fournisseur est introuvable.",
    },
    pending: "En attente",
    member: "Sur " + APP_NAME,
    open: "Gérer mes fournisseurs",
  },
  referral: {
    title: "Parrainage",
    lead: "Invitez un entrepreneur, un fournisseur ou un architecte. Dès que son entreprise est vérifiée, vous recevez un mois offert, et lui aussi.",
    code: "Votre code",
    share: "Partager mon lien",
    copied: "Lien copié.",
    message: (url: string) =>
      `Je compare mes prix de matériaux et je trouve mes sous-traitants sur ${APP_NAME}. Inscris-toi avec mon lien, tu as un mois de Premium offert : ${url}`,
    count: (n: number) =>
      n === 0
        ? "Personne n’a encore utilisé votre code."
        : `${n} entreprise${n > 1 ? "s" : ""} parrainée${n > 1 ? "s" : ""}.`,
    rewarded: "Récompense reçue",
    waiting: "En attente de vérification",
  },
  supplierSpace: {
    title: "Votre espace fournisseur",
    pending:
      "Nous vérifions votre entreprise. Vos premières demandes de prix arrivent ensuite par e-mail.",
    stats: {
      invited: "Demandes reçues (90 jours)",
      answered: "Taux de réponse",
      won: "Offres retenues",
      wonAmount: "Ventes via " + APP_NAME,
    },
    month: "Ce mois-ci",
    monthSales: (sales: string) => `${sales} de ventes via ${APP_NAME}.`,
    monthLine: (sales: string, commission: string) =>
      `${sales} de ventes, ${commission} de commission à facturer en fin de mois.`,
    requests: "Demandes de prix",
    noRequests:
      "Aucune demande pour l’instant. Elles arrivent par e-mail et s’affichent ici.",
    answer: "Répondre",
    view: "Voir",
    orders: "Commandes",
    noOrders: "Aucune commande pour l’instant.",
    bills: "Relevés de commission",
    noBills: "Aucun relevé pour l’instant.",
    billPaid: "Payé",
    billOpen: "À payer (lien dans l’e-mail du relevé)",
    zones: "Mes zones et catégories",
    zonesLead:
      "Vous recevez les demandes de ces catégories, dans ces provinces.",
    saveZones: "Enregistrer",
    saved: "Enregistré.",
    quoteStatus: {
      invited: "À répondre",
      submitted: "Offre envoyée",
      declined: "Déclinée",
      awarded: "Retenue",
      not_selected: "Non retenue",
    },
    tip: "Astuce : répondre vite augmente vos chances d’être retenu.",
  },
  founders: {
    eyebrow: "Ambassadeurs fondateurs",
    counter: (taken: number, total: number) =>
      `${taken} / ${total} places fondateur attribuées`,
    counterNote: "Abonnements payants réels, mis à jour automatiquement.",
    left: (n: number) =>
      n === 1 ? "Plus qu’une place" : `Plus que ${n} places`,
    until: (date: string) =>
      `Ouvert jusqu’au ${date} inclus, ou jusqu’à la 100e place.`,
    closed: "Les 100 places fondateur sont attribuées.",
    ended: "L’offre fondateur est terminée.",
    cta: "Devenir fondateur",
    learn: "Découvrir l’offre fondateur",
    member: (n: number) => `Fondateur n° ${n}`,
    memberLead:
      "Votre prix de lancement est garanti à vie, tant que votre abonnement reste actif sans interruption sur le même plan.",
    memberEnded: (n: number) =>
      `Vous avez été le fondateur n° ${n}. La garantie de prix a pris fin avec la résiliation ou le changement de plan.`,
    memberUpgrade:
      "Vous pouvez passer une seule fois de Starter à Premium en gardant votre prix fondateur. Un retour en arrière, un second changement ou une résiliation le font perdre.",
    memberLocked:
      "Votre formule est fixée : un changement ou une résiliation feraient perdre votre prix fondateur.",
    loseWarning:
      "Attention : ce changement vous fera perdre votre prix fondateur à vie. Continuer ?",
    portalWarning:
      "Sur la page suivante, une résiliation, un passage à une formule inférieure ou un second changement de formule vous feront perdre votre prix fondateur à vie. Continuer ?",
    page: {
      heroTitle: "Votre devis part avant celui des autres.",
      heroLead:
        "Une demande de prix, tous vos fournisseurs, comparés ligne par ligne. Votre fournisseur habituel peut répondre aussi : vous vérifiez enfin que son prix est le bon.",
      heroCta: "Essayer Premium 7 jours, sans carte",
      problemTitle:
        "Les prix bougent chaque mois. Votre devis, lui, est signé.",
      facts: [
        {
          value: "72 %",
          text: "des entreprises de construction attendent de nouvelles hausses des matériaux d’ici fin 2026.",
          source: "Enquête Embuild, septembre 2026",
        },
        {
          value: "39 %",
          text: "travaillent désormais au « prix du jour », fixé à la commande, contre 15 à 20 % d’habitude.",
          source: "Enquête Embuild, septembre 2026",
        },
        {
          value: "+21,5 %",
          text: "pour les plastiques et le PVC en un an. Métaux non ferreux : +32,6 %.",
          source: "Indices SPF Économie, août 2025 – août 2026",
        },
      ],
      howTitle: "Trois étapes, sans un coup de fil",
      radius:
        "Seuls les fournisseurs situés dans un rayon d’environ 50 km autour de votre chantier sont sollicités, du plus proche au plus loin.",
      how: [
        {
          title: "Décrivez vos matériaux",
          text: "Produits, quantités et code postal du chantier. Ajoutez vos fournisseurs habituels.",
        },
        {
          title: "Les fournisseurs répondent",
          text: "Ils reçoivent la demande dans leur langue et répondent par un simple lien, sans compte, ou envoient leur offre en PDF.",
        },
        {
          title: "Comparez et commandez",
          text: "Prix, livraison, délai et validité, ligne par ligne. Bon de commande, suivi de livraison et contrôle de la facture Peppol.",
        },
      ],
      calcTitle: "Combien vaut 1 % sur vos achats ?",
      calcLead:
        "Entrez vos achats annuels de matériaux et un écart de prix. Le résultat est une hypothèse, pas un résultat garanti.",
      calcPurchases: "Achats de matériaux par an (HTVA)",
      calcGap: "Écart de prix supposé",
      calcResult: (amount: string) => `${amount} par an`,
      calcCompare: (price: string) =>
        `Abonnement Starter annuel : ${price} HTVA.`,
      verifyTitle: "Des entreprises vérifiées, chaque mois",
      verifyText:
        "Numéro de TVA (VIES) et statut actif à la BCE contrôlés à l’inscription, chaque mois et avant chaque accord.",
      verify30bis:
        "BatiNode ne vérifie pas les dettes ONSS ou fiscales. Pour l’obligation de retenue (30bis), consultez l’application officielle 30bis sur socialsecurity.be.",
      reachTitle: "Combien de fournisseurs près de votre chantier ?",
      reachLead:
        "Fournisseurs recensés à partir de leurs sites officiels. Vous pouvez aussi ajouter vos fournisseurs habituels.",
      reachPlaceholder: "Code postal, ex. 1600",
      reachResult: (n: number, postal: string) =>
        n === 1
          ? `1 fournisseur recensé pour ${postal}`
          : `${n} fournisseurs recensés pour ${postal}`,
      reachNone:
        "Encore aucun fournisseur recensé ici. Ajoutez les vôtres : ils recevront vos demandes dès votre première demande de prix.",
      founderTitle: "Fils d’entrepreneur. J’ai vu le problème de l’intérieur.",
      founderText:
        "Mon père est entrepreneur dans le bâtiment. J’ai travaillé plusieurs années à ses côtés, et c’est moi qui m’occupais de l’administration et de la gestion de la société. À chaque chantier, la même histoire : des demandes de prix envoyées à gauche et à droite, et toujours les mêmes fournisseurs par habitude, alors que leurs prix n’étaient pas toujours les plus avantageux. La solution n’existait pas, alors je l’ai créée : BatiNode. Henrique, fondateur (Modern X Renov SRL, BCE 1015.519.625).",
      offerTitle:
        "100 places d’ambassadeur fondateur. Votre prix de lancement, bloqué.",
      offerPoints: [
        "Starter 69,99 € ou Premium 129,99 € HTVA par mois, garantis tant que votre abonnement reste actif sans interruption sur le même plan.",
        "Votre numéro de fondateur, de 1 à 100, dans votre espace.",
        "Un passage de Starter à Premium autorisé une fois, en gardant votre prix fondateur.",
        "Satisfait ou remboursé : votre premier paiement est remboursé intégralement si vous le demandez dans les 30 jours, sans justification.",
        "Une ligne directe avec l’équipe : vos idées passent en priorité.",
        "La place est attribuée à votre premier paiement, dans l’ordre d’arrivée.",
      ],
      offerAfter:
        "Après la phase de lancement, les prix des nouveaux abonnés pourront augmenter. Le vôtre reste bloqué. La garantie prend fin en cas de résiliation, de retour à une formule inférieure ou de second changement de formule.",
      faqTitle: "Vos questions, nos réponses franches",
      faq: [
        {
          q: "Mon fournisseur me fait déjà un bon prix.",
          a: "Gardez-le. Envoyez-lui la demande via BatiNode avec deux ou trois autres : vous saurez, ligne par ligne, si c’est vrai.",
        },
        {
          q: "Les fournisseurs vont-ils répondre ?",
          a: "Ils répondent par un simple lien, sans inscription, ou envoient leur PDF. Vérifiez ci-dessus combien sont recensés près de chez vous, et ajoutez les vôtres.",
        },
        {
          q: "Je n’ai pas le temps.",
          a: "Une demande prend moins de temps que trois coups de fil. Pendant l’essai, on peut l’envoyer avec vous : écrivez à support@batinode.be.",
        },
        {
          q: "Encore un abonnement…",
          a: "Faites le calcul avec vos propres chiffres plus haut. Le prix fondateur est bloqué, l’annuel offre deux mois, et vous résiliez en ligne quand vous voulez.",
        },
        {
          q: "Et si ça ne me convient pas ?",
          a: "Écrivez à support@batinode.be dans les 30 jours qui suivent votre premier paiement : il vous est remboursé intégralement, sans justification, et l’abonnement est arrêté.",
        },
        {
          q: "Et le 30bis pour mes sous-traitants ?",
          a: "BatiNode vérifie la TVA et la BCE chaque mois. Pour les dettes ONSS ou fiscales et la retenue, utilisez l’application officielle 30bis sur socialsecurity.be.",
        },
        {
          q: "Les autres verront-ils mes prix ?",
          a: "Non. Chaque offre n’est visible que de vous, et chaque fournisseur ne voit que sa propre offre.",
        },
        {
          q: "Et si BatiNode disparaît ?",
          a: "L’entreprise derrière BatiNode est identifiée à la BCE, et les conditions du prix fondateur sont écrites dans nos conditions générales.",
        },
      ],
      finalTitle: "Envoyez votre première demande aujourd’hui.",
      supplierLink: "Vous êtes fournisseur ? Recevez des demandes gratuitement",
      architectLink: "Architecte ? Gratuit, sans commission",
    },
  },
  landing: {
    signIn: "Se connecter",
    start: "Commencer gratuitement",
    eyebrow: "Pour les PME de la construction en Belgique",
    title:
      "Achetez vos matériaux au meilleur prix. Travaillez avec des partenaires en règle.",
    lead: `${APP_NAME} envoie vos demandes de prix aux fournisseurs de votre zone, compare les offres ligne par ligne et garde la preuve de chaque commande. En français et en néerlandais.`,
    proof: [
      "Vérification TVA et BCE",
      "Factures Peppol contrôlées",
      "Sans engagement",
    ],
    personasTitle: "Une plateforme, trois métiers",
    personas: {
      contractor: {
        title: "Entrepreneurs",
        points: [
          "Une demande, plusieurs offres",
          "Comparateur ligne par ligne",
          "Entreprises vérifiées (TVA, BCE)",
          "Preuve d’achat et facture contrôlée",
        ],
        cta: "Je suis entrepreneur",
      },
      supplier: {
        title: "Fournisseurs",
        points: [
          "Des demandes qualifiées de votre zone",
          "Réponse en un clic",
          "Inscription gratuite",
          "Relevé clair chaque mois",
        ],
        cta: "Je suis fournisseur",
      },
      architect: {
        title: "Architectes",
        points: [
          "Publiez vos projets gratuitement",
          "Entrepreneurs vérifiés de votre zone",
          "Entreprises en règle (TVA, BCE)",
          "Gratuit, sans limite",
        ],
        cta: "Je suis architecte",
      },
    },
    howTitle: "Comment ça marche",
    how: [
      {
        title: "Décrivez votre besoin",
        text: "Produits, quantités, code postal du chantier. Trois minutes.",
      },
      {
        title: "Les fournisseurs répondent",
        text: "Ils reçoivent un e-mail dans leur langue et envoient leur prix.",
      },
      {
        title: "Comparez et commandez",
        text: "Meilleur prix par ligne, délai, livraison. Vous retenez une offre et payez le fournisseur en direct.",
      },
    ],
    pricingTitle: "Prix de lancement",
    pricingLead:
      "Essayez Premium gratuitement pendant 7 jours, puis choisissez votre plan. Prix de lancement garantis à vie pour les premiers abonnés, HTVA et sans engagement.",
    pricingFrom: (price: string) => `à partir de ${price} / mois`,
    faqTitle: "Questions fréquentes",
    faq: [
      {
        q: "Les fournisseurs doivent-ils s’inscrire ?",
        a: "Non. Ils reçoivent un e-mail et répondent via un lien personnel. S’inscrire leur permet en plus de recevoir les demandes de toute leur zone.",
      },
      {
        q: "Qui paie la commande ?",
        a:
          "Vous payez le fournisseur directement, comme d’habitude. " +
          APP_NAME +
          " garde les preuves : bon de commande, acompte, livraison et facture.",
      },
      {
        q: "Comment vérifiez-vous les entreprises ?",
        a: "Nous contrôlons que le numéro de TVA est valide et que l’entreprise est active à la BCE, puis nous recontrôlons chaque mois et avant chaque accord.",
      },
      {
        q: "Puis-je arrêter quand je veux ?",
        a: "Oui. Les plans sont mensuels ou annuels, sans engagement, et se résilient en ligne.",
      },
    ],
    finalTitle: "Votre prochain chantier mérite trois offres.",
    footer: `© ${new Date().getFullYear()} ${APP_NAME} · Conditions générales · Confidentialité`,
  },
};
