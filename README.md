# Spend Track API

The REST API for **Spend Track**, a personal financial organization system.

A **NestJS 11** REST API with a DDD-modular architecture, TypeORM and PostgreSQL, cookie-based JWT authentication with CSRF protection, Roles + Abilities authorization,
i18n (`pt-BR` and `en`), structured logging, auditing, and a durable email outbox.

Each business module under `src/modules/` is split into domain, application, infrastructure, and
presentation layers; cross-cutting wiring lives in `src/core/`. The architecture rules are in
[`docs/conventions.md`](docs/conventions.md).

## Related repository

The related web client project is [spend-track-client](https://github.com/Arthu085/spend-track-client).
The frontend consumes the authentication, users, roles, and abilities endpoints. Its optional
[API integration suite](https://github.com/Arthu085/spend-track-client#api-integration-tests) validates
real requests and response schemas against this checkout using disposable PostgreSQL. The
repositories retain separate setup and validation, and this API can be developed, run, and validated
on its own.

## Prerequisites

- Node.js 24 LTS (pinned in [`.nvmrc`](.nvmrc)) and npm
- Docker with Docker Compose (local PostgreSQL, and Testcontainers for integration and e2e tests)

## Quick start

Create the local configuration first:

```bash
cp .env.example .env
```

Then run either the full stack in Docker, which needs no local `npm install`:

```bash
# API (watch mode) + PostgreSQL in Compose; migrations and seeds run on start
docker compose up --build -d
```

or the API on the host, against PostgreSQL in Compose:

```bash
npm install
docker compose up postgres -d
npm run migration:run
npm run seed
npm run start:dev
```

The API listens on `http://localhost:3000/api` (`PORT` changes the port). Outside production:

- Swagger UI, the reference for every route: `http://localhost:3000/api/docs`
- Seeded administrator: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`
- No email is sent (`MAIL_TRANSPORT=log`): confirmation and password-reset tokens are written to the
  application log. The `mail` Compose profile starts Mailpit to receive real SMTP mail instead

State-changing requests need a CSRF token from `GET /api/auth/csrf`; see
[frontend integration](docs/modules/auth.md#frontend-integration). Optional Compose profiles
(Mailpit, Redis) are described in [`docs/infrastructure.md`](docs/infrastructure.md#local-development).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Start the API in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run lint` / `npm run lint:check` | Lint with autofix / lint without fixing, failing on any warning |
| `npm run typecheck` | Type-check `src/` and `test/` |
| `npm test` / `npm run test:cov` | Unit tests / unit tests with the 80% coverage threshold |
| `npm run test:integration` | Integration tests against PostgreSQL in Testcontainers (needs Docker) |
| `npm run test:e2e` | HTTP end-to-end tests against PostgreSQL in Testcontainers (needs Docker) |
| `npm run migration:generate --name=<kebab-description>` | Generate a migration from entity changes |
| `npm run migration:run` | Apply pending migrations |
| `npm run seed` | Seed roles, abilities, and the first administrator |

`package.json` has the rest (`format`, `migration:revert`, the `*:prod` variants, ...). The gate
every change must pass is in [`docs/conventions.md`](docs/conventions.md#testing).

## Documentation

| Document | Covers |
| --- | --- |
| [`docs/PROJECT.md`](docs/PROJECT.md) | Purpose, stack, modules, and seeded data |
| [`docs/conventions.md`](docs/conventions.md) | Engineering rules: architecture, modules, HTTP, auth, persistence, i18n, testing, delivery |
| [`docs/core.md`](docs/core.md) | Cross-cutting mechanisms: request pipeline, guards, transactions, scheduling, mail, logging |
| [`docs/infrastructure.md`](docs/infrastructure.md) | Local environment, Docker, configuration, migrations, deployment, operations, CI |
| [`docs/modules/`](docs/modules) | One document per business module: rules, invariants, and design decisions |
| Swagger (`/api/docs`) | Every route with its request and response shapes |
