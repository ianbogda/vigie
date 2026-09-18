#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="vigie"
APP_DIR="/opt/vigie"
APP_USER="vigie"
DOMAIN="${VIGIE_DOMAIN:-vigie.epele-tools.fr}"
API_PORT="${VIGIE_API_PORT:-3211}"
LE_EMAIL="${LETSENCRYPT_EMAIL:-}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log(){ printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail(){ printf '\n\033[1;31mERREUR: %s\033[0m\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail "Lancez ce script avec sudo."

log "Installation des prérequis"
apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 22 ]]; then
  log "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  log "Installation de Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

log "Création du compte de service"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude .git "$SOURCE_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Installation et build de Vigie"
cd "$APP_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build

log "Installation du service API"
cat > /etc/systemd/system/vigie.service <<SERVICE
[Unit]
Description=Vigie EPLE Tools API
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/apps/api
Environment=NODE_ENV=production
Environment=PORT=$API_PORT
ExecStart=/usr/bin/node $APP_DIR/apps/api/dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now vigie

log "Configuration HTTPS Let's Encrypt via Caddy"
TLS_LINE="tls {\n        issuer acme {\n            dir https://acme-v02.api.letsencrypt.org/directory\n        }\n    }"
if [[ -n "$LE_EMAIL" ]]; then
  TLS_LINE="tls $LE_EMAIL {\n        issuer acme {\n            dir https://acme-v02.api.letsencrypt.org/directory\n        }\n    }"
fi
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    $(printf '%b' "$TLS_LINE")

    encode zstd gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:$API_PORT
    }

    handle /health {
        reverse_proxy 127.0.0.1:$API_PORT
    }

    handle {
        root * $APP_DIR/apps/web/dist
        try_files {path} /index.html
        file_server
    }
}
CADDY
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

log "Contrôles"
systemctl is-active --quiet vigie || fail "Le service Vigie n'est pas actif."
systemctl is-active --quiet caddy || fail "Caddy n'est pas actif."
curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null || fail "L'API ne répond pas sur /health."

cat <<DONE

Vigie v0.0.3 est installée.
URL cible : https://$DOMAIN
API locale : http://127.0.0.1:$API_PORT

Let's Encrypt : Caddy demandera et renouvellera automatiquement le certificat.
Prérequis DNS : $DOMAIN doit pointer vers ce VPS et les ports 80/443 doivent être accessibles.

Commandes utiles :
  systemctl status vigie
  systemctl status caddy
  journalctl -u vigie -f
  journalctl -u caddy -f
DONE
