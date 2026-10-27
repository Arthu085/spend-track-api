#!/usr/bin/env bash
# Smoke-tests a built `prod` image the way docs/infrastructure.md deploys it:
# disposable PostgreSQL and SMTP (Mailpit), generated secrets, one-off migration
# and seed containers, then the API itself. Everything it creates is removed on exit.
#
# Usage: scripts/smoke-test-prod-image.sh [image]   (default: api:prod)

set -euo pipefail

IMAGE="${1:-api:prod}"
POSTGRES_IMAGE="${SMOKE_POSTGRES_IMAGE:-postgres:16-alpine}"
MAILPIT_IMAGE="${SMOKE_MAILPIT_IMAGE:-axllent/mailpit:v1.29}"
TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-90}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="api-smoke-$$"
NETWORK="$PREFIX"
DB="$PREFIX-postgres"
SMTP="$PREFIX-mailpit"
API="$PREFIX-api"

WORK_DIR="$(mktemp -d)"
ENV_FILE="$WORK_DIR/production.env"
COOKIE_JAR="$WORK_DIR/cookies.txt"

DB_USER=app
DB_NAME=app
DB_PASSWORD="$(openssl rand -hex 24)"
ADMIN_EMAIL=smoke-admin@example.com
ADMIN_PASSWORD="$(openssl rand -hex 16)-Aa1"

step() { printf '\n==> %s\n' "$*"; }
pass() { printf '    ok: %s\n' "$*"; }
fail() {
  printf '    FAIL: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]] && docker container inspect "$API" >/dev/null 2>&1; then
    printf '\n==> API logs\n' >&2
    docker logs --tail 200 "$API" >&2 || true
  fi
  docker rm -f "$API" "$DB" "$SMTP" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
  exit "$status"
}
trap cleanup EXIT

wait_until() {
  local description=$1
  shift
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  until "$@"; do
    ((SECONDS < deadline)) || fail "timed out waiting for $description"
    sleep 1
  done
  pass "$description"
}

http_status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" || true
}

expect_status() {
  local expected=$1 url=$2
  local actual
  actual="$(http_status "$url")"
  [[ $actual == "$expected" ]] || fail "GET $url returned $actual, expected $expected"
  pass "GET $url -> $expected"
}

status_is() {
  [[ "$(http_status "$2")" == "$1" ]]
}

run_in_image() {
  docker run --rm --network "$NETWORK" --env-file "$ENV_FILE" "$@"
}

psql_value() {
  docker exec "$DB" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"
}

step "Image metadata and contents ($IMAGE)"

[[ "$(docker image inspect -f '{{.Config.User}}' "$IMAGE")" == node ]] ||
  fail 'image USER is not node'
pass 'image USER is node'

docker image inspect -f '{{.Config.Healthcheck.Test}}' "$IMAGE" | grep -q '/api/health/live' ||
  fail 'image HEALTHCHECK does not probe /api/health/live'
pass 'image HEALTHCHECK probes /api/health/live'

expected_migrations="$(find "$REPO_ROOT/src/core/database/migrations" -name '*.ts' | wc -l | tr -d ' ')"
expected_i18n="$(cd "$REPO_ROOT/src" && find i18n -name '*.json' | sort | tr '\n' ' ')"

docker run --rm --entrypoint sh \
  -e EXPECTED_MIGRATIONS="$expected_migrations" \
  -e EXPECTED_I18N="$expected_i18n" \
  "$IMAGE" -ec '
    [ "$(id -u)" != 0 ] || { echo "runs as root"; exit 1; }
    for file in dist/main.js dist/core/database/data-source.js dist/core/database/seeds/run-seed.js; do
      [ -f "$file" ] || { echo "missing $file"; exit 1; }
    done
    migrations=$(find dist/core/database/migrations -name "*.js" | wc -l)
    [ "$migrations" -eq "$EXPECTED_MIGRATIONS" ] ||
      { echo "found $migrations compiled migrations, expected $EXPECTED_MIGRATIONS"; exit 1; }
    for file in $EXPECTED_I18N; do
      [ -f "dist/$file" ] || { echo "missing dist/$file"; exit 1; }
    done
    for path in src test .env node_modules/typescript node_modules/ts-node node_modules/@nestjs/cli; do
      [ ! -e "$path" ] || { echo "unexpected $path in image"; exit 1; }
    done
    [ ! -w dist/main.js ] || { echo "application files are writable by the runtime user"; exit 1; }
  ' || fail 'image contents check'
pass "non-root uid, compiled app, $expected_migrations migrations, i18n assets; no sources or dev tooling"

step 'Disposable PostgreSQL and SMTP'

docker network create "$NETWORK" >/dev/null
docker run -d --name "$DB" --network "$NETWORK" \
  -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
  "$POSTGRES_IMAGE" >/dev/null
docker run -d --name "$SMTP" --network "$NETWORK" -p 127.0.0.1::8025 "$MAILPIT_IMAGE" >/dev/null
MAILPIT_URL="http://localhost:$(docker port "$SMTP" 8025/tcp | head -n1 | sed 's/.*://')"

postgres_ready() {
  docker exec "$DB" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 &&
    docker exec "$DB" psql -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1
}
wait_until 'PostgreSQL accepts connections' postgres_ready

step 'Production configuration with generated secrets'

umask 077
cat >"$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
TRUST_PROXY=1
APP_WEB_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
DB_HOST=$DB
DB_PORT=5432
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_SSL=false
DB_POOL_MAX=5
DB_STATEMENT_TIMEOUT_MS=30000
JWT_ACCESS_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
COOKIE_SECRET=$(openssl rand -base64 48)
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=
MAIL_TRANSPORT=smtp
MAIL_HOST=$SMTP
MAIL_PORT=1025
MAIL_SECURE=false
MAIL_FROM=no-reply@example.com
EMAIL_OUTBOX_WORKER_ENABLED=true
EMAIL_OUTBOX_POLL_INTERVAL_MS=500
LOG_LEVEL=info
EOF
pass 'environment file written with generated secrets'

if run_in_image -e COOKIE_SECURE=false "$IMAGE" >"$WORK_DIR/insecure.log" 2>&1; then
  fail 'API started with COOKIE_SECURE=false in production'
fi
grep -q 'COOKIE_SECURE' "$WORK_DIR/insecure.log" || fail 'insecure configuration failed for another reason'
pass 'insecure configuration is rejected at boot'

step 'Migrations and seeds (one-off containers)'

run_in_image "$IMAGE" npm run migration:run:prod >"$WORK_DIR/migrate.log" 2>&1 ||
  { cat "$WORK_DIR/migrate.log" >&2; fail 'migration:run:prod'; }
applied="$(psql_value 'SELECT count(*) FROM migrations')"
[[ $applied == "$expected_migrations" ]] || fail "$applied migrations recorded, expected $expected_migrations"
pass "migration:run:prod applied $applied migrations"

run_in_image "$IMAGE" npm run migration:run:prod >"$WORK_DIR/migrate-again.log" 2>&1 ||
  { cat "$WORK_DIR/migrate-again.log" >&2; fail 'second migration:run:prod'; }
grep -q 'No migrations are pending' "$WORK_DIR/migrate-again.log" || fail 'second migration run was not a no-op'
pass 'second migration:run:prod is a no-op'

run_in_image "$IMAGE" npm run seed:prod >"$WORK_DIR/seed-no-admin.log" 2>&1 ||
  { cat "$WORK_DIR/seed-no-admin.log" >&2; fail 'seed:prod without admin'; }
[[ "$(psql_value 'SELECT count(*) FROM users')" == 0 ]] || fail 'seed:prod created a user without SEED_ADMIN_ENABLED'
pass 'seed:prod seeds roles and abilities only while SEED_ADMIN_ENABLED is unset'

for run in first second; do
  run_in_image -e SEED_ADMIN_ENABLED=true -e SEED_ADMIN_EMAIL="$ADMIN_EMAIL" -e SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    "$IMAGE" npm run seed:prod >"$WORK_DIR/seed-$run.log" 2>&1 ||
    { cat "$WORK_DIR/seed-$run.log" >&2; fail "$run seed:prod with admin"; }
done
[[ "$(psql_value "SELECT count(*) FROM users WHERE email = '$ADMIN_EMAIL'")" == 1 ]] ||
  fail 'seed:prod did not create exactly one admin'
pass 'seed:prod creates the initial admin once and is idempotent'

step 'API container'

docker run -d --name "$API" --network "$NETWORK" --env-file "$ENV_FILE" -p 127.0.0.1::3000 "$IMAGE" >/dev/null
API_URL="http://localhost:$(docker port "$API" 3000/tcp | head -n1 | sed 's/.*://')/api"

wait_until 'readiness returns 200' status_is 200 "$API_URL/health/ready"
expect_status 200 "$API_URL/health/live"
for probe in live ready; do
  curl -s -D - -o /dev/null "$API_URL/health/$probe" | grep -qi '^cache-control: no-store' ||
    fail "/health/$probe response is cacheable"
done
pass 'probes send Cache-Control: no-store'

container_healthy() {
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$API")" == healthy ]]
}
wait_until 'Docker HEALTHCHECK reports healthy' container_healthy

[[ "$(docker exec "$API" id -u)" != 0 ]] || fail 'API process runs as root'
pass "API process runs as uid $(docker exec "$API" id -u)"

expect_status 404 "$API_URL/docs"

step 'Critical flows: CSRF, login, protected route'

csrf_token() {
  grep -i '^x-csrf-token:' "$1" | tail -n1 | cut -d' ' -f2 | tr -d '\r'
}

curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -D "$WORK_DIR/csrf.headers" -o /dev/null "$API_URL/auth/csrf"
token="$(csrf_token "$WORK_DIR/csrf.headers")"
[[ -n $token ]] || fail 'GET /auth/csrf returned no X-CSRF-Token header'
pass 'GET /auth/csrf issues a token'

login_status="$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -D "$WORK_DIR/login.headers" -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $token" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" "$API_URL/auth/login")"
[[ $login_status == 200 ]] || fail "POST /auth/login returned $login_status"
grep -i '^set-cookie: access_token=' "$WORK_DIR/login.headers" | grep -qi 'secure' ||
  fail 'access_token cookie is not Secure'
pass 'POST /auth/login -> 200 with Secure cookies'

me_status="$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$API_URL/users/me")"
[[ $me_status == 200 ]] || fail "GET /users/me returned $me_status"
pass 'GET /users/me -> 200 with the session cookies'

step 'Email outbox delivers through SMTP'

token="$(csrf_token "$WORK_DIR/login.headers")"
forgot_status="$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $token" \
  -d "{\"email\":\"$ADMIN_EMAIL\"}" "$API_URL/auth/forgot-password")"
[[ $forgot_status == 200 ]] || fail "POST /auth/forgot-password returned $forgot_status"
pass 'POST /auth/forgot-password -> 200'

outbox_sent() {
  [[ "$(psql_value "SELECT status FROM email_outbox WHERE email_type = 'PASSWORD_RESET'")" == SENT ]]
}
wait_until 'outbox job reaches SENT' outbox_sent

mailpit_received() {
  curl -s "$MAILPIT_URL/api/v1/messages" | grep -q "$ADMIN_EMAIL"
}
wait_until 'Mailpit received the password-reset email' mailpit_received

step 'Readiness follows PostgreSQL; liveness does not'

docker stop "$DB" >/dev/null
wait_until 'readiness returns 503 while PostgreSQL is down' status_is 503 "$API_URL/health/ready"
expect_status 200 "$API_URL/health/live"
docker start "$DB" >/dev/null
wait_until 'readiness recovers after PostgreSQL restarts' status_is 200 "$API_URL/health/ready"

step 'Graceful shutdown'

docker stop -t 30 "$API" >/dev/null
exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$API")"
[[ $exit_code == 0 ]] || fail "API exited with code $exit_code after SIGTERM"
pass 'SIGTERM drains and exits with code 0'

printf '\nProduction image smoke test passed.\n'
