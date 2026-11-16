#!/usr/bin/env bash
# Restores a dump created by backup.sh.
#
# Usage: scripts/restore.sh --check <dump>   restore into a scratch database, report it, and drop it
#        scripts/restore.sh <dump> --yes     replace the live database with the dump
#
# A live restore takes a pre-restore backup, stops the API, recreates the database, restores the dump,
# applies the running image's pending migrations, and starts the API again. Everything written since
# the dump was taken is lost.

set -euo pipefail

# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '4,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

mode=
dump=
case "${1:-} ${2:-}" in
  '--check '?*) mode=check dump=$2 ;;
  *' --yes') mode=live dump=$1 ;;
  *) usage ;;
esac
[[ $# -eq 2 && $dump != -* ]] || usage
[[ -s $dump ]] || fail "$dump does not exist or is empty"

db_name="$(env_value DB_NAME)"
db_user="$(env_value DB_USER)"
[[ -n $db_name && -n $db_user ]] || fail "DB_NAME and DB_USER must be set in $DEPLOY_DIR/.env"

superuser_sql() {
  compose exec -T postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
    -v db="$1" -v owner="$db_user"
}

create_database() {
  superuser_sql "$1" <<'SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db" OWNER :"owner";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
SQL
}

drop_database() {
  superuser_sql "$1" <<<'DROP DATABASE IF EXISTS :"db" WITH (FORCE);'
}

restore_into() {
  compose exec -T postgres pg_restore -U "$db_user" -d "$1" \
    --exit-on-error --single-transaction --no-owner --no-privileges <"$dump"
}

acquire_lock
compose up -d --wait postgres >/dev/null
compose exec -T postgres pg_restore --list <"$dump" >/dev/null || fail "$dump is not a readable archive"

if [[ $mode == check ]]; then
  scratch="${db_name}_restore_check"
  trap 'drop_database "$scratch"' EXIT
  log "Restoring into the scratch database $scratch"
  create_database "$scratch"
  restore_into "$scratch"
  migrations="$(compose exec -T postgres psql -U "$db_user" -d "$scratch" -tAc 'SELECT count(*) FROM migrations')"
  users="$(compose exec -T postgres psql -U "$db_user" -d "$scratch" -tAc 'SELECT count(*) FROM users')"
  log "Restore check passed: $migrations migrations, $users users; dropping $scratch"
  exit 0
fi

log 'Backing up the live database first'
"$DEPLOY_DIR/scripts/backup.sh" --label pre-restore
safety="$(find "$DEPLOY_DIR/backups" -maxdepth 1 -name '*-pre-restore.dump' -type f | sort | tail -n1)"

log 'Stopping the API'
compose stop api

failed() {
  printf 'ERROR: the restore failed; the API is stopped.\n' >&2
  printf 'Restore the pre-restore backup with: scripts/restore.sh %s --yes\n' "$safety" >&2
}
trap failed ERR

log "Recreating $db_name from $dump"
create_database "$db_name"
restore_into "$db_name"

log 'Applying pending migrations of the running image'
compose run --rm --no-deps -T api npm run migration:run:prod

log 'Starting the API'
compose up -d --no-deps api
wait_for_api || fail 'the API did not become ready; inspect its logs'
trap - ERR
log 'Restore complete'
