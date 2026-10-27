# Project context

What this API does, which modules it has, and the data it seeds. Engineering rules are in
[`conventions.md`](conventions.md); configuration and operations in
[`infrastructure.md`](infrastructure.md).

## Purpose

A REST API for a web frontend that provides authentication with cookie-based sessions, user and
role management with administrator safeguards, ability-based authorization, request auditing, and
transactional email delivery (email confirmation, password reset, and account notifications).

## Stack

- **NestJS 11** REST API on Express with a DDD-modular architecture; TypeScript, npm.
- **PostgreSQL** through **TypeORM**, schema managed by migrations only.
- Cookie-based JWT authentication with session-bound CSRF tokens; Roles + Abilities authorization.
- nestjs-i18n (`pt-BR` default, `en`), Pino logging, Helmet, CORS allowlist, rate limiting (in
  memory or shared in Redis), `@nestjs/schedule`, Nodemailer SMTP, liveness and readiness probes.
- Jest unit, integration, and e2e tests (Testcontainers); ESLint and Prettier; GitHub Actions CI.
- A multi-stage `Dockerfile` (`dev` and `prod` targets) and a development Compose stack.

## Modules

| Module | Responsibility | HTTP routes |
| --- | --- | --- |
| [`auth`](modules/auth.md) | Login, refresh, logout, password recovery, CSRF token issuance; binds the global CSRF, JWT, and ability guards | Yes |
| [`users`](modules/users.md) | User management, role assignment, admin protection and change approvals, self-service profile and password change, email confirmation | Yes |
| [`authorization`](modules/authorization.md) | Fixed Role/Ability catalog, role grant management, and the `AbilitiesGuard` | Yes |
| [`audit`](modules/audit.md) | Append-only trail of HTTP requests on opted-in routes | No |
| [`email-quota`](modules/email-quota.md) | Per-recipient, per-type, per-UTC-day send cap; fails closed | No |
| [`email-outbox`](modules/email-outbox.md) | Durable PostgreSQL outbox and in-process worker that delivers transactional emails with retries | No |

There is no self-registration: users are created by an administrator or by the seed.

## Seeded data

`npm run seed` (and `seed:prod`) provisions:

- the roles `ADMIN` and `USER`;
- the full ability catalog, with `ADMIN` granted every ability and `USER` only `(READ, USER)`;
- one confirmed administrator from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, skipped in production
  unless `SEED_ADMIN_ENABLED=true`.

Seeds are idempotent and never reset data changed at runtime. Catalog and grant rules are in
[`modules/authorization.md`](modules/authorization.md#seeds); the seed user in
[`modules/users.md`](modules/users.md#seed-user); how seeds run in
[`infrastructure.md`](infrastructure.md#migrations-and-seeds).
