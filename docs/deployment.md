# Production deployment

A provider-independent setup for running the API, PostgreSQL, and the frontend on one Ubuntu server
(any VPS with Docker) with Docker Compose, Caddy, and GitHub Actions. It reuses the `prod` Docker
target and the compiled migration and seed commands described in [`infrastructure.md`](infrastructure.md).
The repository's `docker-compose.yml` is for development: it mounts the source, runs the watcher, and
publishes the database. Do not run it in production.

**First deployment at a glance:**

1. [Prepare the server](#prepare-the-server): DNS, Docker, a deploy user, and a firewall.
2. [Configure GitHub](#github-configuration): a `production` environment with variables and secrets,
   in this repository and in the frontend repository.
3. [Deploy the API](#deploy), then the frontend from its repository.
4. [Create the first administrator](#first-deployment) and check the site in a browser.
5. [Schedule backups](#backups) and rehearse a [restore](#restore-and-recovery).

## Architecture

The browser reaches the frontend and the API through one HTTPS origin, for example
`https://app.example.com`, the same-origin shape in [deployment shapes](modules/auth.md#deployment-shapes).
Host-only `Secure` cookies with `SameSite=Lax` stay first-party.

| Service (`deploy/compose.yml`) | Ports | Storage and role |
| --- | --- | --- |
| `caddy` | Public `80`, `443` (TCP and UDP) | Obtains and renews certificates, redirects HTTP to HTTPS, forwards `/api` unchanged to `api:3000`, answers `404` for `/api/health*`, and serves the frontend release with the frontend's own rules |
| `api` | None (`3000` on the Compose network) | The `prod` image from GitHub Container Registry; JSON logs on stdout |
| `postgres` | None (`5432` on the Compose network) | `postgres:16-alpine` with data in the `postgres_data` volume |
| `mailpit` (profile `mail`) | Web UI on the server's `127.0.0.1:8025` only | Optional temporary SMTP sink that keeps messages in memory |

Only Caddy publishes public ports. Docker logs rotate at 10 MB × 5 files per container. One API
instance needs no Redis; add [shared Redis](infrastructure.md#shared-rate-limiting-with-redis) before
running more than one.

### Configuration files

The server holds two files, both rendered by the deploy workflow from the GitHub environment:

- **`.env`** holds the server settings: domain, ACME email, PostgreSQL bootstrap, backups, Compose
  profiles, and `API_IMAGE`, which `scripts/deploy.sh` writes. Compose reads it for interpolation
  only; no container receives it as a whole. [`deploy/.env.example`](../deploy/.env.example) documents
  it.
- **`api.env`** holds the API variables from the root [`.env.example`](../.env.example), whose
  meaning and production values are in [Configuration](infrastructure.md#configuration). Compose sets
  the ones the topology fixes, which therefore never appear in `api.env`: `NODE_ENV=production`,
  `PORT=3000`, `TRUST_PROXY=1` (Caddy is the only proxy and replaces client-sent `X-Forwarded-*`
  headers), `APP_WEB_URL` and `CORS_ORIGINS` as `https://$APP_DOMAIN`, `COOKIE_SECURE=true`, an
  empty `COOKIE_DOMAIN`, and the `DB_*` connection to the `postgres` service. Variables not set
  either way use the API's defaults.

Both files are read literally: values are never quoted.

### Server layout

Everything lives in `DEPLOY_PATH`, for example `/srv/spend-track`. Compose names the project, its
containers, and its volumes after the directory, so keep the path stable once deployed.

| Path | Written by | Contents |
| --- | --- | --- |
| `compose.yml`, `caddy/`, `postgres/init/`, `scripts/` | API workflow, from `deploy/` | Stack definition, Caddy site, database bootstrap, operational scripts |
| `.env`, `api.env` | API workflow | [Configuration files](#configuration-files), mode `600` |
| `rclone/rclone.conf` | API workflow (optional) | Off-server backup destination |
| `frontend/` | Frontend workflow | `releases/<id>/`, the `current` and `previous` links, and `release.sh` |
| `backups/` | `scripts/backup.sh` | Verified database dumps |
| `.deploy/` | `scripts/deploy.sh` | Current and previous image, last configuration, locks |

The frontend repository's [deployment guide](https://github.com/Arthu085/spend-track-client/blob/main/docs/deployment.md)
describes its release layout. Caddy imports `frontend/current/frontend.caddy` and answers `503` for
non-API paths until the first frontend release.

## Prepare the server

1. **DNS.** Point the domain's `A` (and `AAAA`, if the server has IPv6) records at the server.
   Caddy needs them, and ports 80 and 443 open, to obtain a certificate.
2. **Docker.** Install Docker Engine with the Compose plugin from
   [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/), not the Snap
   package. Check with `docker compose version`.
3. **Deploy user.** Create a user that owns `DEPLOY_PATH` and can run Docker, and give GitHub
   Actions its own SSH key:

   ```sh
   # on the server
   sudo adduser --disabled-password --gecos '' deploy
   sudo usermod -aG docker deploy
   sudo install -d -o deploy -g deploy -m 750 /srv/spend-track
   sudo install -d -o deploy -g deploy -m 700 /home/deploy/.ssh

   # on your machine: create the key and print the host key line for SSH_KNOWN_HOSTS
   ssh-keygen -t ed25519 -N '' -C github-actions -f deploy_key
   ssh-keyscan -t ed25519 <server-host>

   # on the server: authorize the public key (deploy_key.pub)
   sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys <<< '<contents of deploy_key.pub>'
   ```

   Membership in the `docker` group is root-equivalent: protect the key and use it only for
   deployments. Compare the `ssh-keyscan` fingerprint (`ssh-keygen -lf -` on its output) with the one
   the server prints for `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
4. **Firewall and SSH.** Allow only SSH, `80/tcp`, `443/tcp`, and `443/udp`, and disable SSH
   password authentication. Docker-published ports bypass `ufw` rules, which is why no service
   except Caddy publishes a public port.
5. **SMTP.** Verify the sender and publish the provider's DNS records (SPF, DKIM, and DMARC where
   supported). Prefer port 465 with `MAIL_SECURE=true`. Port 587 uses `MAIL_SECURE=false` and
   upgrades with STARTTLS only when the server advertises it; the API's transport does not require
   that upgrade, so confirm the provider always offers it before choosing 587. Without a provider yet,
   use [Mailpit](#email).

## GitHub configuration

Both repositories deploy through a GitHub
[environment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)
named `production`. Create it in each repository (Settings → Environments), set **Deployment
branches** to the default branch only, and optionally add required reviewers. Store the values below
in the environment. The SSH values, `DEPLOY_PATH`, and `APP_DOMAIN` must match in both repositories.

### Variables

| Variable | Required | Value |
| --- | --- | --- |
| `SSH_HOST`, `SSH_USER` | Yes | Server address and deploy user |
| `SSH_PORT` | No | SSH port; default `22` |
| `DEPLOY_PATH` | Yes | Absolute stack directory, such as `/srv/spend-track` |
| `APP_DOMAIN` | Yes | Public hostname without scheme, such as `app.example.com` |
| `ACME_EMAIL` | Yes | Email for certificate expiry notices |
| `DB_NAME`, `DB_USER` | No | Database and role; default `spend_track`. Fixed after the first deploy |
| `MAIL_HOST` | Yes | SMTP host, or `mailpit` for the temporary sink ([Email](#email)) |
| `MAIL_PORT`, `MAIL_SECURE` | No | Default `465` and `true` |
| `MAIL_USER` | No | SMTP user |
| `MAIL_FROM` | Yes | Accepted sender, unquoted: `Spend Track <no-reply@example.com>` |
| `BACKUP_REMOTE` | No | rclone remote and path for off-server copies ([Backups](#backups)) |
| `BACKUP_RETENTION_DAYS`, `BACKUP_REMOTE_RETENTION_DAYS` | No | Default `7` and `30`; `0` keeps every dump |
| `API_ENV_EXTRA` | No | Other non-secret API variables from the root `.env.example`, one `KEY=value` per line, such as `DB_STATEMENT_TIMEOUT_MS=30000` or `LOG_LEVEL=warn`; later lines win |

### Secrets

| Secret | Required | Value |
| --- | --- | --- |
| `SSH_PRIVATE_KEY` | Yes | The deploy key's private part |
| `SSH_KNOWN_HOSTS` | Yes | The server's verified `ssh-keyscan` line; host keys are always checked |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL superuser password; never reaches the API |
| `DB_PASSWORD` | Yes | The API role's password |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` | Yes | Independent values of at least 32 characters |
| `MAIL_PASSWORD` | No | SMTP password |
| `RCLONE_CONFIG` | No | Contents of an `rclone.conf` that defines the `BACKUP_REMOTE` remote |

Generate every secret independently, for example with `openssl rand -base64 48`, and keep them
stable: changing a JWT or cookie secret signs every user out, and `POSTGRES_PASSWORD` and
`DB_PASSWORD` apply only when the database volume is first created
([Rotate credentials](#rotate-credentials)). Values must be single lines. The API's boot schema
rejects weak or placeholder values ([Configuration](infrastructure.md#configuration)).

A new API variable needs no workflow change when it is not secret: add it to `API_ENV_EXTRA`. A new
secret needs a GitHub secret and one line in the workflow's **Render configuration** step.

## Deploy

Run **Deploy** from the Actions tab (`workflow_dispatch`) on the default branch. Use the same command
for the first deployment and every update. The workflow
([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)):

1. **Requires successful CI.** It stops unless it runs on the default branch and the CI workflow
   succeeded for the exact commit.
2. **Publishes the image.** It builds the `prod` target and pushes
   `ghcr.io/<owner>/spend-track-api:<commit sha>`, or reuses that tag when it already exists.
3. **Uploads configuration.** Over SSH with a pinned host key, it copies `deploy/` to `DEPLOY_PATH`
   and renders `.env.next` and `api.env.next` from the environment's variables and secrets.
4. **Pulls the image** on the server with the job's short-lived token in a temporary Docker
   configuration, so no registry credential stays on the server.
5. **Runs `scripts/deploy.sh <image>`** (below), then checks `https://$APP_DOMAIN/api/auth/csrf`.

`scripts/deploy.sh` holds a lock, moves the staged configuration into place, and then:

1. validates the Compose and Caddy configuration and starts PostgreSQL;
2. takes a pre-deploy [backup](#backups);
3. runs `migration:run:prod` and then `seed:prod` once, in one-off containers of the new image;
   seeds create the roles, the ability catalog, and the global transaction category catalog
   ([seeded data](PROJECT.md#seeded-data));
4. replaces the API container and waits up to `READY_TIMEOUT_SECONDS` (default 120) for
   `/api/health/ready`;
5. starts or updates the other services, reloads Caddy, records the current and previous image, and
   removes older API images.

Migrations and seeds never run on API startup. A failure before step 4 restores the previous
configuration and leaves the running API untouched; a failed migration rolls back its own
transaction. If the new API never becomes ready, the script restores the previous configuration and
image and exits with an error. That automatic rollback does not revert migrations, so every migration
must keep the previous release working
([Migrations and rolling deployments](infrastructure.md#migrations-and-rolling-deployments)).

A release that applies migrations `1793896076380` and `1793897757086` to a database that already
holds financial records follows the
[financial feature cutover](infrastructure.md#historical-settlements-and-recurring-contributions-cutover):
stop the API with `docker compose stop api` before running the workflow, so no writer runs during the
migrations, and verify the preserved figures before reopening traffic. A first deployment to an empty
database needs no cutover.

The API stops briefly while its container is replaced; Caddy answers `502` meanwhile.

### First deployment

1. Deploy the API, then deploy the frontend from its repository.
2. Create the first administrator once, on the server, without storing the credentials:

   ```sh
   cd /srv/spend-track
   export SEED_ADMIN_PASSWORD="$(openssl rand -hex 16)-Aa1"
   docker compose run --rm --no-deps -e SEED_ADMIN_ENABLED=true \
     -e SEED_ADMIN_EMAIL=admin@your-domain.com -e SEED_ADMIN_PASSWORD api npm run seed:prod
   echo "$SEED_ADMIN_PASSWORD"; unset SEED_ADMIN_PASSWORD
   ```

   Hand the password over through a secure channel, or let the administrator use password reset
   ([Initial administrator](infrastructure.md#initial-administrator)).
3. Schedule [backups](#backups) and verify the release in a browser:
   - sign-in, a refresh after the access token expires, and sign-out;
   - a reload on a nested frontend route;
   - the dashboard and an account list for the signed-in user;
   - a password-reset email whose link uses the production domain;
   - in the network panel: `Secure`, `HttpOnly` auth cookies with `SameSite=Lax`, and successful
     CSRF-protected mutations.

### Updates

Merge to the default branch, wait for CI, and run **Deploy** again. Deploy the API before a frontend
release that needs its new endpoints, and keep API changes compatible with the frontend still
running. Changed variables or secrets take effect on the next deployment; redeploying the same commit
reuses its image and only applies the new configuration.

### Automatic deployment

Manual deployment is the default. To also deploy every push to the default branch once CI passes,
uncomment the `workflow_run` trigger in `.github/workflows/deploy.yml` (adjust `branches` if the
default branch is not `main`). Manual runs keep working. Before enabling it:

- **Branch restrictions.** Keep the `production` environment limited to the default branch. The
  workflow also deploys only CI runs that succeeded for a `push` to the default branch of this
  repository, never pull requests or forks.
- **Approval.** Required reviewers on the environment turn each automatic run into a pending
  deployment that someone approves; remove them only when every merge may go live.
- **Concurrency.** Deployments run one at a time per repository. A deployment that is waiting
  replaces an older waiting one, so a burst of merges deploys the newest commit once the running
  deployment ends; the running one is never cancelled.
- **Rollback.** A release that never becomes ready rolls back on its own, but migrations stay
  applied, so only merge backward-compatible migrations. After a manual rollback, the next merge
  deploys again: revert the faulty commit first.
- **Two repositories.** Each repository deploys on its own merges, so an API change that the
  frontend needs must reach production before the frontend change.

### Deploy without GitHub Actions

On the server, write `.env` from [`deploy/.env.example`](../deploy/.env.example) and `api.env` as
described in [Configuration files](#configuration-files), then deploy an image the server can pull or
has loaded:

```sh
cd /srv/spend-track
scripts/deploy.sh ghcr.io/<owner>/spend-track-api:<commit sha>
```

## Email

For a real provider, set the `MAIL_*` variables and `MAIL_PASSWORD`. To run without a provider for a
while, set `MAIL_HOST=mailpit`, `MAIL_PORT=1025`, and `MAIL_SECURE=false`: the workflow then enables
the `mail` profile, and the API delivers every email to Mailpit, which keeps the latest 500 messages
in memory and sends nothing out. Open its UI through an SSH tunnel:

```sh
ssh -L 8025:127.0.0.1:8025 deploy@<server-host>   # then browse http://localhost:8025
```

Switching back to a provider and redeploying leaves the Mailpit container running; stop it with
`docker compose --profile mail rm -sf mailpit`.

## Backups

**Database backups are not server snapshots.** A provider's VPS snapshot copies the whole disk at a
point in time: useful to rebuild a broken server quickly, but taken while PostgreSQL writes (so it
may need crash recovery), stored with the same provider, and usually restorable only as a whole
server. The database backups below are consistent `pg_dump` files that restore into any PostgreSQL
16 on any host, one database at a time. Use snapshots as an extra layer if the provider offers them,
never as the only backup.

`scripts/backup.sh` writes a dump to `backups/`, checks that `pg_restore` can read it, deletes local
dumps older than `BACKUP_RETENTION_DAYS`, and, when `BACKUP_REMOTE` is set, copies it off the server
with [rclone](https://rclone.org/) (run from the `rclone/rclone` image), confirms the copy, and deletes
remote dumps older than `BACKUP_REMOTE_RETENTION_DAYS`. Every deployment and every live restore takes
one first. A dump that stays on the server does not survive the loss of the server.

### Set up

1. **Off-server storage (recommended).** rclone supports S3-compatible storage, Backblaze B2, SFTP,
   Google Drive, and more. On your machine, run `rclone config` to add the storage, then add a
   [`crypt`](https://rclone.org/crypt/) remote on top of it so the provider stores only encrypted
   files. For example, with `BACKUP_REMOTE=offsite:`, the resulting file looks like:

   ```ini
   [storage]
   type = s3
   provider = Other
   endpoint = https://s3.example.com
   access_key_id = ...
   secret_access_key = ...

   [offsite]
   type = crypt
   remote = storage:spend-track-backups
   password = ...
   password2 = ...
   ```

   Save the file's contents as the `RCLONE_CONFIG` secret, set `BACKUP_REMOTE`, and redeploy. Keep a
   copy of the file, which includes the crypt passwords, outside the server: without it the dumps
   cannot be decrypted. Give the storage credentials access to that bucket only.
2. **Schedule.** As the deploy user, run `crontab -e` and add a daily backup, adjusting the path:

   ```cron
   15 3 * * * /srv/spend-track/scripts/backup.sh >> /srv/spend-track/backups/backup.log 2>&1
   ```

   Two backups never run at once. A backup during a deployment is safe: `pg_dump` reads a
   consistent snapshot.
3. **Check.** Run `scripts/backup.sh` once by hand, rehearse a [restore](#restore-and-recovery), and
   watch `backups/backup.log` (or alert on it) for failures and missing days.

Back up the GitHub environment values (or the server's `.env`, `api.env`, and `rclone/rclone.conf`)
separately in a password manager or another secure store.

## Restore and recovery

**Rehearse regularly.** Restore a dump into a scratch database, report its migration and user counts,
and drop it; the live database is not touched:

```sh
cd /srv/spend-track
scripts/restore.sh --check backups/<name>.dump
```

**Restore the live database.** This replaces everything written since the dump:

```sh
scripts/restore.sh backups/<name>.dump --yes
```

It takes a `pre-restore` backup, stops the API, recreates the database, restores the dump in one
transaction, applies the running image's pending migrations, and starts the API. If it fails, it
prints the command that restores the `pre-restore` dump. To restore an off-server copy, download it
first:

```sh
docker run --rm --user "$(id -u):$(id -g)" -e RCLONE_CONFIG=/config/rclone.conf \
  -v "$PWD/rclone:/config" -v "$PWD/backups:/backups" rclone/rclone:1.71 \
  copy offsite:<name>.dump /backups
```

**Recover on a new server.** Prepare it as above, point `SSH_HOST`, `SSH_KNOWN_HOSTS`, and DNS at it,
deploy the API (with the same secrets) and the frontend, download the latest dump into `backups/`,
and run the live restore. Re-add the backup cron entry.

## Rollback

- **Automatic:** a release that never becomes ready is replaced by the previous image and
  configuration ([Deploy](#deploy)).
- **Manual, on the server:** `scripts/deploy.sh --rollback` redeploys the previous image (kept
  locally) through the same checks; running it again rolls forward. The configuration stays as is.
- **Manual, from GitHub:** re-run an earlier successful **Deploy** run, which redeploys that commit's
  published image, rendering the environment's current variables and secrets. Re-running jobs keeps
  that run's workflow definition.
- **Schema:** rolling back the application does not roll back the database. Revert a migration only
  deliberately, with `docker compose run --rm --no-deps api npm run typeorm:prod -- migration:revert`
  from the newer image ([Rollback](infrastructure.md#rollback)), or restore a backup when data written
  since the release may be lost.
- **Financial records:** once historical settlements or contribution recurrences exist, the
  [financial feature rollback boundary](infrastructure.md#historical-settlements-and-recurring-contributions-cutover)
  takes precedence: never roll back to an image older than migrations `1793896076380` and
  `1793897757086` without its preflight.
- **Frontend:** roll back in the frontend repository; its releases are independent of the API image.

## Operations

```sh
cd /srv/spend-track
docker compose ps                         # status and health
docker compose logs -f --tail 100 api     # JSON logs; see infrastructure.md#logging
docker compose exec postgres psql -U spend_track -d spend_track   # SQL as DB_USER on DB_NAME, e.g. outbox queries
docker compose restart api                # restart without redeploying
```

Never run `docker compose down -v`, `docker volume prune`, or anything that removes the
`postgres_data` or `caddy_data` volumes: the first holds the database, the second the certificates
and ACME account. Watch the [email outbox](infrastructure.md#email-outbox-operations) and the
health probes, which are only reachable from the server:

```sh
docker compose exec api node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(async (r) => console.log(r.status, await r.text()))"
```

### Rotate credentials

- **JWT and cookie secrets, SMTP:** update the secret and redeploy; changed signing secrets sign every
  user out.
- **`DB_PASSWORD`:** change the role first, then the secret, then redeploy:
  `docker compose exec postgres psql -U postgres -c "ALTER ROLE spend_track PASSWORD '<new password>'"`.
- **`POSTGRES_PASSWORD`:** `ALTER ROLE postgres PASSWORD '...'` likewise. It applies only when the
  volume is first initialized; the scripts connect through the container's local socket.
- **`DB_NAME`, `DB_USER`:** apply only to a new volume. Renaming them later needs `ALTER DATABASE` and
  `ALTER ROLE` before the next deployment.

## Manual hosting work

This repository provisions no external service. Choosing the server and domain, DNS, the firewall,
the GitHub environment and its values, SMTP verification, the off-server storage, the backup cron
entry and its monitoring, restore drills, and host updates remain manual.
