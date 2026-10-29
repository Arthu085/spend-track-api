# Users module

> Location: `src/modules/users/` · Rules: [modules](../conventions.md#modules) and
> [security, authentication, and authorization](../conventions.md#security-authentication-and-authorization)
> · Related: [`auth.md`](auth.md), [`authorization.md`](authorization.md), [`email-outbox.md`](email-outbox.md)

User management (create, list, get, update, activate/deactivate, soft-delete), role assignment
through the `user_roles` relation, protection of administrators, approval-gated changes between
administrators, the self-service profile and password change, and email confirmation. Routes and
payloads are in Swagger; this document covers the rules behind them.

## Public API

- `index.ts`: `UserEntity`, `USER_REPOSITORY`/`UserRepository`, `AuthSubject`,
  `PASSWORD_HASHER`/`PasswordHasher`, `USER_NOTIFIER`/`UserNotifier`, `assertEmailConfirmed`, and the
  revoker registries `EMAIL_CHANGE_TOKEN_REVOKERS`, `PASSWORD_CHANGE_TOKEN_REVOKERS`, and
  `USER_SESSION_REVOKERS` with their port types, all consumed by `auth`.
- `presentation.ts`: `UserDetailResponseDto`, returned by `auth`'s login and refresh.
- `persistence.ts`: `UsersSeeder`. `auth`'s token ORM entities import `UserOrmEntity` directly.
- `users.module.ts`: `UsersModule`.

## Status and deletion

`status` (reversible `ACTIVE`/`INACTIVE`) and `deletedAt` (irreversible through the API) are
independent: deactivating never soft-deletes and soft-deleting never changes `status`. There is no
hard delete.

`GetUserUseCase`, `UpdateUserUseCase`, and `UpdateOwnProfileUseCase` reject an inactive user with
`InactiveUserError` (`409`). The status toggle is exempt because it is the only way back to
`ACTIVE`, and delete is exempt so a record stays deletable whatever its status.

## Input rules

- **Partial updates.** On `PATCH /users/:uuid`, `name`, `email`, and `roleUuids` are optional; an
  omitted field keeps its value and an explicit `null` is a `400`. Roles are resolved only when sent
  and email uniqueness is checked only when the normalized email changes. The [admin safety](#admin-safety)
  rules run on every request. An empty body changes only `updatedAt`/`updatedBy`.
- **Length limits live in one place.** `src/shared/domain/constraints/user-input-length.constraints.ts`
  defines `name` 1–150, `email` at most 255, and `password` 8–128 characters. DTOs, list filters,
  Swagger, the seed-admin schema, and the `varchar` columns all use it, so oversized input is a
  translated `400`, never a database `500`, and the password cap bounds argon2 work.
- **Names must not be blank.** `name` must contain a non-whitespace character (`NON_BLANK_PATTERN`);
  it is otherwise stored as sent, without trimming.
- **New passwords must be strong.** A password being set (`POST /users`, `POST /auth/reset-password`,
  `newPassword` on `PATCH /users/me/password`, and `SEED_ADMIN_PASSWORD`) must contain at least one
  ASCII lowercase letter, one ASCII uppercase letter, one ASCII digit, and one character that is
  neither an ASCII letter nor a digit (`STRONG_PASSWORD_PATTERN` in
  `src/shared/domain/constraints/password-strength.constraints.ts`, also published as the Swagger
  `pattern`). A violation is a translated `400` (`validation.STRONG_PASSWORD`). Login and
  `currentPassword` fields are exempt, so accounts whose password predates the rule still sign in
  and can change it. The web app mirrors the same pattern.
- **Emails are case-insensitive and stored normalized.** The shared `EmailField()` DTO decorator trims
  the value before validation, and every use-case that receives an email applies `normalizeEmail`
  (`trim().toLowerCase()`) before using it. Any casing logs in, and a differently-cased duplicate is a
  `409`. The database enforces it with `chk_users_email_normalized`, making the partial unique index
  `uq_users_email_active` effectively case-insensitive. A write that loses a race on that index is
  mapped to the same `EmailAlreadyInUseError` (`409`); other unique violations stay `500`s.

## Role assignment

`roleUuids` on create and update pass through `assertRolesResolved` (from `authorization`) before any
other role rule: a missing or soft-deleted role is `RoleNotFoundError` (`404`), an inactive one
`InactiveRoleError` (`409`). Nothing is dropped silently, so the stored role set is exactly the
requested one.

## Admin safety

The route abilities decide who may call user-management endpoints; domain rules
(`domain/policies/admin-safety.policy.ts`) additionally protect administrators. A user **is an
admin** when they hold the `ADMIN` role, whatever their or the role's status. An **active admin** is a
live, `ACTIVE` user holding a live, `ACTIVE` `ADMIN` role.

- **Only an active admin can act on an admin.** Updating, toggling status, or deleting a user who
  holds `ADMIN` is `AdminTargetForbiddenError` (`403`) for anyone else, whatever their abilities.
- **Only an active admin can grant `ADMIN`** (`AdminRoleGrantForbiddenError`, `403`).
- **`ADMIN` is permanent through the API.** No update, change request, or approval can remove it,
  not even the admin's own (`AdminRoleRemovalForbiddenError`, `403`). An admin leaves through
  deactivation or deletion by another admin; removing the role takes a direct database change.
- **Editing another admin needs their approval.** `PATCH /users/:uuid` on a different admin returns
  `AdminChangeApprovalRequiredError` (`409`) after role resolution and the retention rule; the change
  goes through a [change request](#admin-change-requests). Deactivation and deletion stay direct, so a
  compromised or departed admin can still be removed.
- **Nobody deactivates or deletes themselves** (`403`), and removing the final active admin is
  `LastActiveAdminError` (`409`). Together, these rules keep at least one active admin.

Create, update, status, delete, and change-request creation serialize these checks with a PostgreSQL
transaction advisory lock (`lockAdminRoster`) and re-read the actor after taking it, so two admins
deactivating each other at the same time cannot both succeed. Update, status, delete, and change
requests then lock the target row (`findByUuidForUpdate`) so they never write a stale copy over a
concurrent confirmation or reset.

## Admin change requests

When an active admin edits a different admin, the change is stored in `user_change_requests` and
applied only if the target approves it within `USER_CHANGE_REQUEST_TTL_HOURS`. Requests are created
with `POST /users/:uuid/change-requests` (`UPDATE` + `READ` on `User`), which applies the same partial
body, admin rules, uniqueness check, and role resolution as `PATCH`, and returns
`UserChangeRequestNotApplicableError` (`409`) when the target is not an admin or is the actor. The
target lists and decides requests under `/users/me/change-requests`, routes that need authentication
but no ability; a request addressed to someone else is a `404`. Only admins receive requests, so these
routes refuse a caller who does not hold `ADMIN`, whatever its status, with
`UserChangeRequestRecipientForbiddenError` (`403`).

- **The email is a notification, not a credential.** It links to `APP_WEB_URL` +
  `MAIL_USER_CHANGE_REQUEST_PATH` with no token; approving needs the target's authenticated session.
  Nothing is sent if the account is gone, inactive, or no longer has a pending request. A quota
  denial keeps the request (it stays visible in the app); an unavailable outbox rolls it back.
- **Both value sets are stored.** The row keeps the target's values at request time (`current_*`)
  next to the requested ones (`requested_*`). Approval refuses a request whose current values no
  longer match the profile (`UserChangeRequestStaleError`, `409`).
- **One pending request per target.** A new request, or the target's own `PATCH /users/:uuid` or
  `PATCH /users/me`, supersedes the pending one; the partial unique index
  `uq_user_change_requests_pending_target` enforces it. Creation, approval, and rejection lock the
  target's row first.
- **Removing an admin voids their requests.** Deactivating or deleting an admin supersedes every
  pending request they filed or received.
- **Expiry is derived.** A request is pending while `status = 'PENDING'` and `expires_at` is in the
  future. An expired request is never listed and is `UserChangeRequestNotPendingError` (`409`), like a
  decided one.
- **Approval re-runs the update rules** (uniqueness, role status, `ADMIN` retention) and applies the
  values through `UserProfileChangeService`, the same path as a direct update. `updated_by` records the
  approving admin and `requested_by` the requester.
- **Rows are kept** as a history; there is no retention job for this table.

## Self-service profile

`PATCH /users/me` lets every authenticated user change their own `name` and `email`, with no ability
required. `PATCH /users/:uuid` on one's own uuid still works for users holding `UPDATE` on `User`,
with the full body and the admin rules.

- **Only `name` and `email`** (plus `currentPassword`). Other fields are stripped by the validation
  whitelist; `null` is a `400`.
- **An email change needs the current password**, verified against the locked row:
  missing is `CurrentPasswordRequiredError` (`422`), wrong is `InvalidCurrentPasswordError` (`403`,
  not `401`, so clients do not try to refresh). Both run before the uniqueness check, so a hijacked
  session cannot probe registered addresses. A name-only, unchanged, or casing-only email update
  needs no password and ignores one that is sent. Because the route verifies a password, it uses the
  stricter `AUTH_THROTTLE_*` budget.
- **The previous address is notified.** An email change schedules an `EMAIL_CHANGE_NOTICE` to the
  replaced address in the same transaction: a fixed text saying the address changed and every session
  ended, without link, token, name, or new address. An unavailable outbox rolls the change back; a
  quota denial is logged (`Email change notice not scheduled`) and the change commits. Admin edits and
  approved change requests send no notice.
- **No admin-roster lock.** It targets only the caller and writes their current roles back, so it
  takes just the caller's row lock. It supersedes a pending change request addressed to the caller and
  applies the change through `UserProfileChangeService`, like an admin edit.

## Self-service password change

`PATCH /users/me/password` lets every authenticated user change their own password with
`currentPassword` and `newPassword`, with no ability required. It is the only API route that changes
a signed-in user's password: `PATCH /users/:uuid` and `PATCH /users/me` strip a `password` field, and
an administrator cannot change another user's password.

- **Validation.** Both fields are required strings of at most 128 characters; `newPassword` must also
  have at least 8 and pass the [strength rule](#input-rules), as create and reset do. A missing or
  invalid field is a `400`.
- **The current password is verified against the locked row**, and a wrong one is
  `InvalidCurrentPasswordError` (`403`, not `401`, so clients do not try to refresh). The route uses
  the stricter `AUTH_THROTTLE_*` budget.
- **A new password equal to the current one is accepted.** Rejecting it would cost a second argon2
  verification for no security gain; the change still ends every session.
- **One transaction.** The new password is hashed before the transaction, like a reset. The use-case
  then locks the caller's row, verifies, writes the hash onto the locked row, and runs the
  `PASSWORD_CHANGE_TOKEN_REVOKERS` and `USER_SESSION_REVOKERS` registries, so outstanding reset links
  and every session end together; a failing revoker rolls the change back. It takes no admin-roster
  lock and does not touch change requests.
- **The caller signs in again.** The response clears the auth cookies, like `PATCH /users/me`, and
  carries no data.
- **No email is sent.** Unlike an email change, a password change schedules no notice.

`GET /users/me/abilities` returns the caller's effective abilities as bare `{ action, subject }`
pairs, in no particular order, also with no ability required. It reuses the resolution behind
`AbilitiesGuard` ([`authorization.md`](authorization.md#enforcement)) through the exported
`UserAbilityRepository`, so it lists exactly the pairs the guard would accept on that request. It is
a separate route rather than a field on `GET /users/me` because `UserDetailResponseDto` is also the
login and refresh response. Clients use it to show or hide UI only; the server still checks every
route.

## Email confirmation

New users and changed emails start unconfirmed, and `login`, `refresh`, and every authenticated
request reject an unconfirmed user with `EmailNotConfirmedError` (`403`). `withProfile` clears the
confirmation **only when the normalized email actually changes**, so renaming a user or changing roles
never locks them out.

**Scheduling.** `CreateUserUseCase` and every email change schedule an `EMAIL_CONFIRMATION` job inside
the transaction that writes the user. Scheduling never throws; the caller applies the policy by
denial reason:

- **`UNAVAILABLE`** (outbox or quota store failure): `EmailSchedulingUnavailableError`, and the whole
  transaction rolls back, so the caller gets a `500` to retry.
- **`DISABLED` or `EXHAUSTED`** (quota denial): the user change commits without a job and
  `Email confirmation not scheduled` is logged. After `EXHAUSTED`, the user can resend once the daily
  quota resets. `DISABLED` (`MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION=0`) also denies resends, so the user
  can confirm only through a password reset or after an operator raises the limit.

**Delivery.** The token is minted when the outbox delivers the job: the handler resolves the account
by recipient, locks it, issues nothing if it is gone, inactive, already confirmed, or no longer has
that email, supersedes earlier tokens, stores the new digest, and sends an
[`OneTimeToken`](../core.md#token-hashing-and-one-time-tokens) link (`APP_WEB_URL` +
`MAIL_CONFIRM_EMAIL_PATH`) in the job's locale after the commit. Only one token is ever usable.

**Confirmation.** `ConfirmEmailUseCase` locks the user, claims the token with a conditional
`UPDATE ... AND consumed_at IS NULL`, and confirms the locked row in one transaction. Every failure
(malformed, unknown, expired, consumed, mismatched, owner gone) is one
`InvalidEmailConfirmationTokenError` (`422`), and a concurrent replay gets the same error.

**Resend only schedules**, without an account lookup, so every address gets the same response and
work ([`email-quota.md`](email-quota.md#where-the-gate-runs)). Expired tokens are batch-deleted
`EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS` after expiry.

## Sessions and tokens

`users` cannot import `auth` (the dependency points the other way), so it owns two ports with
registries that `auth` registers into in `onModuleInit`. Revokers run in the caller's transaction, and
a failing revoker rolls the user change back. A module that adds another session or address-bound
token registers its own revoker; nothing checks that at compile time, so cover it with an integration
test.

| Registry                         | Runs when                                                                              | `auth` revoker                      |
| -------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `USER_SESSION_REVOKERS`          | A user is deactivated or soft-deleted, or a user changes their own profile or password | Revokes every refresh token         |
| `EMAIL_CHANGE_TOKEN_REVOKERS`    | An email actually changes                                                              | Consumes every password-reset token |
| `PASSWORD_CHANGE_TOKEN_REVOKERS` | A user changes their own password                                                      | Consumes every password-reset token |

- **Deactivation and deletion end every session.** Otherwise a refresh cookie issued before
  deactivation would work again after reactivation. Reactivation revokes nothing; the user signs in
  again.
- **Changing your own profile ends every session**, through `PATCH /users/me`, `PATCH /users/:uuid` on
  one's own uuid, or approving a change request, whichever fields were sent. These routes also clear
  the auth cookies, so the caller signs in again; after an email change, that login needs the new
  address confirmed. Edits to someone else's profile revoke nothing.
- **Changing your own password ends every session** and consumes every outstanding password-reset
  token, and `PATCH /users/me/password` clears the auth cookies too.
- **Email changes revoke outstanding tokens.** `UserProfileChangeService` consumes every confirmation
  token and runs the email-change revokers, so no link mailed to an old address keeps working. Refresh
  tokens of the edited user are not revoked by an admin edit, but the now-unconfirmed account fails
  every access check with `EmailNotConfirmedError` (`403`) until the new address is confirmed;
  `JwtAuthGuard` rethrows it unchanged so clients do not attempt a refresh.

**Lock order.** Every flow that touches a user because of a token, or a token because of a user,
locks the user row first (`FOR NO KEY UPDATE`) and writes the row it locked, never an earlier
snapshot. `FOR NO KEY UPDATE` still serializes these flows against each other and against every
`UPDATE users`, but not against the `KEY SHARE` lock a token insert's foreign-key check takes, which
avoids deadlocks between a password reset and a concurrent refresh rotation. Whichever side locks
first wins, and both outcomes are safe:

- **Confirm or reset vs. email change:** if the change commits first, the token is already consumed
  and the claim fails; otherwise the token flow completes against the old address and the change then
  un-confirms the new one.
- **Token issuing vs. email change:** the delivery handlers issue nothing unless the locked row still
  has the job's recipient; if the issue wins, the change consumes the new token. An email may still
  reach the old address, but its link is dead, and a retry after the change sends nothing.
- **Status toggle and delete** take the same row lock, so they never overwrite a confirmation that
  committed after they read the user.

Admin mutations take the admin-roster advisory lock before the row lock; approval, rejection, the
self-service update and password change, and the token flows take no advisory lock, so the lock order
has no cycle.

## Notifications

`UserNotifier` sends every email the `users` and `auth` flows need. `MAIL_TRANSPORT` selects the
adapter: `LoggingUserNotifier` (default) logs confirmation and reset tokens with a masked recipient,
and only the masked recipient for notices; `SmtpUserNotifier` delivers through
[`MailSenderService`](../core.md#mail-sending). Another provider needs only a new adapter bound to
`USER_NOTIFIER`.

- A send failure rejects, so the outbox retries the job; only the masked error message is stored.
- Emails render in the locale carried by the job, since delivery runs outside any request.
- HTML and plain-text variants are built from the same translated fields by dependency-free renderers
  (`renderActionEmail`, `renderNoticeEmail`). `escapeHtml` applies to every HTML value, including
  `href` attributes.

## Persistence notes

- **Actor names are projections.** `creatorName`/`updaterName` are resolved at read time from the
  `created_by`/`updated_by` ids in one batched query (none when no ids), with `withDeleted: true` so a
  removed author's name still shows. `findByEmail` (login and uniqueness checks) is not hydrated, and
  `findAuthSubject` (every authenticated request) is a lean projection. Soft deletion records the actor
  in both `updated_by` and `deleted_by`.
- **Listing uses a query builder for correctness.** A find-options `where` on the `roles` relation
  would truncate each user's roles to the matching one. `findAllPaginated` joins roles (not their
  abilities, which would multiply rows) and filters by role with an `IN (SELECT ...)` subquery on
  `users.id`, so every listed user keeps its full role set. Text filters use `applyILikeFilter`,
  which escapes `%`, `_`, and `\`.

## Seed user

`UsersSeeder` creates one user with the `ADMIN` role from `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`, normalized and hashed like any other write and **already confirmed**, so the
credentials work immediately. It is idempotent: an existing user with that email is never changed,
except that a seed user still unconfirmed is confirmed. It fails, rolling back the whole seed run,
when the `ADMIN` role is missing.

`SEED_ADMIN_ENABLED` defaults to `true` outside production and `false` in production. The rules in
`src/core/config/validation/seed-admin.validation.ts` are part of the boot schema and are re-checked
by the seeder: when enabled, both values are required, with a valid email and an 8–128 character
password that passes the [strength rule](#input-rules) in every environment; in production, known
default emails, weak passwords, and passwords under 12 characters are rejected even while the seed
is disabled. The `.env.example` credentials are for local use only.

## Configuration

`EMAIL_CONFIRMATION_TOKEN_TTL_HOURS`, `EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS`,
`USER_CHANGE_REQUEST_TTL_HOURS`, `APP_WEB_URL`, `MAIL_CONFIRM_EMAIL_PATH`,
`MAIL_USER_CHANGE_REQUEST_PATH`, the `MAIL_*` transport settings, and `SEED_ADMIN_*`. Argon2 uses the
library defaults; there is no tuning variable.

## Known limitations

- A mistyped new email on `PATCH /users/me` locks the user out until an admin corrects it: login
  requires the new address to be confirmed and the old one is already replaced.
- A password change sends no notice email, unlike an email change.
- No self-registration and no hard delete.
