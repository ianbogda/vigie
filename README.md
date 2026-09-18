# Vigie — EPLE Tools — v0.0.3

**Vigie** est le cockpit de détection budgétaire, financière et comptable d'EPLE Tools.

Cette itération verrouille l'UX avant branchement des exports Op@le :
- synthèse multi-EPLE ;
- quatre états explicites : action requise, à examiner, aucun signal, données insuffisantes ;
- fraîcheur des données ;
- investigation EPLE ;
- signaux prioritaires ;
- amorce des vues métier ;
- workflow d'import Balance, Budget/Exécution, Achats/Engagements et Créances.

Les données sont fictives en v0.0.3. La prochaine étape branche PostgreSQL, les snapshots et les premiers importeurs.

URL cible : `https://vigie.epele-tools.fr`

## Installation serveur

La v0.0.3 ajoute `deploy/install-debian13.sh` : installation automatisée sur Debian 13, service systemd, Caddy et certificat TLS Let's Encrypt avec renouvellement automatique. Voir `INSTALL.md`.
