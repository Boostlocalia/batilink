# BatiLink

Plateforme belge pour les PME du bâtiment, en français et en néerlandais.

- **Demandes de prix** : un entrepreneur interroge plusieurs négoces en une fois ; les négoces répondent depuis l'e-mail sans créer de compte, et l'entrepreneur compare les offres côte à côte. Si une offre est retenue, le négoce doit une commission (5 % HTVA par défaut).
- **Questions des fournisseurs** : un négoce qui répond à l'e-mail de demande pose une question ; un agent IA la lit, la transmet à l'entrepreneur dans sa langue et renvoie la réponse. Aucune adresse n'est révélée avant l'attribution.
- **Réseau** : les entrepreneurs sous-traitent du travail, les architectes publient leurs projets gratuitement, les entrepreneurs vérifiés répondent. Quand un entrepreneur abonné (Starter ou Premium) confirme un projet d'architecte, BatiLink facture 5 % HTVA du montant convenu à l'entrepreneur (réglage dans `supabase/functions/_shared/project-commission.ts`).
- **Mes fichiers** : chaque entreprise (entrepreneur, fournisseur, architecte) range ses métrés, listes de prix, plans et photos dans un espace privé (`/fichiers`). Un métré Excel (.xlsx) ou CSV devient une demande de prix en un geste.
- **Vérification** : chaque entrepreneur et architecte est contrôlé (TVA, BCE, dettes sociales et fiscales 30bis) à l'inscription, chaque mois et juste avant chaque accord.
- **Commandes et preuve d'achat** : l'entrepreneur paie le fournisseur en direct ; BatiLink garde la preuve de la transaction. Une offre retenue devient un bon de commande numéroté (BL-2026-000042). Le fournisseur le confirme depuis son e-mail et peut demander un acompte ; l'entrepreneur dépose la preuve de son virement, que le fournisseur reçoit avant de lancer la commande. Réception confirmée, facture Peppol vérifiée automatiquement, preuve de paiement : chaque étape est horodatée et chaque fichier reçoit une empreinte SHA-256.
- **Commission mensuelle** : chaque mois, le fournisseur reçoit le relevé des commandes passées via BatiLink et la commission due, avec un lien de paiement sécurisé (Stripe : Bancontact, carte, virement). Les abonnements se paient aussi par Stripe.
- **Assistant** : un assistant IA accueille chaque type d'utilisateur avec un guide et répond aux questions. Son nom et celui de l'app sont dans `supabase/functions/_shared/brand.ts`.

Une seule base de code produit l'app iOS, l'app Android et le site web (téléphone, tablette, ordinateur).

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `src/app/` | Écrans (Expo Router) : page d'accueil publique (`/bienvenue`), connexion par code e-mail, inscription en 4 étapes adaptée au profil (entrepreneur, fournisseur, architecte), espace fournisseur, fichiers de l'entreprise (`/fichiers`), fournisseurs favoris (`/fournisseurs`), catégories et provinces d'un fournisseur (`/zones`), accueil, nouvelle demande, comparateur d'offres avec questions des fournisseurs, réseau (annonces, projets, accords), abonnement, réglages avec statut de vérification, page publique de réponse fournisseur (`/offre/[token]`). |
| `src/i18n/` | Textes FR et NL. La langue suit l'appareil, se change dans Réglages et est mémorisée. |
| `src/lib/` | Client Supabase, session, calcul des totaux (TVA 21 %), formats belges (dates, TVA, codes postaux). |
| `supabase/migrations/` | Schéma Postgres, règles d'accès (RLS), catégories de produits et métiers. |
| `supabase/functions/` | Fonctions serveur : envoi de la demande, réponse fournisseur, choix de l'offre et commission, relances, réception des e-mails (`inbound-email`), réponses dans l'app (`quote-message`), vérification (`verify-company`), accords (`accept-agreement`), assistant (`assistant`), accueil après inscription (`welcome`), espace fournisseur (`supplier-space`), invitation d'un fournisseur habituel (`invite-supplier`), essais, e-mails d'activation et parrainage (`lifecycle`). |
| `supabase/functions/_shared/` | Règles partagées par l'app et le serveur : abonnements, commission, vérification, noms (`brand.ts`), connaissances de l'assistant (`assistant-prompt.ts`). |
| `scripts/import-kbo.mjs` | Chargement mensuel des données ouvertes de la BCE. |

## Abonnements

| | Test | Starter | Premium |
| --- | --- | --- | --- |
| Prix HTVA / mois | 0 € | 69,99 € | 129,99 € |
| Prix HTVA / an (2 mois offerts) | 0 € | 699,90 € | 1 299,90 € |
| Réseau entrepreneurs | 3 échanges par mois (annonce ou réponse) | Illimité | Illimité |
| Fournisseurs | Consultation, sans envoi de demande de prix | Non inclus | Demandes de prix illimitées |
| Utilisateurs | 1 | 2 | 5 |

Dans la base, les plans gardent leurs identifiants `free`, `pro` et `full`. Les architectes publient gratuitement ; un projet confirmé par un entrepreneur abonné donne lieu à une commission de 5 % HTVA. Les fournisseurs s'inscrivent gratuitement et paient 5 % HTVA sur les ventes passées par BatiLink.

## Inscription et conversion

- **Inscription par profil** : profil, entreprise (TVA avec nom trouvé à la BCE, adresse, contact, taille), activité (métiers, types de chantiers et achats mensuels pour un entrepreneur ; type, catégories, provinces, livraison, enlèvement, minimum de commande et adresse des demandes pour un fournisseur ; numéro d'architecte, projets pour un architecte), puis origine, code de parrainage et conditions. Un fournisseur accepte la commission à l'inscription. La province est déduite du code postal.
- **Essai** : chaque nouvel entrepreneur a 14 jours de Premium (30 avec un code de parrainage), sans carte. `lifecycle` prévient 3 jours avant la fin puis repasse l'entreprise en Gratuit.
- **Parrainage** : chaque entreprise a un lien `/bienvenue?ref=CODE`. Quand l'entreprise parrainée est vérifiée, le parrain reçoit un mois de Premium (gratuit ou en essai), 69,99 € HTVA de crédit Stripe (abonné) ou 69,99 € HTVA déduits de son relevé de commission (fournisseur).
- **Fournisseurs favoris** : un entrepreneur invite ses fournisseurs habituels par e-mail ; ils reçoivent ses demandes en priorité, même hors zone, et rejoignent BatiLink avec le lien d'invitation.
- **E-mails** : bienvenue, activation (entre 2 et 14 jours si rien n'a été fait), fin d'essai, relance mensuelle des entrepreneurs inactifs, récompense de parrainage. Chaque e-mail part une seule fois (`lifecycle_messages`).
- **Pilotage** : les vues `funnel_weekly` (inscriptions, entreprises vérifiées, actives et payantes, par semaine et par profil) et `revenue_monthly` (abonnements et commissions par mois) sont réservées au back-office.

## Données et volume

- `events` : journal de tout ce qui se passe (demandes envoyées, offres, attributions, messages relayés, vérifications), en ajout seul, indexé pour de gros volumes.
- `price_observations` : les prix unitaires remis, par produit, catégorie et région, prêts pour des statistiques de marché.
- `commission_statements` : le relevé mensuel des commissions à facturer par fournisseur.
- `purchase_orders`, `order_documents`, `order_links` : les bons de commande, leurs pièces (preuves d'acompte, bons de livraison, factures) et les liens envoyés aux fournisseurs.
- `payments`, `commission_bills` : les relevés mensuels de commission et leurs paiements Stripe.
- `company_checks` : l'historique de chaque contrôle, avec la réponse brute du registre comme preuve.
- `project_commissions` : la commission de 5 % sur les projets d'architectes confirmés, ajoutée au relevé mensuel de celui qui la paie.
Ces tables sont réservées au back-office : l'app ne peut pas les lire.

## Vérification des entreprises

| Contrôle | Source | Branchement |
| --- | --- | --- |
| Numéro de TVA actif | VIES (Commission européenne) | Aucun, service public. |
| Entreprise active, activité construction (41-43) ou architecture (71.11) | Données ouvertes de la BCE | Télécharger l'extrait mensuel complet sur [kbopub.economie.fgov.be/kbo-open-data](https://kbopub.economie.fgov.be/kbo-open-data), le dézipper, puis `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-kbo.mjs <dossier>`. |
| Dettes sociales (ONSS, INASTI) et fiscales (SPF Finances), art. 30bis | Service REST `billRetainment` de l'ONSS | L'entreprise qui exploite BatiLink doit désigner un gestionnaire d'accès, activer le canal REST dans Chaman avec un certificat, puis renseigner `BILLRETAINMENT_CLIENT_ID` et `BILLRETAINMENT_PRIVATE_KEY`. Valider d'abord en simulation (`BILLRETAINMENT_ENV` différent de `production`) : le format exact des réponses est à confirmer avec la spécification officielle. Contact : billretainment30bis@onss.fgov.be. |

Tant qu'un registre n'est pas branché ou ne répond pas, l'entreprise reste « à compléter » : elle n'est jamais validée par défaut, et un accord est bloqué. Avant chaque accord, les deux entreprises sont recontrôlées en direct. Si le sous-traitant a des dettes, le donneur d'ordre doit confirmer qu'il fera les retenues légales avant que l'accord soit confirmé.

## Commandes, preuve d'achat et paiements

| Étape | Qui | Preuve conservée |
| --- | --- | --- |
| Offre remise | Fournisseur | Acceptation des conditions de commission, horodatée |
| Offre retenue | Entrepreneur | Bon de commande numéroté, montants figés |
| Commande confirmée, acompte éventuel | Fournisseur (lien e-mail) | Date de confirmation, montant de l'acompte, IBAN |
| Acompte | Entrepreneur paie le fournisseur en direct | Capture ou PDF du virement (empreinte SHA-256) transmis au fournisseur, qui confirme la réception |
| Réception | Entrepreneur | Date, bon de livraison en option |
| Facture | Entrepreneur | Facture Peppol (UBL) comparée à la commande : TVA du fournisseur, TVA de l'entrepreneur, numéro de commande, montant. Une même facture ne peut servir qu'une fois. |
| Paiement | Entrepreneur paie le fournisseur en direct | Preuve de paiement transmise au fournisseur |

La commission suit le montant facturé quand la facture correspond. Elle est due dès que la vente est prouvée (réception, preuve de paiement, facture conforme, ou 45 jours après la confirmation du fournisseur) ; sinon elle attend le mois suivant. Le 2 de chaque mois, `bill-commissions` envoie à chaque fournisseur, et à chaque entrepreneur qui doit une commission de projet, le relevé détaillé (numéro de commande, entrepreneur, montant, commission) avec un lien de paiement sécurisé. Faites valider les conditions générales des fournisseurs (commission, acompte, référence de commande sur la facture) par un avocat.

**Facturation de BatiLink** : depuis 2026, les factures entre entreprises belges passent par Peppol. Les relevés `BL-COM-…` servent de référence ; la facture de commission elle-même part du logiciel comptable de la société qui exploite BatiLink, déjà relié à Peppol, avec le même numéro.

### Brancher Stripe

Stripe sert à encaisser les abonnements et les commissions ; les commandes se paient en direct entre entrepreneur et fournisseur.

1. Créer le compte Stripe de l'entreprise qui exploite BatiLink (Belgique).
2. Créer deux produits (Starter, Premium), chacun avec un prix mensuel (69,99 €, 129,99 € HTVA) et un prix annuel (699,90 €, 1 299,90 € HTVA), et noter les quatre identifiants de prix.
3. Activer le **portail client** (changement de plan, moyen de paiement, factures, résiliation) et, si souhaité, **Stripe Tax**.
4. Créer un point de terminaison webhook vers `https://<ref>.supabase.co/functions/v1/stripe-webhook` avec les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Renseigner les secrets :
   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
     STRIPE_PRICE_PRO=price_... STRIPE_PRICE_FULL=price_... \
     STRIPE_PRICE_PRO_YEAR=price_... STRIPE_PRICE_FULL_YEAR=price_... STRIPE_AUTOMATIC_TAX=on
   ```
   Commencer avec les clés de test (`sk_test_…`). Sans `STRIPE_SECRET_KEY`, le choix d'un plan indique que le paiement n'est pas encore activé et le lien du relevé de commission ne s'ouvre pas.

## Agent IA

- **Questions des fournisseurs** : chaque e-mail d'invitation a une adresse de réponse propre à l'offre (`s-<clé>@reply.votre-domaine.be`). Configurer la réception (« Inbound parsing » de Brevo) sur le sous-domaine `reply` pour appeler `https://<ref>.supabase.co/functions/v1/inbound-email?secret=<INBOUND_EMAIL_SECRET>`. L'expéditeur est contrôlé (même adresse, ou même domaine d'entreprise), l'historique cité est retiré, puis Claude réécrit le message pour l'autre partie dans sa langue sans coordonnées. Sans clé Claude, le message est transmis tel quel.
- **Assistant** : répond à partir de `assistant-prompt.ts`, à mettre à jour quand l'app change.

## Mettre en ligne pour tester

- **Site web, Netlify** (même compte que boostlocal.be) : « Add new site → Import an existing project → GitHub → batilink », branche `signup-conversion`. `netlify.toml` donne la commande de build, les variables publiques de Supabase et la redirection vers l'app : rien d'autre à remplir. Une adresse comme `app.boostlocal.be` ou `batilink.be` s'ajoute ensuite dans « Domain management ». Après le passage sur Netlify, mettre `EXPO_PUBLIC_APP_URL` à cette adresse dans `netlify.toml` (liens de parrainage).
- **Site web, GitHub Pages** (version de test) : publié sur GitHub Pages, [boostlocalia.github.io/batilink](https://boostlocalia.github.io/batilink). Chaque push sur `signup-conversion` le reconstruit (`.github/workflows/deploy-web.yml`) dans la branche `gh-pages`. Réglage unique : GitHub → Settings → Pages → « Deploy from a branch », branche `gh-pages`, dossier `/ (root)`. `vercel.json` permet aussi un hébergement Vercel.
- **Fonctions serveur** : ajouter le secret `SUPABASE_ACCESS_TOKEN` au dépôt GitHub (Settings → Secrets and variables → Actions), puis lancer « Deploy Supabase functions » dans l'onglet Actions. Elles se redéploient ensuite à chaque modification.
- **Connexion par code** : Supabase → Authentication → Emails, modèle « Magic link » avec `{{ .Token }}`. Sans fournisseur d'e-mails branché, Supabase n'envoie qu'aux membres de l'organisation, quelques e-mails par heure : suffisant pour tester soi-même, pas pour des testeurs externes (brancher Brevo en SMTP dans Authentication → Emails → SMTP).

## Mise en route

1. Le projet Supabase existe : **batilink**, réf. `bkmzstdviytslegbxsax`, région Frankfurt (eu-central-1), URL `https://bkmzstdviytslegbxsax.supabase.co`. Tout le schéma de `supabase/migrations/` y est installé.
2. Installer les dépendances : `npm install`.
3. Lier le projet :
   ```bash
   npx supabase login
   npx supabase link --project-ref bkmzstdviytslegbxsax
   ```
   Le schéma a été installé par le connecteur Supabase, sous d'autres numéros de version que les fichiers. Avant le premier `npx supabase db push`, aligner l'historique : `npx supabase migration list`, puis `npx supabase migration repair --status applied <version>` pour chaque fichier déjà installé (tous ceux présents aujourd'hui) et `--status reverted` pour les versions distantes qui n'ont pas de fichier. Un nouveau projet vide s'installe simplement avec `npx supabase db push`.
4. Configurer les secrets des fonctions puis les déployer :
   ```bash
   npx supabase secrets set BREVO_API_KEY=... EMAIL_FROM=demandes@votre-domaine.be APP_URL=https://app.votre-domaine.be \
     CRON_SECRET=$(openssl rand -hex 24) INBOUND_EMAIL_SECRET=$(openssl rand -hex 24) \
     RELAY_EMAIL_DOMAIN=reply.votre-domaine.be ANTHROPIC_API_KEY=...
   npx supabase functions deploy
   ```
   Sans `BREVO_API_KEY`, les e-mails sont écrits dans les journaux au lieu d'être envoyés.
5. Programmer les relances toutes les heures (SQL editor de Supabase, extensions `pg_cron` et `pg_net` activées) :
   ```sql
   select cron.schedule('remind-suppliers', '0 * * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/remind-suppliers',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
     )
   $$);
   select cron.schedule('verify-companies', '15 3 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/verify-company',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
     )
   $$);
   select cron.schedule('lifecycle', '0 8 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/lifecycle',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
     )
   $$);
   select cron.schedule('bill-commissions', '0 6 2 * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/bill-commissions',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
     )
   $$);
   ```
   La deuxième tâche recontrôle chaque nuit les entreprises dont la dernière vérification date de plus de 30 jours. La troisième gère chaque matin les essais, les e-mails d'activation et les parrainages. La quatrième envoie le 2 de chaque mois les relevés de commission du mois précédent.
6. Copier `.env.example` en `.env` et le remplir (`EXPO_PUBLIC_SUPABASE_URL=https://bkmzstdviytslegbxsax.supabase.co`, et la clé publique du projet, Supabase → Project Settings → API Keys, `sb_publishable_…`), puis lancer l'app : `npm run web`, `npm run ios` ou `npm run android`.
7. Dans Supabase → Authentication → Email templates, mettre `{{ .Token }}` dans le modèle « Magic link » pour que l'e-mail de connexion contienne le code à 6 chiffres.

### Ajouter les fournisseurs démarchés

Les fournisseurs peuvent s'inscrire eux-mêmes (profil « Fournisseur ») ou être invités par un entrepreneur. Ceux qu'on démarche sans compte s'ajoutent dans la base, avec les catégories et les débuts de codes postaux qu'ils couvrent (`14` couvre 1400 à 1499) :

```sql
insert into companies (kind, name, email, language, city, vat_number)
values ('supplier', 'Négoce Exemple', 'offres@exemple.be', 'fr', 'Wavre', 'BE0123456789')
returning id;

insert into supplier_coverage (supplier_id, category_id, postal_prefix)
select '<id>', id, '13' from categories where slug in ('gros-oeuvre', 'isolation');
```

## Vérifications

```bash
npm run typecheck   # TypeScript de l'app
npm run lint        # ESLint
npm test            # tests unitaires (abonnements, totaux, formats, e-mails, liens, relais, vérification)
cd supabase/functions && npx deno check --node-modules-dir=none */index.ts   # TypeScript des fonctions serveur
```

## Sécurité

- Chaque entreprise ne voit que ses propres demandes et offres (RLS Postgres).
- Le lien envoyé au fournisseur contient un jeton aléatoire ; seule son empreinte SHA-256 est stockée, et l'app ne peut pas la lire. Le lien expire après 14 jours ; une relance envoie un nouveau lien.
- Les limites d'abonnement sont vérifiées par le serveur, pas seulement par l'app.
- Une entreprise ne peut modifier que son nom, sa langue et son adresse : statut de vérification, commission et retenues sont écrits par le serveur. Les adresses e-mail des autres entreprises ne sont pas lisibles ; elles sont partagées une fois un accord confirmé.
- Les messages reçus par e-mail sont traités comme du contenu à relayer, jamais comme des instructions pour l'IA.
- Paiements : les commandes se paient en direct entre entrepreneur et fournisseur. Abonnements et commissions se paient sur les pages de Stripe : les données de carte et de compte ne passent jamais par BatiLink. Un paiement n'est marqué payé et un plan ne change que sur un webhook dont la signature Stripe est vérifiée. Les montants et la commission sont calculés par le serveur.
- Documents : bucket privé, type de fichier vérifié sur son contenu (pas sur son nom), 10 Mo maximum, empreinte SHA-256 conservée ; le fournisseur les consulte par un lien signé valable 5 minutes. Chaque étape d'une commande n'est possible qu'au bon moment et par la bonne partie.
