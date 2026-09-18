# Vigie EPLE — v0.0.13 — cockpit multi-établissements

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

`/health` doit annoncer `0.0.13`.
