# Vigie EPLE — v0.0.14 — cockpit multi-établissements

Vigie devient un cockpit financier et comptable multi-EPLE : observer, analyser et anticiper à partir des situations Op@le historisées.

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

`/health` doit annoncer `0.0.14`.

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
