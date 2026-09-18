# Installation — Vigie v0.0.7

```bash
sudo LETSENCRYPT_EMAIL=admin@example.fr bash ./deploy/install-debian13.sh
```

Le script installe/build Vigie sous l'utilisateur de service `vigie`, applique toutes les migrations SQL, configure PostgreSQL, systemd, Caddy et Let's Encrypt.

Contrôles :
```bash
systemctl status vigie --no-pager
curl http://127.0.0.1:3211/health
npm audit
```

URL cible : `https://vigie.eple-tools.fr`
