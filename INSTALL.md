# Installation — Vigie v0.0.12

Sur Debian 13 :

```bash
sudo bash deploy/install-debian13.sh
```

L'installateur construit l'API et le front, applique les migrations, redémarre `vigie`, configure Caddy/HTTPS et contrôle `/health`, `/api/snapshots`, `/api/analysis` et `/api/dashboard`.

Contrôle manuel :

```bash
curl http://127.0.0.1:3211/health
curl http://127.0.0.1:3211/api/dashboard
```

`/health` doit annoncer `0.0.12`.
