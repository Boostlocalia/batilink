# Mode privé (BatiNode réservé à son propriétaire)

Depuis le 6 novembre 2026, BatiNode tourne en **mode privé** : Henrique s'en sert seul pour ses demandes de prix de matériaux, avec les comptes Modern X Renov et TNC construct srl, et tout ce qui coûte de l'argent ou consomme un quota payant est en pause. Rien n'est supprimé : tout se rallume en quelques minutes.

## Ce qui reste actif

| Fonction | Pourquoi |
| --- | --- |
| Connexion des comptes `henrique.peneda@gmail.com` (Modern X Renov) et `contact@t-n-c.be` (TNC construct srl) | Usage du propriétaire |
| Demandes de prix aux fournisseurs, comparateur, bons de commande | Le cœur de l'outil |
| Pages des fournisseurs (`/offre/…`, `/bon/…`) et leurs questions relayées | Les fournisseurs répondent sans compte |
| Relances des fournisseurs (tâche `remind-suppliers`, toutes les heures) | Elles concernent tes propres demandes |
| Recontrôle nocturne TVA / BCE (`verify-companies`) | Services publics gratuits ; garde ton entreprise « vérifiée » |

## Ce qui est en pause

| Élément | Comment c'est coupé |
| --- | --- |
| Inscriptions publiques | La base refuse tout nouveau compte hors liste (`private_mode_guard_signup` sur `auth.users`). L'app masque l'onglet « Créer un compte » et la page d'accueil publique ouvre directement la connexion. |
| Autres comptes existants | Bloqués (`banned_until`) et leurs sessions fermées ; débloqués automatiquement à la réouverture. |
| Abonnements Stripe | La fonction `subscription` refuse d'ouvrir Stripe Checkout ; l'onglet « Abonnement » est masqué. |
| Relevés de commission (`bill-commissions`, le 2 du mois) | Tâche en pause + la fonction refuse de tourner. |
| E-mails d'essai, d'activation, de relance, de parrainage (`lifecycle`) | Tâche en pause + la fonction refuse de tourner. |
| Actualités IA quotidiennes (`news-daily`, `news-daily-retry`) | Tâches en pause + la fonction refuse de tourner (appels Claude avec recherche web). |
| Surveillance des quotas (`quota-watch`, appel Claude toutes les heures) | Tâche en pause. |
| Assistant Nodi (Claude) | La fonction `assistant` refuse ; la bulle est masquée. |
| Pixel Meta et bandeau cookies | Désactivés dans l'app. |

## Réglages à faire dans tes comptes (une fois)

1. **Meta (Facebook) Ads** : business.facebook.com → Gestionnaire de publicités → compte « BatiNode » → coche toutes les campagnes → interrupteur sur « Désactivé ». Le compte est en solde impayé (« UNSETTLED ») : règle le solde dans Paramètres de paiement pour qu'il ne s'alourdisse pas, puis retire la carte si tu veux être sûr qu'aucune campagne ne reparte.
2. **Supabase** : supabase.com → projet *batilink* → Authentication → Sign In / Providers → décoche **« Allow new users to sign up »** → Save. (Double sécurité : la base refuse déjà les inscriptions.) Le plan est **Free** : rien à résilier. Un projet gratuit se met en pause après 7 jours sans visite ; tu le relances avec « Restore project » (gratuit, les données sont gardées).
3. **Stripe** : dashboard.stripe.com → Développeurs → Webhooks → l'endpoint `stripe-webhook` → « Désactiver ». Produits → Starter et Premium → « Archiver » (aucun nouvel abonnement possible). Stripe ne facture rien sans transaction : pas besoin de fermer le compte.
4. **Brevo** (e-mails) : app.brevo.com → Mon plan. Reste sur le plan **Free** (300 e-mails/jour, assez pour tes demandes de prix). Si un plan payant est actif, « Changer de plan » → Free. Ne supprime pas la clé API : tes demandes de prix partent par Brevo.
5. **Anthropic (Claude)** : console.anthropic.com → Billing → désactive le **rechargement automatique** (auto-reload) et mets une limite mensuelle basse (Limits → par ex. 5 $). Seul le relais des questions des fournisseurs l'utilise encore.
6. **Domaine batinode.be** : garde-le (quelques euros par an) pour ne pas perdre le nom ; vérifie juste que le renouvellement automatique ne prend pas d'options payantes (hébergement, e-mail pro) inutiles.
7. **Hébergement du site** : GitHub Pages, gratuit. Rien à faire.

## Rouvrir au public

1. Supabase → SQL Editor :
   ```sql
   select public.private_mode_off();
   ```
   Les tâches mises en pause repartent, les comptes bloqués sont débloqués, les inscriptions sont acceptées.
2. Dans `.github/workflows/deploy-web.yml` (et `netlify.toml` si Netlify sert le site), passe `EXPO_PUBLIC_PRIVATE_MODE` à `off`, puis pousse sur `signup-conversion` : le site se reconstruit avec l'inscription, l'abonnement, Nodi et le bandeau cookies.
3. Refais le chemin inverse dans tes comptes : Supabase « Allow new users to sign up », webhook Stripe réactivé et produits désarchivés, campagnes Meta, plan Brevo et crédit Claude selon le volume attendu.

## Ajouter un collègue pendant le mode privé

```sql
select public.private_mode_allow('collegue@exemple.be');
```

## Remettre le mode privé

```sql
select public.private_mode_on(array['henrique.peneda@gmail.com', 'contact@t-n-c.be']);
```

Ces fonctions ne sont appelables que depuis l'éditeur SQL de Supabase (ou la clé de service) : ni un visiteur ni un compte connecté ne peut changer le mode.
