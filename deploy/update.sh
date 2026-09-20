#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/vigie"
APP_USER="vigie"
API_PORT="${VIGIE_API_PORT:-3211}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/etc/vigie.env"
BACKUP_DIR="/var/backups/vigie"

STAGING_ROOT="/opt/vigie-staging"
mkdir -p "$STAGING_ROOT"
chown "$APP_USER:$APP_USER" "$STAGING_ROOT"
chmod 750 "$STAGING_ROOT"

STAGING_DIR="$(sudo -u "$APP_USER" mktemp -d "$STAGING_ROOT/vigie-deploy-XXXXXXXX")"
SERVICE_STOPPED=0
DEPLOY_STARTED=0

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$*"
}

ok() {
  printf '\033[1;32m✓ %s\033[0m\n' "$*"
}

warn() {
  printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2
}

fail() {
  printf '\n\033[1;31mERREUR: %s\033[0m\n' "$*" >&2
  exit 1
}

recover() {
  local code=$?
  local line="${BASH_LINENO[0]:-?}"
  local command="${BASH_COMMAND:-inconnue}"

  printf '\n\033[1;31mÉchec du script ligne %s (code %s).\033[0m\n' \
    "$line" "$code" >&2
  printf 'Commande : %s\n' "$command" >&2

  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    warn "Staging conservé pour diagnostic : $STAGING_DIR"
  fi

  if (( SERVICE_STOPPED )); then
    warn "Tentative de redémarrage de Vigie..."
    systemctl start vigie >/dev/null 2>&1 || true
  fi

  exit "$code"
}

trap recover ERR

check_dist() {
  local root="$1"
  local label="$2"

  [[ -d "$root/apps/api/dist" ]] \
    || fail "$label : répertoire apps/api/dist absent."

  [[ -s "$root/apps/api/dist/index.js" ]] \
    || fail "$label : apps/api/dist/index.js absent ou vide."

  [[ -d "$root/apps/web/dist" ]] \
    || fail "$label : répertoire apps/web/dist absent."

  [[ -s "$root/apps/web/dist/index.html" ]] \
    || fail "$label : apps/web/dist/index.html absent ou vide."

  ok "$label : artefacts API et Web présents."
}

check_build_version() {
  local root="$1"
  local label="$2"
  local expected="$3"
  local package_version api_package_version web_package_version web_version

  package_version="$(node -p "require('$root/package.json').version")"
  api_package_version="$(node -p "require('$root/apps/api/package.json').version")"
  web_package_version="$(node -p "require('$root/apps/web/package.json').version")"
  [[ "$package_version" == "$expected" && "$api_package_version" == "$expected" && "$web_package_version" == "$expected" ]] \
    || fail "$label : versions source incohérentes (root=$package_version, API=$api_package_version, Web=$web_package_version, attendu=$expected)."

  web_version="$(sed -n 's/.*<meta name="vigie-version" content="\([^"]*\)".*/\1/p' "$root/apps/web/dist/index.html" | head -n1)"
  [[ "$web_version" == "$expected" ]] \
    || fail "$label : build Web=$web_version, attendu=$expected. Le dist ne correspond pas aux sources."

  ok "$label : source/API/Web cohérents en v${expected}."
}

# ---------------------------------------------------------------------------
# Précontrôles
# ---------------------------------------------------------------------------

[[ $EUID -eq 0 ]] \
  || fail "Lancez ce script avec sudo."

[[ -d "$APP_DIR" ]] \
  || fail "$APP_DIR n'existe pas. Utilisez l'installeur initial."

[[ -f "$ENV_FILE" ]] \
  || fail "$ENV_FILE est absent."

[[ -f "$SOURCE_DIR/package.json" ]] \
  || fail "package.json introuvable dans les sources."

id "$APP_USER" >/dev/null 2>&1 \
  || fail "L'utilisateur système $APP_USER n'existe pas."

for cmd in node npm psql pg_dump pg_restore rsync curl tar mktemp realpath; do
  command -v "$cmd" >/dev/null 2>&1 \
    || fail "$cmd est absent."
done

systemctl cat vigie >/dev/null 2>&1 \
  || fail "Le service systemd vigie n'existe pas."

SOURCE_REAL="$(realpath "$SOURCE_DIR")"
APP_REAL="$(realpath "$APP_DIR")"

if [[ "$SOURCE_REAL" == "$APP_REAL" ]]; then
  fail "Refus de mise à jour : la source est le répertoire de production $APP_DIR.
Décompressez la nouvelle release hors de $APP_DIR puis lancez son deploy/update.sh."
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ -n "${DATABASE_URL:-}" ]] \
  || fail "DATABASE_URL n'est pas défini dans $ENV_FILE."

EXPECTED_VERSION="$(node -p "require('$SOURCE_DIR/package.json').version")"
CURRENT_VERSION="$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo "inconnue")"

log "Mise à jour de Vigie"
echo "Version installée : $CURRENT_VERSION"
echo "Version à déployer : $EXPECTED_VERSION"
echo "Source             : $SOURCE_DIR"
echo "Production         : $APP_DIR"

# ---------------------------------------------------------------------------
# Staging éphémère
# ---------------------------------------------------------------------------

STAGING_DIR="$(mktemp -d /tmp/vigie-deploy-XXXXXXXX)"

log "Préparation du staging"
echo "Staging : $STAGING_DIR"

rsync -a \
  --delete \
  --chown="$APP_USER:$APP_USER" \
  --exclude node_modules \
  --exclude .git \
  --exclude '.env' \
  "$SOURCE_DIR/" "$STAGING_DIR/"

#STAGING_VERSION="$(node -p "require('$STAGING_DIR/package.json').version")"

[[ "$STAGING_VERSION" == "$EXPECTED_VERSION" ]] \
  || fail "Version du staging inattendue : $STAGING_VERSION au lieu de $EXPECTED_VERSION."

ok "Sources v${EXPECTED_VERSION} copiées dans le staging."

# ---------------------------------------------------------------------------
# Quality gate + build
# ---------------------------------------------------------------------------

log "Installation des dépendances dans le staging"

cd "$STAGING_DIR"
sudo -u "$APP_USER" npm ci

log "Quality gate"

sudo -u "$APP_USER" npm run quality

log "Build"

sudo -u "$APP_USER" npm run build

log "Contrôle des artefacts construits"

check_dist "$STAGING_DIR" "Staging"
check_build_version "$STAGING_DIR" "Staging" "$EXPECTED_VERSION"

echo "API :"
du -sh "$STAGING_DIR/apps/api/dist"

echo "Web :"
du -sh "$STAGING_DIR/apps/web/dist"

# ---------------------------------------------------------------------------
# Sauvegardes
# ---------------------------------------------------------------------------

log "Sauvegardes avant déploiement"

install -d -m 700 "$BACKUP_DIR"

DB_BACKUP="$(
  VIGIE_BACKUP_DIR="$BACKUP_DIR" \
    "$STAGING_DIR/deploy/backup-db.sh"
)"

[[ -s "$DB_BACKUP" ]] \
  || fail "La sauvegarde PostgreSQL n'a pas été créée correctement."

pg_restore --list "$DB_BACKUP" >/dev/null \
  || fail "La sauvegarde PostgreSQL n'est pas lisible par pg_restore."

CODE_BACKUP="$BACKUP_DIR/vigie-code-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"

tar \
  --exclude='./node_modules' \
  --exclude='./apps/api/node_modules' \
  --exclude='./apps/web/node_modules' \
  -C "$APP_DIR" \
  -czf "$CODE_BACKUP" \
  .

chmod 600 "$CODE_BACKUP"

[[ -s "$CODE_BACKUP" ]] \
  || fail "La sauvegarde du code n'a pas été créée."

ok "BDD  : $DB_BACKUP"
ok "Code : $CODE_BACKUP"

# ---------------------------------------------------------------------------
# Dernier contrôle AVANT arrêt
# ---------------------------------------------------------------------------

log "Contrôle final avant bascule"

check_dist "$STAGING_DIR" "Staging"

[[ "$(node -p "require('$STAGING_DIR/package.json').version")" == "$EXPECTED_VERSION" ]] \
  || fail "La version du staging a changé avant déploiement."

ok "La production peut être arrêtée."

# ---------------------------------------------------------------------------
# Bascule
# ---------------------------------------------------------------------------

log "Arrêt court de Vigie"

systemctl stop vigie
SERVICE_STOPPED=1
DEPLOY_STARTED=1

log "Déploiement de Vigie v${EXPECTED_VERSION}"

rsync -a \
  --delete \
  --chown="$APP_USER:$APP_USER" \
  --exclude node_modules \
  --exclude .git \
  --exclude '.env' \
  "$STAGING_DIR/" "$APP_DIR/"

# Contrôle IMMÉDIAT après rsync, avant toute autre opération.
check_dist "$APP_DIR" "Production après rsync"
check_build_version "$APP_DIR" "Production après rsync" "$EXPECTED_VERSION"

DEPLOYED_VERSION="$(node -p "require('$APP_DIR/package.json').version")"

[[ "$DEPLOYED_VERSION" == "$EXPECTED_VERSION" ]] \
  || fail "Version déployée inattendue : $DEPLOYED_VERSION au lieu de $EXPECTED_VERSION."

ok "Code v${EXPECTED_VERSION} copié dans $APP_DIR."

# ---------------------------------------------------------------------------
# Dépendances de production
# ---------------------------------------------------------------------------

log "Installation des dépendances de production"

cd "$APP_DIR"

sudo -u "$APP_USER" npm ci --omit=dev

# npm ci ne doit jamais faire disparaître les artefacts construits.
check_dist "$APP_DIR" "Production après npm ci"
check_build_version "$APP_DIR" "Production après npm ci" "$EXPECTED_VERSION"

# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------

log "Migrations PostgreSQL"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

MIGRATION_COUNT="$(
  psql "$DATABASE_URL" -Atqc \
    'SELECT count(*) FROM schema_migrations;'
)"

if [[ "$MIGRATION_COUNT" == "0" ]]; then
  LEGACY_INSTALL="$(
    psql "$DATABASE_URL" -Atqc \
      "SELECT to_regclass('public.balance_snapshots') IS NOT NULL;"
  )"

  if [[ "$LEGACY_INSTALL" == "t" ]]; then
    log "Amorçage du suivi des migrations historiques"

    for sql in "$APP_DIR"/deploy/sql/*.sql; do
      filename="$(basename "$sql")"
      number="${filename%%_*}"

      if [[ "$number" =~ ^[0-9]+$ ]] && (( 10#$number <= 11 )); then
        psql "$DATABASE_URL" \
          -v ON_ERROR_STOP=1 \
          -c "INSERT INTO schema_migrations(filename)
              VALUES ('$filename')
              ON CONFLICT DO NOTHING;" \
          >/dev/null
      fi
    done
  fi
fi

shopt -s nullglob

for sql in "$APP_DIR"/deploy/sql/*.sql; do
  filename="$(basename "$sql")"

  if [[ "$(
    psql "$DATABASE_URL" -Atqc \
      "SELECT 1
       FROM schema_migrations
       WHERE filename='$filename'
       LIMIT 1;"
  )" == "1" ]]; then
    echo "  ✓ $filename"
    continue
  fi

  echo "  → $filename"

  {
    echo 'BEGIN;'
    cat "$sql"
    printf \
      "\nINSERT INTO schema_migrations(filename) VALUES ('%s');\n" \
      "$filename"
    echo 'COMMIT;'
  } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1

  echo "  ✓ $filename appliquée"
done

# ---------------------------------------------------------------------------
# Dernier contrôle avant démarrage
# ---------------------------------------------------------------------------

log "Contrôle final de la production"

check_dist "$APP_DIR" "Production"
check_build_version "$APP_DIR" "Production" "$EXPECTED_VERSION"

[[ "$(node -p "require('$APP_DIR/package.json').version")" == "$EXPECTED_VERSION" ]] \
  || fail "La production n'est plus en version $EXPECTED_VERSION."

# ---------------------------------------------------------------------------
# Redémarrage
# ---------------------------------------------------------------------------

log "Redémarrage de Vigie"

systemctl start vigie
SERVICE_STOPPED=0

HEALTH_JSON=""

for attempt in {1..20}; do
  HEALTH_JSON="$(
    curl -fsS \
      --connect-timeout 2 \
      "http://127.0.0.1:${API_PORT}/health" \
      2>/dev/null || true
  )"

  [[ -n "$HEALTH_JSON" ]] && break

  sleep 1
done

if [[ -z "$HEALTH_JSON" ]]; then
  journalctl -u vigie -n 80 --no-pager >&2 || true
  fail "L'API ne devient pas prête."
fi

echo "$HEALTH_JSON"

grep -q "\"version\":\"${EXPECTED_VERSION}\"" <<<"$HEALTH_JSON" \
  || fail "Version API inattendue."

grep -q '"status":"ready"' <<<"$HEALTH_JSON" \
  || fail "La BDD n'est pas prête."

AUTH_STATUS="$(
  curl -s \
    -o /dev/null \
    -w '%{http_code}' \
    "http://127.0.0.1:${API_PORT}/api/auth/me"
)"

[[ "$AUTH_STATUS" == "401" ]] \
  || fail "Authentification inattendue : HTTP $AUTH_STATUS."

systemctl is-active --quiet vigie \
  || fail "Le service Vigie n'est pas actif."

# ---------------------------------------------------------------------------
# Nettoyage
# ---------------------------------------------------------------------------

log "Nettoyage"

rm -rf "$STAGING_DIR"
STAGING_DIR=""

ok "Vigie v${EXPECTED_VERSION} est opérationnelle."
ok "BDD existante conservée."
ok "Artefacts API et Web contrôlés."
