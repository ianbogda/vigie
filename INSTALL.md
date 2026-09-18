# Installation — Vigie v0.0.11

Sur Debian 13 :

```bash
unzip vigie-eple-v0.0.11.zip
cd vigie-eple-v0.0.11
sudo bash deploy/install-debian13.sh
```

L'installateur applique les migrations PostgreSQL, build l'API et le front, redémarre `vigie`, configure Caddy et vérifie la version réellement chargée.

Contrôle complémentaire :

```bash
curl http://127.0.0.1:3211/health
curl http://127.0.0.1:3211/api/analysis
```
