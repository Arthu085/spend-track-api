# Email quota module

> Location: `src/modules/email-quota/` · Consumer: [`email-outbox.md`](email-outbox.md)

A per-recipient daily send cap for transactional emails. The quota key is
`(EmailType, recipient, UTC day)`: each recipient has an independent budget per email type
(`MAIL_DAILY_LIMIT_PASSWORD_RESET`, `MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION`,
`MAIL_DAILY_LIMIT_USER_CHANGE_REQUEST`, `MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE`). The goal is fair use
per recipient, not protecting a provider-wide sending budget.

The module has no HTTP surface. Its only caller is the outbox's `ScheduleEmailUseCase`, through
`EmailQuotaPort` (`src/shared/application/ports/`), which sits in the shared kernel with the
`EmailType` enum because the consumer is a sibling module. `EmailQuotaModule` is not global;
`EmailOutboxModule` imports it.

## Contract

- **Denial is silent.** The port returns `{ allowed: false, reason }` and never throws, so the module
  never contributes to an error response. Callers decide what a denial means
  ([`email-outbox.md`](email-outbox.md#scheduling)).
- **`limit <= 0` disables an email type** (`DISABLED`) without touching the database. For
  `MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE` this turns off the notice to a replaced address; the email
  change itself still commits.
- **Exhausted** (`EXHAUSTED`) once the recipient used the day's limit for that type.
- **Fails closed.** Any repository failure (database down, lock timeout) is `UNAVAILABLE`: a quota
  that cannot be checked never lets an email through uncounted, or an attacker who can slow the
  database could bypass the limit.
- **Recipients are normalized** (`trim().toLowerCase()`) inside the use-case, so differently-cased
  addresses share a bucket and match the normalized account email.
- **The UTC day is computed in the application** (`toUtcDay`) and passed to the query, never
  `CURRENT_DATE`, which would depend on the database session's time zone.

Exhausted and unavailable decisions are logged with the recipient masked.

## Where the gate runs

The quota is consumed in exactly one place: when the outbox schedules a job, in the same savepoint
as the job insert. One slot buys one job and every retry of it, so delivery failures neither bypass
nor multiply the limit. A job that ends `FAILED` keeps its slot; refunding it would let failures
reopen the budget.

Public flows (forgot-password, resend-confirmation) schedule without any account lookup, so the gate
sees the same input for known and unknown addresses; the account is resolved later by the delivery
handler. Putting a lookup before the gate would create an account-existence side channel.

## Mechanism

Storage is append-only: one `email_send_logs` row per consumed slot, with no counter column and no
stored day. `consumeDailySlot` runs in a (sub)transaction:

1. Set a 3-second `lock_timeout` and take
   `pg_advisory_xact_lock(hashtextextended('email-quota:<type>:<recipient>:<day>', 0))`, then restore
   the previous `lock_timeout` so the short timeout never leaks into the caller's statements.
2. Count the rows for `(email_type, recipient)` whose database-generated `created_at` falls in the
   UTC day.
3. If below the limit, insert a row and return the new count; otherwise return no slot.

- **Why a lock.** Count-then-insert without one lets two concurrent requests both see `limit - 1`
  and both insert.
- **Why an advisory lock.** An append-only table has no counter row to lock or upsert, and different
  keys never contend, so the bottleneck is per key, not global. `SERIALIZABLE` with retries would add
  a retry pattern used nowhere else; an anchor row per key would recreate the counter table.
- **Why the timeout.** A request never hangs on a pooled connection; the timeout fails closed as
  `UNAVAILABLE`.
- **Transaction-scoped.** The `_xact_` lock is released when the outermost transaction ends.
  `TypeOrmEmailSendLogRepository` extends `BaseTransactionalRepository`, so inside a caller's
  transaction the work runs on the same connection as a savepoint: a lock timeout rolls back only the
  quota attempt, a slot consumed for a user write that rolls back is rolled back too, and no second
  connection can deadlock against the caller's locks.

## Retention

`EmailSendLogCleanupScheduler` runs daily at 03:00 and batch-deletes rows older than
`EMAIL_SEND_LOG_RETENTION_DAYS` ([retention contract](../core.md#scheduling-and-retention)). The
smallest enabled retention, 1 day, always keeps the current UTC day, so pruning never resets a budget, and
the deletes need no advisory lock. The quota index cannot serve a bare `created_at` range, so each
batch walks the primary key; a run with nothing to delete scans the table, which is why the job runs
daily.

## Configuration

`MAIL_DAILY_LIMIT_*` (one per email type, `0` disables it) and `EMAIL_SEND_LOG_RETENTION_DAYS`.

## Known limitations

- **`MAIL_TRANSPORT=log` still consumes quota**, for parity between environments. Raise the limits
  locally if the defaults get in the way.
- No domain entity or mapper: the repository port deals only in primitives, and each row is an
  immutable attempt.
