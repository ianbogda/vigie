# ---------------------------------------------------------------------------
# Staging éphémère
# ---------------------------------------------------------------------------

log "Préparation du staging"
echo "Source  : $SOURCE_DIR"
echo "Staging : $STAGING_DIR"

# Le staging doit être construit uniquement à partir des sources.
# Les artefacts produits localement dans le checkout ne doivent jamais
# être propagés : ils peuvent appartenir à root ou être obsolètes.
rsync -a \
  --delete \
  --chown="$APP_USER:$APP_USER" \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='*.tsbuildinfo' \
  "$SOURCE_DIR/" "$STAGING_DIR/"

STAGING_VERSION="$(
  node -p "require('$STAGING_DIR/package.json').version"
)"

[[ "$STAGING_VERSION" == "$EXPECTED_VERSION" ]] \
  || fail "Version du staging inattendue : $STAGING_VERSION au lieu de $EXPECTED_VERSION."

# Vérification des droits avant npm.
[[ "$(stat -c '%U' "$STAGING_DIR")" == "$APP_USER" ]] \
  || fail "Le staging $STAGING_DIR n'appartient pas à $APP_USER."

sudo -u "$APP_USER" test -w "$STAGING_DIR" \
  || fail "Le staging $STAGING_DIR n'est pas inscriptible par $APP_USER."

ok "Sources v${EXPECTED_VERSION} copiées dans le staging."

# ---------------------------------------------------------------------------
# Quality gate + build
# ---------------------------------------------------------------------------

log "Installation, quality gate et build dans le staging"

sudo -u "$APP_USER" -- bash -c '
  set -Eeuo pipefail

  staging_dir="$1"
  cd "$staging_dir"

  echo "Workspace npm : $(pwd)"
  echo "Utilisateur    : $(id -un)"

  if [[ "$(pwd -P)" != "$(realpath "$staging_dir")" ]]; then
    echo "ERREUR: workspace npm inattendu." >&2
    exit 1
  fi

  echo
  echo "==> npm ci"
  npm ci

  # npm/tsc peuvent générer des .tsbuildinfo.
  # Ils seront ici créés par APP_USER, jamais par root.
  echo
  echo "==> npm run quality"
  npm run quality

  echo
  echo "==> npm run build"
  npm run build
' _ "$STAGING_DIR"

log "Contrôle des artefacts construits"

check_dist "$STAGING_DIR" "Staging"
check_build_version "$STAGING_DIR" "Staging" "$EXPECTED_VERSION"

echo "API :"
du -sh "$STAGING_DIR/apps/api/dist"

echo "Web :"
du -sh "$STAGING_DIR/apps/web/dist"
