#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="vigie"
APP_DIR="/opt/vigie"
APP_USER="vigie"
API_PORT="${VIGIE_API_PORT:-3211}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/etc/vigie.env"

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$*"
}

ok() {
  printf '\033[1;32m✓ %s\033[0m\n' "$*"
}

fail() {
  printf '\n\033[1;31mERREUR: %s\033[0m\n' "$*" >&2
  exit 1
}

trap 'printf "\n\033[1;31mÉchec de la mise à jour à la ligne %s.\033[0m\n" "$LINENO" >&2' ERR

[[ $EUID -eq 0 ]] || fail "Lancez ce script avec sudo."

[[ -d "$APP_DIR" ]] || fail "$APP_DIR n'existe pas. Utilisez l'installeur initial."
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE est absent. Utilisez l'installeur initial."
[[ -f "$SOURCE_DIR/package.json" ]] || fail "package.json introuvable dans les sources."
id "$APP_USER" >/dev/null 2>&1 || fail "L'utilisateur système $APP_USER n'existe pas."

EXPECTED_VERSION="$(node -p "require('$SOURCE_DIR/package.json').version")"

log "Mise à jour de Vigie vers v${EXPECTED_VERSION}"

#
# 1. Vérification de l'installation existante
#

command -v node >/dev/null 2>&1 || fail "Node.js est absent."
command -v npm >/dev/null 2>&1 || fail "npm est absent."
command -v psql >/dev/null 2>&1 || fail "psql est absent."
command -v rsync >/dev/null 2>&1 || fail "rsync est absent."

systemctl cat vigie >/dev/null 2>&1 \
  || fail "Le service systemd vigie n'existe pas."

#
# 2. Chargement de la configuration existante
#

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ -n "${DATABASE_URL:-}" ]] \
  || fail "DATABASE_URL n'est pas défini dans $ENV_FILE."

#
# 3. Arrêt de l'API
#

log "Arrêt de Vigie"

systemctl stop vigie

#
# 4. Synchronisation des nouvelles sources
#

log "Synchronisation des sources"

rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude '.env' \
  "$SOURCE_DIR/" "$APP_DIR/"

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

#
# 5. Dépendances
#

log "Installation des dépendances"

cd "$APP_DIR"

if [[ -f package-lock.json ]]; then
  sudo -u "$APP_USER" npm ci
else
  sudo -u "$APP_USER" npm install
fi

#
# 6. Build
#

log "Build de Vigie"

sudo -u "$APP_USER" npm run build

#
# 7. Migrations PostgreSQL
#

log "Migrations PostgreSQL"

shopt -s nullglob
SQL_FILES=("$APP_DIR"/deploy/sql/*.sql)

if [[ ${#SQL_FILES[@]} -eq 0 ]]; then
  fail "Aucune migration SQL trouvée dans deploy/sql."
fi

for sql in "${SQL_FILES[@]}"; do
  echo "  → $(basename "$sql")"
  psql "$DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -f "$sql" >/dev/null
done

ok "${#SQL_FILES[@]} migration(s) contrôlée(s)/appliquée(s)"

#
# 8. Permissions PostgreSQL
#

log "Contrôle des droits PostgreSQL"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
GRANT ALL ON ALL TABLES IN SCHEMA public TO vigie;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO vigie;
SQL

#
# 9. Permissions fichiers
#

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

#
# 10. Redémarrage
#

log "Redémarrage de Vigie"

systemctl start vigie

#
# 11. Healthcheck
#

log "Contrôles"

for attempt in {1..15}; do
  if HEALTH_JSON="$(curl -fsS \
      --connect-timeout 2 \
      "http://127.0.0.1:${API_PORT}/health" 2>/dev/null)"; then
    break
  fi

  sleep 1
done

[[ -n "${HEALTH_JSON:-}" ]] \
  || {
    journalctl -u vigie -n 50 --no-pager >&2 || true
    fail "L'API Vigie ne répond pas après la mise à jour."
  }

echo "$HEALTH_JSON"

if ! grep -q "\"version\":\"${EXPECTED_VERSION}\"" <<<"$HEALTH_JSON"; then
  journalctl -u vigie -n 50 --no-pager >&2 || true
  fail "La version chargée ne correspond pas à ${EXPECTED_VERSION}."
fi

AUTH_STATUS="$(
  curl -s \
    -o /dev/null \
    -w '%{http_code}' \
    "http://127.0.0.1:${API_PORT}/api/auth/me"
)"

[[ "$AUTH_STATUS" == "401" ]] \
  || fail "Contrôle d'authentification inattendu : HTTP $AUTH_STATUS."

systemctl is-active --quiet vigie \
  || fail "Le service Vigie n'est pas actif."

ok "Vigie v${EXPECTED_VERSION} est opérationnelle."

cat <<EOF

Mise à jour terminée.

Version : ${EXPECTED_VERSION}
Service : actif
API     : http://127.0.0.1:${API_PORT}

Commandes utiles :
  systemctl status vigie
  journalctl -u vigie -n 100 --no-pager

EOF
