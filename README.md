# Vigie — v0.0.12

Cockpit financier et comptable EPLE alimenté par les exports Op@le.

## Nouveautés v0.0.12

- tableau de bord d'accueil alimenté par les **données réellement importées** ;
- suppression des EPLE, KPI, alertes et montants fictifs de la synthèse ;
- nouveau endpoint `GET /api/dashboard` multi-EPLE ;
- radar calculé à partir des derniers snapshots Balance, Budget, CLCA et FDR ;
- signaux prioritaires issus des règles déterministes ;
- agrégation réelle de l'exécution budgétaire ;
- fraîcheur des sources et sources manquantes visibles ;
- tiroir d'investigation avec signaux, règles et traçabilité des imports ;
- historique FDR visible par établissement ;
- import FDR/CLCA conservant le parseur CSV Op@le tolérant (`relax_quotes`).

## Limite connue

Le recouvrement reste en **données insuffisantes** tant qu'une source CLCV/créances n'est pas intégrée. Vigie ne transforme jamais cette absence en valeur zéro ou en état vert.

Voir `INSTALL.md` pour le déploiement Debian 13.
