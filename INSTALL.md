# Installation — Vigie v0.0.4

## Installation automatique — Debian 13

Vigie fournit désormais un installateur Bash qui installe les prérequis, Node.js 22 si nécessaire, Caddy, construit l'application, crée le service systemd et configure HTTPS avec **Let's Encrypt**.

### Prérequis

- Debian 13 ;
- accès `sudo` / root ;
- DNS `vigie.eple-tools.fr` pointant vers l'adresse publique du serveur ;
- ports TCP 80 et 443 accessibles depuis Internet.

### Installation

Depuis le dossier décompressé :

```bash
sudo bash ./deploy/install-debian13.sh
```

Option recommandée pour associer une adresse au compte ACME Let's Encrypt :

```bash
sudo LETSENCRYPT_EMAIL=admin@votre-domaine.fr bash ./deploy/install-debian13.sh
```

Le domaine peut être surchargé si nécessaire :

```bash
sudo VIGIE_DOMAIN=vigie.eple-tools.fr LETSENCRYPT_EMAIL=admin@votre-domaine.fr bash ./deploy/install-debian13.sh
```

## HTTPS / Let's Encrypt

Caddy utilise explicitement l'ACME v2 de Let's Encrypt. Il demande le certificat lors du premier démarrage et assure ensuite son renouvellement automatiquement. Il n'est donc pas nécessaire d'installer Certbot.

Le certificat ne pourra pas être émis tant que le DNS ne pointe pas vers le VPS ou que les ports 80/443 sont bloqués.

## Contrôles

```bash
systemctl status vigie
systemctl status caddy
curl http://127.0.0.1:3211/health
journalctl -u vigie -f
journalctl -u caddy -f
```

URL de production : `https://vigie.eple-tools.fr`

## Développement

```bash
npm install
npm run dev
```

## Réparation HTTPS

La v0.0.4 corrige le domaine par défaut en `vigie.eple-tools.fr` (sans `e` supplémentaire) et bloque l'installation si le DNS ne pointe pas vers le VPS.

En cas d'installation v0.0.3 déjà effectuée :

```bash
sudo VIGIE_DOMAIN=vigie.eple-tools.fr bash ./deploy/install-debian13.sh
```

Diagnostic seul :

```bash
sudo bash ./deploy/repair-https.sh
```
