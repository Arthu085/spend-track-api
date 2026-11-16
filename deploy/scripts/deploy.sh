#!/usr/bin/env bash
# Deploys an API image to the production stack in this directory, or rolls back to the previous one.
#
# Usage: scripts/deploy.sh <image>      deploy an image, for example ghcr.io/owner/repo:<commit sha>
#        scripts/deploy.sh --rollback   redeploy the image that ran before the last successful deploy
#
# Staged configuration (.env.next, api.env.next) replaces .env and api.env first. The sequence is:
# validate, pull, pre-deploy backup, migrations, seeds, API replacement, readiness. A failure before
# the API is replaced leaves the running release untouched; a failed readiness check restores the
# previous image and configuration. Migrations already applied are not reverted.

set -euo pipefail

# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CONFIG_FILES=(.env api.env)

cd "$DEPLOY_DIR"

usage() {
  sed -n '4,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

set_env_value() {
  local key=$1 value=$2 file=$3 tmp
  tmp="$(mktemp "$file.XXXXXX")"
  grep -v "^$key=" "$file" >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$file"
}

snapshot_config() {
  local file
  rm -rf "$STATE_DIR/config.previous"
  mkdir -p "$STATE_DIR/config.previous"
  for file in "${CONFIG_FILES[@]}"; do
    [[ ! -f $file ]] || cp -p "$file" "$STATE_DIR/config.previous/$file"
  done
}

restore_config() {
  local file
  for file in "${CONFIG_FILES[@]}"; do
    [[ ! -f $STATE_DIR/config.previous/$file ]] || cp -p "$STATE_DIR/config.previous/$file" "$file"
  done
}

apply_staged_config() {
  local file
  for file in "${CONFIG_FILES[@]}"; do
    [[ ! -f $file.next ]] || mv "$file.next" "$file"
    [[ -f $file ]] || fail "$DEPLOY_DIR/$file is missing; see docs/deployment.md"
    chmod 600 "$file"
  done
}

remove_old_images() {
  local keep_current=$1 keep_previous=$2 repository image
  repository="${keep_current%@*}"
  repository="${repository%:*}"
  docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' | while read -r image; do
    [[ $image == "$keep_current" || $image == "$keep_previous" || $image == *:'<none>' ]] && continue
    docker image rm "$image" >/dev/null 2>&1 || true
  done
  docker image prune -f >/dev/null
}

[[ $# -eq 1 ]] || usage
acquire_lock
mkdir -p frontend/releases

current_image="$(cat "$STATE_DIR/current-image" 2>/dev/null || true)"
case "$1" in
  --rollback)
    target_image="$(cat "$STATE_DIR/previous-image" 2>/dev/null || true)"
    [[ -n $target_image ]] || fail 'no previous image is recorded'
    ;;
  -*) usage ;;
  *) target_image=$1 ;;
esac

log "Deploying $target_image"
snapshot_config
apply_staged_config
set_env_value API_IMAGE "$target_image" .env

abort() {
  printf 'ERROR: %s\n' "$*" >&2
  log 'Restoring the previous configuration; the running release is unchanged'
  restore_config
  exit 1
}

compose config --quiet || abort 'invalid Compose configuration'

if ! docker image inspect "$target_image" >/dev/null 2>&1; then
  docker pull "$target_image" || abort "cannot pull $target_image"
fi

compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null ||
  abort 'invalid Caddy configuration'

log 'Starting PostgreSQL'
compose up -d --wait postgres || abort 'PostgreSQL did not become healthy'

log 'Backing up the database'
"$DEPLOY_DIR/scripts/backup.sh" --label pre-deploy || abort 'pre-deploy backup failed'

log 'Running migrations'
compose run --rm --no-deps -T api npm run migration:run:prod || abort 'migrations failed and were rolled back'

log 'Running seeds'
compose run --rm --no-deps -T api npm run seed:prod || abort 'seeds failed and were rolled back'

log 'Replacing the API'
compose up -d --no-deps api

if ! wait_for_api; then
  printf 'ERROR: the API did not become ready within %ss\n' "$READY_TIMEOUT_SECONDS" >&2
  compose logs --tail 100 api >&2 || true
  restore_config
  if [[ -n $current_image ]]; then
    log "Rolling back to $current_image"
    compose up -d --no-deps api
    wait_for_api || fail 'the previous release did not become ready either; inspect the API logs'
    log 'Previous release restored'
  fi
  exit 1
fi

log 'Starting the remaining services'
compose up -d --remove-orphans
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile

if [[ $target_image != "$current_image" ]]; then
  [[ -z $current_image ]] || printf '%s\n' "$current_image" >"$STATE_DIR/previous-image"
  printf '%s\n' "$target_image" >"$STATE_DIR/current-image"
fi
remove_old_images "$target_image" "$(cat "$STATE_DIR/previous-image" 2>/dev/null || true)"

log "Deployed $target_image"
