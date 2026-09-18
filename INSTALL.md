# Installation — Vigie v0.0.9

```bash
sudo LETSENCRYPT_EMAIL=votre-adresse@domaine.fr bash ./deploy/install-debian13.sh
```

Cible : `https://vigie.eple-tools.fr`.

Contrôles :

```bash
curl http://127.0.0.1:3211/health
curl http://127.0.0.1:3211/api/snapshots
curl http://127.0.0.1:3211/api/imports
systemctl status vigie --no-pager
```

`/health` doit annoncer `0.0.9`. L'installation s'arrête sinon.
