#!/usr/bin/env bash
# Creates a verified custom-format PostgreSQL dump in backups/, copies it off the server when
# BACKUP_REMOTE is set, and prunes old local and remote dumps.
# Settings (in .env): BACKUP_RETENTION_DAYS (local, default 7), BACKUP_REMOTE (rclone remote and path,
# configured in rclone/rclone.conf; empty keeps backups on this server only),
# BACKUP_REMOTE_RETENTION_DAYS (default 30). A retention of 0 keeps every dump.

set -euo pipefail

# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RCLONE_IMAGE="${RCLONE_IMAGE:-rclone/rclone:1.71}"

label=
if [[ $# -eq 2 && $1 == --label ]]; then
  [[ $2 =~ ^[a-z0-9-]+$ ]] || fail 'the label must contain only lowercase letters, digits, and dashes'
  label=$2
elif [[ $# -ne 0 ]]; then
  echo 'Usage: scripts/backup.sh [--label <name>]' >&2
  exit 2
fi

db_name="$(env_value DB_NAME)"
db_user="$(env_value DB_USER)"
local_retention="$(env_value BACKUP_RETENTION_DAYS 7)"
remote="$(env_value BACKUP_REMOTE)"
remote_retention="$(env_value BACKUP_REMOTE_RETENTION_DAYS 30)"
[[ -n $db_name && -n $db_user ]] || fail "DB_NAME and DB_USER must be set in $DEPLOY_DIR/.env"
[[ $local_retention =~ ^[0-9]+$ && $remote_retention =~ ^[0-9]+$ ]] || fail 'retention days must be whole numbers'

umask 077
backup_dir="$DEPLOY_DIR/backups"
mkdir -p "$backup_dir" "$STATE_DIR"

exec 8>"$STATE_DIR/backup.lock"
flock 8

name="$db_name-$(date -u +%Y%m%dT%H%M%SZ)${label:+-$label}.dump"
partial="$backup_dir/.$name.partial"
trap 'rm -f "$partial"' EXIT

log "Dumping $db_name"
compose exec -T postgres pg_dump -U "$db_user" -d "$db_name" --format=custom >"$partial"
[[ -s $partial ]] || fail 'the dump is empty'
compose exec -T postgres pg_restore --list <"$partial" >/dev/null || fail 'the dump is not a readable archive'
mv "$partial" "$backup_dir/$name"
log "Saved backups/$name ($(du -h "$backup_dir/$name" | cut -f1))"

if ((local_retention > 0)); then
  find "$backup_dir" -maxdepth 1 -name '*.dump' -type f -mtime "+$local_retention" -print -delete
fi

if [[ -z $remote ]]; then
  log 'BACKUP_REMOTE is not set; the dump stays on this server only'
  exit 0
fi

rclone() {
  docker run --rm --user "$(id -u):$(id -g)" \
    -e RCLONE_CONFIG=/config/rclone.conf -e XDG_CACHE_HOME=/tmp \
    -v "$DEPLOY_DIR/rclone:/config" -v "$backup_dir:/backups:ro" \
    "$RCLONE_IMAGE" "$@"
}

log "Copying to $remote"
rclone copy "/backups/$name" "$remote"
rclone lsf "$remote/$name" | grep -qx "$name" ||
  fail "rclone finished, but $name is not listed in $remote; the local dump is kept"

if ((remote_retention > 0)); then
  rclone delete "$remote" --min-age "${remote_retention}d" --include '*.dump'
fi
log 'Off-server copy verified'
