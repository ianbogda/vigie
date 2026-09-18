# Installation — Vigie v0.0.13

Sur Debian 13, depuis la racine du projet :

```bash
sudo bash deploy/install-debian13.sh
```

Le script installe/met à jour PostgreSQL, applique toutes les migrations SQL, construit l'API et le Web, redémarre `vigie`, configure Caddy et vérifie `/health` et `/api/dashboard`.

Contrôle manuel :

```bash
curl http://127.0.0.1:3211/health
curl http://127.0.0.1:3211/api/dashboard
sudo systemctl status vigie --no-pager
```
