# shellcheck shell=bash
# Shared helpers for the production scripts; sourced, not executed.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$DEPLOY_DIR/.deploy"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-120}"

log() { printf '==> %s\n' "$*"; }

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

compose() { docker compose -f "$DEPLOY_DIR/compose.yml" "$@"; }

env_value() {
  local key=$1 default=${2-}
  local value
  value="$(grep -m1 "^$key=" "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2-)" || true
  printf '%s' "${value:-$default}"
}

acquire_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || fail 'another deployment or restore is running'
}

api_ready() {
  compose exec -T api node -e \
    "fetch('http://127.0.0.1:3000/api/health/ready').then((res) => process.exit(res.ok ? 0 : 1), () => process.exit(1))" \
    >/dev/null 2>&1
}

wait_for_api() {
  local deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  until api_ready; do
    ((SECONDS < deadline)) || return 1
    sleep 2
  done
}
