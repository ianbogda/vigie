#!/usr/bin/env bash
EXPECTED_VERSION="$(node -p "require('./package.json').version")"
set -Eeuo pipefail

APP_NAME="vigie"
APP_DIR="/opt/vigie"
APP_USER="vigie"
DOMAIN="${VIGIE_DOMAIN:-vigie.eple-tools.fr}"
API_PORT="${VIGIE_API_PORT:-3211}"
LE_EMAIL="${LETSENCRYPT_EMAIL:-}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log(){ printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail(){ printf '\n\033[1;31mERREUR: %s\033[0m\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail "Lancez ce script avec sudo."

log "Installation des prérequis"
apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https rsync dnsutils openssl postgresql postgresql-client

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

log "Initialisation PostgreSQL"
systemctl enable --now postgresql
DB_PASSWORD="$(openssl rand -hex 24)"
if [[ -f /etc/vigie.env ]]; then DB_PASSWORD="$(sed -n 's#^DATABASE_URL=postgresql://vigie:\([^@]*\)@.*#\1#p' /etc/vigie.env)"; fi
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='vigie'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER vigie WITH PASSWORD '$DB_PASSWORD';"
PCIF_BASE_URL_OLD="$(sed -n 's/^PCIF_BASE_URL=//p' /etc/vigie.env 2>/dev/null || true)"
PCIF_API_KEY_OLD="$(sed -n 's/^PCIF_API_KEY=//p' /etc/vigie.env 2>/dev/null || true)"
PCIF_CACHE_OLD="$(sed -n 's/^PCIF_CACHE_MINUTES=//p' /etc/vigie.env 2>/dev/null || true)"
ADMIN_EMAIL="${VIGIE_ADMIN_EMAIL:-$(sed -n 's/^VIGIE_ADMIN_EMAIL=//p' /etc/vigie.env 2>/dev/null || true)}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@vigie.local}"
ADMIN_PASSWORD="${VIGIE_ADMIN_PASSWORD:-$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)}"
printf 'Vigie — compte administrateur initial\nURL: https://%s\nIdentifiant: %s\nMot de passe initial: %s\n' "$DOMAIN" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" > /root/vigie-initial-admin.txt
chmod 600 /root/vigie-initial-admin.txt
cat > /etc/vigie.env <<ENV
DATABASE_URL=postgresql://vigie:$DB_PASSWORD@127.0.0.1:5432/vigie
PCIF_BASE_URL=${PCIF_BASE_URL_OLD:-https://pcif.eple-tools.fr}
PCIF_API_KEY=${PCIF_API_KEY_OLD}
PCIF_CACHE_MINUTES=${PCIF_CACHE_OLD:-10}
VIGIE_ADMIN_EMAIL=$ADMIN_EMAIL
VIGIE_ADMIN_PASSWORD=$ADMIN_PASSWORD
VIGIE_SESSION_DAYS=1
ENV
chmod 600 /etc/vigie.env
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='vigie'" | grep -q 1 || sudo -u postgres createdb -O vigie vigie
for sql in "$APP_DIR"/deploy/sql/*.sql; do sudo -u postgres psql -d vigie -f "$sql"; done
sudo -u postgres psql -d vigie -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO vigie; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO vigie;"

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
EnvironmentFile=/etc/vigie.env
ExecStart=/usr/bin/node $APP_DIR/apps/api/dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable vigie
systemctl restart vigie
sleep 2
# Le secret de bootstrap n'est nécessaire qu'à la création du premier compte.
sed -i '/^VIGIE_ADMIN_PASSWORD=/d' /etc/vigie.env

log "Pré-contrôle DNS et réseau pour HTTPS"
PUBLIC_IP="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
DNS_IPS="$(dig +short A "$DOMAIN" 2>/dev/null | tr '\n' ' ' || true)"
if [[ -z "$DNS_IPS" ]]; then
  fail "Aucun enregistrement DNS A trouvé pour $DOMAIN. Créez/corrigez le DNS avant de demander le certificat Let's Encrypt."
fi
if [[ -n "$PUBLIC_IP" ]] && ! grep -qw "$PUBLIC_IP" <<<"$DNS_IPS"; then
  fail "Le DNS de $DOMAIN pointe vers [$DNS_IPS], mais l'IP publique détectée du VPS est $PUBLIC_IP. Corrigez le DNS puis relancez l'installation."
fi
echo "DNS OK : $DOMAIN -> $DNS_IPS"

log "Configuration HTTPS Let's Encrypt via Caddy"
TLS_LINE="tls {\n        issuer acme {\n            dir https://acme-v02.api.letsencrypt.org/directory\n        }\n    }"
if [[ -n "$LE_EMAIL" ]]; then
  TLS_LINE="tls $LE_EMAIL {\n        issuer acme {\n            dir https://acme-v02.api.letsencrypt.org/directory\n        }\n    }"
fi
cat > /etc/caddy/sites/vigie.caddy <<CADDY
$DOMAIN {
    $(printf '%b' "$TLS_LINE")

    encode zstd gzip

    @api path /api /api/*
    handle @api {
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
systemctl enable caddy
systemctl restart caddy
sleep 3

log "Contrôles"
systemctl is-active --quiet vigie || fail "Le service Vigie n'est pas actif."
systemctl is-active --quiet caddy || fail "Caddy n'est pas actif."
HEALTH_JSON="$(curl -fsS "http://127.0.0.1:$API_PORT/health")" || fail "L'API ne répond pas sur /health."
grep -q '"version":"${EXPECTED_VERSION}" <<<"$HEALTH_JSON" || fail "Mauvaise version API chargée : $HEALTH_JSON (attendu ${EXPECTED_VERSION})."
AUTH_STATUS="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$API_PORT/api/auth/me)"
[[ "$AUTH_STATUS" == "401" ]] || fail "Le contrôle d'accès ne répond pas comme attendu (HTTP $AUTH_STATUS)."
HTTPS_AUTH_STATUS="$(curl -ks -o /dev/null -w '%{http_code}' --connect-timeout 10 https://$DOMAIN/api/auth/me)"
[[ "$HTTPS_AUTH_STATUS" == "401" ]] || fail "Caddy ne route pas correctement l'API protégée (HTTP $HTTPS_AUTH_STATUS)."
if ! curl -kfsS --connect-timeout 10 "https://$DOMAIN/" >/dev/null; then
  echo "HTTPS ne répond pas encore correctement. Diagnostic Caddy :" >&2
  journalctl -u caddy -n 80 --no-pager >&2 || true
  fail "Échec HTTPS pour $DOMAIN. Vérifiez surtout DNS, ports 80/443 et les journaux Caddy ci-dessus."
fi
echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -subject -issuer -dates || true

cat <<DONE

Vigie v${EXPECTED_VERSION} est installée.
URL cible : https://$DOMAIN
API locale : http://127.0.0.1:$API_PORT

Let's Encrypt : Caddy demandera et renouvellera automatiquement le certificat.
Prérequis DNS : $DOMAIN doit pointer vers ce VPS et les ports 80/443 doivent être accessibles.

Identifiants initiaux : /root/vigie-initial-admin.txt
À supprimer après la première connexion et la création des comptes nécessaires.

Commandes utiles :
  systemctl status vigie
  systemctl status caddy
  journalctl -u vigie -f
  journalctl -u caddy -f
DONE
