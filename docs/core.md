# Core mechanisms

Cross-cutting mechanisms in `src/core/` and `src/shared/` that every module relies on, with the
constraints that are easy to break when changing them. The rules that follow from them are in
[`conventions.md`](conventions.md); operational guidance is in [`infrastructure.md`](infrastructure.md).

## Bootstrap and request pipeline

`configureApp(app, config)` (`src/core/bootstrap/configure-app.ts`) is the single source of the HTTP
pipeline, applied in this order: trust proxy, the `/api` global prefix, Helmet, signed
`cookie-parser`, CORS, the global exception filters, and validation. `main.ts` adds only
process-level concerns: the Pino logger, shutdown hooks, Swagger, and `listen`. E2E tests build apps
through `createTestApp()`, which applies the same `configureApp`, so global HTTP behavior belongs in
`configureApp`, never in `main.ts` or a single spec.

A request passes through:

1. **Middleware.** Pino assigns the request id (an inbound `X-Request-Id` matching `[\w-]{1,100}`, or
   a new UUID) and echoes it in the `X-Request-Id` response header. `TRUST_PROXY` decides the `req.ip`
   used by rate limiting, audit, and logs ([`infrastructure.md`](infrastructure.md#reverse-proxy-and-client-ip)).
2. **Global guards**, in the order described in [Global guards](#global-guards).
3. **Global pipes.** `AppValidationPipe` (class-validator with localized messages) reports one error
   per field: a missing or `null` value gets only `validation.REQUIRED`, a wrong type only its type
   message, and nested fields use their full path (`abilities.0.subject`). `ParseUuidParamPipe`
   validates `:uuid` parameters.
4. **`AuditInterceptor`** for routes with `.audit(...)` ([`modules/audit.md`](modules/audit.md)).
5. **Controller → use-case → ports → repository adapter.**
6. **`ResponseEnvelopeInterceptor`** wraps the result in `{ data, meta }`, resolves `meta.message`
   from `.successMessage(...)`, and unwraps a `PaginatedResult` into `data` plus
   `{ total, page, limit }` in `meta`.
7. **`AllExceptionsFilter`** maps `DomainError`s (through `DOMAIN_ERROR_STATUS_MAP`) and
   `HttpException`s to the standard error body, translating messages shaped like i18n keys. Nest's
   own 404 for an unmatched route becomes `errors.route_not_found`, so the message never echoes the
   method and path. An unexpected exception is a generic 500, logged with its stack. The filter is
   also the fallback audit writer for requests a guard rejected.

Language resolution: `Accept-Language`, then the `x-lang` header, then `?lang=`, falling back to
`DEFAULT_LOCALE` (`pt-BR`).

### Exception filter registration order

`AllExceptionsFilter` is not bound with `APP_FILTER`. `setupExceptionHandling()` registers it with
`app.useGlobalFilters(...)` from `configureApp()`, **before** `setupValidation()` registers
`I18nValidationExceptionFilter`. Nest checks global filters in reverse registration order, so the
specific validation filter wins for validation errors and the catch-all handles everything else. Any
new global filter must be registered with `app.useGlobalFilters(...)` after
`setupExceptionHandling(app)`; an `APP_FILTER` provider resolves earlier and would be shadowed by the
catch-all.

### CORS

CORS is credentialed, matches `Origin` exactly against `CORS_ORIGINS`, and exposes the
`X-CSRF-Token` response header. Unset, `CORS_ORIGINS` defaults to the origin of `APP_WEB_URL` (the
frontend, not the API) in every environment; an explicit value, including an empty one that disables
cross-origin access, replaces that default. Each entry must be a serialized `http`/`https` origin
(`scheme://host[:port]`, lowercase, punycode, no default port, path, trailing slash, `*`, or `null`),
because a browser never sends anything else and such an entry would silently match nothing.
`APP_WEB_URL` must be an `http`/`https` URL, so the default is never the opaque `null` origin.

Requests from other origins still reach the app, but the browser hides the response, and a request
carrying `X-CSRF-Token` fails its preflight. A "simple" cross-site request cannot set that header, so
`CsrfGuard` rejects it.

## Global guards

| Order | Guard | Bound in | Purpose |
| --- | --- | --- | --- |
| 1 | `AuditContextGuard` | `AuditModule` | Resolves the route's audit metadata onto the request; never denies |
| 2 | `ThrottlerGuard` | `CoreThrottlerModule` | Rate limiting |
| 3 | `CsrfGuard` | `AuthModule` | Session-bound CSRF check on unsafe methods |
| 4 | `JwtAuthGuard` | `AuthModule` | Authenticates the access cookie, unless `.public()` |
| 5 | `AbilitiesGuard` | `AuthModule` (`useExisting`, owned by `AuthorizationModule`) | Enforces `.ability(...)` against database grants |

Nest applies `APP_GUARD`s in module-import order, so `AppModule`'s import list is part of the
contract (`AuditModule` → `CoreThrottlerModule` → `AuthModule` → ...). Each position is load-bearing:

- `AuditContextGuard` before `ThrottlerGuard`, so a `429` on an audited route is still recorded.
- `CsrfGuard` before `JwtAuthGuard`, so a CSRF failure costs no database round-trip. `CsrfGuard`
  verifies the JWT signatures itself, without database access, to find the session a token is bound
  to.
- `JwtAuthGuard` before `AbilitiesGuard`, which reads the actor from `req.user`.

The three auth guards are bound together in `auth.module.ts` so their relative order is fixed at one
call site ([`modules/auth.md`](modules/auth.md#guards-and-csrf)).

### Rate limiting

`ThrottlerGuard` applies the global `THROTTLE_TTL`/`THROTTLE_LIMIT` budget. Routes marked with
`PublicAuthFlowThrottle()` get the stricter `AUTH_THROTTLE_TTL`/`AUTH_THROTTLE_LIMIT` budget: login,
refresh, forgot-password, reset-password, confirm-email, resend-confirmation, `PATCH /users/me`,
which verifies the current password on an email change, and `PATCH /users/me/password`. `buildThrottlerOptions` resolves the budget
per request from that marker, because `@Throttle(...)` values are fixed at import time, before
configuration loads. A `429` carries the `errors.too_many_requests` key and is localized like any
other error.

Counters live in process memory unless `THROTTLE_REDIS_URL` is set. Then `ThrottlerRedisModule`
opens one `ioredis` client at boot (`THROTTLER_REDIS_CLIENT`, closed on shutdown) and
`RedisThrottlerStorage` stores the counters in Redis. Its Lua script mirrors the in-memory semantics
(sliding window, nothing counted while blocked, a fresh budget after a block) using Redis `TIME`, so
switching storage never changes a limit. Commands time out after 1 second and are not queued while
disconnected; any storage failure becomes `503 errors.service_unavailable`, so the throttler fails
closed instead of letting requests through unlimited. Operational guidance:
[`infrastructure.md`](infrastructure.md#shared-rate-limiting-with-redis).

## Configuration loading

Every variable is validated at boot by the Joi schema in
`src/core/config/validation/env.validation.ts`, the only place defaults are declared. The schema is
composed from one fragment per namespace (`appEnvSchema`, `mailEnvSchema`, ...); each `registerAs`
factory in `src/core/config/configurations/` validates its own fragment with `validateEnv` and maps
the result without fallbacks. Code reads configuration through the typed `AppConfigService`. With
`NODE_ENV=production` the schema also rejects insecure values
([`infrastructure.md`](infrastructure.md#configuration)).

## Swagger UI

`setupSwagger` serves Swagger UI at `/api/docs` and the spec at `/api/docs-json`, outside production
only. The document's version and description come from `package.json`, resolved from the working
directory.

Its `requestInterceptor` makes "Try it out" work with cookie auth: every request uses
`credentials: 'include'`, and unsafe requests to the page's own origin copy `csrf_token` from
`document.cookie` into `X-CSRF-Token` (call `GET /api/auth/csrf` first). This requires:

- **The UI under `/api`.** `csrf_token` has `Path=/api`, and browsers expose a cookie to
  `document.cookie` only on pages inside its path.
- **The same origin as the API.** Cross-origin, the browser cannot read the API's cookies.
- **Inlined constants.** Swagger ships the interceptor as source text, so it cannot import
  constants. A unit spec pins the cookie and header names to `CSRF_TOKEN_COOKIE` and
  `CSRF_HEADER_NAME`; the safe-method list must be kept in step with `CsrfGuard` by hand.

## Persistence

### Connection options

`buildTypeOrmOptions(database)` (`src/core/database/typeorm-options.ts`) is the single source of the
TypeORM options: entity and migration globs, `synchronize: false`, `uuidExtension: 'pgcrypto'`, and
the managed-host settings (`DB_SSL` → `ssl`, `DB_POOL_MAX` → `poolSize`, `DB_STATEMENT_TIMEOUT_MS` →
`statement_timeout`, sent only when non-zero). It is pure and reads only its argument.
`DatabaseModule` passes the validated runtime config; the CLI-only `data-source.ts` (TypeORM CLI and
seeds) loads `.env` and validates the `DB_*` variables itself. Runtime code must never import
`data-source.ts`.

### Transactions

`DatabaseModule` (`@Global()`) provides `TRANSACTION_MANAGER` (`TypeOrmTransactionManager`,
implementing the shared `TransactionManagerPort`). Use-cases call
`runInTransaction(async () => { ... })`; the port takes no manager argument, so the application
layer stays TypeORM-free.

Repositories are bound to the default `EntityManager`, so a plain `dataSource.transaction(...)`
would not include them: their writes would auto-commit outside the transaction without any error.
`TypeOrmTransactionManager` therefore runs the callback inside a module-level
`AsyncLocalStorage<EntityManager>`, and `BaseTransactionalRepository` returns the ambient
transactional repository when one is active for the same `DataSource`. **An adapter that does not
extend `BaseTransactionalRepository` silently escapes every transaction.** Both classes key the
"already in a transaction" check on `DataSource` identity and must keep agreeing.

- **Nesting joins.** A nested `runInTransaction` runs in the outer transaction. Catching a nested
  failure and continuing does not work: PostgreSQL has already aborted the transaction.
- **`runInSavepoint(work)`** is the exception. Inside a transaction it wraps `work` in a savepoint,
  so a failure rolls back only `work` and the outer transaction stays usable; outside one it behaves
  like `runInTransaction`. Its only user is email scheduling
  ([`modules/email-outbox.md`](modules/email-outbox.md#scheduling)).
- **Audit writes never join a transaction.** A rollback would erase the failure trail, and a failed
  audit insert would abort an unrelated transaction. Audit records are written on the response's
  `finish` event, after any use-case transaction has ended
  ([`modules/audit.md`](modules/audit.md)).

Multi-write flows in `auth` and `users` (login, refresh, logout, password reset, email confirmation,
user mutations, change requests, and token issuing by the outbox handlers) lock the user row before
any token row and claim one-time tokens with a conditional `UPDATE`, so concurrent replays of a token
cannot both commit. The per-flow rules are in [`modules/auth.md`](modules/auth.md) and
[`modules/users.md`](modules/users.md#sessions-and-tokens).

## Scheduling and retention

`CoreSchedulingModule` registers `ScheduleModule.forRoot()` once so any module can declare
`@Cron(...)` handlers. Every replica runs every job; a job must be safe to run concurrently or take a
lock ([`infrastructure.md`](infrastructure.md#running-multiple-instances)). The email outbox worker is
not a cron job: it polls on its own interval and is replica-safe through `SKIP LOCKED`
([`modules/email-outbox.md`](modules/email-outbox.md#worker)).

Each module that owns an unbounded technical table owns the job that prunes it:

| Scheduler | Module | Table(s) | Cadence | Retention variable |
| --- | --- | --- | --- | --- |
| `AuthTokenCleanupScheduler` | `auth` | `refresh_tokens`, `password_reset_tokens` | hourly | `REFRESH_TOKEN_RETENTION_DAYS`, `PASSWORD_RESET_TOKEN_RETENTION_DAYS` |
| `EmailConfirmationTokenCleanupScheduler` | `users` | `email_confirmation_tokens` | hourly | `EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS` |
| `EmailOutboxCleanupScheduler` | `email-outbox` | `email_outbox` (`SENT`/`FAILED`) | hourly | `EMAIL_OUTBOX_RETENTION_DAYS` |
| `EmailSendLogCleanupScheduler` | `email-quota` | `email_send_logs` | daily, 03:00 | `EMAIL_SEND_LOG_RETENTION_DAYS` |
| `AuditLogCleanupScheduler` | `audit` | `audit_logs` | daily, 03:00 | `AUDIT_LOG_RETENTION_DAYS` |

Except for refresh tokens ([`modules/auth.md`](modules/auth.md#token-cleanup)), every job uses
`deleteInBatches` with `deleteBatchBefore`: each batch of `RETENTION_CLEANUP_BATCH_SIZE` rows is one
short autocommit `DELETE ... WHERE id IN (SELECT ... ORDER BY id LIMIT $n FOR UPDATE SKIP LOCKED)`,
repeated until a batch comes back short. Runs are bounded, safe to repeat, and safe in parallel on
several replicas (they split the backlog). Deletes are physical; each scheduler logs and swallows its
own failure. Every job is optional: setting its retention variable to `0` skips it on every tick, so
those rows are kept indefinitely.

## Mail sending

`CoreMailModule` wraps Nodemailer in `MailSenderService.send({ to, subject, html, text })`. It is a
plain, non-global module imported by `UsersModule`, which owns the `UserNotifier` adapters
([`modules/users.md`](modules/users.md#notifications)).

- The transporter is created on the first `send()`, so boot never touches SMTP and
  `MAIL_TRANSPORT=log` never loads it. It is closed on shutdown.
- Connection and greeting timeouts are 10 seconds and the socket timeout 20 seconds (constants), so
  a stalled SMTP server fails a send in bounded time.
- `auth` is passed only when both `MAIL_USER` and `MAIL_PASSWORD` are set, which lets an
  unauthenticated relay such as Mailpit work.
- `send()` rejects on failure. Quotas and retries live above it, in the email outbox
  ([`modules/email-outbox.md`](modules/email-outbox.md)).

## Token hashing and one-time tokens

`CoreHashingModule` binds the shared `TOKEN_HASHER` port to `Sha256TokenHasher`; `AuthModule` and
`UsersModule` import it.

- **Only for machine-generated secrets** (signed JWTs or 32 random bytes), where a fast deterministic
  digest is enough. Human passwords stay on argon2 `PasswordHasher`.
- `verify(hash, token)` compares hex digests with `crypto.timingSafeEqual` and returns `false` on a
  length mismatch. A stored value in any other format never matches, so it fails closed.

`OneTimeToken` (`src/shared/application/tokens/`) owns the `<uuid>.<secret>` format of reset and
confirmation links: a random v4 `uuid` that locates the row and a 32-byte base64url `secret` of which
only the SHA-256 digest is stored. `parse` returns `null` for anything else, so a malformed link is
rejected before any database lookup. Each flow keeps its own table, TTL, and error.

## Active-record policy

`assertRecordActive(record, error)` (`src/shared/domain/policies/`) throws the given error when a
record is not `ACTIVE`. Use-cases call it after the not-found check with their module's
`Inactive*Error`, which extends the shared `InactiveRecordError` and maps to `409`: the record exists
and the caller may reach it, but its state conflicts with the operation.

It is a use-case check, not a guard or a repository filter: a guard would have to load the record a
second time, and filtering inactive rows in repositories would turn them into "not found" for every
caller, including flows that must load them (login reports an accurate error for an inactive user;
the status toggle reactivates one). Exemptions are listed in
[`conventions.md`](conventions.md#http).

## Logging

`buildPinoHttpOptions` (`src/core/logging/pino-options.factory.ts`) removes `req.headers.cookie`,
`req.headers.authorization`, and `res.headers["set-cookie"]` from request logs and serializes only
the request id, method, URL, and status. This is a hard security requirement:
`pino-options.factory.redaction.spec.ts` asserts that secrets never reach the output, and custom log
statements must never dump raw `req`/`res` objects, which would bypass it.

Structured logging and masking rules are in [`conventions.md`](conventions.md#logging).
`redactEmails` is best-effort: it matches common `local@domain.tld` shapes in linear time and misses
quoted local parts and dotless hosts. `AllExceptionsFilter` logs an unhandled 5xx as
`{ msg, error, stack }` with emails masked in both.

## Health probes

`CoreHealthModule` exposes `GET /api/health/live` and `GET /api/health/ready`. Both are `.public()`,
`.skipThrottle()`, unaudited, and answer with `Cache-Control: no-store`; success bodies are
`{ "data": { "status": "ok" }, "meta": {} }`. How deployments use them is in
[`infrastructure.md`](infrastructure.md#health-probes).

- **Liveness** checks nothing beyond the process answering HTTP.
- **Readiness** (`ReadinessService`) takes one pooled connection and runs `SELECT 1`, and also sends
  `PING` to the throttler's Redis when `THROTTLE_REDIS_URL` is set. Any failure is a `503`
  (`errors.service_unavailable`); the cause is logged as a `warn` per failed check
  (`Readiness check failed`), never returned.

A 2-second deadline (`READINESS_CHECK_TIMEOUT_MS`) bounds each check, because the pool has no connect
or query timeout and a half-open socket would otherwise wait for the OS TCP timeout. On timeout or
error, the connection is released with the error so `pg-pool` destroys it instead of reusing it, and
a connection arriving after the deadline is destroyed too. The service handles the client's `error`
event while it holds a connection, since an unhandled one would crash the process. Overlapping checks
share one in-flight check per dependency. SMTP and the outbox are deliberately not checked: delivery
is asynchronous and retried, so neither restarting nor draining an instance would help.
