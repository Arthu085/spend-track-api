# Email outbox module

> Location: `src/modules/email-outbox/` · Consumers: [`auth.md`](auth.md), [`users.md`](users.md) ·
> Quota: [`email-quota.md`](email-quota.md) · Operations:
> [`infrastructure.md`](../infrastructure.md#email-outbox-operations)

Durable, asynchronous delivery of the transactional emails: password reset, email confirmation,
admin change-request notifications, and email-change notices. A request never sends mail itself: it
**schedules** a job in the `email_outbox` table, and an in-process worker **delivers** it later with
retries. Jobs live in PostgreSQL, so they survive crashes and deploys and commit together with the
writes that schedule them, without Redis or a message broker.

The module has no HTTP surface. Callers use `EmailOutboxPort` (`EMAIL_OUTBOX_PORT`), and business
modules register delivery handlers in `EmailJobHandlerRegistry` (`EMAIL_JOB_HANDLER_REGISTRY`), both
in the shared kernel.

```text
schedule ──► PENDING ──claim──► PROCESSING ──handler ok──► SENT
                ▲                    │
                └──── retry ◄────────┤ handler throws, attempts < max
                                     └─ handler throws, attempts = max ──► FAILED
              PROCESSING with an expired lease is claimable again (crash recovery)
```

## Scheduling

`schedule({ emailType, recipient })` normalizes the recipient, consumes a quota slot, and inserts a
`PENDING` job, all inside `runInSavepoint(...)`:

- **Slot and job commit together**, so failures and retries never leak or multiply the daily budget.
- **Inside a caller's transaction they also commit with the caller's writes** (transactional
  outbox): a rolled-back user change leaves no job and no consumed slot.
- **The savepoint protects the caller.** A scheduling failure (quota lock timeout, insert error)
  rolls back only the slot and job and leaves the caller's transaction usable.
- **It never throws.** It returns `{ scheduled: true }` after a successful insert, or
  `{ scheduled: false, reason: 'DISABLED' | 'EXHAUSTED' | 'UNAVAILABLE' }`, logged with a masked
  recipient. The caller owns the policy: public routes ignore the result; user writes roll back on
  `UNAVAILABLE` and commit without the email on a quota denial
  ([`users.md`](users.md#email-confirmation)).

A job stores only `email_type`, the normalized `recipient`, and the request `locale` (an unsupported
language falls back to the default), because the worker runs outside any request. **It never stores a
token or a link.**

## Delivery

The worker claims up to 20 jobs per run, one at a time, and calls the handler registered for each
type:

| Email type | Handler | Module |
| --- | --- | --- |
| `PASSWORD_RESET` | `DeliverPasswordResetEmailUseCase` | `auth` |
| `EMAIL_CONFIRMATION` | `DeliverEmailConfirmationUseCase` | `users` |
| `USER_CHANGE_REQUEST` | `DeliverUserChangeRequestEmailUseCase` | `users` |
| `EMAIL_CHANGE_NOTICE` | `DeliverEmailChangeNoticeUseCase` | `users` |

Token handlers resolve the account by recipient, then lock and revalidate it in a transaction, mint a
fresh token that supersedes earlier ones, and send after the commit; they complete without sending
when the account no longer qualifies ([`auth.md`](auth.md#password-recovery),
[`users.md`](users.md#email-confirmation)). The change-request handler sends a tokenless notification
only while a pending request exists, and the email-change notice goes to the replaced address without
any lookup. Consequences:

- **No sensitive payload at rest.** The raw token exists only in memory between its write and the
  send; `email_outbox` reveals who was emailed, not how to use a link.
- **No account enumeration.** Account resolution happens in the worker, so the public routes do the
  same work for every address.
- **No token bound to a replaced address.** Revalidation runs on every attempt.
- **Only the latest link works.** Every attempt mints a fresh token, so a retried or duplicated email
  leaves exactly one usable link, and its TTL starts at delivery.

## Retries and crash recovery

A handler that throws fails the attempt; the error message (emails masked, at most 1,000 characters)
is stored in `last_error`. While `attempts < EMAIL_OUTBOX_MAX_ATTEMPTS`, the job returns to `PENDING`
at `now + EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS × 2^(attempts − 1)`, capped at one hour. The last
allowed failure marks it `FAILED`, logged at `error`, and it is never claimed again. A job with no
registered handler fails the same way instead of staying stuck.

`claimNext` is one statement that selects the next due job with `FOR UPDATE SKIP LOCKED`, marks it
`PROCESSING`, increments `attempts`, and sets a two-minute lease (`locked_until`). Concurrent workers
on different replicas therefore claim different jobs.

- **Crash recovery.** A job left `PROCESSING` by a dead process is reclaimed as a new attempt once its
  lease expires; the SMTP timeouts keep one delivery well below the lease. A lease that expires
  during the final attempt marks the job `FAILED` (`Lease expired during the final attempt`), so a job
  that keeps crashing workers cannot exceed the attempt limit.
- **Fencing.** `attempts` doubles as a fencing token: completing, retrying, or failing a job applies
  only while it is still `PROCESSING` with the same attempt number. A slow run that lost its lease
  changes nothing (`Email job lease lost before completion`).
- **At-least-once.** A crash after the SMTP server accepted a message but before `SENT` was recorded
  delivers it again; the newer token supersedes the older link.

## Worker

`EmailOutboxWorker` starts in `onApplicationBootstrap`, after every handler has registered. It
dispatches immediately, so jobs left by a previous process are picked up on restart, then every
`EMAIL_OUTBOX_POLL_INTERVAL_MS`, skipping overlapping runs. On shutdown it stops polling, stops
claiming, and waits for the job in flight. `EMAIL_OUTBOX_WORKER_ENABLED=false` makes a process
enqueue-only; the e2e suite uses this because its parallel apps share one database. Every replica may
run the worker without a distributed lock.

## Anti-enumeration

Forgot-password and resend-confirmation contain no account lookup: they schedule and return. The
quota depends only on the address and the account check runs in the worker, so known, unknown,
inactive, and confirmed addresses get the same response with the same work.

## Retention

`EmailOutboxCleanupScheduler` runs hourly and batch-deletes jobs whose `processed_at` (when they
reached `SENT` or `FAILED`) is older than `EMAIL_OUTBOX_RETENTION_DAYS`. `PENDING` and `PROCESSING`
jobs are never pruned ([retention contract](../core.md#scheduling-and-retention)).

## Configuration

`EMAIL_OUTBOX_WORKER_ENABLED`, `EMAIL_OUTBOX_POLL_INTERVAL_MS`, `EMAIL_OUTBOX_MAX_ATTEMPTS`,
`EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS`, and `EMAIL_OUTBOX_RETENTION_DAYS`; ranges and defaults are in
`.env.example` and the config schema.

## Known limitations

- **No job expiry.** If no worker runs for a long time, a password-reset email still arrives late;
  its token is minted at delivery, so the link itself is fresh.
- **Polling, not `LISTEN/NOTIFY`.** Delivery latency is up to one poll interval.
- **No admin view, metrics, or manual replay** of `FAILED` jobs.
- No domain entity or mapper: the repository port returns plain records.
