# Installation — Vigie v0.0.5

Sur Debian 13, après extraction :

```bash
sudo LETSENCRYPT_EMAIL=adresse@domaine.fr bash ./deploy/install-debian13.sh
```

Le script installe Node.js 22, PostgreSQL, Caddy, initialise la base `vigie`, applique le schéma du premier import Balance, construit l'application, installe le service systemd et configure HTTPS Let's Encrypt pour `vigie.eple-tools.fr`.

## Mise à jour

Le script est idempotent pour le schéma SQL (`CREATE TABLE IF NOT EXISTS`). Il peut être relancé sur une installation existante. Les snapshots déjà enregistrés dans PostgreSQL ne sont pas supprimés.

## Diagnostic

```bash
systemctl status vigie
systemctl status postgresql
systemctl status caddy
journalctl -u vigie -n 100 --no-pager
curl http://127.0.0.1:3211/health
```

## Format de balance

Vigie accepte XLSX, XLS ou CSV. Il recherche des intitulés usuels tels que `Compte`, `N° compte`, `Libellé`, `Solde`, `Solde débiteur`, `Solde créditeur`, `Débit`, `Crédit`. Le fichier est refusé si aucune ligne comptable exploitable n'est reconnue.
