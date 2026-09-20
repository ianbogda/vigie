#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${VIGIE_BACKUP_DIR:-/var/backups/vigie}"
ENV_FILE="${VIGIE_ENV_FILE:-/etc/vigie.env}"
RETENTION_DAYS="${VIGIE_BACKUP_RETENTION_DAYS:-14}"

[[ -f "$ENV_FILE" ]] || { echo "ERREUR: $ENV_FILE absent." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "ERREUR: DATABASE_URL absent." >&2; exit 1; }

install -d -m 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$BACKUP_DIR/vigie-${stamp}.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$backup" "$DATABASE_URL"
pg_restore --list "$backup" >/dev/null
chmod 600 "$backup"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'vigie-*.dump' -mtime "+$RETENTION_DAYS" -delete
printf '%s\n' "$backup"
