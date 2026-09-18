# Vigie — EPLE Tools · v0.0.1

**Vigie** est le cockpit de détection budgétaire, financière et comptable d'EPLE Tools.

Objectif : repérer rapidement les situations qui nécessitent une investigation, sans recréer Op@le.

## V0.0.1
- maquette React fonctionnelle ;
- API Fastify ;
- synthèse multi-EPLE ;
- radar Budget / Trésorerie / Recouvrement / Fournisseurs / Comptabilité générale ;
- liste d'alertes ;
- états `ok`, `watch`, `alert` ;
- architecture prête pour les importeurs V1.

Les données affichées dans cette version sont fictives. La persistance PostgreSQL et les importeurs Op@le arrivent dans les itérations suivantes.

## Démarrage
Prérequis : Node.js 22+.

```bash
npm install
npm run dev
```

Web : http://localhost:5173 — API : http://localhost:3211 — Santé : http://localhost:3211/health

## Périmètre V1 cible
Balance, Budget/Exécution, Achats/Engagements, Créances → normalisation → historisation → indicateurs → règles → alertes → investigation.
