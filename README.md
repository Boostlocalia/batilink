# BatiLink

Plateforme belge pour les PME du bâtiment, en français et en néerlandais. Un entrepreneur envoie une demande de prix à plusieurs négoces en une fois, les négoces répondent depuis l'e-mail sans créer de compte, et l'entrepreneur compare les offres côte à côte.

Une seule base de code produit l'app iOS, l'app Android et le site web.

Cette version couvre la phase 2 de la feuille de route : les demandes de prix. Le réseau entre entrepreneurs (annonces, badge vérifié, messagerie) et le paiement en ligne viennent ensuite.

## Ce qu'il y a dedans

| Dossier | Rôle |
| --- | --- |
| `src/app/` | Écrans (Expo Router) : connexion par code e-mail, création de l'entreprise, accueil, nouvelle demande, comparateur d'offres, abonnement, réglages, page publique de réponse fournisseur (`/offre/[token]`). |
| `src/i18n/` | Textes FR et NL. La langue suit l'appareil, se change dans Réglages et est mémorisée. |
| `src/lib/` | Client Supabase, session, calcul des totaux (TVA 21 %), formats belges (dates, TVA, codes postaux). |
| `supabase/migrations/` | Schéma Postgres, règles d'accès (RLS) et catégories de produits. |
| `supabase/functions/` | Fonctions serveur : envoi de la demande et des e-mails, réponse fournisseur, choix de l'offre, relances après 24 h. |
| `supabase/functions/_shared/plans.ts` | Règles des trois abonnements, utilisées à la fois par l'app et par le serveur. |

## Abonnements

| | Gratuit | Pro | Complet |
| --- | --- | --- | --- |
| Prix HTVA / mois | 0 € | 39 € | 89 € |
| Demandes de prix | 1 d'essai par mois, 3 fournisseurs max | 1 d'essai par mois | Illimitées |
| Réseau entrepreneurs | Consultation | Complet | Complet |

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
   npx supabase secrets set BREVO_API_KEY=... EMAIL_FROM=demandes@votre-domaine.be APP_URL=https://app.votre-domaine.be CRON_SECRET=$(openssl rand -hex 24)
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
   ```
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
npm test            # tests unitaires (abonnements, totaux, formats, e-mails, liens)
npx deno check supabase/functions/*/index.ts   # TypeScript des fonctions serveur
```

## Sécurité

- Chaque entreprise ne voit que ses propres demandes et offres (RLS Postgres).
- Le lien envoyé au fournisseur contient un jeton aléatoire ; seule son empreinte SHA-256 est stockée, et l'app ne peut pas la lire. Le lien expire après 14 jours ; une relance envoie un nouveau lien.
- Les limites d'abonnement sont vérifiées par le serveur, pas seulement par l'app.
