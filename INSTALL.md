# Installation et mise à jour — Vigie v0.0.72

## Première installation — Debian 13

Depuis la racine des sources :

```bash
sudo bash deploy/install-debian13.sh
```

L'installeur configure PostgreSQL, Node.js, le service systemd `vigie`, Caddy/HTTPS et le compte administrateur initial.

## Mise à jour d'une installation existante

La mise à jour **conserve la base PostgreSQL existante**. Depuis la racine de la nouvelle version :

```bash
sudo bash deploy/update.sh
```

Avant toute migration, le script :

1. crée un staging éphémère dans `/tmp`, y construit et valide la nouvelle version ;
2. exécute `npm run quality` ;
3. crée un dump PostgreSQL vérifié dans `/var/backups/vigie` ;
4. archive le code actuellement déployé ;
5. arrête brièvement le service ;
6. applique uniquement les migrations SQL absentes ;
7. redémarre Vigie et exécute les smoke tests.

Un échec de build ou de quality gate intervient donc avant l'arrêt de la production.

## Sauvegarde manuelle

```bash
sudo bash deploy/backup-db.sh
```

Les dumps sont au format PostgreSQL custom et sont contrôlés avec `pg_restore --list`. La rétention par défaut est de 14 jours. Elle peut être modifiée avec `VIGIE_BACKUP_RETENTION_DAYS`.

## Restauration d'urgence

La restauration est volontairement manuelle afin d'éviter tout écrasement accidentel :

```bash
sudo systemctl stop vigie
sudo -u postgres dropdb --if-exists vigie
sudo -u postgres createdb -O vigie vigie
sudo -u postgres pg_restore --no-owner --role=vigie -d vigie /var/backups/vigie/vigie-YYYYMMDDTHHMMSSZ.dump
sudo systemctl start vigie
```

Ne restaurer une sauvegarde qu'après diagnostic : les migrations sont transactionnelles et une restauration efface les données créées après le dump.

## Configuration de production

`/etc/vigie.env` doit être lisible uniquement par root (`0600`) et contenir au minimum `DATABASE_URL`. Les secrets ne doivent jamais être stockés dans le dépôt.

Variables reconnues : `DATABASE_URL`, `PCIF_BASE_URL`, `PCIF_API_KEY`, `PCIF_CACHE_MINUTES`, `EPLE_TOOLS_API_KEY`, `VIGIE_SESSION_DAYS` et, uniquement si une origine distincte doit appeler l'API, `VIGIE_CORS_ORIGIN`.

En production, CORS est désactivé par défaut : le frontend et l'API sont servis sous la même origine par Caddy.

## Contrôles

```bash
curl http://127.0.0.1:3211/health
curl http://127.0.0.1:3211/health/live
sudo systemctl status vigie --no-pager
sudo journalctl -u vigie -n 100 --no-pager
```

`/health` vérifie aussi PostgreSQL et doit retourner `status: "ready"` et la version attendue. `/health/live` vérifie uniquement que le processus API répond.
