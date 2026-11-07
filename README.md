# Spend Track API

The REST API for **Spend Track**, a private personal finance application. It covers the complete
MVP: accounts, categories, transactions, credit cards, recurrences, budgets, investments, and a
monthly dashboard, alongside authentication and user administration.

A **NestJS 11** REST API with a DDD-modular architecture, TypeORM and PostgreSQL, cookie-based JWT authentication with CSRF protection, Roles + Abilities authorization,
i18n (`pt-BR` and `en`), structured logging, auditing, and a durable email outbox.

Each business module under `src/modules/` is split into domain, application, infrastructure, and
presentation layers; cross-cutting wiring lives in `src/core/`. The architecture rules are in
[`docs/conventions.md`](docs/conventions.md).

## Financial features

| Area | What it provides | Rules |
| --- | --- | --- |
| Accounts | Bank, savings, and cash accounts with an opening balance, one default account, and deactivation | [`accounts.md`](docs/modules/accounts.md) |
| Categories | A seeded global catalog plus each user's personal income and expense categories | [`transaction-categories.md`](docs/modules/transaction-categories.md) |
| Transactions | Planned and completed income and expenses, and transfers between the user's accounts | [`transactions.md`](docs/modules/transactions.md) |
| Credit cards | Cards, invoice cycles, purchases in up to 48 installments, refunds, and partial invoice payments | [`credit-cards.md`](docs/modules/credit-cards.md) |
| Recurrences | Weekly, monthly, or yearly income, expenses, and card charges, confirmed one occurrence at a time | [`recurrences.md`](docs/modules/recurrences.md) |
| Budgets | An overall monthly limit and optional category limits | [`budgets.md`](docs/modules/budgets.md) |
| Investments | Investments, reserves, and goals with contributions, withdrawals, and manual valuations | [`investments.md`](docs/modules/investments.md) |
| Preferences | Spending perspective (purchase date or invoice month) and the dashboard's default month | [`preferences.md`](docs/modules/preferences.md) |
| Dashboard | A monthly summary of income, expenses, balances, invoices, budgets, investments, and daily spending guidance | [`dashboard.md`](docs/modules/dashboard.md) |

The rules that keep these figures consistent:

- **Privacy:** financial data belongs to its owner. Another user's record answers `404`, including
  for administrators.
- **Planned and completed:** only completed operations change an account's actual balance. Planned
  ones affect projections, and canceled ones stay as history without affecting either.
- **No double counting:** transfers, invoice payments, and investment contributions and withdrawals
  are never counted as spending or income. A card purchase counts as spending and changes an account
  balance only when its invoice is paid.
- **Opening balances:** an opening balance already includes everything before its date, so no
  operation can be dated before the opening date of an account it touches. The date can move later
  only up to the account's earliest live operation. The amount can be corrected at any time, which
  shifts the balances by the difference. See
  [`accounts.md`](docs/modules/accounts.md#opening-balance).
- **Budgets and guidance:** budgets never block a transaction, and the daily allowance is
  informational.
- **Money:** amounts are BRL, held as integer cents in the domain and sent as decimal strings over
  HTTP.

Dedicated reports and exports, bank and brokerage integrations, shared finances, and public sign-up
are outside the MVP. Users are created by an administrator or by the seed.

## Related repository

The related web client project is [spend-track-client](https://github.com/Arthu085/spend-track-client).
The frontend consumes the authentication, administration, and financial endpoints. Its
[API integration suite](https://github.com/Arthu085/spend-track-client#api-integration-tests) validates
real requests and response schemas against this checkout using disposable PostgreSQL, and runs in the
CI of both repositories. The
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
| `npm run seed` | Seed roles, abilities, the first administrator, and the global category catalog |

`package.json` has the rest (`format`, `migration:revert`, the `*:prod` variants, ...). The gate
every change must pass is in [`docs/conventions.md`](docs/conventions.md#testing).

## Documentation

| Document | Covers |
| --- | --- |
| [`docs/PROJECT.md`](docs/PROJECT.md) | Purpose, stack, modules, and seeded data |
| [`docs/conventions.md`](docs/conventions.md) | Engineering rules: architecture, modules, HTTP, auth, persistence, i18n, testing, delivery |
| [`docs/core.md`](docs/core.md) | Cross-cutting mechanisms: request pipeline, guards, transactions, scheduling, mail, logging |
| [`docs/deployment.md`](docs/deployment.md) | First production deployment: services, HTTPS, PostgreSQL, SMTP, secrets, backups, updates |
| [`docs/infrastructure.md`](docs/infrastructure.md) | Local environment, Docker, configuration, migrations, deployment, operations, CI |
| [`docs/modules/`](docs/modules) | One document per business module: rules, invariants, and design decisions |
| Swagger (`/api/docs`) | Every route with its request and response shapes |
