#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/vigie"
APP_USER="vigie"
ENV_FILE="/etc/vigie.env"
API_PORT="${VIGIE_API_PORT:-3211}"

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

[[ $EUID -eq 0 ]] || fail "Lancez ce script avec sudo."
[[ -d "$APP_DIR/.git" ]] || fail "$APP_DIR n'est pas un dépôt Git."
[[ -f "$APP_DIR/package.json" ]] || fail "package.json absent."
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE absent."

id "$APP_USER" >/dev/null 2>&1 \
  || fail "Utilisateur $APP_USER absent."

for cmd in git node npm curl; do
  command -v "$cmd" >/dev/null 2>&1 \
    || fail "$cmd est absent."
done

cd "$APP_DIR"

# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

log "Préparation du répertoire"

# Le code et tous les artefacts générés appartiennent à vigie.
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Les anciens fichiers incrémentaux TypeScript peuvent provenir
# d'un ancien build root.
find "$APP_DIR" -name '*.tsbuildinfo' -delete

# ---------------------------------------------------------------------------
# Mise à jour Git
# ---------------------------------------------------------------------------

log "Mise à jour des sources"

sudo -u "$APP_USER" git pull --ff-only

VERSION="$(sudo -u "$APP_USER" node -p "require('./package.json').version")"

echo "Version : $VERSION"

# ---------------------------------------------------------------------------
# Dépendances
# ---------------------------------------------------------------------------

log "Installation des dépendances"

sudo -u "$APP_USER" npm ci

# ---------------------------------------------------------------------------
# Quality gate
# ---------------------------------------------------------------------------

log "Contrôle qualité"

sudo -u "$APP_USER" npm run quality

ok "Quality gate validé."

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

log "Compilation"

# On supprime explicitement les anciens dist pour garantir qu'un build
# réussi a réellement recréé les artefacts.
rm -rf \
  "$APP_DIR/apps/api/dist" \
  "$APP_DIR/apps/web/dist"

sudo -u "$APP_USER" npm run build

# ---------------------------------------------------------------------------
# Vérification du build
# ---------------------------------------------------------------------------

log "Contrôle des artefacts"

[[ -s "$APP_DIR/apps/api/dist/index.js" ]] \
  || fail "apps/api/dist/index.js n'a pas été généré."

[[ -s "$APP_DIR/apps/web/dist/index.html" ]] \
  || fail "apps/web/dist/index.html n'a pas été généré."

ok "API compilée."
ok "Web compilé."

echo
du -sh "$APP_DIR/apps/api/dist"
du -sh "$APP_DIR/apps/web/dist"

# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------

log "Migrations PostgreSQL"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ -n "${DATABASE_URL:-}" ]] \
  || fail "DATABASE_URL absent de $ENV_FILE."

if [[ -d "$APP_DIR/deploy/sql" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

  shopt -s nullglob

  for sql in "$APP_DIR"/deploy/sql/*.sql; do
    filename="$(basename "$sql")"

    applied="$(
      psql "$DATABASE_URL" -Atqc \
        "SELECT 1
           FROM schema_migrations
          WHERE filename = '$filename'
          LIMIT 1;"
    )"

    if [[ "$applied" == "1" ]]; then
      echo "  ✓ $filename déjà appliquée"
      continue
    fi

    echo "  → $filename"

    {
      echo "BEGIN;"
      cat "$sql"
      printf \
        "\nINSERT INTO schema_migrations(filename) VALUES ('%s');\n" \
        "$filename"
      echo "COMMIT;"
    } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1

    echo "  ✓ $filename"
  done
fi

# ---------------------------------------------------------------------------
# Redémarrage
# ---------------------------------------------------------------------------

log "Redémarrage"

systemctl restart vigie

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

log "Contrôle de Vigie"

HEALTH=""

for attempt in {1..20}; do
  HEALTH="$(
    curl -fsS \
      --connect-timeout 2 \
      "http://127.0.0.1:${API_PORT}/health" \
      2>/dev/null || true
  )"

  [[ -n "$HEALTH" ]] && break
  sleep 1
done

if [[ -z "$HEALTH" ]]; then
  journalctl -u vigie -n 50 --no-pager >&2 || true
  fail "Vigie ne répond pas après le redémarrage."
fi

echo "$HEALTH"

grep -q "\"version\":\"${VERSION}\"" <<<"$HEALTH" \
  || fail "L'API ne retourne pas la version ${VERSION}."

grep -q '"status":"ready"' <<<"$HEALTH" \
  || fail "L'API n'est pas prête."

systemctl is-active --quiet vigie \
  || fail "Le service vigie n'est pas actif."

ok "Vigie v${VERSION} est déployée."
