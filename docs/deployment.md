# First production deployment

A provider-independent guide for a first, small production deployment on a single host. It reuses
the `prod` Docker target and the compiled migration and seed commands described in
[`infrastructure.md`](infrastructure.md). The repository's `docker-compose.yml` is for development:
it mounts the source, runs the watcher, and publishes the database. Do not run it in production.

## Services and connections

Start with one API instance and one frontend origin, for example `https://app.example.com`:

| Service | Connections and storage |
| --- | --- |
| HTTPS reverse proxy and static server | Public ports 80/443; redirects HTTP to HTTPS, serves the frontend's `dist/`, forwards `/api/` unchanged to the private API |
| API `prod` image | Private port 3000; connects to PostgreSQL and the SMTP provider; logs JSON to stdout |
| PostgreSQL 16 | Private port 5432; persistent disk or Docker named volume at `/var/lib/postgresql/data`; scheduled off-host backups |
| SMTP provider | Outbound SMTP from the API; verified sender domain and provider credentials |

The browser reaches the frontend and the API through the same HTTPS origin, the same-origin shape in
[deployment shapes](modules/auth.md#deployment-shapes). Host-only `Secure` cookies with
`SameSite=Lax` stay first-party, so no third-party cookie support is needed. Build the frontend with
`VITE_API_URL=https://app.example.com`, without `/api`: its HTTP client adds the prefix. The
[frontend deployment guide](https://github.com/Arthu085/spend-track-client/blob/main/docs/deployment.md)
covers static serving, client-side routing fallback, asset caching, and PWA verification.

One host is enough to start. A managed database also works with the
[managed PostgreSQL settings](infrastructure.md#managed-postgresql), including certificate-verified
TLS. Leave `THROTTLE_REDIS_URL` unset for one API instance; in-memory rate limits reset on restart.
Add [shared Redis](infrastructure.md#shared-rate-limiting-with-redis) before running more than one
instance.

## Prepare the host

1. **Host and DNS.** Choose a host with Docker, persistent storage, and enough memory for PostgreSQL
   and the API. Point the domain's DNS at the proxy and expose only HTTPS, its HTTP redirect and
   certificate challenge, and restricted operator access.
2. **HTTPS.** Configure a certificate with automatic renewal at the reverse proxy or hosting ingress,
   and check HTTPS before the first sign-in: production cookies require it. Make the proxy overwrite
   incoming `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` with values it sets. With
   exactly one proxy and no direct public access to the API, set `TRUST_PROXY=1`; re-evaluate it
   when a CDN or another proxy is added ([Reverse proxy and client IP](infrastructure.md#reverse-proxy-and-client-ip)).
3. **Persistent database storage.** Keep PostgreSQL data on a named volume or persistent disk and
   reuse it for every container replacement; removing a container must not remove its data. Never
   run `docker compose down -v`, `docker volume prune`, or an empty replacement volume against
   production. A volume is not a backup, and a managed database needs an explicit backup policy too.
4. **SMTP.** Verify the sender and publish the provider's DNS records (SPF, DKIM, and DMARC where
   supported). Prefer port 465 with `MAIL_SECURE=true`, which uses TLS from the start of the
   connection. Port 587 uses `MAIL_SECURE=false` and upgrades with STARTTLS only when the server
   advertises it; the API's transport does not require that upgrade, so confirm the provider always
   offers it before choosing 587.

### Self-hosted PostgreSQL

Keep the database on a private Docker network. The examples below use the network `spend-track`, the
container `spend-track-postgres`, the volume `spend-track-postgres-data`, and the role and database
`spend_track`. Create a
PostgreSQL-only env file outside every checkout, with mode `600`, holding a unique bootstrap
password (`POSTGRES_USER=postgres`, `POSTGRES_DB=postgres`, `POSTGRES_PASSWORD=<generated value>`),
then provision once:

```sh
docker network create spend-track
docker volume create spend-track-postgres-data
docker run -d --name spend-track-postgres --restart unless-stopped \
  --network spend-track --env-file /srv/spend-track/postgres.env \
  --mount type=volume,src=spend-track-postgres-data,dst=/var/lib/postgresql/data \
  postgres:16-alpine
docker exec spend-track-postgres pg_isready -U postgres -d postgres
docker exec -it spend-track-postgres createuser -U postgres --pwprompt spend_track
docker exec spend-track-postgres createdb -U postgres --owner=spend_track spend_track
```

`createuser` creates a login role without superuser, role-creation, or database-creation
privileges. Enter a separately generated password at its prompt and use it as the API's
`DB_PASSWORD`. The `spend_track` role owns the application database, so migrations can create its schema;
the bootstrap superuser credentials never enter the API's environment. The production image smoke
test runs migrations and seeds as such a role ([CI](infrastructure.md#ci)).

The database publishes no host port. Pin a tested PostgreSQL image digest for the real host.

## Runtime environment

Create `/srv/spend-track/production.env` outside every checkout with mode `600`, or use the host's secret
manager. Start from an empty file rather than a copy of `.env.example`, whose development secrets
and admin credentials are rejected in production. Docker reads `--env-file` values literally, so do
not quote `MAIL_FROM`. Replace every example host, address, and secret:

```dotenv
NODE_ENV=production
PORT=3000
APP_WEB_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
TRUST_PROXY=1
DB_HOST=spend-track-postgres
DB_PORT=5432
DB_USER=spend_track
DB_PASSWORD=<generated password of the spend_track role>
DB_NAME=spend_track
DB_SSL=false
DB_POOL_MAX=10
DB_STATEMENT_TIMEOUT_MS=30000
JWT_ACCESS_SECRET=<independent random secret>
JWT_REFRESH_SECRET=<independent random secret>
COOKIE_SECRET=<independent random secret>
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=
MAIL_TRANSPORT=smtp
MAIL_HOST=<provider SMTP host>
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=<provider user>
MAIL_PASSWORD=<provider password>
MAIL_FROM=Spend Track <no-reply@your-domain.com>
LOG_PRETTY=false
EMAIL_OUTBOX_WORKER_ENABLED=true
```

- Generate each signing secret independently with `openssl rand -base64 48` and keep the values
  across restarts and updates; changing one signs every user out.
- Leave `SEED_ADMIN_*` out of this file.
- `DB_SSL=false` fits only the private same-host database; an external database uses verified TLS.
- Keep `CORS_ORIGINS` an exact origin without a trailing slash or wildcard.
- Never put database, SMTP, or signing secrets in frontend variables or Docker build arguments, and
  never disable CSRF or secure cookies to troubleshoot hosting.

[Configuration](infrastructure.md#configuration) and
[Production values](infrastructure.md#production-values) define every other variable and the boot
validation rules.

## First release

Build from the reviewed commit and tag the image with it; keep that tag for updates and rollback.
Then run migrations and seeds as one-off containers on the private network:

```sh
TAG="$(git rev-parse --short HEAD)"
API_IMAGE="spend-track-api:$TAG"
docker build --target prod -t "$API_IMAGE" .
docker run --rm --network spend-track --env-file /srv/spend-track/production.env \
  "$API_IMAGE" npm run migration:run:prod
docker run --rm --network spend-track --env-file /srv/spend-track/production.env \
  "$API_IMAGE" npm run seed:prod
```

Stop at the first failing command. Run migrations from one place only; nothing coordinates
concurrent runs. Seeds create the roles, the ability catalog, and the global transaction category
catalog ([seeded data](PROJECT.md#seeded-data)). Create the first administrator as described in
[Initial administrator](infrastructure.md#initial-administrator), adding `--network spend-track` and
`"$API_IMAGE"` to that one-off `docker run`, so no administrator credential stays in the API's
environment.

Start the API with a restart policy on the same network. This example assumes the proxy runs on the
Docker host; a containerized proxy joins the `spend-track` network and targets `api:3000` instead, with no
published API port:

```sh
docker run -d --name api --restart unless-stopped --stop-timeout 30 \
  --network spend-track --env-file /srv/spend-track/production.env \
  -p 127.0.0.1:3000:3000 "$API_IMAGE"
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
```

Point the proxy at `127.0.0.1:3000` with the `/api` prefix preserved. Do not cache API responses,
authentication headers, or cookies. Expose the [health probes](infrastructure.md#health-probes) only
to operators and hosting checks, not through the public proxy. Docker's restart policy restarts
exited processes, not containers that are merely `unhealthy`, so monitor both probes.

### Browser verification

Build the frontend with its production variables and publish its complete `dist/` through the
proxy. Readiness checks neither SMTP nor browser authentication, so in a real HTTPS browser verify:

- sign-in, a refresh after the access token expires, and sign-out;
- a reload on a nested frontend route;
- the dashboard and an account list for the signed-in user;
- a password-reset email whose link uses the production domain;
- in the network panel: `Secure`, `HttpOnly` auth cookies with `SameSite=Lax`, and successful
  CSRF-protected mutations.

## Backups and restore rehearsal

Schedule at least daily encrypted off-host backups, plus one before every release with migrations.
Choose retention and the acceptable data-loss window explicitly, and alert on failed or missing
backups. A dump kept only on the same host does not survive host or disk loss. Back up runtime
secrets and proxy configuration separately through a secure store.

For the self-hosted example, create a consistent custom-format dump and restore it into a separate,
empty database. Never restore over the live database:

```sh
umask 077
mkdir -p /srv/spend-track/backups
BACKUP="/srv/spend-track/backups/spend-track-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec spend-track-postgres pg_dump -U spend_track -d spend_track --format=custom > "$BACKUP"
test -s "$BACKUP"
docker exec spend-track-postgres createdb -U postgres --owner=spend_track --template=template0 spend_track_restore_check
docker exec -i spend-track-postgres pg_restore -U spend_track -d spend_track_restore_check \
  --exit-on-error --no-owner --no-privileges < "$BACKUP"
docker exec spend-track-postgres psql -U spend_track -d spend_track_restore_check \
  -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM migrations;'
```

Keep the rehearsal database away from the running API, confirm the expected schema and records, and
then drop only that database. Encrypt the dump, copy it off-host, verify the copy, and periodically
rehearse a full recovery on an isolated host. Managed databases use the provider's
restore-to-new-database procedure. `pg_dump` captures one database, not cluster roles, so record the
roles a recovery must recreate. See PostgreSQL's
[backup documentation](https://www.postgresql.org/docs/16/backup-dump.html).

## Updates and rollback

1. Pass the repository gate and the production image smoke test, then build a new commit-tagged
   image and frontend bundle. Keep the previous ones.
2. Take and verify a backup. Run pending migrations and seeds once from the new image before starting
   it; stop if either fails. Keep the schema compatible with the previous release
   ([Migrations and rolling deployments](infrastructure.md#migrations-and-rolling-deployments)).
   A release that applies migrations `1793896076380` and `1793897757086` follows the
   [financial feature cutover](infrastructure.md#historical-settlements-and-recurring-contributions-cutover)
   instead of the steps below.
3. Replace the API with the [single-instance replacement](infrastructure.md#single-instance-replacement)
   procedure, keeping `--network spend-track`, `--restart unless-stopped`, the same env file, and the
   loopback binding from this guide. A single instance has a short outage. Never delete the database
   volume.
4. Wait for readiness, publish the new frontend bundle atomically, and repeat the browser
   verification. Keep the hashed assets that open tabs still reference and follow the frontend's PWA
   update guidance. Watch the JSON logs and the
   [email outbox](infrastructure.md#email-outbox-operations).
5. On failure, choose deliberately among three different operations:
   - **Application rollback:** run the previous image and frontend bundle. The database is unchanged,
     so this works only if the newer schema still supports the previous release.
   - **Schema revert:** run `migration:revert` from the newer image as described in
     [Rollback](infrastructure.md#rollback); a `down()` can drop data written since the release.
   - **Backup restore:** replaces everything written since the backup. Prefer a forward fix when
     production data would be lost.

## Manual hosting work

This repository and its CI provision no external service. Choosing the host and domain, DNS,
certificates and renewal, private networks and firewall, secret injection, persistent storage, SMTP
verification, image and bundle publication, restart supervision, probe and log monitoring, and
backup scheduling with restore drills remain manual.

References: [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
explains loopback bindings; [Nodemailer SMTP](https://nodemailer.com/smtp) defines the TLS settings.
