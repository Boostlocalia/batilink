# BatiLink

Plateforme belge pour les PME du bâtiment, en français et en néerlandais.

- **Demandes de prix** : un entrepreneur interroge plusieurs négoces en une fois ; les négoces répondent depuis l'e-mail sans créer de compte, et l'entrepreneur compare les offres côte à côte. Si une offre est retenue, le négoce doit une commission (5 % HTVA par défaut).
- **Questions des fournisseurs** : un négoce qui répond à l'e-mail de demande pose une question ; un agent IA la lit, la transmet à l'entrepreneur dans sa langue et renvoie la réponse. Aucune adresse n'est révélée avant l'attribution.
- **Réseau** : les entrepreneurs sous-traitent du travail, les architectes publient leurs projets, les entrepreneurs vérifiés répondent.
- **Vérification** : chaque entrepreneur et architecte est contrôlé (TVA, BCE, dettes sociales et fiscales 30bis) à l'inscription, chaque mois et juste avant chaque accord.
- **Assistant** : un assistant IA accueille chaque type d'utilisateur avec un guide et répond aux questions. Son nom et celui de l'app sont dans `supabase/functions/_shared/brand.ts`.

Une seule base de code produit l'app iOS, l'app Android et le site web (téléphone, tablette, ordinateur). Le paiement en ligne des abonnements vient ensuite.

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `src/app/` | Écrans (Expo Router) : connexion par code e-mail, création de l'entreprise (entrepreneur ou architecte), accueil, nouvelle demande, comparateur d'offres avec questions des fournisseurs, réseau (annonces, projets, accords), abonnement, réglages avec statut de vérification, page publique de réponse fournisseur (`/offre/[token]`). |
| `src/i18n/` | Textes FR et NL. La langue suit l'appareil, se change dans Réglages et est mémorisée. |
| `src/lib/` | Client Supabase, session, calcul des totaux (TVA 21 %), formats belges (dates, TVA, codes postaux). |
| `supabase/migrations/` | Schéma Postgres, règles d'accès (RLS), catégories de produits et métiers. |
| `supabase/functions/` | Fonctions serveur : envoi de la demande, réponse fournisseur, choix de l'offre et commission, relances, réception des e-mails (`inbound-email`), réponses dans l'app (`quote-message`), vérification (`verify-company`), accords (`accept-agreement`), assistant (`assistant`). |
| `supabase/functions/_shared/` | Règles partagées par l'app et le serveur : abonnements, commission, vérification, noms (`brand.ts`), connaissances de l'assistant (`assistant-prompt.ts`). |
| `scripts/import-kbo.mjs` | Chargement mensuel des données ouvertes de la BCE. |

## Abonnements

| | Gratuit | Pro | Complet |
| --- | --- | --- | --- |
| Prix HTVA / mois | 0 € | 39 € | 89 € |
| Demandes de prix | 1 d'essai par mois, 3 fournisseurs max | 1 d'essai par mois | Illimitées |
| Réseau entrepreneurs | Consultation | Publier, répondre, accords | Publier, répondre, accords |

Les architectes utilisent le réseau gratuitement.

## Données et volume

- `events` : journal de tout ce qui se passe (demandes envoyées, offres, attributions, messages relayés, vérifications), en ajout seul, indexé pour de gros volumes.
- `price_observations` : les prix unitaires remis, par produit, catégorie et région, prêts pour des statistiques de marché.
- `commission_statements` : le relevé mensuel des commissions à facturer par fournisseur.
- `company_checks` : l'historique de chaque contrôle, avec la réponse brute du registre comme preuve.
Ces tables sont réservées au back-office : l'app ne peut pas les lire.

## Vérification des entreprises

| Contrôle | Source | Branchement |
| --- | --- | --- |
| Numéro de TVA actif | VIES (Commission européenne) | Aucun, service public. |
| Entreprise active, activité construction (41-43) ou architecture (71.11) | Données ouvertes de la BCE | Télécharger l'extrait mensuel complet sur [kbopub.economie.fgov.be/kbo-open-data](https://kbopub.economie.fgov.be/kbo-open-data), le dézipper, puis `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-kbo.mjs <dossier>`. |
| Dettes sociales (ONSS, INASTI) et fiscales (SPF Finances), art. 30bis | Service REST `billRetainment` de l'ONSS | L'entreprise qui exploite BatiLink doit désigner un gestionnaire d'accès, activer le canal REST dans Chaman avec un certificat, puis renseigner `BILLRETAINMENT_CLIENT_ID` et `BILLRETAINMENT_PRIVATE_KEY`. Valider d'abord en simulation (`BILLRETAINMENT_ENV` différent de `production`) : le format exact des réponses est à confirmer avec la spécification officielle. Contact : billretainment30bis@onss.fgov.be. |

Tant qu'un registre n'est pas branché ou ne répond pas, l'entreprise reste « à compléter » : elle n'est jamais validée par défaut, et un accord est bloqué. Avant chaque accord, les deux entreprises sont recontrôlées en direct. Si le sous-traitant a des dettes, le donneur d'ordre doit confirmer qu'il fera les retenues légales avant que l'accord soit confirmé.

## Agent IA

- **Questions des fournisseurs** : chaque e-mail d'invitation a une adresse de réponse propre à l'offre (`s-<clé>@reply.votre-domaine.be`). Configurer la réception (« Inbound parsing » de Brevo) sur le sous-domaine `reply` pour appeler `https://<ref>.supabase.co/functions/v1/inbound-email?secret=<INBOUND_EMAIL_SECRET>`. L'expéditeur est contrôlé (même adresse, ou même domaine d'entreprise), l'historique cité est retiré, puis Claude réécrit le message pour l'autre partie dans sa langue sans coordonnées. Sans clé Claude, le message est transmis tel quel.
- **Assistant** : répond à partir de `assistant-prompt.ts`, à mettre à jour quand l'app change.

## Mise en route

1. Créer un projet sur [supabase.com](https://supabase.com), région **Frankfurt (eu-central-1)**.
2. Installer les dépendances : `npm install`.
3. Lier le projet et appliquer le schéma :
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
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
   ```
   La seconde tâche recontrôle chaque nuit les entreprises dont la dernière vérification date de plus de 30 jours.
6. Copier `.env.example` en `.env` et le remplir, puis lancer l'app : `npm run web`, `npm run ios` ou `npm run android`.
7. Dans Supabase → Authentication → Email templates, mettre `{{ .Token }}` dans le modèle « Magic link » pour que l'e-mail de connexion contienne le code à 6 chiffres.

### Ajouter les fournisseurs démarchés

Les fournisseurs n'ont pas de compte. On les ajoute dans la base, avec les catégories et les débuts de codes postaux qu'ils couvrent (`14` couvre 1400 à 1499) :

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
