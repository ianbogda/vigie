#!/usr/bin/env bash
set -Eeuo pipefail
DOMAIN="${VIGIE_DOMAIN:-vigie.eple-tools.fr}"
[[ $EUID -eq 0 ]] || { echo "Lancez avec sudo." >&2; exit 1; }
echo "==> DNS"
dig +short A "$DOMAIN" || true
echo "==> Caddyfile"
caddy validate --config /etc/caddy/Caddyfile
echo "==> Redémarrage Caddy"
systemctl restart caddy
sleep 3
echo "==> État"
systemctl --no-pager --full status caddy || true
echo "==> Journaux ACME/TLS"
journalctl -u caddy -n 100 --no-pager || true
echo "==> Test HTTPS"
curl -vkI --connect-timeout 10 "https://$DOMAIN/" || true
