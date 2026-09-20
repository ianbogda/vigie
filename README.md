# Vigie EPLE — v0.0.71 — cockpit multi-établissements

Vigie devient un cockpit financier et comptable multi-EPLE : observer, analyser et anticiper à partir des situations Op@le historisées.

## v0.0.71 — préparation production

Cette version stabilise le déploiement sans réinitialiser les données : version API dérivée du package, configuration de production validée, CORS fermé par défaut en production, healthcheck PostgreSQL, sauvegarde `pg_dump` vérifiée, migrations suivies par `schema_migrations`, build et quality gate en staging avant arrêt du service, archive du code précédent et smoke tests après redémarrage.

Pour mettre à jour une installation existante en conservant sa BDD :

```bash
sudo bash deploy/update.sh
```

La procédure détaillée, la sauvegarde manuelle et la restauration d'urgence sont décrites dans `INSTALL.md`.

## Cette itération

- accueil refondu selon le visuel validé, palette Bootstrap 5.3 apaisée ;
- sélecteur **Vue agence / établissement** ;
- trajectoire budgétaire EPLE saisonnière ;
- correction du calcul budgétaire : **engagé / montant évaluatif**, sans double comptage du réalisé ;
- disponible = montant évaluatif − engagé ;
- signaux dépliables **Pourquoi ce signal ?** avec données, règle, lecture et source ;
- structure d'analyse financière permanente : constaté / engagé / attendu / estimé ;
- calendrier de gestion EPLE : mise en route, préparation de rentrée, fermeture estivale, atterrissage, clôture ;
- intégration PCIF non intrusive : table `pcif_context` et API de synthèse (maîtrise, risques majeurs, actions ouvertes). Aucune donnée PCIF fictive n'est créée ;
- imports existants conservés : Balance/EBLC, Budget, CLCA, FDR.

## PCIF

Vigie n'embarque pas les 267 questions du PCIF. Il ne consomme qu'une synthèse utile au diagnostic financier : niveau de maîtrise, risques majeurs et actions ouvertes. Cela évite de dupliquer PCIF Académie. Le branchement automatique à son API pourra remplacer l'alimentation de `pcif_context` lorsque le contrat d'API sera stabilisé.

## Déploiement

```bash
sudo bash deploy/install-debian13.sh
```

Puis contrôler :

```bash
curl http://127.0.0.1:3211/health
curl http://127.0.0.1:3211/api/dashboard
```

`/health` doit annoncer la version du package actuellement déployé et `status: "ready"`.

## v0.0.14 — factorisation du client React

Le cockpit est désormais découpé par responsabilité :

- `App.tsx` : orchestration, sélection EPLE, navigation et import ;
- `lib/api.ts` : accès HTTP centralisé ;
- `lib/format.ts` : formats € / % / dates ;
- `types/dashboard.ts` : contrat de données du cockpit ;
- `components/` : composants réutilisables (signal, PCIF, trajectoire, import, statut) ;
- `views/` : accueil, établissements et vues métier.

Le chargement initial utilise désormais un callback synchrone pour `useEffect` (`void load()`), ce qui corrige l'erreur TypeScript TS2345 de la v0.0.13. La philosophie fonctionnelle et le rendu du cockpit sont conservés.

## v0.0.15 — connexion PCIF Académie

Vigie peut désormais consommer une synthèse PCIF via une API serveur-à-serveur. L'UAI est l'identifiant pivot entre applications. La clé PCIF reste uniquement côté API Vigie ; elle n'est jamais envoyée au navigateur.

Configuration dans `/etc/vigie.env` :

```env
PCIF_BASE_URL=https://pcif.eple-tools.fr
PCIF_API_KEY=COLLER_LA_CLE_EMISE_PAR_PCIF
PCIF_CACHE_MINUTES=10
```

Contrôles : `GET /api/integrations/pcif/status` et synchronisation `POST /api/integrations/pcif/sync` avec `{ "uais": ["0280036M"] }`.

Le contrat attendu côté PCIF Académie est décrit dans `PCIF_ACADEMIE_TODO.md`.

## v0.0.26 — Budget en miroir

- synthèse budgétaire unique avec dépenses à gauche et recettes à droite ;
- normalisation des signes Op@le dans les vues de gestion ;
- calcul explicite du solde `recettes - dépenses` et du besoin de financement ;
- lecture par périmètre budgétaire (SG, services spéciaux, investissement) ;
- vue Analyse conservant le sélecteur Dépenses / Recettes ;
- vue Structure hiérarchique ;
- vue Données sources avec les montants bruts Op@le et recherche.

## v0.0.27 — Budget par service

Synthèse budgétaire miroir par service : AP, VE, ALO, PAYE, services spéciaux le cas échéant, puis OPC. Les recettes et dépenses sont séparées avant agrégation.

### v0.0.36 — trajectoires financières

- courbes annuelles FDR, trésorerie, résultat et BFR ;
- résultat calculé par crédits nets − débits nets des classes 6 et 7 ;
- exercices clos alimentés par les EBLC au 31/12 ; exercice courant affiché en atténué ;
- YFDR : `D` est interprété comme une valeur définitive/consolidée.

### v0.0.45 — CAF / IAF M9.6

Vigie calcule désormais la CAF/IAF à partir des EBLC selon la méthode additive M9.6 : résultat + C68 − C78 − C776 + C675 − C775 − C777. La vue agence utilise la CAF/IAF pour le positionnement des EPLE. Le calcul des jours de FDR et de trésorerie est également aligné sur la M9.6 : charges nettes des comptes 60 à 65 et base 360 jours.

## Qualité du code

Le projet applique les conventions suivantes : TypeScript en `camelCase`, composants et types en `PascalCase`, classes CSS en `kebab-case`, indentation à deux espaces et absence d’espaces de fin de ligne. Les fichiers se terminent par un unique saut de ligne, sans ligne vide supplémentaire.

Les commandes de contrôle sont :

```bash
npm run typecheck
npm test
npm run format:check
npm run quality
```

L’API sépare désormais le démarrage du serveur (`apps/api/src/index.ts`), la composition Fastify (`apps/api/src/app.ts`), les utilitaires communs (`apps/api/src/common`) et les parseurs d’import (`apps/api/src/modules/imports`). Les nouvelles fonctions métier publiques doivent être documentées en TSDoc et couvertes par des tests unitaires lorsqu’elles portent une règle de gestion ou une transformation de données.
