import { OPERATOR as O, type LegalTexts } from "./types";

const P = `${O.name} (numéro d’entreprise ${O.enterprise}, TVA ${O.vat}), ${O.address}`;

export const legalFr: LegalTexts = {
  updated: "En vigueur depuis le 21 octobre 2026",
  nav: {
    mentions: "Mentions légales",
    conditions: "Conditions générales",
    confidentialite: "Confidentialité",
    cookies: "Cookies",
    suppression: "Supprimer mon compte",
  },
  docs: {
    mentions: {
      title: "Mentions légales",
      sections: [
        {
          title: "Éditeur",
          body: [
            `BatiNode (${O.site}) est édité et exploité par ${P}.`,
            `Contact : ${O.email}.`,
          ],
        },
        {
          title: "Hébergement",
          body: [
            "L’application web est servie par GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis).",
            "Les données des comptes, les demandes, les offres et les fichiers sont hébergés par Supabase, Inc. dans un centre de données situé à Francfort (Allemagne, Union européenne).",
          ],
        },
        {
          title: "Propriété intellectuelle",
          body: [
            `La marque BatiNode, le logo, Nodi, les textes, les illustrations et le code de l’application appartiennent à ${O.name}. Toute reproduction sans autorisation écrite est interdite.`,
            "Les noms, logos et contenus des entreprises inscrites restent la propriété de ces entreprises.",
          ],
        },
        {
          title: "Signaler un contenu",
          body: [
            `Pour signaler un contenu illicite ou une erreur, écrivez à ${O.email}. Nous répondons dans les meilleurs délais.`,
          ],
        },
      ],
    },

    conditions: {
      title: "Conditions générales d’utilisation et de vente",
      sections: [
        {
          title: "1. Objet",
          body: [
            `Les présentes conditions régissent l’utilisation de BatiNode, plateforme exploitée par ${P}, et les abonnements qui y sont vendus.`,
            "En créant un compte, en répondant à une demande de prix ou en utilisant l’application, vous acceptez ces conditions au nom de l’entreprise que vous représentez.",
          ],
        },
        {
          title: "2. Une plateforme réservée aux professionnels",
          body: [
            "BatiNode s’adresse uniquement aux entreprises : entrepreneurs du bâtiment, fournisseurs de matériaux et architectes. Chaque entreprise doit disposer d’un numéro d’entreprise belge actif.",
            "Nous vérifions le numéro de TVA (VIES) et l’inscription à la Banque-Carrefour des Entreprises, à l’inscription puis régulièrement. Un compte dont l’entreprise n’est pas active ou dont les informations sont inexactes peut être suspendu.",
            "Vous êtes responsable des informations que vous donnez, de la confidentialité de votre mot de passe et de ce qui est fait avec votre compte. Signalez-nous sans attendre tout usage non autorisé.",
          ],
        },
        {
          title: "3. Les services",
          body: [
            "BatiNode permet notamment : d’envoyer des demandes de prix à des fournisseurs et de comparer leurs offres, d’émettre des bons de commande, d’échanger avec d’autres entreprises dans le Réseau d’entrepreneurs (sous-traitance et partenariats), de gérer des fichiers, et d’être aidé par Nodi, l’assistant de BatiNode.",
            "Les fonctions disponibles dépendent de l’abonnement choisi, comme indiqué sur la page Abonnement de l’application.",
          ],
        },
        {
          title: "4. Le rôle de BatiNode",
          body: [
            "BatiNode met en relation des entreprises. Nous ne sommes pas partie aux contrats conclus entre elles : la vente de matériaux est conclue directement entre l’entrepreneur et le fournisseur, aux conditions de leur offre et de leur bon de commande.",
            "Nous ne garantissons ni les prix, ni la qualité, ni les délais, ni la solvabilité des utilisateurs. La vérification des entreprises réduit les risques mais ne les supprime pas.",
            "Lorsqu’aucun fournisseur n’est choisi par l’entrepreneur, BatiNode sélectionne des fournisseurs de la région selon leur activité et leur proximité, sans contrepartie de leur part.",
          ],
        },
        {
          title: "5. Abonnements des entrepreneurs",
          body: [
            "Un nouvel entrepreneur peut essayer gratuitement l’abonnement Premium pendant 7 jours, sans carte de paiement. À la fin de l’essai, l’accès aux fonctions payantes s’arrête jusqu’au choix d’un abonnement.",
            "Prix de lancement hors TVA : Starter 69,99 € par mois ou 699,90 € par an ; Premium 129,99 € par mois ou 1 299,90 € par an. La TVA belge s’ajoute au prix.",
            "Garantie fondateur : une entreprise qui s’abonne pendant la phase de lancement, c’est-à-dire parmi les 50 premières entreprises à payer un abonnement et au plus tard le 31 mars 2027 (heure belge), reçoit un numéro de fondateur et garde son prix de lancement à vie, tant que son abonnement reste actif sans interruption et sur le même plan. Le fondateur peut passer une seule fois de Starter à Premium en gardant cette garantie, au prix de lancement de Premium. Elle prend fin si l’abonnement est résilié, s’il passe à une formule inférieure ou s’il change de formule une seconde fois.",
            "Le paiement est traité par Stripe. L’abonnement est payable d’avance et se renouvelle automatiquement à la fin de chaque période, au prix en vigueur.",
            "Satisfait ou remboursé : votre premier paiement d’abonnement vous est remboursé intégralement si vous le demandez à support@batinode.be dans les 30 jours qui le suivent, sans justification. L’abonnement est alors résilié et la place de fondateur éventuelle n’est pas réattribuée. Cette garantie ne vaut qu’une fois par entreprise.",
            "Vous pouvez résilier à tout moment depuis l’application : la résiliation prend effet à la fin de la période payée, sans remboursement de la période en cours.",
            "Sous réserve de la garantie fondateur, nous annonçons toute hausse de prix au moins 30 jours à l’avance ; elle s’applique à partir de la période suivante et vous pouvez résilier avant.",
            "Les abonnements étant vendus à des entreprises, le droit de rétractation prévu pour les consommateurs ne s’applique pas.",
          ],
        },
        {
          title: "6. Fournisseurs",
          body: [
            "Un fournisseur peut répondre à une demande de prix depuis le lien reçu par e-mail, sans compte. Répondre est gratuit.",
            "Une offre remise engage le fournisseur aux prix et conditions indiqués, jusqu’à sa date de validité. Le fournisseur reste responsable de son offre, y compris lorsqu’il a joint un PDF et que Nodi en a repris les prix : il vérifie le formulaire avant de l’envoyer.",
            "Si une commission sur les commandes devait être introduite, son taux serait affiché et accepté expressément avant toute offre concernée. Elle ne s’appliquerait jamais aux offres déjà remises.",
            "Un fournisseur peut cesser de recevoir les demandes à tout moment, en un clic depuis l’e-mail ou la page de l’offre.",
          ],
        },
        {
          title: "7. Nodi et l’intelligence artificielle",
          body: [
            "Nodi utilise un modèle d’intelligence artificielle pour répondre aux questions, lire les offres jointes en PDF, rédiger les actualités et reformuler ou traduire les messages entre entrepreneurs et fournisseurs. Les coordonnées sont retirées des messages relayés.",
            "Les réponses de Nodi peuvent contenir des erreurs. Elles ne remplacent pas un conseil professionnel (technique, juridique ou fiscal). Vérifiez toujours les montants et les informations importantes.",
            "Les actualités publiées par Nodi résument des articles de sources externes, dont le lien est indiqué. Ces sources restent responsables de leur contenu.",
          ],
        },
        {
          title: "8. Usages interdits",
          body: [
            "Il est interdit notamment : de publier un contenu illicite, trompeur, injurieux ou portant atteinte aux droits d’autrui ; d’envoyer des messages publicitaires non sollicités ; d’extraire en masse les données de la plateforme ; de tenter d’accéder aux comptes ou données d’autrui ; de perturber le fonctionnement du service ; de créer un compte pour une entreprise que vous ne représentez pas.",
          ],
        },
        {
          title: "9. Vos contenus",
          body: [
            "Vous restez propriétaire des contenus que vous déposez (demandes, offres, fichiers, messages, logo). Vous nous accordez le droit de les héberger, de les afficher aux destinataires choisis et de les traiter dans la seule mesure nécessaire au fonctionnement du service.",
          ],
        },
        {
          title: "10. Disponibilité et responsabilité",
          body: [
            "Nous faisons le nécessaire pour que BatiNode soit disponible et sûr, sans pouvoir garantir un service sans interruption ni erreur. Des maintenances peuvent avoir lieu.",
            `Sauf faute intentionnelle ou faute grave, la responsabilité de ${O.name} est limitée aux dommages directs et plafonnée aux montants payés par votre entreprise à BatiNode pendant les 12 mois précédant le fait dommageable. Nous ne répondons pas des dommages indirects, tels que perte de chiffre d’affaires, de clientèle ou de données.`,
          ],
        },
        {
          title: "11. Suspension et fin",
          body: [
            "Vous pouvez arrêter d’utiliser BatiNode et demander la suppression de votre compte à tout moment.",
            "Nous pouvons suspendre ou fermer un compte qui ne respecte pas ces conditions, après un avertissement sauf urgence (fraude, sécurité, contenu illicite).",
          ],
        },
        {
          title: "12. Données personnelles",
          body: [
            "Le traitement des données personnelles est décrit dans la politique de confidentialité, qui fait partie des présentes conditions.",
          ],
        },
        {
          title: "13. Modification des conditions",
          body: [
            "Nous pouvons adapter ces conditions. Toute modification importante vous est annoncée au moins 30 jours avant son entrée en vigueur, par e-mail ou dans l’application. Si vous refusez la modification, vous pouvez résilier avant cette date.",
          ],
        },
        {
          title: "14. Droit applicable et litiges",
          body: [
            "Ces conditions sont soumises au droit belge. En cas de désaccord, écrivez-nous d’abord : nous cherchons une solution amiable.",
            "À défaut, les tribunaux de l’arrondissement judiciaire de Bruxelles sont seuls compétents.",
          ],
        },
      ],
    },

    confidentialite: {
      title: "Politique de confidentialité",
      sections: [
        {
          title: "Responsable du traitement",
          body: [
            `${P} est responsable du traitement des données personnelles collectées via BatiNode. Pour toute question ou demande : ${O.email}.`,
          ],
        },
        {
          title: "Données traitées",
          body: [
            "Compte : nom, adresse e-mail, téléphone, langue et mot de passe (conservé uniquement sous forme chiffrée).",
            "Entreprise : nom, numéro de TVA, adresse, données publiques de la Banque-Carrefour des Entreprises, logo, métiers, zones d’activité, taille et informations données à l’inscription.",
            "Activité : demandes de prix, offres, bons de commande, documents, fichiers, messages, publications dans le Réseau d’entrepreneurs et questions posées à Nodi.",
            "Paiement : l’abonnement et son état. Les données de carte sont traitées directement par Stripe ; nous n’y avons pas accès.",
            "Technique : journaux de connexion et d’erreurs, adresse IP, pour la sécurité du service.",
            "Fournisseurs : l’annuaire contient des coordonnées professionnelles de fournisseurs de matériaux (nom de l’entreprise, adresse, e-mail et téléphone professionnels, activité), issues de sources publiques comme leur site internet ou la Banque-Carrefour des Entreprises.",
          ],
        },
        {
          title: "Pourquoi et sur quelle base",
          body: [
            "Fournir le service (compte, demandes, offres, commandes, Réseau d’entrepreneurs, abonnement) : exécution du contrat.",
            "Facturation et comptabilité : obligation légale.",
            "Vérifier les entreprises, prévenir la fraude, sécuriser la plateforme : intérêt légitime à garder une plateforme fiable.",
            "Transmettre les demandes de prix aux fournisseurs de l’annuaire : intérêt légitime des entrepreneurs et des fournisseurs à se rencontrer entre professionnels. Chaque e-mail permet de s’y opposer en un clic.",
            "Vous informer des évolutions du service : intérêt légitime ; vous pouvez vous y opposer à tout moment.",
          ],
        },
        {
          title: "Qui voit vos données",
          body: [
            "Les fournisseurs à qui une demande est envoyée voient le nom, le numéro de TVA et l’adresse de l’entreprise qui demande, ainsi que le contenu de la demande. L’entrepreneur voit les offres et le nom des fournisseurs. Les coordonnées personnelles sont retirées des messages relayés.",
            "Nos sous-traitants, uniquement pour faire fonctionner BatiNode : Supabase (base de données et fichiers, Francfort, UE), GitHub (hébergement de l’application web), Brevo (envoi des e-mails, France), Stripe (paiements) et Anthropic (le modèle d’intelligence artificielle de Nodi). Selon ses conditions commerciales, Anthropic n’utilise pas ces données pour entraîner ses modèles.",
            "Uniquement si vous l’acceptez dans le bandeau cookies de la version web : Meta Platforms Ireland (pixel Meta), pour mesurer nos publicités Facebook et Instagram. Il reçoit les pages visitées et le fait qu’une inscription ou un abonnement a eu lieu, jamais vos coordonnées, et ne fonctionne jamais sur les liens envoyés aux fournisseurs.",
            "Certains de ces prestataires peuvent traiter des données hors de l’Union européenne, notamment aux États-Unis. Ces transferts sont encadrés par le cadre de protection des données UE–États-Unis ou par les clauses contractuelles types de la Commission européenne.",
            "Les membres connectés de BatiNode voient, dans la liste des entrepreneurs inscrits, le nom de votre entreprise, votre commune, vos métiers et les badges « Vérifié BCE » et « Fondateur ». Jamais votre e-mail, votre téléphone ni votre numéro de TVA. Vous pouvez quitter cette liste à tout moment dans Réglages.",
            "Nous ne vendons jamais vos données.",
          ],
        },
        {
          title: "Durée de conservation",
          body: [
            "Les données du compte et de l’activité sont conservées tant que le compte est actif, puis supprimées ou anonymisées dans les 30 jours d’une demande de suppression, sauf ce que la loi nous oblige à garder (factures et pièces comptables, pendant la durée légale).",
            "Les journaux techniques sont conservés au plus 12 mois.",
            "Les coordonnées d’un fournisseur de l’annuaire sont conservées jusqu’à ce qu’il s’y oppose ; nous gardons alors seulement de quoi respecter son refus.",
          ],
        },
        {
          title: "Vos droits",
          body: [
            `Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, la limitation du traitement, leur portabilité, et vous opposer au traitement fondé sur notre intérêt légitime. Écrivez à ${O.email} ; nous répondons dans un délai d’un mois.`,
            "Vous pouvez aussi introduire une plainte auprès de l’Autorité de protection des données, rue de la Presse 35, 1000 Bruxelles (www.autoriteprotectiondonnees.be).",
          ],
        },
        {
          title: "Sécurité",
          body: [
            "Les échanges sont chiffrés (HTTPS), les mots de passe sont chiffrés, chaque entreprise n’accède qu’à ses propres données, les fichiers sont privés et ne s’ouvrent que par des liens temporaires, et l’accès d’administration est limité.",
          ],
        },
      ],
    },

    cookies: {
      title: "Cookies et stockage local",
      sections: [
        {
          title: "Ce que nous utilisons",
          body: [
            "Sur la version web, le pixel Meta (Facebook, Instagram) ne s’active que si vous cliquez sur « Accepter » dans le bandeau ; « Refuser » est aussi simple. Il sert à mesurer nos publicités : pages vues, inscription, abonnement, sans vos coordonnées. Il dépose le cookie « _fbp » (jusqu’à 90 jours) et transmet ces informations à Meta Platforms Ireland, qui peut les relier à votre compte Facebook ou Instagram. Votre choix est gardé 6 mois ; le lien « Choix cookies » en bas des pages publiques permet de le changer. L’application iPhone et Android n’utilise pas ce pixel.",
            "Pour le reste, l’application garde dans votre navigateur ou votre téléphone uniquement ce qui est nécessaire à son fonctionnement : votre session de connexion, la langue choisie et quelques préférences d’affichage (par exemple un brouillon de demande en cours). Ces éléments sont strictement nécessaires et ne demandent donc pas de consentement.",
          ],
        },
        {
          title: "Paiement",
          body: [
            "La page de paiement est fournie par Stripe sur son propre site. Stripe y utilise ses cookies, nécessaires à la sécurité du paiement et à la prévention de la fraude, selon sa propre politique.",
          ],
        },
        {
          title: "Les effacer",
          body: [
            "Vous pouvez effacer ces données à tout moment en vous déconnectant ou depuis les réglages de votre navigateur. Vous devrez alors vous reconnecter.",
          ],
        },
      ],
    },
    suppression: {
      title: "Supprimer votre compte BatiNode",
      sections: [
        {
          title: "Depuis l’application",
          body: [
            "Ouvrez Réglages, puis « Supprimer mon compte », et confirmez. La suppression est immédiate et définitive.",
          ],
        },
        {
          title: "Sans l’application",
          body: [
            `Écrivez à ${O.email} depuis l’adresse e-mail de votre compte en demandant la suppression. Nous la faisons dans les 30 jours et vous le confirmons.`,
          ],
        },
        {
          title: "Ce qui est supprimé",
          body: [
            "Votre accès et vos données personnelles. Si vous êtes le dernier utilisateur de votre entreprise : son abonnement est arrêté, ses fichiers, son logo, ses annonces et ses conversations sont effacés.",
            "Ce qui est conservé : les commandes, offres et pièces comptables dont vos partenaires ou nous-mêmes avons besoin pour respecter la loi, pendant la durée légale, sans vos coordonnées.",
          ],
        },
      ],
    },
  },
};
