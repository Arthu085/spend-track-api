# Audit module

> Location: `src/modules/audit/` · Rules: [HTTP](../conventions.md#http) · Related:
> [global guards](../core.md#global-guards)

An append-only trail of HTTP requests in `audit_logs`. Auditing is **opt-in and write-only**: a route
is recorded only when its `endpoint()` chain has `.audit('<Subject>.<action>')`. There is no "audit
everything" mode and no read API; records are read from the database.

## Guarantees

- **Auditing never breaks the audited request.** `RecordAuditLogUseCase` logs and swallows
  persistence failures (`Failed to persist audit log`), and writes never join a use-case transaction
  ([`core.md`](../core.md#transactions)).
- **No sensitive input is stored.** Bodies, headers, cookies, and query strings are never captured:
  `path` is the request path cut at the first `?` or `#`, kept otherwise as received.
- **Unexpected errors are not stored verbatim.** `error_message` keeps an expected error's own message
  (a domain error key or an `HttpException` message, emails masked, at most 500 characters); any other
  error is stored as `Internal server error`, since its text may carry SQL, parameters, or personal
  data. The stack goes to the application log.
- **Every request to an audited route is recorded once,** including guard rejections
  (`401`, `403`, `429`), with the status code the client received.

Each record holds the action, method, path, outcome (`SUCCESS`/`FAILURE`), status code, actor uuid,
error message, and a context with client `ip`, `userAgent`, and `requestId` (the `X-Request-Id` set
before any guard runs, so denied requests correlate with their log lines).

## Why the write path spans three components

- **`AuditContextGuard`** reads the route's audit metadata once and stores an `AuditContext` on the
  request. A global exception filter cannot read handler metadata (its `ArgumentsHost` has no handler),
  so a guard has to. It never denies.
- **`AuditInterceptor`** captures the outcome and defers the write to `res.once('finish')`, because
  the final status is known only once the response is written.
- **`AllExceptionsFilter`** writes the record for requests a guard rejected, which never reached the
  interceptor. The interceptor marks requests it handled, so the two never both write.

A client-aborted request never fires `finish` and is not audited; this is an accepted trade-off.

**The caller generates the record uuid** (the interceptor on error, or the filter on the guard path),
so an unexpected `500` can return it as `auditId` without awaiting the database write.

**Actor resolution has a fallback:** an actor attached by the handler with `attachAuditActor`, then
`req.user`, then `null`. Public routes that establish an identity another way (login, refresh) attach
it themselves ([`auth.md`](auth.md#login)).

## Wiring constraints

- **`AuditModule` must be imported before `CoreThrottlerModule`** in `AppModule`, or a `429` on an
  audited route is not recorded ([global guards](../core.md#global-guards)).
- **`AuditLogPort` lives in the shared kernel** (`src/shared/application/ports/`) because the shared
  exception filter writes records and must never import a business module. `AuditModule` is
  `@Global()` so the port resolves app-wide, and the filter injects it as optional, so the app still
  boots, unaudited, without the module.

## Storage and retention

`user_id` is a nullable uuid, deliberately **not** a foreign key to `users`, so the trail never
blocks or cascades on that table. Rows extend `BaseTechnicalOrmEntity` and are never updated or
soft-deleted.

`AuditLogCleanupScheduler` runs daily at 03:00 and batch-deletes records older than
`AUDIT_LOG_RETENTION_DAYS` ([retention contract](../core.md#scheduling-and-retention)). Check your
compliance and incident-response requirements before lowering it.

## Configuration

`AUDIT_LOG_RETENTION_DAYS`.

## Not included

No body capture, no read or list endpoint, no Swagger routes, no translations (records are not
user-facing), no seeds, and no abilities.
