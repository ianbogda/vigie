#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/vigie"
APP_USER="vigie"
API_PORT="${VIGIE_API_PORT:-3211}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/etc/vigie.env"
BACKUP_DIR="/var/backups/vigie"
STAGING_DIR=""
SERVICE_STOPPED=0
DEPLOY_SUCCEEDED=0

log(){ printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok(){ printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
fail(){ printf '\n\033[1;31mERREUR: %s\033[0m\n' "$*" >&2; exit 1; }
cleanup(){
  code=$?
  if (( SERVICE_STOPPED )); then
    printf '\nTentative de redémarrage de Vigie après échec...\n' >&2
    systemctl start vigie >/dev/null 2>&1 || true
  fi
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    if (( DEPLOY_SUCCEEDED )); then
      rm -rf "$STAGING_DIR"
    else
      printf 'Staging de diagnostic conservé : %s\n' "$STAGING_DIR" >&2
    fi
  fi
  exit "$code"
}
trap cleanup EXIT

[[ $EUID -eq 0 ]] || fail "Lancez ce script avec sudo."
[[ -d "$APP_DIR" ]] || fail "$APP_DIR n'existe pas. Utilisez l'installeur initial."
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE est absent."
[[ -f "$SOURCE_DIR/package.json" ]] || fail "package.json introuvable dans les sources."
id "$APP_USER" >/dev/null 2>&1 || fail "L'utilisateur système $APP_USER n'existe pas."
for cmd in node npm psql pg_dump pg_restore rsync curl tar mktemp; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd est absent."; done
systemctl cat vigie >/dev/null 2>&1 || fail "Le service systemd vigie n'existe pas."

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL n'est pas défini dans $ENV_FILE."
EXPECTED_VERSION="$(node -p "require('$SOURCE_DIR/package.json').version")"
log "Préparation de Vigie v${EXPECTED_VERSION}"

log "Création du staging éphémère"
STAGING_DIR="$(mktemp -d /tmp/vigie-deploy-XXXXXXXX)"
chmod 755 "$STAGING_DIR"
ok "$STAGING_DIR"

log "Build et quality gate hors production"
rsync -a --delete --exclude node_modules --exclude .git --exclude '.env' "$SOURCE_DIR/" "$STAGING_DIR/"
chown -R "$APP_USER:$APP_USER" "$STAGING_DIR"
cd "$STAGING_DIR"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run quality
sudo -u "$APP_USER" npm run build

log "Sauvegardes avant migration"
install -d -m 700 "$BACKUP_DIR"
DB_BACKUP="$(VIGIE_BACKUP_DIR="$BACKUP_DIR" "$STAGING_DIR/deploy/backup-db.sh")"
CODE_BACKUP="$BACKUP_DIR/vigie-code-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar --exclude='./node_modules' --exclude='./apps/api/node_modules' --exclude='./apps/web/node_modules' -C "$APP_DIR" -czf "$CODE_BACKUP" .
chmod 600 "$CODE_BACKUP"
ok "BDD : $DB_BACKUP"
ok "Code : $CODE_BACKUP"

log "Arrêt court de Vigie"
systemctl stop vigie
SERVICE_STOPPED=1

log "Déploiement du build validé"
rsync -a --delete --exclude node_modules --exclude .git --exclude '.env' "$STAGING_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev

log "Migrations PostgreSQL"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL
MIGRATION_COUNT="$(psql "$DATABASE_URL" -Atqc 'SELECT count(*) FROM schema_migrations;')"
if [[ "$MIGRATION_COUNT" == "0" ]]; then
  LEGACY_INSTALL="$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.balance_snapshots') IS NOT NULL;")"
  if [[ "$LEGACY_INSTALL" == "t" ]]; then
    log "Amorçage du suivi des migrations historiques"
    for sql in "$APP_DIR"/deploy/sql/*.sql; do
      filename="$(basename "$sql")"
      number="${filename%%_*}"
      if [[ "$number" =~ ^[0-9]+$ ]] && (( 10#$number <= 11 )); then
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations(filename) VALUES ('$filename') ON CONFLICT DO NOTHING;" >/dev/null
      fi
    done
  fi
fi
shopt -s nullglob
for sql in "$APP_DIR"/deploy/sql/*.sql; do
  filename="$(basename "$sql")"
  [[ "$(psql "$DATABASE_URL" -Atqc "SELECT 1 FROM schema_migrations WHERE filename='$filename' LIMIT 1;")" == "1" ]] && { echo "  ✓ $filename"; continue; }
  echo "  → $filename"
  { echo 'BEGIN;'; cat "$sql"; printf "\nINSERT INTO schema_migrations(filename) VALUES ('%s');\n" "$filename"; echo 'COMMIT;'; } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
  echo "  ✓ $filename appliquée"
done

log "Redémarrage et smoke tests"
systemctl start vigie
SERVICE_STOPPED=0
for attempt in {1..20}; do
  HEALTH_JSON="$(curl -fsS --connect-timeout 2 "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || true)"
  [[ -n "$HEALTH_JSON" ]] && break
  sleep 1
done
[[ -n "${HEALTH_JSON:-}" ]] || { journalctl -u vigie -n 80 --no-pager >&2 || true; fail "L'API ne devient pas prête."; }
echo "$HEALTH_JSON"
grep -q "\"version\":\"${EXPECTED_VERSION}\"" <<<"$HEALTH_JSON" || fail "Version API inattendue."
grep -q '"status":"ready"' <<<"$HEALTH_JSON" || fail "La BDD n'est pas prête."
AUTH_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${API_PORT}/api/auth/me")"
[[ "$AUTH_STATUS" == "401" ]] || fail "Authentification inattendue : HTTP $AUTH_STATUS."
systemctl is-active --quiet vigie || fail "Le service Vigie n'est pas actif."
DEPLOY_SUCCEEDED=1
ok "Vigie v${EXPECTED_VERSION} est opérationnelle. BDD existante conservée."
