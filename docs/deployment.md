# Production deployment

A provider-independent setup for running the API, PostgreSQL, and the frontend on one Ubuntu server
(any VPS with Docker) with Docker Compose, Caddy, and GitHub Actions. It reuses the `prod` Docker
target and the compiled migration and seed commands described in [`infrastructure.md`](infrastructure.md).
The repository's `docker-compose.yml` is for development: it mounts the source, runs the watcher, and
publishes the database. Do not run it in production.

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

Only Caddy publishes public ports. Compose sets the values the topology fixes: `NODE_ENV=production`,
`TRUST_PROXY=1` (Caddy is the only proxy and replaces client-sent `X-Forwarded-*` headers),
`APP_WEB_URL` and `CORS_ORIGINS` as `https://$APP_DOMAIN`, `COOKIE_SECURE=true`, host-only cookies,
and the `DB_*` connection to the `postgres` service. Docker logs rotate at 10 MB × 5 files per
container. One API instance needs no Redis; add [shared Redis](infrastructure.md#shared-rate-limiting-with-redis)
before running more than one.

### Server layout

Everything lives in `DEPLOY_PATH`, for example `/srv/spend-track`. Compose names the project, its
containers, and its volumes after the directory, so keep the path stable once deployed.

| Path | Written by | Contents |
| --- | --- | --- |
| `compose.yml`, `caddy/`, `postgres/init/`, `scripts/` | API workflow, from `deploy/` | Stack definition, Caddy site, database bootstrap, operational scripts |
| `.env` | API workflow (`scripts/deploy.sh` adds `API_IMAGE`) | Compose settings; never passed to a container as a whole ([`deploy/.env.example`](../deploy/.env.example)) |
| `api.env` | API workflow | API runtime settings ([`deploy/api.env.example`](../deploy/api.env.example)) |
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
   sudo adduser --disabled-password --gecos '' deploy
   sudo usermod -aG docker deploy
   sudo install -d -o deploy -g deploy -m 750 /srv/spend-track
   ssh-keygen -t ed25519 -N '' -C github-actions -f deploy_key   # on your machine
   sudo install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
   sudo tee -a /home/deploy/.ssh/authorized_keys < deploy_key.pub
   ssh-keyscan -t ed25519 <server-host>                           # value of SSH_KNOWN_HOSTS
   ```

   Membership in the `docker` group is root-equivalent: protect the key, use it only for
   deployments, and verify the `ssh-keyscan` fingerprint against the server's console
   (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`).
4. **Firewall and SSH.** Allow only SSH, `80/tcp`, `443/tcp`, and `443/udp`, and disable SSH
   password authentication. Docker-published ports bypass `ufw` rules, which is why no service
   except Caddy publishes a public port.
5. **SMTP.** Verify the sender and publish the provider's DNS records (SPF, DKIM, and DMARC where
   supported). Prefer port 465 with `MAIL_SECURE=true`. Port 587 uses `MAIL_SECURE=false` and
   upgrades with STARTTLS only when the server advertises it; the API's transport does not require
   that upgrade, so confirm the provider always offers it before choosing 587.

## GitHub configuration

Both repositories deploy through a GitHub
[environment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)
named `production`. Create it in each repository (Settings → Environments), restrict its deployment
branches to `main`, and optionally add required reviewers. Store the values below in the environment.
The SSH values and `DEPLOY_PATH` and `APP_DOMAIN` must match in both repositories.

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
| `API_ENV_EXTRA` | No | Extra non-secret `KEY=value` lines for `api.env`, such as `LOG_LEVEL=warn` or `THROTTLE_LIMIT=200`; later lines win |

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
([Rotate credentials](#rotate-credentials)). Values must be single lines and are written to the
server literally, so do not quote them. The boot schema rejects weak or placeholder values
([Configuration](infrastructure.md#configuration)).

## Deploy

Run **Deploy** from the Actions tab (`workflow_dispatch`) on `main`. The workflow
([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)):

1. **Requires successful CI.** It stops unless the CI workflow succeeded for the exact commit.
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

Migrations and seeds never run on API startup. A failure before step 4 leaves the running release
and configuration untouched; a migration failure rolls back its own transaction. If the new API never
becomes ready, the script restores the previous configuration and image and exits with an error. That
automatic rollback does not revert migrations, so every migration must keep the previous release
working ([Migrations and rolling deployments](infrastructure.md#migrations-and-rolling-deployments)).

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

### Automatic deployment

To deploy every commit on `main` once CI passes, uncomment the `workflow_run` trigger in
`.github/workflows/deploy.yml`. The workflow then deploys the commit CI tested, and skips runs whose
CI failed. Keep the environment's required reviewers if deployments should still wait for approval.

### Deploy without GitHub Actions

On the server, with an image the server can pull or has loaded, and `.env` and `api.env` written by
hand from the examples:

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

`scripts/backup.sh` writes a custom-format `pg_dump` to `backups/`, verifies that `pg_restore` can
read it, prunes local dumps older than `BACKUP_RETENTION_DAYS`, and, when `BACKUP_REMOTE` is set,
copies it off the server with [rclone](https://rclone.org/) (run from the `rclone/rclone` image),
confirms the copy, and prunes remote dumps older than `BACKUP_REMOTE_RETENTION_DAYS`. A dump that
stays on the server does not survive the loss of the server.

**Off-server storage.** rclone supports S3-compatible storage, Backblaze B2, SFTP, Google Drive, and
more. Create the configuration with `rclone config` on any machine, wrap the destination in a
[`crypt`](https://rclone.org/crypt/) remote so the provider stores only encrypted dumps, and save the
file as the `RCLONE_CONFIG` secret. For example, with `BACKUP_REMOTE=offsite:`:

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

`rclone config` stores the crypt passwords obscured; enter them through it rather than in plain text.

Keep a copy of the `rclone.conf` (and the crypt passwords) outside the server: without them the
dumps cannot be decrypted. Give the storage credentials write access to that bucket only.

**Schedule.** Every deployment takes a pre-deploy backup. Add a daily one to the deploy user's
crontab (`crontab -e`), adjusting the path:

```cron
15 3 * * * /srv/spend-track/scripts/backup.sh >> /srv/spend-track/backups/backup.log 2>&1
```

Check `backups/backup.log`, and alert on missing or failing backups with your monitoring. Back up the
GitHub environment values (or the server's `.env`, `api.env`, and `rclone/rclone.conf`) separately in
a secure store.

## Restore and recovery

**Rehearse regularly.** Restore a dump into a scratch database, report its migration and user counts,
and drop it; the live database is not touched:

```sh
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

## Updates and rollback

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
