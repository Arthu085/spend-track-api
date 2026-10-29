# Infrastructure and operations

How to run the API locally, configure it, build and deploy its production image, and operate it. The
[`Dockerfile`](../Dockerfile), [`docker-compose.yml`](../docker-compose.yml), and
[`.env.example`](../.env.example) hold the exact settings; this document covers the decisions and
procedures they do not make obvious. Implementation of the mechanisms mentioned here is in
[`core.md`](core.md).

## Local development

### Compose services

Compose is for local development only. All services share the `backend-network` bridge network:

| Service | Started by | Notes |
| --- | --- | --- |
| `api` | `docker compose up` | `dev` image with the repository bind-mounted; runs `migration:run`, `seed`, then the watcher. Anonymous volumes keep the container's `node_modules` and `dist/` apart from the host's; `nest-cli.compose.json` disables `deleteOutDir` because `dist/` is a mounted volume. Publishes `PORT` |
| `postgres` | `docker compose up` | `postgres:16-alpine`, credentials from `DB_USER`/`DB_PASSWORD`/`DB_NAME`, data in the `postgres_data` volume. A `pg_isready` healthcheck gates `api` |
| `mailpit` | `--profile mail` | Captures every email sent over SMTP; nothing leaves the machine |
| `redis` | `--profile redis` | `redis:7-alpine` without a password, published on `127.0.0.1:6379` only |

```bash
docker compose up --build              # api + postgres
docker compose up postgres             # postgres only, for an API on the host
docker compose --profile mail up       # adds Mailpit
docker compose --profile redis up      # adds Redis
docker compose down                    # stop; keeps the database volume
docker compose down -v                 # stop and delete local database data
```

### One `.env` for both contexts

The `api` service overrides `DB_HOST=postgres`, `DB_PORT=5432`, and `MAIL_HOST=mailpit`, so the same
`.env` (with `DB_HOST=localhost`) works for an API on the host and in Compose.

### Email locally

`MAIL_TRANSPORT=log` (the default) sends nothing and writes confirmation and password-reset tokens
to the application log. To receive real emails, start the `mail` profile and set `MAIL_TRANSPORT=smtp`: the
`.env.example` values (`MAIL_PORT=1025`, no credentials) already target Mailpit, whose web UI is at
`http://localhost:8025`. If `MAIL_PORT` is unset, it falls back to the schema default `587`, not to
Mailpit.

### Redis locally

Leave `THROTTLE_REDIS_URL` empty for single-instance development. To try shared rate limiting, start
the `redis` profile and set `THROTTLE_REDIS_URL=redis://redis:6379` (API in Compose) or
`redis://localhost:6379` (API on the host).

## Docker images

One multi-stage `Dockerfile` on `node:24-alpine`:

| Stage | Contents |
| --- | --- |
| `deps` | `npm ci` with the full dependency tree |
| `build` | Compiled `dist/`, including the `i18n` JSON files |
| `prod-deps` | `npm ci --omit=dev --omit=optional` (production dependencies only) |
| `prod` | `package.json`, production `node_modules`, and `dist/` |
| `dev` | Full source and dependencies; `npm run start:dev`. The default target |

`--omit=optional` keeps `typescript` and `ts-node`, optional peers of `typeorm`, out of the
production tree. `argon2` ships musl prebuilds for `linux/amd64` and `linux/arm64`, so no image needs
a compiler toolchain. `.dockerignore` keeps every `.env*` file except `.env.example` out of the build
context.

### Production image

`docker build --target prod -t api:prod .` produces an image that runs `node dist/main.js` as the
non-root `node` user with `NODE_ENV=production`. It contains compiled code, migrations, seed scripts,
and translations, but no TypeScript source, tests, dev dependencies, or `.env`; application files
are owned by `root`. Configuration comes only from the runtime environment
([Configuration](#configuration)), and the container reaches PostgreSQL at `DB_HOST`, where
`localhost` means the container itself. Migrations and seeds never run on startup
([Migrations and seeds](#migrations-and-seeds)).

- **Port.** The API listens on `PORT` (default `3000`); `EXPOSE 3000` only documents the default.
  With another value, publish that port (`-e PORT=8080 -p 8080:8080`).
- **Healthcheck.** The image `HEALTHCHECK` calls `GET /api/health/live` with Node's `fetch` (every
  30 seconds, 5-second timeout, 3 retries, 30-second start period). It deliberately uses liveness,
  not readiness, so a database outage never marks every replica unhealthy. Orchestrators with their
  own probes ignore it ([Health probes](#health-probes)).
- **Shutdown.** `SIGTERM` stops the outbox worker from claiming jobs and waits for the delivery in
  flight, stops scheduled jobs, drains in-flight HTTP requests, closes the database pool, and exits
  with code `0`. The API spawns no child processes, so it needs no init process.

**Set a termination grace period of at least 30 seconds** (`docker stop -t 30`,
`docker run --stop-timeout 30`, Kubernetes `terminationGracePeriodSeconds`, ECS `stopTimeout`).
Docker's default of 10 seconds can be shorter than the slowest request plus one SMTP delivery, which
may wait 10 seconds to connect, 10 for the greeting, and 20 per stalled read. Validate it against
real latency: exit code `0` means a graceful stop, `137` a kill. A killed process loses only
in-flight work; an interrupted outbox job is retried after its lease expires
([Email outbox operations](#email-outbox-operations)).

## Configuration

Every variable is listed in [`.env.example`](../.env.example), whose values are local-development
examples, not defaults or production values. The boot schema (`src/core/config/validation/`)
validates the environment, so a missing, weak, or inconsistent value stops the process before it
serves traffic. Migration and seed containers validate only the `DB_*` variables (seeds also check
`SEED_ADMIN_*`); the full schema runs when the API starts.

In every environment, `COOKIE_SAMESITE=none` requires `COOKIE_SECURE=true`. With
`NODE_ENV=production` the schema also requires:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET` of at least 32 characters, without
  placeholder markers (`change-me`, `replace-me`, `placeholder`), with different access and refresh
  secrets;
- `COOKIE_SECURE=true` and `MAIL_TRANSPORT=smtp`, set explicitly;
- seed-admin values that are not known defaults or weak passwords, even while the seed is disabled
  ([Initial administrator](#initial-administrator)).

### Production values

| Variable | Production value | Secret |
| --- | --- | --- |
| `NODE_ENV` | `production`, set by the image. Enables the checks above, disables Swagger, makes the admin seed opt-in | No |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Independent random values | **Yes** |
| `COOKIE_SECRET` | Random; signs the auth cookies and CSRF tokens | **Yes** |
| `COOKIE_SECURE` | `true` | No |
| `COOKIE_SAMESITE` | `lax` when the frontend is on the API's site; `none` for another site ([deployment shapes](modules/auth.md#deployment-shapes)) | No |
| `COOKIE_DOMAIN` | Empty (host-only cookies); a parent domain exposes the cookies to every sibling subdomain | No |
| `APP_WEB_URL` | Public `https` URL of the frontend, used in email links and as the default CORS origin | No |
| `MAIL_CONFIRM_EMAIL_PATH`, `MAIL_RESET_PASSWORD_PATH`, `MAIL_USER_CHANGE_REQUEST_PATH` | The frontend routes that handle email confirmation, password reset, and change requests, appended to `APP_WEB_URL` in email links | No |
| `CORS_ORIGINS` | Every frontend origin, exact and comma-separated ([CORS](core.md#cors)) | No |
| `TRUST_PROXY` | The proxies in front of the API ([Reverse proxy and client IP](#reverse-proxy-and-client-ip)) | No |
| `THROTTLE_REDIS_URL` | Required with more than one instance; `rediss://` over untrusted networks ([Shared rate limiting with Redis](#shared-rate-limiting-with-redis)) | **Yes** (may embed a password) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | The database endpoint, set explicitly | No |
| `DB_PASSWORD` | Database password | **Yes** |
| `DB_SSL`, `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS` | See [Managed PostgreSQL](#managed-postgresql) | No |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_FROM` | Provider host, `587` (or `465` with `MAIL_SECURE=true`), and an accepted sender | No |
| `MAIL_USER`, `MAIL_PASSWORD` | SMTP credentials | **Yes** |
| `EMAIL_OUTBOX_*` | Defaults suit production; keep the worker enabled on at least one instance | No |
| `SEED_ADMIN_*` | Unset on the API; set only on the one-off container that creates the first administrator | **Yes** |
| `LOG_PRETTY` | `false`: `pino-pretty` is a dev dependency and is not in the `prod` image | No |

- Keep secrets in a secret store (the platform's secret manager, Kubernetes Secrets, Vault, ...) and
  inject them as environment variables. Never bake them into the image or commit a production `.env`.
- Generate each secret independently, for example with `openssl rand -base64 48`.
- On a single host, an env file outside the repository with `chmod 600`, passed with `--env-file`,
  is enough. Docker reads it literally, so write `MAIL_FROM=Spend Track <no-reply@spendtrack.com>` without the
  quotes `.env.example` uses for `dotenv`.
- Every instance and every one-off container needs the same values.
- **Rotating a secret signs every user out.** A new JWT secret invalidates every session, and a new
  `COOKIE_SECRET` also invalidates every CSRF token. Roll a new value to every instance in the same
  deployment.

### Managed PostgreSQL

| Variable | Local default | Managed host (RDS, Cloud SQL, Neon, ...) |
| --- | --- | --- |
| `DB_SSL` | `false` | `true`. Certificates are verified; add a provider CA with `NODE_EXTRA_CA_CERTS`, never disable verification. `PGSSLMODE` is ignored |
| `DB_POOL_MAX` | `10` | Sized for every process ([Running multiple instances](#running-multiple-instances)) |
| `DB_STATEMENT_TIMEOUT_MS` | `0` (no client timeout) | A ceiling such as `30000`. Behind a transaction pooler (PgBouncer, pooled Neon/Supabase endpoints) keep `0` and use `ALTER ROLE ... SET statement_timeout`, since poolers often reject the startup parameter |

These settings apply to the API and to the migration and seed commands alike.

### Reverse proxy and client IP

Rate limiting, audit records, and logs use the client address Express resolves from the socket and
`X-Forwarded-For`, according to `TRUST_PROXY`:

| Deployment | `TRUST_PROXY` | Effective client IP |
| --- | --- | --- |
| Direct connections (local, Compose) | `false` (default) | Socket peer; `X-Forwarded-For` ignored |
| A fixed number of proxies | Hop count, e.g. `1` | The address the outermost trusted proxy saw |
| Proxies with known addresses | List, e.g. `loopback,10.0.0.0/8` | Right-most `X-Forwarded-For` entry not in the list |

Left at `false` behind a proxy, every client shares the proxy's address: one rate-limit bucket for
everyone and the proxy in every audit record. Trust only what actually sits in front of the API: an
over-broad setting lets clients choose their own address and evade rate limiting. `true` and `/0`
ranges are rejected at boot; a hop count larger than the real chain has the same problem.

## Migrations and seeds

Both run as one-off commands with the API's environment, never on API startup in production. Locally,
`npm run migration:run` and `npm run seed` use ts-node; the Compose `api` service runs both on start.

| Command (production image) | Behavior |
| --- | --- |
| `npm run migration:run:prod` | Applies every pending migration in one transaction: a failure rolls all of them back. Applied migrations are recorded in `migrations`, so a rerun with nothing pending is a no-op. Run it from exactly one place per deployment; nothing coordinates concurrent runs |
| `npm run seed:prod` | Runs every seeder in one transaction (see below) |
| `npm run typeorm:prod -- migration:revert` | Reverts the most recently applied migration only ([Rollback](#rollback)) |

Seeders implement the `Seeder` port and are listed in a registry that `run-seed.ts` executes in one
transaction with a shared `EntityManager`. A failing seeder rolls back the whole run and is rethrown
as `Seeder "<name>" failed` with the original error as `cause`. Seeders are idempotent and only
insert what is missing, so `seed:prod` is safe on every deployment and required on the first one and
on releases that add roles or abilities. What they seed is in
[`PROJECT.md`](PROJECT.md#seeded-data).

### Initial administrator

In production the admin seed runs only with `SEED_ADMIN_ENABLED=true`, and the seed-admin rules
reject known default emails (such as `admin@email.com`), known weak passwords, and passwords shorter
than 12 characters; every environment also requires an uppercase letter, a lowercase letter, a digit,
and a symbol. Those rules are also part of the API's boot schema, so a copied development
`.env` stops the API even with the seed disabled. Create the first administrator once, passing the
values only to that container:

```bash
export SEED_ADMIN_PASSWORD="$(openssl rand -hex 16)-Aa1"
docker run --rm --env-file /path/to/production.env \
  -e SEED_ADMIN_ENABLED=true \
  -e SEED_ADMIN_EMAIL=admin@your-domain.com \
  -e SEED_ADMIN_PASSWORD \
  api:prod npm run seed:prod
unset SEED_ADMIN_PASSWORD
```

The fixed `-Aa1` suffix guarantees every required character class. `-e SEED_ADMIN_PASSWORD` without a
value forwards it from the shell, keeping it off the command line.
Hand the password over through a secure channel, or discard it and let the administrator use password
reset once SMTP works. Re-running the seed never changes an existing user's password or roles (it only confirms one that
is still unconfirmed). Do not keep `SEED_ADMIN_*`
in the API's configuration.

### Migrations and rolling deployments

Migrations run before the new code starts, and during a rolling deployment old and new instances run
side by side, so the schema after a migration must work with **both** releases:

- **Expand first:** add tables, nullable columns or columns with defaults, and indexes; keep what the
  old code reads and writes.
- **Contract in a later release:** drop or rename columns and tighten constraints only once no
  running release uses the old shape. A rename becomes add, copy, switch reads, then drop.
- **Keep migrations short.** Pending migrations share one transaction and hold their locks until it
  ends; move large backfills to a separate, batched step.

A migration that cannot be backward-compatible requires stopping the old instances before migrating
instead of rolling them over.

## Deployment

A provider-independent sequence; each step maps to the platform's equivalent (a Kubernetes `Job` and
`Deployment`, an ECS task and service, ...). `scripts/smoke-test-prod-image.sh` runs steps 2–9
against disposable containers and is the executable reference.

1. **Build an immutable image** tagged with the commit (never only `latest`) and push it:
   `docker build --target prod -t "registry.example.com/api:$TAG" .`
2. **Provide configuration and secrets** ([Configuration](#configuration)). A bad database value
   stops step 4, but other invalid values surface only when the new instances boot (steps 6–7).
3. **Check PostgreSQL** is reachable (with `DB_SSL=true` when required), and take a backup before any
   release that contains migrations.
4. **Run migrations once** as a one-off container; stop if it exits non-zero:
   `docker run --rm --env-file /path/to/production.env "registry.example.com/api:$TAG" npm run migration:run:prod`
5. **Run seeds** with `seed:prod` when needed; the first administrator is a separate one-time run.
6. **Start the new instances** from the same tag, [replacing a single instance](#single-instance-replacement)
   or [rolling](#rolling-deployment) behind a proxy or load balancer.
7. **Wait for readiness** (`GET /api/health/ready` returns `200`) before routing traffic.
8. **Verify:** both probes return `200`, logs show no boot errors or `Email outbox dispatch failed`,
   a real login succeeds, and a password-reset email reaches `SENT`.
9. **Retire old instances gracefully:** stop routing to them, let open requests finish, then send
   `SIGTERM` with a grace period of at least 30 seconds.
10. **On failure**, recover as described in [Failed deployments](#failed-deployments).

### Single-instance replacement

Two containers cannot publish the same host port, so **requests fail until the new instance is ready**
(typically a few seconds). Keep the old container stopped for a quick rollback:

```bash
docker stop -t 30 api
docker rename api api-previous
docker run -d --name api --stop-timeout 30 --env-file /path/to/production.env -p 3000:3000 \
  "registry.example.com/api:$TAG"
timeout 120 sh -c 'until curl -fs http://127.0.0.1:3000/api/health/ready >/dev/null; do sleep 2; done'

# after verification:      docker rm api-previous
# on failure (schema must still be compatible, see Rollback):
#   docker rm -f api && docker rename api-previous api && docker start api
```

### Rolling deployment

For zero downtime, a reverse proxy or load balancer owns the public port and each instance has its
own address: a loopback-bound host port, or a private Docker network the proxy shares. Set
`TRUST_PROXY` for that proxy.

```bash
# new instance next to the old one (old on 3000, new on 3001)
docker run -d --name "api-$TAG" --stop-timeout 30 --env-file /path/to/production.env \
  -p 127.0.0.1:3001:3000 "registry.example.com/api:$TAG"
timeout 120 sh -c 'until curl -fs http://127.0.0.1:3001/api/health/ready >/dev/null; do sleep 2; done'
```

Add the new upstream to the proxy (or let its readiness health check admit it), verify, remove the
old upstream, and once its open requests have finished, `docker stop -t 30` and `docker rm` the old
instance. The next deployment uses the freed port. If the new instance fails, leave the old upstream
in place and remove the new container. With more replicas, repeat one instance at a time.

### Failed deployments

- **Migration failed:** its transaction rolled back, so the schema and running release are unchanged.
  Fix the migration in a new image; never edit a migration already applied anywhere.
- **New instances never become ready:** they receive no traffic. Read their logs (configuration
  errors name the variable), stop them, and keep the old instances.
- **Problem found after traffic moved:** route traffic back to the previous instances if they still
  run, or redeploy the previous image tag.

### Rollback

**Rolling back the application does not roll back the database.** The previous image then runs
against the newer schema, which works only when the migration was backward-compatible.

Reverting the schema is a separate, deliberate step: run
`npm run typeorm:prod -- migration:revert` from the **newer** image (the older one lacks the
migration's `down()`), once per migration, and start the old image only when the schema matches it.
A `down()` may drop columns or tables with their data; confirm it is safe for data written since the
deployment, and otherwise roll forward with a fix or restore the backup from step 3.

## Health probes

| Endpoint | `200` means | Failure | Use it for |
| --- | --- | --- | --- |
| `GET /api/health/live` | The process answers HTTP | No response | Restarting the container: image `HEALTHCHECK`, orchestrator liveness probe |
| `GET /api/health/ready` | PostgreSQL answered `SELECT 1`, and Redis answered `PING` when `THROTTLE_REDIS_URL` is set, each within 2 seconds | `503` with the standard error body | Routing traffic: load balancer target health, readiness or startup probes, deployment gates |

Keep them apart. Liveness checks no dependency, so a database outage never restarts every replica in
a loop; an instance that fails readiness should leave rotation, not restart. SMTP and the email
outbox are not part of readiness: delivery is asynchronous and retried, so watch the outbox through
monitoring instead ([Email outbox operations](#email-outbox-operations)). Responses never include
connection details; failure causes go to the logs.

- Give readiness a probe timeout above its 2-second check (3 seconds or more), or a slow database
  looks like a timed-out probe instead of a `503`.
- Fail liveness only after several consecutive misses (for example 3 at a 10-second period), so a
  long garbage-collection pause does not trigger a restart.
- Readiness costs one pooled connection per check per replica; when real traffic exhausts the pool,
  readiness fails and sheds load from that replica.
- Both probes are public and unthrottled. Expose them only to the load balancer and orchestrator,
  since anyone who reaches readiness can make the API run a query per request.

## Running multiple instances

All durable state is in PostgreSQL: auth uses stateless JWT cookies plus database-backed sessions,
the email quota serializes on advisory locks, and emails are queued in `email_outbox`. Every replica
needs the same secrets and the same `THROTTLE_REDIS_URL`. Three things need attention:

- **Rate limiting needs Redis.** With in-memory counters, `N` replicas allow up to `N ×` every limit,
  including `AUTH_THROTTLE_LIMIT` on credential routes, and counters reset on every restart. Set
  `THROTTLE_REDIS_URL` on every replica.
- **Scheduled jobs run on every replica.** The current retention jobs tolerate that
  ([`core.md`](core.md#scheduling-and-retention)). A future job that must run once per schedule needs
  a lock per run (`pg_try_advisory_lock`, a Redis `SET <key> <token> NX PX <ttl>` released only by
  its owner, or a single designated replica), with a lock TTL above the job's worst-case duration.
- **Size the connection pool for the peak.** Each API process and each migration or seed container
  opens up to `DB_POOL_MAX` connections, and a rolling deployment briefly runs old and new replicas
  together:

  ```text
  (replicas during a rolling deployment, old + new) × DB_POOL_MAX
    + one-off migration/seed containers + operator and monitoring sessions
    < max_connections − superuser_reserved_connections
  ```

  Lower `DB_POOL_MAX` or put a pooler such as PgBouncer in front when the limit is small.

The email outbox worker is already multi-instance safe: replicas claim jobs with
`FOR UPDATE SKIP LOCKED` under a lease, and a crashed replica's job is reclaimed when its lease
expires. Set `EMAIL_OUTBOX_WORKER_ENABLED=false` on replicas that should only enqueue, as long as at
least one keeps it enabled.

### Shared rate limiting with Redis

With `THROTTLE_REDIS_URL` set, counters are global and survive restarts and deploys; budgets,
headers (`X-RateLimit-*`, `Retry-After`), the localized `429`, and client IP resolution stay the same.

- **Fails closed.** Redis becomes a hard dependency: the API does not boot without it, a throttled
  request that cannot reach Redis within 1 second answers `503` instead of skipping the limit
  (logged as `Rate limit storage unavailable`), and readiness fails so load balancers drain the
  instance. Liveness is unaffected, so a Redis outage never restarts containers.
- **Topology.** One standalone endpoint: a single node, a managed primary endpoint, or a proxy in
  front of a replicated setup. Redis Cluster is not supported. Every replica must use the same
  instance and database index.
- **Keys.** Each counter is a sorted set `throttler:<sha256 of route and client IP>:default:hits` of
  at most `limit + 1` entries, plus a `...:blocked` key during a block; both expire on their own.
  Memory grows with distinct clients per window.
- **Operations.** Use `maxmemory-policy noeviction` (or a dedicated instance): eviction would silently
  drop counters and lift limits. Persistence is optional, since losing counters only resets current
  windows. Require a password, and use `rediss://` over networks you do not control.

## Logging

The API writes JSON lines to stdout through Pino at `LOG_LEVEL`. Every response carries an
`X-Request-Id` (taken from a safe inbound header or generated), which also appears in the request's
log lines and audit record. Cookies and authorization headers are never logged, and email addresses
in warnings and errors are masked ([`core.md`](core.md#logging)). Useful messages to alert on:
`Unhandled exception`, `Email job failed permanently`, `Email outbox dispatch failed`,
`Rate limit storage unavailable`, `Readiness check failed`, and `Failed to persist audit log`.

## Email outbox operations

Password-reset, email-confirmation, admin change-request, and email-change notice emails are queued
in `email_outbox` and delivered by an in-process worker; the design is in
[`modules/email-outbox.md`](modules/email-outbox.md).

**Is a worker running?** Every process runs one unless `EMAIL_OUTBOX_WORKER_ENABLED=false`, which it
logs as `Email outbox worker disabled` at startup. An enabled worker logs `Email outbox dispatched`
with `sent`, `retried`, and `failed` counts when it does something. If no process runs a worker,
requests still succeed and jobs accumulate as `PENDING` until one starts.

**Inspecting the queue** (read-only; `recipient` holds personal data):

```sql
-- jobs per state, with the oldest
SELECT status, count(*), min(created_at) AS oldest, max(attempts) AS max_attempts
FROM email_outbox GROUP BY status;

-- due but unclaimed jobs; a growing number means no worker keeps up
SELECT count(*) FROM email_outbox WHERE status = 'PENDING' AND available_at <= now();

-- jobs held by a worker; an expired lease means that worker died mid-delivery
SELECT uuid, email_type, attempts, locked_until, locked_until < now() AS lease_expired
FROM email_outbox WHERE status = 'PROCESSING' ORDER BY locked_until;

-- recent retries and permanent failures, with the masked error
SELECT uuid, email_type, status, attempts, available_at, processed_at, last_error
FROM email_outbox WHERE last_error IS NOT NULL
ORDER BY coalesce(processed_at, available_at) DESC LIMIT 50;
```

**Retries and failures.** A failed attempt is retried with exponential backoff
(`Email job attempt failed; retry scheduled`, `warn`). After `EMAIL_OUTBOX_MAX_ATTEMPTS` the job is
`FAILED` (`Email job failed permanently`, `error`) and never retried; there is no replay, so the
user requests a new email, which counts against the daily quota. A job whose lease expired is
reclaimed as a new attempt, or marked `FAILED` if that was its final attempt. `SENT` and `FAILED`
rows are deleted `EMAIL_OUTBOX_RETENTION_DAYS` after `processed_at`.

**During an SMTP outage** the API stays ready and keeps accepting requests. With the defaults
(5 attempts, 60-second base delay) a job fails permanently after about 15 minutes, so for a longer
planned outage raise `EMAIL_OUTBOX_MAX_ATTEMPTS` or `EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS`
beforehand. Restarting or scaling the API does not help.

**Delivery is at-least-once.** A crash after the provider accepted a message but before it was marked
`SENT` sends it again. Each delivery mints a fresh token, so only the most recent link works.

## CI

`.github/workflows/ci.yml` runs on pull requests to `main` and pushes to `main`, in two parallel
jobs:

- **Lint, typecheck, test and build** runs the repository gate. Branch protection can require this
  job by name, so renaming it blocks merges until the rule is updated.
- **Production image smoke test** builds the `prod` target with Buildx (cached, nothing pushed) and
  runs `scripts/smoke-test-prod-image.sh`.

The smoke test uses disposable PostgreSQL and Mailpit containers and generated secrets. It checks
that the image runs as non-root and ships compiled code, migrations, seeds, and translations without
source or TypeScript tooling; that an insecure setting stops the container at boot; that migrations
are idempotent and the admin seed is opt-in and runs once; that the probes, `HEALTHCHECK`, and
missing Swagger behave as described; that CSRF bootstrap, login with `Secure` cookies,
`GET /users/me`, and a password-reset email through the outbox work; that readiness turns `503` and
recovers when PostgreSQL stops and restarts while liveness stays `200`; and that `SIGTERM` exits with
code `0`. Run it locally (requires Docker, `curl`, and `openssl`):

```bash
docker build --target prod -t api:prod .
scripts/smoke-test-prod-image.sh api:prod
```

## Known limitations

- **No deployment target.** CI builds and tests the `prod` image but publishes it nowhere; pushing
  and rolling out belong to the hosting platform.
- **No outbox metrics or replay.** Queue health comes from logs and SQL; `FAILED` jobs cannot be
  replayed.
- **No healthcheck on the Compose `api`.** Only the `prod` image declares one; Compose defines one
  only for `postgres`.
- **No scheduled-job locking.** Jobs run on every replica ([Running multiple instances](#running-multiple-instances)).
